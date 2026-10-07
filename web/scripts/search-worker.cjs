const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");
database.function("normalize_public_name", { deterministic: true }, normalizeName);
const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

function digitsOnly(value) { return value.replace(/\D/g, ""); }
function hasTable(name) { return tables.has(name); }
function ftsPrefixQuery(tokens) { return tokens.map(token => `"${token.replace(/"/g, '""')}"*`).join(" "); }

function batchPhotoUrls(personIds) {
  const ids = [...new Set(personIds)];
  if (!ids.length || !hasTable("candidate_photo")) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = database.prepare(`SELECT person_id AS personId, photo_url AS photoUrl, max(year) AS year
    FROM candidate_photo WHERE person_id IN (${placeholders}) GROUP BY person_id`).all(...ids);
  return new Map(rows.map(row => [row.personId, row.photoUrl]));
}

function searchCompanies(rawQuery, limit) {
  const query = rawQuery.trim();
  const digits = digitsOnly(query);
  const documentQuery = digits.length >= 6 && digits.length <= 14 && /^[\d./\-\s]+$/.test(query);
  const nameTokens = [...new Set(normalizeName(query).split(" ").filter(Boolean))];
  if (!documentQuery && nameTokens.length === 0) return [];
  const companyName = "COALESCE(NULLIF(cr.trade_name, ''), NULLIF(cr.legal_name, ''), c.legal_name, '')";
  const companySearchName = "COALESCE(cr.trade_name, '') || ' ' || COALESCE(cr.legal_name, c.legal_name, '')";
  const indexedCompanyNames = hasTable("company_name_search") && hasTable("_politica_search_index") &&
    !!database.prepare("SELECT 1 FROM _politica_search_index WHERE id=1 AND version>=2").get();
  const rows = documentQuery
    ? database.prepare(`SELECT c.cnpj, ${companyName} AS canonicalName
        FROM companies c LEFT JOIN company_registry cr ON cr.company_id = c.id
        WHERE c.cnpj LIKE ?
        ORDER BY CASE WHEN c.cnpj = ? THEN 0 ELSE 1 END, c.cnpj LIMIT ?`)
      .all(`${digits}%`, digits, limit)
    : indexedCompanyNames
      ? database.prepare(`SELECT c.cnpj, ${companyName} AS canonicalName
          FROM companies c LEFT JOIN company_registry cr ON cr.company_id = c.id
          WHERE c.id IN (SELECT company_id FROM company_name_search WHERE company_name_search MATCH ?)
          ORDER BY CASE
            WHEN normalize_public_name(${companyName}) = ? THEN 0
            WHEN substr(normalize_public_name(${companyName}), 1, length(?)) = ? THEN 1
            ELSE 2
          END, length(canonicalName), canonicalName LIMIT ?`)
        .all(ftsPrefixQuery(nameTokens), normalizeName(query), normalizeName(query), normalizeName(query), limit)
      : database.prepare(`SELECT c.cnpj, ${companyName} AS canonicalName
          FROM companies c LEFT JOIN company_registry cr ON cr.company_id = c.id
          WHERE ${nameTokens.map(() => `instr(normalize_public_name(${companySearchName}), ?) > 0`).join(" AND ")}
          ORDER BY CASE
            WHEN upper(${companySearchName}) = ? THEN 0
            WHEN substr(upper(${companySearchName}), 1, length(?)) = ? THEN 1
            ELSE 2
          END, length(canonicalName), canonicalName LIMIT ?`)
        .all(...nameTokens, normalizeName(query), normalizeName(query), normalizeName(query), limit);
  return rows.map(row => ({ kind: "empresa", cnpj: row.cnpj, canonicalName: row.canonicalName || row.cnpj }));
}

function searchPeople(rawQuery, limit = 25, filters = {}) {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  const digits = digitsOnly(query);
  const looksLikeCpf = digits.length >= 6 && digits.length <= 11 && /^[\d./\-\s]+$/.test(query);
  const looksLikeCnpj = digits.length >= 6 && digits.length <= 14 && !/[a-z]/i.test(query);
  const normalizedQuery = normalizeName(query).replace(/[^A-Z0-9]+/g, " ").trim();
  const nameTokens = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  if (!looksLikeCpf && nameTokens.length === 0) return [];

  const nameRank = looksLikeCpf ? "0" : `CASE
    WHEN canonical_name = ? THEN 0
    WHEN substr(canonical_name, 1, length(?)) = ? THEN 1
    WHEN instr(canonical_name, ?) > 0 THEN 2
    ELSE 3 END`;
  const indexedBallots = !looksLikeCpf && hasTable("politician_name_search") && hasTable("_politica_search_index") &&
    !!database.prepare("SELECT 1 FROM _politica_search_index WHERE id=1 AND version>=1").get();
  const indexedPeopleNames = !looksLikeCpf && hasTable("people_name_search") && hasTable("_politica_search_index") &&
    !!database.prepare("SELECT 1 FROM _politica_search_index WHERE id=1 AND version>=2").get();
  const ballotWhere = indexedBallots
    ? "id IN (SELECT person_id FROM politician_name_search WHERE politician_name_search MATCH ?)"
    : `id IN (SELECT person_id FROM politician_history search_history WHERE ${nameTokens.map(() => "instr(normalize_public_name(search_history.ballot_name),?)>0").join(" AND ")})`;
  const ballotParams = indexedBallots ? [ftsPrefixQuery(nameTokens)] : nameTokens;
  const candidateNameWhere = indexedPeopleNames
    ? "id IN (SELECT person_id FROM people_name_search WHERE people_name_search MATCH ?)"
    : `(${nameTokens.map(() => "instr(canonical_name, ?) > 0").join(" AND ")})`;
  const candidateNameParams = indexedPeopleNames ? [ftsPrefixQuery(nameTokens)] : nameTokens;
  const matchWhere = looksLikeCpf ? "cpf LIKE ?" : `(${candidateNameWhere} OR ${ballotWhere})`;
  const matchParams = looksLikeCpf
    ? [`${digits}%`, limit * 4]
    : [normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, ...candidateNameParams, ...ballotParams, limit * 4];

  const filterClauses = [];
  const filterParams = [];
  for (const [field, value] of [["year", filters.year], ["office", filters.office], ["state", filters.state], ["municipality", filters.city]]) {
    if (value) { filterClauses.push(`filter_history.${field}=?`); filterParams.push(value); }
  }
  const historyFilter = filterClauses.length
    ? ` AND id IN (SELECT filter_history.person_id FROM politician_history filter_history WHERE ${filterClauses.join(" AND ")})`
    : "";
  matchParams.splice(matchParams.length - 1, 0, ...filterParams);
  const sql = `WITH matches AS (
      SELECT id, canonical_name, cpf, cpf_trusted, ${nameRank} AS nameRank
      FROM people WHERE ${matchWhere}${historyFilter}
      ORDER BY nameRank ASC, length(canonical_name) ASC, canonical_name ASC LIMIT ?
    )
    SELECT m.id AS personId, m.canonical_name AS canonicalName, m.cpf AS cpf,
      m.cpf_trusted AS cpfTrusted,
      (SELECT count(*) FROM politician_history WHERE person_id = m.id) AS candidacyCount,
      l.year AS latestYear, l.office AS latestOffice, l.party_abbr AS latestPartyAbbr,
      l.state AS latestState, l.result AS latestResult
    FROM matches m LEFT JOIN politician_history l ON l.id = (
      SELECT id FROM politician_history WHERE person_id = m.id ORDER BY year DESC, round DESC LIMIT 1
    )
    ORDER BY m.nameRank ASC, l.year DESC, m.canonical_name ASC`;
  const candidateRows = looksLikeCnpj && !looksLikeCpf
    ? []
    : database.prepare(sql).all(...matchParams).slice(0, limit);
  const candidatePhotoUrls = batchPhotoUrls(candidateRows.map(row => row.personId));
  const candidates = candidateRows.map(row => ({
    kind: "candidato", personId: row.personId, canonicalName: row.canonicalName,
    cpf: row.cpf ?? null, cpfTrusted: !!row.cpfTrusted, candidacyCount: row.candidacyCount,
    latestYear: row.latestYear, latestOffice: row.latestOffice ?? null,
    latestPartyAbbr: row.latestPartyAbbr ?? null, latestState: row.latestState ?? null,
    latestResult: row.latestResult ?? null, photoUrl: candidatePhotoUrls.get(row.personId) ?? null,
  }));
  if (filterClauses.length) return candidates;

  const known = new Set(candidates.map(row => row.cpf).filter(Boolean));
  const remaining = limit;
  let personRows = [];
  if (looksLikeCnpj && !looksLikeCpf) {
    personRows = [];
  } else if (looksLikeCpf) {
    const cpfPattern = `${digits}%`;
    personRows = database.prepare(`WITH matches AS (
        SELECT donor_cpf_cnpj AS cpf, donor_name AS name FROM campaign_donation
        WHERE donor_company_id IS NULL AND donor_cpf_cnpj IS NOT NULL AND length(donor_cpf_cnpj)=11 AND donor_cpf_cnpj LIKE ?
        UNION
        SELECT supplier_cpf_cnpj AS cpf, supplier_name AS name FROM campaign_expense
        WHERE supplier_company_id IS NULL AND supplier_cpf_cnpj IS NOT NULL AND length(supplier_cpf_cnpj)=11 AND supplier_cpf_cnpj LIKE ?
      ) SELECT cpf, max(name) AS name FROM matches GROUP BY cpf LIMIT ?`)
      .all(cpfPattern, cpfPattern, remaining * 2);
  } else if (hasTable("pessoa_fisica_search")) {
    const ftsQuery = ftsPrefixQuery(normalizeName(query).split(" ").filter(Boolean));
    personRows = ftsQuery
      ? database.prepare("SELECT cpf, name FROM pessoa_fisica_search WHERE pessoa_fisica_search MATCH ? LIMIT ?").all(ftsQuery, remaining * 2)
      : [];
  }
  const persons = personRows.filter(row => !known.has(row.cpf)).slice(0, remaining)
    .map(row => ({ kind: "pessoa_fisica", cpf: row.cpf, canonicalName: row.name || row.cpf }));

  const canSearchCompanyNames = normalizedQuery.replace(/\s/g, "").length >= 4;
  const companies = looksLikeCnpj || canSearchCompanyNames ? searchCompanies(query, Math.min(limit, 8)) : [];
  const indexedPartnerNames = hasTable("company_partner_name_search") && hasTable("_politica_search_index") &&
    !!database.prepare("SELECT 1 FROM _politica_search_index WHERE id=1 AND version>=2").get();
  let partnerRows = [];
  if (!looksLikeCnpj && nameTokens.length && hasTable("company_partner")) {
    partnerRows = indexedPartnerNames
      ? database.prepare(`SELECT min(cp.id) AS partnerId, cp.partner_name AS canonicalName,
          max(coalesce(c.legal_name, cp.cnpj)) AS companyName
        FROM company_partner cp JOIN companies c ON c.id=cp.company_id
        WHERE cp.id IN (SELECT partner_id FROM company_partner_name_search WHERE company_partner_name_search MATCH ?)
        GROUP BY normalize_public_name(cp.partner_name), cp.partner_doc_masked LIMIT 8`).all(ftsPrefixQuery(nameTokens))
      : database.prepare(`SELECT min(cp.id) AS partnerId, cp.partner_name AS canonicalName,
          max(coalesce(c.legal_name, cp.cnpj)) AS companyName
        FROM company_partner cp JOIN companies c ON c.id=cp.company_id
        WHERE ${nameTokens.map(() => "instr(normalize_public_name(cp.partner_name),?)>0").join(" AND ")}
        GROUP BY normalize_public_name(cp.partner_name), cp.partner_doc_masked LIMIT 8`).all(...nameTokens);
  }
  const partners = partnerRows.map(row => ({ kind: "socio", ...row }));
  const combined = [];
  for (let i = 0; combined.length < limit && (i < candidates.length || i < companies.length || i < persons.length || i < partners.length); i += 1) {
    if (candidates[i]) combined.push(candidates[i]);
    if (companies[i] && combined.length < limit) combined.push(companies[i]);
    if (persons[i] && combined.length < limit) combined.push(persons[i]);
    if (partners[i] && combined.length < limit) combined.push(partners[i]);
  }
  return combined.slice(0, limit);
}

try {
  const filters = workerData.filters || {};
  const results = searchPeople(String(workerData.query || ""), Math.max(1, Math.min(25, Number(workerData.limit) || 25)), filters);
  const hasFilters = Boolean(filters.year || filters.office || filters.state || filters.city);
  if (!hasFilters) {
    parentPort.postMessage({ results });
  } else {
    const filteredResults = [];
    for (const result of results) {
      if (result.kind !== "candidato") continue;
      const clauses = [];
      const args = [result.personId];
      for (const [field, value] of [["year", filters.year], ["office", filters.office], ["state", filters.state], ["municipality", filters.city]]) {
        if (value) { clauses.push(`${field} = ?`); args.push(value); }
      }
      const match = database.prepare(`SELECT year, office, state, party_abbr AS partyAbbr, result
        FROM politician_history WHERE person_id = ? AND ${clauses.join(" AND ")}
        ORDER BY year DESC, round DESC LIMIT 1`).get(...args);
      if (match) filteredResults.push({ ...result, latestYear: match.year, latestOffice: match.office ?? null,
        latestState: match.state ?? null, latestPartyAbbr: match.partyAbbr ?? null, latestResult: match.result ?? null });
    }
    parentPort.postMessage({ results: filteredResults });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Search worker failed" });
} finally {
  database.close();
}
