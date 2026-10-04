import { companyPartners, personCompanies, partnerById, partnerOtherCompanies } from "./platform/relations";
import { db, hasTable,dataVersion } from "./db";
import { digitsOnly, normalizeName } from "./normalize";

export type Provenance = {
  sourceName: string;
  agency: string;
  legalBasis: string | null;
  url: string;
  accessedAt: string;
  sha256: string;
  parserName: string;
  parserVersion: string;
};

const PROVENANCE_JOIN = `
  JOIN parse pa ON pa.id = t.provenance_id
  JOIN collection col ON col.id = pa.collection_id
  JOIN source src ON src.id = col.source_id
`;

const PROVENANCE_COLUMNS = `
  src.name        AS srcSourceName,
  src.agency      AS srcAgency,
  src.legal_basis AS srcLegalBasis,
  col.url         AS srcUrl,
  col.accessed_at AS srcAccessedAt,
  col.payload_sha256 AS srcSha256,
  pa.parser_name  AS srcParserName,
  pa.parser_version AS srcParserVersion
`;

function pickProvenance(row: Record<string, unknown>): Provenance {
  return {
    sourceName: row.srcSourceName as string,
    agency: row.srcAgency as string,
    legalBasis: (row.srcLegalBasis as string) ?? null,
    url: row.srcUrl as string,
    accessedAt: row.srcAccessedAt as string,
    sha256: row.srcSha256 as string,
    parserName: row.srcParserName as string,
    parserVersion: row.srcParserVersion as string,
  };
}

export type SearchResult =
  | {kind:"socio";partnerId:number;canonicalName:string;companyName:string}
  | {
      kind: "candidato";
      personId: number;
      canonicalName: string;
      cpf: string | null;
      cpfTrusted: boolean;
      candidacyCount: number;
      latestYear: number;
      latestOffice: string | null;
      latestPartyAbbr: string | null;
      latestState: string | null;
      latestResult: string | null;
      photoUrl: string | null;
    }
  | {
      kind: "pessoa_fisica";
      cpf: string;
      canonicalName: string;
    }
  | {
      kind: "empresa";
      cnpj: string;
      canonicalName: string;
    };

function searchCompanies(rawQuery: string, limit: number): Extract<SearchResult, { kind: "empresa" }>[] {
  const query = rawQuery.trim();
  const digits = digitsOnly(query);
  const documentQuery = digits.length >= 6 && digits.length <= 14 && /^[\d./\-\s]+$/.test(query);
  const nameTokens = [...new Set(normalizeName(query).split(" ").filter(Boolean))];
  if (!documentQuery && nameTokens.length === 0) return [];

  const companyName = "COALESCE(NULLIF(cr.trade_name, ''), NULLIF(cr.legal_name, ''), c.legal_name, '')";
  const companySearchName = "COALESCE(cr.trade_name, '') || ' ' || COALESCE(cr.legal_name, c.legal_name, '')";
  const rows = documentQuery
    ? db().prepare(
      `SELECT c.cnpj, ${companyName} AS canonicalName
       FROM companies c LEFT JOIN company_registry cr ON cr.company_id = c.id
       WHERE c.cnpj LIKE ?
       ORDER BY CASE WHEN c.cnpj = ? THEN 0 ELSE 1 END, c.cnpj
       LIMIT ?`
    ).all(`${digits}%`, digits, limit)
    : db().prepare(
      `SELECT c.cnpj, ${companyName} AS canonicalName
       FROM companies c LEFT JOIN company_registry cr ON cr.company_id = c.id
       WHERE ${nameTokens.map(() => `instr(normalize_public_name(${companySearchName}), ?) > 0`).join(" AND ")}
       ORDER BY CASE
         WHEN upper(${companySearchName}) = ? THEN 0
         WHEN substr(upper(${companySearchName}), 1, length(?)) = ? THEN 1
         ELSE 2
       END, length(canonicalName), canonicalName
       LIMIT ?`
    ).all(...nameTokens, normalizeName(query), normalizeName(query), normalizeName(query), limit);

  return (rows as Array<{ cnpj: string; canonicalName: string | null }>).map((row) => ({
    kind: "empresa",
    cnpj: row.cnpj,
    canonicalName: row.canonicalName ?? row.cnpj,
  }));
}

export function searchPeople(rawQuery: string, limit = 25, filters?: {year?:number;office?:string;state?:string;city?:string}): SearchResult[] {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const digits = digitsOnly(query);
  const looksLikeCpf = digits.length >= 6 && digits.length <= 11 && /^[\d./\-\s]+$/.test(query);
  const looksLikeCnpj = digits.length >= 6 && digits.length <= 14 && !/[a-z]/i.test(query);
  const normalizedQuery = normalizeName(query).replace(/[^A-Z0-9]+/g, " ").trim();
  const nameTokens = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  if (!looksLikeCpf && nameTokens.length === 0) return [];

  // Match every typed name fragment independently, regardless of order or missing middle names.
  const nameRank = looksLikeCpf
    ? "0"
    : `CASE
        WHEN canonical_name = ? THEN 0
        WHEN substr(canonical_name, 1, length(?)) = ? THEN 1
        WHEN instr(canonical_name, ?) > 0 THEN 2
        ELSE 3
      END`;
  const indexedBallots = !looksLikeCpf && hasTable("politician_name_search") && hasTable("_politica_search_index") && !!db().prepare("SELECT 1 FROM _politica_search_index WHERE id=1 AND version=1").get();
  const ballotWhere=indexedBallots ? "id IN (SELECT person_id FROM politician_name_search WHERE politician_name_search MATCH ?)" : `id IN (SELECT person_id FROM politician_history search_history WHERE ${nameTokens.map(()=>"instr(normalize_public_name(search_history.ballot_name),?)>0").join(" AND ")})`;
  const ballotParams=indexedBallots ? [nameTokens.map(token=>`"${token}"*`).join(" ")] : nameTokens;
  const matchWhere = looksLikeCpf
    ? "cpf LIKE ?"
    : `(${nameTokens.map(() => "instr(canonical_name, ?) > 0").join(" AND ")} OR ${ballotWhere})`;
  const matchParams = looksLikeCpf
    ? [`${digits}%`, limit * 4]
    : [normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, ...nameTokens,...ballotParams, limit * 4];

  const filterClauses:string[]=[];const filterParams:(string|number)[]=[];
  for(const [field,value] of [["year",filters?.year],["office",filters?.office],["state",filters?.state],["municipality",filters?.city]] as const)if(value){filterClauses.push(`filter_history.${field}=?`);filterParams.push(value);}
  const historyFilter=filterClauses.length?` AND id IN (SELECT filter_history.person_id FROM politician_history filter_history WHERE ${filterClauses.join(" AND ")})`:"";
  matchParams.splice(matchParams.length-1,0,...filterParams);
  // LIMIT in `matches` first; per-row latest-candidacy lookup avoids a full-table window function
  const sql = `
    WITH matches AS (
      SELECT id, canonical_name, cpf, cpf_trusted, ${nameRank} AS nameRank
      FROM people
      WHERE ${matchWhere}${historyFilter}
      ORDER BY nameRank ASC, length(canonical_name) ASC, canonical_name ASC
      LIMIT ?
    )
    SELECT
      m.id AS personId, m.canonical_name AS canonicalName, m.cpf AS cpf,
      m.cpf_trusted AS cpfTrusted,
      (SELECT count(*) FROM politician_history WHERE person_id = m.id) AS candidacyCount,
      l.year AS latestYear, l.office AS latestOffice,
      l.party_abbr AS latestPartyAbbr, l.state AS latestState, l.result AS latestResult
    FROM matches m
    LEFT JOIN politician_history l ON l.id = (
      SELECT id FROM politician_history
      WHERE person_id = m.id
      ORDER BY year DESC, round DESC
      LIMIT 1
    )
    ORDER BY m.nameRank ASC, l.year DESC, m.canonical_name ASC
  `;
  const candidateRows = looksLikeCnpj && !looksLikeCpf
    ? []
    : (db().prepare(sql).all(...matchParams) as Array<Record<string, unknown>>).slice(0, limit);
  const candidatePhotoUrls = batchPhotoUrls(candidateRows.map((r) => r.personId as number));
  const candidates: SearchResult[] = candidateRows.map((r) => ({
    kind: "candidato",
    personId: r.personId as number,
    canonicalName: r.canonicalName as string,
    cpf: (r.cpf as string) ?? null,
    cpfTrusted: !!r.cpfTrusted,
    candidacyCount: r.candidacyCount as number,
    latestYear: r.latestYear as number,
    latestOffice: (r.latestOffice as string) ?? null,
    latestPartyAbbr: (r.latestPartyAbbr as string) ?? null,
    latestState: (r.latestState as string) ?? null,
    latestResult: (r.latestResult as string) ?? null,
    photoUrl: candidatePhotoUrls.get(r.personId as number) ?? null,
  }));
  if(filterClauses.length)return candidates;
  // Donors/suppliers have no `people` row; names go through FTS5 (LIKE over ~14M rows took 100s+)
  const known = new Set(candidates.map((c) => (c.kind === "candidato" ? c.cpf : null)).filter(Boolean));
  const remaining = limit;
  let personRows: Array<{ cpf: string; name: string | null }>;
  if (looksLikeCnpj && !looksLikeCpf) {
    personRows = [];
  } else if (looksLikeCpf) {
    const cpfPattern = `${digits}%`;
    personRows = db()
      .prepare(
        `WITH matches AS (
           SELECT donor_cpf_cnpj AS cpf, donor_name AS name FROM campaign_donation
           WHERE donor_company_id IS NULL AND donor_cpf_cnpj IS NOT NULL AND length(donor_cpf_cnpj) = 11
             AND donor_cpf_cnpj LIKE ?
           UNION
           SELECT supplier_cpf_cnpj AS cpf, supplier_name AS name FROM campaign_expense
           WHERE supplier_company_id IS NULL AND supplier_cpf_cnpj IS NOT NULL AND length(supplier_cpf_cnpj) = 11
             AND supplier_cpf_cnpj LIKE ?
         )
         SELECT cpf, max(name) AS name FROM matches GROUP BY cpf LIMIT ?`
      )
      .all(cpfPattern, cpfPattern, remaining * 2) as typeof personRows;
  } else if (hasTable("pessoa_fisica_search")) {
    const ftsQuery = normalizeName(query)
      .split(" ")
      .filter(Boolean)
      .map((tok) => `"${tok.replace(/"/g, '""')}"*`)
      .join(" ");
    personRows = ftsQuery
      ? (db()
          .prepare("SELECT cpf, name FROM pessoa_fisica_search WHERE pessoa_fisica_search MATCH ? LIMIT ?")
          .all(ftsQuery, remaining * 2) as typeof personRows)
      : [];
  } else {
    personRows = [];
  }
  const persons: SearchResult[] = personRows
    .filter((r) => !known.has(r.cpf))
    .slice(0, remaining)
    .map((r) => ({ kind: "pessoa_fisica", cpf: r.cpf, canonicalName: r.name ?? r.cpf }));

  const canSearchCompanyNames = normalizedQuery.replace(/\s/g, "").length >= 4;
  const companies = looksLikeCnpj || canSearchCompanyNames
    ? searchCompanies(query, Math.min(limit, 8))
    : [];

  const partners:SearchResult[]=!looksLikeCnpj && nameTokens.length && hasTable("company_partner") ? (db().prepare(`SELECT min(cp.id) AS partnerId,cp.partner_name AS canonicalName,max(coalesce(c.legal_name,cp.cnpj)) AS companyName FROM company_partner cp JOIN companies c ON c.id=cp.company_id WHERE ${nameTokens.map(()=>"instr(normalize_public_name(cp.partner_name),?)>0").join(" AND ")} GROUP BY normalize_public_name(cp.partner_name),cp.partner_doc_masked LIMIT 8`).all(...nameTokens) as {partnerId:number;canonicalName:string;companyName:string}[]).map(r=>({kind:"socio",...r})) : [];
  // Interleave entity types so one large result group cannot hide the other searchable records.
  const combined: SearchResult[] = [];
  for (let i = 0; combined.length < limit && (i < candidates.length || i < companies.length || i < persons.length || i < partners.length); i += 1) {
    if (candidates[i]) combined.push(candidates[i]);
    if (companies[i] && combined.length < limit) combined.push(companies[i]);
    if (persons[i] && combined.length < limit) combined.push(persons[i]);
    if (partners[i] && combined.length < limit) combined.push(partners[i]);
  }
  return combined.slice(0, limit);
}

export type Person = {
  id: number;
  cpf: string | null;
  cpfTrusted: boolean;
  voterId: string | null;
  canonicalName: string | null;
};

export type Candidacy = {
  id: number;
  year: number;
  electionType: string | null;
  round: number | null;
  office: string | null;
  candidateNumber: string | null;
  partyAbbr: string | null;
  partyName: string | null;
  state: string | null;
  electoralUnit: string | null;
  municipality: string | null;
  candidacyStatus: string | null;
  candidacyStatusDetail: string | null;
  result: string | null;
  ballotName: string | null;
  fullName: string | null;
  birthDate: string | null;
  gender: string | null;
  education: string | null;
  maritalStatus: string | null;
  race: string | null;
  occupation: string | null;
  tseCandidacyId: string | null;
  provenance: Provenance;
};

export type CampaignOrg = {
  id: number;
  cnpj: string;
  year: number;
  office: string | null;
  partyAbbr: string | null;
  state: string | null;
  provenance: Provenance;
};

export type SocialMediaLink = {
  id: number;
  year: number;
  platform: string;
  url: string;
  state: string | null;
  provenance: Provenance;
};

export type DeclaredAsset = {
  id: number;
  year: number;
  assetType: string | null;
  description: string | null;
  valueCents: number;
  sourceUpdatedAt: string | null;
  valueMissing?:boolean;
  provenance: Provenance;
};

export type DeclaredAssetsYearSummary = { year: number; totalCents: number; count: number;missingValues?:number };

export type FinanceSummary = {
  donationsCount: number;
  donationsTotalCents: number;
  expensesCount: number;
  expensesTotalCents: number;
  paymentsTotalCents: number;
  paymentsCount: number;
  electoralFundTotalCents: number;
  electoralFundCount: number;
};

export type CycleNode = {
  cpfCnpj: string;
  label: string;
  type: "person" | "company";
  personId: number | null;
  photoUrl: string | null;
};

// The rule explanation is the only complete ordered record of cycle members (signal_actor drops some)
const CYCLE_CHAIN_RE = /(\d{11}|\d{14}) \(([^)]*)\)/g;

function parseCycleChain(explanation: string): CycleNode[] {
  const parsed = Array.from(explanation.matchAll(CYCLE_CHAIN_RE)).map(([, cpfCnpj, label]) => ({
    cpfCnpj,
    label: label === "sem nome" ? "sem nome" : label,
    type: (cpfCnpj.length === 14 ? "company" : "person") as "person" | "company",
    personId: null as number | null,
    photoUrl: null as string | null,
  }));
  const cpfs = parsed.filter((n) => n.type === "person").map((n) => n.cpfCnpj);
  if (cpfs.length > 0) {
    const placeholders = cpfs.map(() => "?").join(", ");
    const rows = db()
      .prepare(`SELECT id, cpf FROM people WHERE cpf IN (${placeholders})`)
      .all(...cpfs) as Array<{ id: number; cpf: string }>;
    const byCpf = new Map(rows.map((r) => [r.cpf, r.id]));
    for (const n of parsed) n.personId = byCpf.get(n.cpfCnpj) ?? null;
    const photoUrls = batchPhotoUrls(parsed.map((n) => n.personId).filter((id): id is number => id != null));
    for (const n of parsed) if (n.personId != null) n.photoUrl = photoUrls.get(n.personId) ?? null;
  }
  return parsed;
}

// Per-edge amounts aren't stored on the signal; re-derive them from donations/expenses
export function getCycleEdgeAmounts(nodes: CycleNode[]): number[] {
  const n = nodes.length;
  if (n < 2) return [];
  const donationStmt = db().prepare(
    `SELECT coalesce(sum(d.amount_cents), 0) AS total
     FROM campaign_donation d JOIN campaign_org co ON co.id = d.campaign_org_id
     JOIN people p ON p.id = co.person_id
     WHERE d.donor_cpf_cnpj = ? AND p.cpf = ?`
  );
  const expenseStmt = db().prepare(
    `SELECT coalesce(sum(e.amount_cents), 0) AS total
     FROM campaign_expense e JOIN campaign_org co ON co.id = e.campaign_org_id
     JOIN people p ON p.id = co.person_id
     WHERE p.cpf = ? AND e.supplier_cpf_cnpj = ?`
  );
  return nodes.map((from, i) => {
    const to = nodes[(i + 1) % n];
    const donation = (donationStmt.get(from.cpfCnpj, to.cpfCnpj) as { total: number }).total;
    const expense = (expenseStmt.get(from.cpfCnpj, to.cpfCnpj) as { total: number }).total;
    return donation + expense;
  });
}

export type Signal = {
  id: number;
  type: string;
  severity: "low" | "medium" | "high";
  explanation: string;
  role: string;
  rule: string;
  ruleVersion: string;
  expense: {
    id: number;
    description: string | null;
    amountCents: number;
    year: number;
    supplierName: string | null;
  } | null;
  graphIds: string[] | null;
  cycleNodes: CycleNode[] | null;
  cycleAmountCents: number | null;
  cyclePathLength: number | null;
  aiReview: AiReviewBrief | null;
};

export type PersonHeader = {
  person: Person;
  latestCandidacy: { year: number; office: string | null; partyAbbr: string | null; state: string | null } | null;
  candidacyCount: number;
  signalsCount: number;
  provenance: Provenance | null;
};

export function getPersonHeader(personId: number): PersonHeader | null {
  const person = db()
    .prepare(
      `SELECT id, cpf, cpf_trusted AS cpfTrusted, voter_id AS voterId, canonical_name AS canonicalName
       FROM people WHERE id = ?`
    )
    .get(personId) as
    | { id: number; cpf: string | null; cpfTrusted: number; voterId: string | null; canonicalName: string | null }
    | undefined;
  if (!person) return null;

  const latest = db()
    .prepare(
      `SELECT t.year, t.office, t.party_abbr AS partyAbbr, t.state, ${PROVENANCE_COLUMNS}
       FROM politician_history t
       ${PROVENANCE_JOIN}
       WHERE t.person_id = ?
       ORDER BY t.year DESC, t.round DESC LIMIT 1`
    )
    .get(personId) as (Record<string, unknown> & { year: number; office: string | null; partyAbbr: string | null; state: string | null }) | undefined;

  const candidacyCount = (
    db().prepare("SELECT count(*) AS n FROM politician_history WHERE person_id = ?").get(personId) as { n: number }
  ).n;
  const signalsCount = (
    db()
      .prepare("SELECT count(DISTINCT signal_id) AS n FROM signal_actor WHERE type = 'person' AND actor_id = ?")
      .get(personId) as { n: number }
  ).n;

  return {
    person: {
      id: person.id,
      cpf: person.cpf,
      cpfTrusted: !!person.cpfTrusted,
      voterId: person.voterId,
      canonicalName: person.canonicalName,
    },
    latestCandidacy: latest ? { year: latest.year, office: latest.office, partyAbbr: latest.partyAbbr, state: latest.state } : null,
    candidacyCount,
    signalsCount,
    provenance: latest ? pickProvenance(latest) : null,
  };
}

export function getPersonPhotoUrl(personId: number): string | null {
  if (!hasTable("candidate_photo")) return null;
  const row = db()
    .prepare(`SELECT photo_url AS photoUrl FROM candidate_photo WHERE person_id = ? ORDER BY year DESC LIMIT 1`)
    .get(personId) as { photoUrl: string } | undefined;
  return row?.photoUrl ?? null;
}

export function getPersonPhotoProvenance(personId: number): Provenance | null {
  if (!hasTable("candidate_photo")) return null;
  const row = db()
    .prepare(
      `SELECT ${PROVENANCE_COLUMNS} FROM candidate_photo t ${PROVENANCE_JOIN}
       WHERE t.person_id = ? ORDER BY t.year DESC LIMIT 1`
    )
    .get(personId) as Record<string, unknown> | undefined;
  return row ? pickProvenance(row) : null;
}

function batchPhotoUrls(personIds: number[]): Map<number, string> {
  const out = new Map<number, string>();
  const ids = [...new Set(personIds)];
  if (ids.length === 0 || !hasTable("candidate_photo")) return out;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db()
    .prepare(
      `SELECT person_id AS personId, photo_url AS photoUrl, max(year) AS year
       FROM candidate_photo WHERE person_id IN (${placeholders}) GROUP BY person_id`
    )
    .all(...ids) as Array<{ personId: number; photoUrl: string; year: number }>;
  for (const r of rows) out.set(r.personId, r.photoUrl);
  return out;
}

export function getPersonCandidacies(personId: number): Candidacy[] {
  const rows = db()
    .prepare(
      `SELECT t.id, t.year, t.election_type AS electionType, t.round,
              t.office, t.candidate_number AS candidateNumber,
              t.party_abbr AS partyAbbr, t.party_name AS partyName, t.state,
              t.electoral_unit AS electoralUnit, t.municipality,
              t.candidacy_status AS candidacyStatus,
              t.candidacy_status_detail AS candidacyStatusDetail,
              t.result, t.ballot_name AS ballotName, t.full_name AS fullName,
              t.birth_date AS birthDate, t.gender, t.education,
              t.marital_status AS maritalStatus, t.race, t.occupation,
              t.tse_candidacy_id AS tseCandidacyId,
              ${PROVENANCE_COLUMNS}
       FROM politician_history t
       ${PROVENANCE_JOIN}
       WHERE t.person_id = ?
       ORDER BY t.year DESC, t.round DESC`
    )
    .all(personId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    year: r.year as number,
    electionType: (r.electionType as string) ?? null,
    round: (r.round as number) ?? null,
    office: (r.office as string) ?? null,
    candidateNumber: (r.candidateNumber as string) ?? null,
    partyAbbr: (r.partyAbbr as string) ?? null,
    partyName: (r.partyName as string) ?? null,
    state: (r.state as string) ?? null,
    electoralUnit: (r.electoralUnit as string) ?? null,
    municipality: (r.municipality as string) ?? null,
    candidacyStatus: (r.candidacyStatus as string) ?? null,
    candidacyStatusDetail: (r.candidacyStatusDetail as string) ?? null,
    result: (r.result as string) ?? null,
    ballotName: (r.ballotName as string) ?? null,
    fullName: (r.fullName as string) ?? null,
    birthDate: (r.birthDate as string) ?? null,
    gender: (r.gender as string) ?? null,
    education: (r.education as string) ?? null,
    maritalStatus: (r.maritalStatus as string) ?? null,
    race: (r.race as string) ?? null,
    occupation: (r.occupation as string) ?? null,
    tseCandidacyId: (r.tseCandidacyId as string) ?? null,
    provenance: pickProvenance(r),
  }));
}

export type CandidateVoteSection = {
  municipality: string | null;
  zoneNumber: string | null;
  sectionNumber: string;
  pollingPlaceNumber: string | null;
  pollingPlaceName: string | null;
  pollingPlaceAddress: string | null;
  votes: number;
  provenance: Provenance;
};

export type PersonVoteResult = {
  historyId: number;
  year: number;
  round: number;
  office: string | null;
  state: string | null;
  partyAbbr: string | null;
  candidateNumber: string | null;
  result: string | null;
  totalVotes: number;
  sectionCount: number;
};

export function getPersonVoteResults(personId: number): PersonVoteResult[] {
  if (!hasTable("election_vote_section")) return [];

  const rows = db()
    .prepare(
      `SELECT h.id AS historyId, h.year, h.round, h.office,
              h.state, h.party_abbr AS partyAbbr, h.candidate_number AS candidateNumber, h.result,
              (SELECT COALESCE(SUM(t.votes), 0) FROM election_vote_section t WHERE t.history_id = h.id) AS totalVotes,
              (SELECT COUNT(*) FROM election_vote_section t WHERE t.history_id = h.id) AS sectionCount
       FROM politician_history h
       WHERE h.person_id = ?
         AND EXISTS (SELECT 1 FROM election_vote_section t WHERE t.history_id = h.id)
       ORDER BY h.year DESC, h.round DESC, h.office`
    )
    .all(personId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    historyId: row.historyId as number,
    year: row.year as number,
    round: (row.round as number) ?? 1,
    office: (row.office as string) ?? null,
    state: (row.state as string) ?? null,
    partyAbbr: (row.partyAbbr as string) ?? null,
    candidateNumber: (row.candidateNumber as string) ?? null,
    result: (row.result as string) ?? null,
    totalVotes: row.totalVotes as number,
    sectionCount: row.sectionCount as number,
  }));
}

export type ElectoralCaseSubject = {
  code: string | null;
  subject: string;
  provenance: Provenance;
};

export type ElectoralCaseDecision = {
  sequence: string | null;
  date: string | null;
  author: string | null;
  type: string | null;
  provenance: Provenance;
};

export type ElectoralCaseAppeal = {
  id: string;
  filedAt: string | null;
  closedAt: string | null;
  courtState: string | null;
  instance: number | null;
  className: string | null;
  type: string | null;
  nature: string | null;
  lastDecisionAt: string | null;
  lastDecisionType: string | null;
  reporter: string | null;
  provenance: Provenance;
};

export type ElectoralCaseParty = {
  candidacyYear: number;
  pole: string | null;
  type: string | null;
  name: string | null;
  socialName: string | null;
  isMain: boolean | null;
};

export type PublicElectoralCase = {
  id: number;
  caseNumber: string;
  electionYear: number;
  filedAt: string | null;
  closedAt: string | null;
  originState: string | null;
  originInstance: number | null;
  courtState: string | null;
  instance: number | null;
  distributedAt: string | null;
  distributionType: string | null;
  reporter: string | null;
  classCode: string | null;
  classAbbr: string | null;
  className: string | null;
  mainSubjectCode: string | null;
  mainSubject: string | null;
  isAppeal: boolean | null;
  decisionCount: number | null;
  lastDecisionAt: string | null;
  lastDecisionType: string | null;
  sourceUrl: string | null;
  parties: ElectoralCaseParty[];
  subjects: ElectoralCaseSubject[];
  decisions: ElectoralCaseDecision[];
  appeals: ElectoralCaseAppeal[];
  provenance: Provenance;
};

export type PersonElectoralCases = {
  available: boolean;
  cases: PublicElectoralCase[];
  total: number;
  offset: number;
  pageSize: number;
};

let electoralCaseSearchNormalizerRegistered = false;

function registerElectoralCaseSearchNormalizer() {
  if (electoralCaseSearchNormalizerRegistered) return;
  db().function(
    "normalize_electoral_case_search",
    { deterministic: true },
    (value: unknown) => normalizeName(String(value ?? "")),
  );
  electoralCaseSearchNormalizerRegistered = true;
}

export function getPersonElectoralCases(
  personId: number,
  offset = 0,
  requestedPageSize = 8,
  rawQuery = "",
  status = "",
  pole = "",
): PersonElectoralCases {
  const pageSize = Math.max(1, Math.min(20, Math.floor(requestedPageSize)));
  const safeOffset = Math.max(0, Math.floor(offset));
  const requiredTables = [
    "electoral_case",
    "electoral_case_candidate",
    "electoral_case_subject",
    "electoral_case_decision",
    "electoral_case_appeal",
  ];
  if (!requiredTables.every(hasTable)) {
    return { available: false, cases: [], total: 0, offset: safeOffset, pageSize };
  }

  const hasQuery = rawQuery.trim().length > 0;
  const queryTokens = [...new Set(
    normalizeName(rawQuery).replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean),
  )];
  if (hasQuery && queryTokens.length === 0) {
    return { available: true, cases: [], total: 0, offset: safeOffset, pageSize };
  }

  const candidateFilter = "EXISTS (SELECT 1 FROM electoral_case_candidate cc " +
    "WHERE cc.case_id = t.id AND cc.person_id = ?)";
  const searchParams: Array<string | number> = [];
  let searchFilter = "";
  if (queryTokens.length > 0) {
    registerElectoralCaseSearchNormalizer();
    const caseFields = [
      "t.case_number", "CAST(t.source_dataset_year AS TEXT)", "t.filed_at", "t.closed_at",
      "t.origin_state", "CAST(t.origin_instance AS TEXT)", "t.court_state", "CAST(t.instance AS TEXT)",
      "t.distributed_at", "t.distribution_type", "t.reporter_name", "t.class_code", "t.class_abbr",
      "t.class_name", "t.main_subject_code", "t.main_subject", "CAST(t.is_appeal AS TEXT)",
      "CAST(t.decision_count AS TEXT)", "t.last_decision_at", "t.last_decision_type", "t.source_url",
      "src.name", "src.agency", "col.url", "pa.parser_name",
    ];
    const fieldMatches = (fields: string[], pattern: string) => {
      searchParams.push(...fields.map(() => pattern));
      return fields.map((field) =>
        `normalize_electoral_case_search(COALESCE(${field}, '')) LIKE ? ESCAPE '\\'`,
      ).join(" OR ");
    };
    const tokenFilters = queryTokens.map((token) => {
      const pattern = `%${token.replace(/[\\%_]/g, "\\$&")}%`;
      const directMatches = fieldMatches(caseFields, pattern);

      searchParams.push(personId);
      const partyMatches = fieldMatches([
        "cc_search.candidacy_year", "cc_search.pole", "cc_search.party_type",
        "cc_search.party_name", "cc_search.social_name",
      ].map((field) => `CAST(${field} AS TEXT)`), pattern);
      const subjectMatches = fieldMatches(["cs_search.subject_code", "cs_search.subject"], pattern);
      const decisionMatches = fieldMatches([
        "cd_search.decision_sequence", "cd_search.decided_at", "cd_search.author_name", "cd_search.decision_type",
      ], pattern);
      const appealMatches = fieldMatches([
        "ca_search.appeal_id", "ca_search.filed_at", "ca_search.closed_at", "ca_search.court_state",
        "CAST(ca_search.instance AS TEXT)", "ca_search.class_name", "ca_search.appeal_type", "ca_search.appeal_nature",
        "ca_search.last_decision_at", "ca_search.last_decision_type", "ca_search.reporter_name",
      ], pattern);

      return `(${directMatches}
        OR EXISTS (
          SELECT 1 FROM electoral_case_candidate cc_search
          WHERE cc_search.case_id = t.id AND cc_search.person_id = ? AND (${partyMatches})
        )
        OR EXISTS (
          SELECT 1 FROM electoral_case_subject cs_search
          WHERE cs_search.case_id = t.id AND (${subjectMatches})
        )
        OR EXISTS (
          SELECT 1 FROM electoral_case_decision cd_search
          WHERE cd_search.case_id = t.id AND (${decisionMatches})
        )
        OR EXISTS (
          SELECT 1 FROM electoral_case_appeal ca_search
          WHERE ca_search.case_id = t.id AND (${appealMatches})
        ))`;
    });
    searchFilter = ` AND ${tokenFilters.join(" AND ")}`;
  }
  if(status==="closed")searchFilter+=" AND t.closed_at IS NOT NULL";
  else if(status==="open")searchFilter+=" AND t.closed_at IS NULL";
  if(pole){searchFilter+=" AND EXISTS(SELECT 1 FROM electoral_case_candidate cc_role WHERE cc_role.case_id=t.id AND cc_role.person_id=? AND cc_role.pole=?)";searchParams.push(personId,pole);}
  const filterParams = [personId, ...searchParams];
  const total = (db().prepare(
    `SELECT COUNT(*) AS total FROM electoral_case t ${PROVENANCE_JOIN}
     WHERE ${candidateFilter}${searchFilter}`,
  ).get(...filterParams) as { total: number }).total;
  const rows = db().prepare(
    `SELECT t.id, t.case_number AS caseNumber, t.source_dataset_year AS electionYear,
            t.filed_at AS filedAt, t.closed_at AS closedAt,
            t.origin_state AS originState, t.origin_instance AS originInstance,
            t.court_state AS courtState, t.instance, t.distributed_at AS distributedAt,
            t.distribution_type AS distributionType, t.reporter_name AS reporter,
            t.class_code AS classCode, t.class_abbr AS classAbbr, t.class_name AS className,
            t.main_subject_code AS mainSubjectCode, t.main_subject AS mainSubject,
            t.is_appeal AS isAppeal, t.decision_count AS decisionCount,
            t.last_decision_at AS lastDecisionAt, t.last_decision_type AS lastDecisionType,
            t.source_url AS sourceUrl, ${PROVENANCE_COLUMNS}
     FROM electoral_case t ${PROVENANCE_JOIN}
     WHERE ${candidateFilter}${searchFilter}
     ORDER BY COALESCE(t.last_decision_at, t.filed_at, '') DESC, t.case_number
     LIMIT ? OFFSET ?`
  ).all(...filterParams, pageSize, safeOffset) as Array<Record<string, unknown>>;

  const cases = rows.map((row): PublicElectoralCase => ({
    id: row.id as number,
    caseNumber: row.caseNumber as string,
    electionYear: row.electionYear as number,
    filedAt: (row.filedAt as string) ?? null,
    closedAt: (row.closedAt as string) ?? null,
    originState: (row.originState as string) ?? null,
    originInstance: (row.originInstance as number) ?? null,
    courtState: (row.courtState as string) ?? null,
    instance: (row.instance as number) ?? null,
    distributedAt: (row.distributedAt as string) ?? null,
    distributionType: (row.distributionType as string) ?? null,
    reporter: (row.reporter as string) ?? null,
    classCode: (row.classCode as string) ?? null,
    classAbbr: (row.classAbbr as string) ?? null,
    className: (row.className as string) ?? null,
    mainSubjectCode: (row.mainSubjectCode as string) ?? null,
    mainSubject: (row.mainSubject as string) ?? null,
    isAppeal: row.isAppeal == null ? null : Boolean(row.isAppeal),
    decisionCount: (row.decisionCount as number) ?? null,
    lastDecisionAt: (row.lastDecisionAt as string) ?? null,
    lastDecisionType: (row.lastDecisionType as string) ?? null,
    sourceUrl: (row.sourceUrl as string) ?? null,
    parties: [],
    subjects: [],
    decisions: [],
    appeals: [],
    provenance: pickProvenance(row),
  }));
  if (cases.length === 0) {
    return { available: true, cases, total, offset: safeOffset, pageSize };
  }

  const byCaseId = new Map(cases.map((item) => [item.id, item]));
  const caseIds = cases.map((item) => item.id);
  const casePlaceholders = caseIds.map(() => "?").join(", ");

  const partyRows = db().prepare(
    `SELECT cc.case_id AS caseId, cc.candidacy_year AS candidacyYear, cc.pole,
            cc.party_type AS type, cc.party_name AS name, cc.social_name AS socialName,
            cc.is_main_party AS isMain
     FROM electoral_case_candidate cc
     WHERE cc.person_id = ? AND cc.case_id IN (${casePlaceholders})
     ORDER BY cc.candidacy_year DESC, cc.id`
  ).all(personId, ...caseIds) as Array<Record<string, unknown>>;
  for (const row of partyRows) {
    const item = byCaseId.get(row.caseId as number);
    if (!item) continue;
    item.parties.push({
      candidacyYear: row.candidacyYear as number,
      pole: (row.pole as string) ?? null,
      type: (row.type as string) ?? null,
      name: (row.name as string) ?? null,
      socialName: (row.socialName as string) ?? null,
      isMain: row.isMain == null ? null : Boolean(row.isMain),
    });
  }

  const subjectRows = db().prepare(
    `SELECT t.case_id AS caseId, t.subject_code AS code, t.subject, ${PROVENANCE_COLUMNS}
     FROM electoral_case_subject t ${PROVENANCE_JOIN}
     WHERE t.case_id IN (${casePlaceholders})
     ORDER BY t.subject COLLATE NOCASE`
  ).all(...caseIds) as Array<Record<string, unknown>>;
  for (const row of subjectRows) {
    byCaseId.get(row.caseId as number)?.subjects.push({
      code: (row.code as string) ?? null,
      subject: row.subject as string,
      provenance: pickProvenance(row),
    });
  }

  const decisionRows = db().prepare(
    `SELECT t.case_id AS caseId, t.decision_sequence AS sequence, t.decided_at AS date,
            t.author_name AS author, t.decision_type AS type, ${PROVENANCE_COLUMNS}
     FROM electoral_case_decision t ${PROVENANCE_JOIN}
     WHERE t.case_id IN (${casePlaceholders})
     ORDER BY t.decided_at DESC, t.id DESC`
  ).all(...caseIds) as Array<Record<string, unknown>>;
  for (const row of decisionRows) {
    byCaseId.get(row.caseId as number)?.decisions.push({
      sequence: (row.sequence as string) ?? null,
      date: (row.date as string) ?? null,
      author: (row.author as string) ?? null,
      type: (row.type as string) ?? null,
      provenance: pickProvenance(row),
    });
  }

  const appealRows = db().prepare(
    `SELECT t.case_id AS caseId, t.appeal_id AS appealId, t.filed_at AS filedAt,
            t.closed_at AS closedAt, t.court_state AS courtState, t.instance,
            t.class_name AS className, t.appeal_type AS type, t.appeal_nature AS nature,
            t.last_decision_at AS lastDecisionAt, t.last_decision_type AS lastDecisionType,
            t.reporter_name AS reporter, ${PROVENANCE_COLUMNS}
     FROM electoral_case_appeal t ${PROVENANCE_JOIN}
     WHERE t.case_id IN (${casePlaceholders})
     ORDER BY t.filed_at DESC, t.id DESC`
  ).all(...caseIds) as Array<Record<string, unknown>>;
  for (const row of appealRows) {
    byCaseId.get(row.caseId as number)?.appeals.push({
      id: row.appealId as string,
      filedAt: (row.filedAt as string) ?? null,
      closedAt: (row.closedAt as string) ?? null,
      courtState: (row.courtState as string) ?? null,
      instance: (row.instance as number) ?? null,
      className: (row.className as string) ?? null,
      type: (row.type as string) ?? null,
      nature: (row.nature as string) ?? null,
      lastDecisionAt: (row.lastDecisionAt as string) ?? null,
      lastDecisionType: (row.lastDecisionType as string) ?? null,
      reporter: (row.reporter as string) ?? null,
      provenance: pickProvenance(row),
    });
  }

  return { available: true, cases, total, offset: safeOffset, pageSize };
}

export function getPersonVoteSectionsPage(
  historyId: number,
  page: number,
  query: string,
): { sections: CandidateVoteSection[]; total: number; pageSize: number } {
  const pageSize = 25;
  if (!hasTable("election_vote_section")) return { sections: [], total: 0, pageSize };

  const trimmedQuery = query.trim().slice(0, 100);
  const filterSql = trimmedQuery
    ? `AND (
         COALESCE(t.municipality, '') LIKE ? ESCAPE '\\' OR
         COALESCE(t.polling_place_name, '') LIKE ? ESCAPE '\\' OR
         COALESCE(t.polling_place_address, '') LIKE ? ESCAPE '\\' OR
         COALESCE(t.polling_place_number, '') LIKE ? ESCAPE '\\' OR
         COALESCE(t.zone_number, '') LIKE ? ESCAPE '\\' OR
         COALESCE(t.section_number, '') LIKE ? ESCAPE '\\'
       )`
    : "";
  const pattern = `%${trimmedQuery.replace(/[\\%_]/g, "\\$&")}%`;
  const filterParams = trimmedQuery ? [pattern, pattern, pattern, pattern, pattern, pattern] : [];
  const totalRow = db()
    .prepare(`SELECT COUNT(*) AS total FROM election_vote_section t WHERE t.history_id = ? ${filterSql}`)
    .get(historyId, ...filterParams) as { total: number };
  const rows = db()
    .prepare(
      `SELECT t.municipality, t.zone_number AS zoneNumber, t.section_number AS sectionNumber,
              t.polling_place_number AS pollingPlaceNumber,
              t.polling_place_name AS pollingPlaceName,
              t.polling_place_address AS pollingPlaceAddress, t.votes,
              ${PROVENANCE_COLUMNS}
       FROM election_vote_section t
       ${PROVENANCE_JOIN}
       WHERE t.history_id = ? ${filterSql}
       ORDER BY t.votes DESC, t.municipality COLLATE NOCASE, t.polling_place_name COLLATE NOCASE,
                t.zone_number, t.section_number
       LIMIT ? OFFSET ?`
    )
    .all(historyId, ...filterParams, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;

  return {
    total: totalRow.total,
    pageSize,
    sections: rows.map((row) => ({
      municipality: (row.municipality as string) ?? null,
      zoneNumber: (row.zoneNumber as string) ?? null,
      sectionNumber: row.sectionNumber as string,
      pollingPlaceNumber: (row.pollingPlaceNumber as string) ?? null,
      pollingPlaceName: (row.pollingPlaceName as string) ?? null,
      pollingPlaceAddress: (row.pollingPlaceAddress as string) ?? null,
      votes: row.votes as number,
      provenance: pickProvenance(row),
    })),
  };
}

export function getPersonCampaignOrgs(personId: number): CampaignOrg[] {
  const rows = db()
    .prepare(
      `SELECT t.id, t.cnpj, t.year, t.office, t.party_abbr AS partyAbbr, t.state,
              ${PROVENANCE_COLUMNS}
       FROM campaign_org t
       ${PROVENANCE_JOIN}
       WHERE t.person_id = ?
       ORDER BY t.year DESC`
    )
    .all(personId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    cnpj: r.cnpj as string,
    year: r.year as number,
    office: (r.office as string) ?? null,
    partyAbbr: (r.partyAbbr as string) ?? null,
    state: (r.state as string) ?? null,
    provenance: pickProvenance(r),
  }));
}

export function getPersonSocialMedia(personId: number): SocialMediaLink[] {
  const rows = db()
    .prepare(
      `SELECT t.id, t.year, t.platform, t.url, t.state,
              ${PROVENANCE_COLUMNS}
       FROM social_media t
       ${PROVENANCE_JOIN}
       WHERE t.person_id = ?
       ORDER BY t.year DESC, t.platform`
    )
    .all(personId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    year: r.year as number,
    platform: r.platform as string,
    url: r.url as string,
    state: (r.state as string) ?? null,
    provenance: pickProvenance(r),
  }));
}

export function getPersonAssets(
  personId: number
): { declaredAssets: DeclaredAsset[]; declaredAssetsByYear: DeclaredAssetsYearSummary[] } {
  const rows = db()
    .prepare(
      `SELECT t.id, t.year, t.asset_type AS assetType, t.description,
              t.value_cents AS valueCents, t.source_updated_at AS sourceUpdatedAt,
              ${PROVENANCE_COLUMNS}
       FROM declared_assets t
       ${PROVENANCE_JOIN}
       WHERE t.person_id = ?
       ORDER BY t.year DESC, t.value_cents DESC`
    )
    .all(personId) as Array<Record<string, unknown>>;

  return {
    declaredAssets: rows.map((r) => ({
      id: r.id as number,
      year: r.year as number,
      assetType: (r.assetType as string) ?? null,
      description: (r.description as string) ?? null,
      valueCents: (r.valueCents as number) ?? 0,
      valueMissing:r.valueCents==null,
      sourceUpdatedAt: (r.sourceUpdatedAt as string) ?? null,
      provenance: pickProvenance(r),
    })),
    declaredAssetsByYear: Object.values(
      rows.reduce<Record<number, DeclaredAssetsYearSummary>>((acc, r) => {
        const y = r.year as number;
        const cents = (r.valueCents as number) ?? 0;
        acc[y] ??= { year: y, totalCents: 0, count: 0,missingValues:0 };
        if(r.valueCents==null)acc[y].missingValues=(acc[y].missingValues||0)+1;
        acc[y].totalCents += cents;
        acc[y].count += 1;
        return acc;
      }, {})
    ).sort((a, b) => a.year - b.year),
  };
}

export type CandidateComparisonRecord = {
  personId: number;
  name: string;
  photoUrl: string | null;
  latestCandidacy: {
    year: number;
    office: string | null;
    municipality:string|null; round:number|null;
    partyAbbr: string | null;
    state: string | null;
    result: string | null;
  } | null;
  candidacyCount: number;
  donationsTotalCents: number;
  donationsCount: number;
  expensesCount: number;
  electoralFundsTotalCents: number;
  expensesTotalCents: number;
  latestVote: { year: number; totalVotes: number } | null;
  latestAssets: { year: number; totalCents: number; missingValues: number } | null;
  paymentsTotalCents:number;
  paymentsCount:number;
};

export function getCandidateComparison(personIds: number[], year?: number): CandidateComparisonRecord[] {
  const ids = [...new Set(personIds)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 3);

  return ids.flatMap((personId) => {
    const header = getPersonHeader(personId);
    if (!header || header.candidacyCount === 0) return [];

    const candidacies = getPersonCandidacies(personId);
    const finance = getPersonFinance(personId, year);
    const votes = getPersonVoteResults(personId);
    const assetsByYear = getPersonAssets(personId).declaredAssetsByYear;
    const latest = candidacies.find(item => !year || item.year === year);
    const latestVote = votes.find(item => !year || item.year === year);
    const latestAssets = [...assetsByYear].reverse().find(item => !year || item.year === year);

    return [{
      personId,
      name: header.person.canonicalName ?? "Nome não disponível",
      photoUrl: getPersonPhotoUrl(personId),
      latestCandidacy: latest ? {
        year: latest.year,
        office: latest.office,
        municipality:latest.municipality,round:latest.round,
        partyAbbr: latest.partyAbbr,
        state: latest.state,
        result: latest.result,
      } : null,
      candidacyCount: header.candidacyCount,
      donationsTotalCents: finance.donationsTotalCents,
      donationsCount: finance.donationsCount,
      expensesCount: finance.expensesCount,
      electoralFundsTotalCents: finance.electoralFundTotalCents,
      expensesTotalCents: finance.expensesTotalCents,
      paymentsTotalCents:finance.paymentsTotalCents,
      paymentsCount:finance.paymentsCount,
      latestVote: latestVote ? { year: latestVote.year, totalVotes: latestVote.totalVotes } : null,
      latestAssets: latestAssets && latestAssets.count!==(latestAssets.missingValues||0) ? { year: latestAssets.year, totalCents: latestAssets.totalCents, missingValues: latestAssets.missingValues || 0 } : null,
    }];
  });
}

export type ParliamentaryEarmark = {
  id: number;
  earmarkCode: string;
  year: number;
  earmarkType: string | null;
  locality: string | null;
  state: string | null;
  municipality: string | null;
  functionName: string | null;
  actionName: string | null;
  committedCents: number | null;
  paidCents: number | null;
  provenance: Provenance;
};

export function getPersonEarmarks(
  personId: number
): { earmarks: ParliamentaryEarmark[]; totalCommittedCents: number; totalPaidCents: number } {
  if (!hasTable("parliamentary_earmark")) {
    return { earmarks: [], totalCommittedCents: 0, totalPaidCents: 0 };
  }
  const rows = db()
    .prepare(
      `SELECT t.id, t.earmark_code AS earmarkCode, t.year, t.earmark_type AS earmarkType,
              t.locality, t.state, t.municipality, t.function_name AS functionName,
              t.action_name AS actionName, t.committed_cents AS committedCents,
              t.paid_cents AS paidCents,
              ${PROVENANCE_COLUMNS}
       FROM parliamentary_earmark t
       ${PROVENANCE_JOIN}
       WHERE t.author_person_id = ?
       ORDER BY t.year DESC, t.committed_cents DESC`
    )
    .all(personId) as Array<Record<string, unknown>>;

  const earmarks = rows.map((r) => ({
    id: r.id as number,
    earmarkCode: r.earmarkCode as string,
    year: r.year as number,
    earmarkType: (r.earmarkType as string) ?? null,
    locality: (r.locality as string) ?? null,
    state: (r.state as string) ?? null,
    municipality: (r.municipality as string) ?? null,
    functionName: (r.functionName as string) ?? null,
    actionName: (r.actionName as string) ?? null,
    committedCents: (r.committedCents as number) ?? null,
    paidCents: (r.paidCents as number) ?? null,
    provenance: pickProvenance(r),
  }));

  return {
    earmarks,
    totalCommittedCents: earmarks.reduce((s, e) => s + (e.committedCents ?? 0), 0),
    totalPaidCents: earmarks.reduce((s, e) => s + (e.paidCents ?? 0), 0),
  };
}

export type CompanyEarmark = {
  earmarkCode: string;
  earmarkYear: number | null;
  authorName: string | null;
  authorPersonId: number | null;
  amountCents: number;
  monthsCount: number;
  state: string | null;
  municipality: string | null;
};

export function getCompanyEarmarks(cnpj: string): { earmarks: CompanyEarmark[]; totalCents: number } {
  if (!hasTable("parliamentary_earmark_beneficiary")) return { earmarks: [], totalCents: 0 };
  const rows = db()
    .prepare(
      // aggregate first, then join one author row per code: earmark_code isn't unique (fan-out)
      `WITH agg AS (
         SELECT earmark_code, sum(amount_cents) AS amountCents, count(*) AS monthsCount,
                min(state) AS state, min(municipality) AS municipality
         FROM parliamentary_earmark_beneficiary
         WHERE beneficiary_doc = ? AND earmark_code != 'Sem informação'
         GROUP BY earmark_code
       ),
       author AS (
         SELECT earmark_code, author_name, author_person_id, year,
                row_number() OVER (PARTITION BY earmark_code ORDER BY id) AS rn
         FROM parliamentary_earmark
       )
       SELECT agg.earmark_code AS earmarkCode, agg.amountCents, agg.monthsCount, agg.state, agg.municipality,
              author.author_name AS authorName, author.author_person_id AS authorPersonId, author.year AS earmarkYear
       FROM agg
       LEFT JOIN author ON author.earmark_code = agg.earmark_code AND author.rn = 1
       ORDER BY agg.amountCents DESC`
    )
    .all(cnpj) as Array<Record<string, unknown>>;

  const earmarks = rows.map((r) => ({
    earmarkCode: r.earmarkCode as string,
    earmarkYear: (r.earmarkYear as number) ?? null,
    authorName: (r.authorName as string) ?? null,
    authorPersonId: (r.authorPersonId as number) ?? null,
    amountCents: r.amountCents as number,
    monthsCount: r.monthsCount as number,
    state: (r.state as string) ?? null,
    municipality: (r.municipality as string) ?? null,
  }));

  return { earmarks, totalCents: earmarks.reduce((s, e) => s + e.amountCents, 0) };
}

export type EarmarkPaymentRow = {
  earmarkCode: string;
  year: number | null;
  authorName: string | null;
  authorPersonId: number | null;
  authorPhotoUrl: string | null;
  companyName: string | null;
  companyCnpj: string;
  amountCents: number;
  earmarkType:string|null; purpose:string|null; locality:string|null; sourceUrl:string|null; collectedAt:string|null;
};

export type EarmarkPaymentPage = { rows: EarmarkPaymentRow[]; total: number };

export const EARMARK_PAGE_SIZE = 50;

export function getEarmarkPayments(opts: {
  page?: number;
  q?: string;
  order?: "asc" | "desc";
  year?:number; type?:string; includePublic?:boolean;
}): EarmarkPaymentPage {
  if (!hasTable("parliamentary_earmark_beneficiary")) return { rows: [], total: 0 };
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const offset = (page - 1) * EARMARK_PAGE_SIZE;
  const sortDir = opts.order === "asc" ? "ASC" : "DESC";
  const q = opts.q?.trim() ?? "";

  // BB, Caixa and BNDES are payment rails between emenda and recipient; excluded by CNPJ
  const PASSTHROUGH_CNPJS = ["00000000000191", "00360305000104", "00038166000105"];
  // Government bodies typed as Pessoa Juridica; name prefixes because legal_nature is mostly unset
  const GOV_NAME_PATTERNS = [
    "MUNICIPIO D%", "ESTADO D%", "PREFEITURA%", "GOVERNO D%", "CAMARA MUNICIPAL%",
    "ASSEMBLEIA LEGISLATIVA%", "UNIAO FEDERAL%", "%MINISTERIO%", "%SECRETARIA%",
    "%FUNDO ESTADUAL%", "%FUNDO MUNICIPAL%", "%FUNDO NACIONAL%", "%FUNDO ESPECIAL%",
    "%FUNDO DE SAUDE%", "%DEPARTAMENTO DE ESTRADAS%",
    "CONSORCIO INTERFEDERATIVO%", "CONSORCIO PUBLICO%", "CONSORCIO INTERMUNICIPAL%",
  ];

  const CTE = `
    WITH agg AS (
      SELECT earmark_code, beneficiary_doc, beneficiary_name, sum(amount_cents) AS amountCents
      FROM parliamentary_earmark_beneficiary
      WHERE beneficiary_type LIKE 'Pessoa Jur%' AND earmark_code != 'Sem informação'
        ${opts.includePublic?"":`AND beneficiary_doc NOT IN (${PASSTHROUGH_CNPJS.map(() => "?").join(", ")}) AND ${GOV_NAME_PATTERNS.map(() => "beneficiary_name NOT LIKE ?").join(" AND ")}`}
      GROUP BY earmark_code, beneficiary_doc
    ),
    author AS (
      SELECT earmark_code, author_name, author_person_id, year,earmark_type,program_name,action_name,locality,
             row_number() OVER (PARTITION BY earmark_code ORDER BY id) AS rn
      FROM parliamentary_earmark
    ),
    joined AS (
      SELECT agg.earmark_code AS earmarkCode, agg.beneficiary_doc AS companyCnpj,
             agg.beneficiary_name AS companyName, agg.amountCents,
             author.author_name AS authorName, author.author_person_id AS authorPersonId,
             author.year AS year, author.earmark_type AS earmarkType, author.program_name || ' · ' || author.action_name AS purpose,author.locality,
             (SELECT col.url FROM parliamentary_earmark_beneficiary b JOIN parse pa ON pa.id=b.provenance_id JOIN collection col ON col.id=pa.collection_id WHERE b.earmark_code=agg.earmark_code AND b.beneficiary_doc=agg.beneficiary_doc LIMIT 1) AS sourceUrl,
             (SELECT max(b.collected_at) FROM parliamentary_earmark_beneficiary b WHERE b.earmark_code=agg.earmark_code AND b.beneficiary_doc=agg.beneficiary_doc) AS collectedAt
      FROM agg
      LEFT JOIN author ON author.earmark_code = agg.earmark_code AND author.rn = 1
    )
  `;
  const filters:string[]=[],qArgs:(string|number)[]=[];
  if(q){filters.push("(instr(normalize_public_name(companyName),normalize_public_name(?))>0 OR instr(normalize_public_name(authorName),normalize_public_name(?))>0)");qArgs.push(q,q);}
  if(opts.year){filters.push("year=?");qArgs.push(opts.year);}
  if(opts.type){filters.push("earmarkType=?");qArgs.push(opts.type);}
  const where=filters.length?"WHERE "+filters.join(" AND "):"";

  const cteArgs = opts.includePublic?[]:[...PASSTHROUGH_CNPJS, ...GOV_NAME_PATTERNS];
  const total = (
    db().prepare(`${CTE} SELECT count(*) AS n FROM joined ${where}`).get(...cteArgs, ...qArgs) as { n: number }
  ).n;
  const rows = db()
    .prepare(
      `${CTE} SELECT * FROM joined ${where} ORDER BY amountCents ${sortDir} LIMIT ? OFFSET ?`
    )
    .all(...cteArgs, ...qArgs, EARMARK_PAGE_SIZE, offset) as Array<Record<string, unknown>>;

  const photoUrls = batchPhotoUrls(
    rows.map((r) => r.authorPersonId as number | null).filter((id): id is number => id != null)
  );

  return {
    total,
    rows: rows.map((r) => ({
      earmarkCode: r.earmarkCode as string,
      year: (r.year as number) ?? null,
      authorName: (r.authorName as string) ?? null,
      authorPersonId: (r.authorPersonId as number) ?? null,
      authorPhotoUrl: r.authorPersonId != null ? (photoUrls.get(r.authorPersonId as number) ?? null) : null,
      companyName: (r.companyName as string) ?? null,
      companyCnpj: r.companyCnpj as string,
      amountCents: r.amountCents as number,
      earmarkType:r.earmarkType as string|null,purpose:r.purpose as string|null,locality:r.locality as string|null,sourceUrl:r.sourceUrl as string|null,collectedAt:r.collectedAt as string|null,
    })),
  };
}

export function getPersonFinance(personId: number, year?: number): FinanceSummary {
  const yearClause = year != null ? " AND t.year = ?" : "";
  const yearArgs = year != null ? [year] : [];

  const donationsAgg = db()
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(t.amount_cents), 0) AS total
       FROM campaign_donation t JOIN campaign_org co ON co.id = t.campaign_org_id
       WHERE co.person_id = ?${yearClause}`
    )
    .get(personId, ...yearArgs) as { n: number; total: number };

  const expensesAgg = db()
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(t.amount_cents), 0) AS total
       FROM campaign_expense t JOIN campaign_org co ON co.id = t.campaign_org_id
       WHERE co.person_id = ?${yearClause}`
    )
    .get(personId, ...yearArgs) as { n: number; total: number };

  const electoralFundAgg = db()
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(t.amount_cents), 0) AS total
       FROM campaign_donation t JOIN campaign_org co ON co.id = t.campaign_org_id
       WHERE co.person_id = ? AND t.source IN ('FUNDO ESPECIAL', 'FUNDO PARTIDARIO')${yearClause}`
    )
    .get(personId, ...yearArgs) as { n: number; total: number };

  const paymentsAgg = db()
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(p.amount_cents), 0) AS total
       FROM campaign_expense_payment p
       JOIN campaign_expense ce ON ce.id = p.campaign_expense_id
       JOIN campaign_org co ON co.id = ce.campaign_org_id
       WHERE co.person_id = ?${year != null ? " AND ce.year = ?" : ""}`
    )
    .get(personId, ...yearArgs) as { n: number; total: number };

  return {
    donationsCount: donationsAgg.n,
    donationsTotalCents: donationsAgg.total,
    expensesCount: expensesAgg.n,
    expensesTotalCents: expensesAgg.total,
    paymentsTotalCents: paymentsAgg.total,
    paymentsCount: paymentsAgg.n,
    electoralFundTotalCents: electoralFundAgg.total,
    electoralFundCount: electoralFundAgg.n,
  };
}

export function getPersonSignals(personId: number): { signals: Signal[]; signalsCount: number } {
  const signalRows = db()
    .prepare(
      `SELECT s.id, s.type, s.severity, s.explanation, sa.role,
              rr.rule, rr.rule_version AS ruleVersion,
              s.amount_cents AS amountCents, s.path_length AS pathLength,
              ar.verdict AS aiVerdict, ar.confidence AS aiConfidence,
              ar.explanation AS aiExplanation, ar.model AS aiModel
       FROM signal_actor sa
       JOIN signal s ON s.id = sa.signal_id
       JOIN rule_run rr ON rr.id = s.rule_run_id
       LEFT JOIN signal_ai_review ar ON ar.signal_id = s.id
         AND ar.reviewed_at = (SELECT max(x.reviewed_at) FROM signal_ai_review x WHERE x.signal_id = s.id)
       WHERE sa.type = 'person' AND sa.actor_id = ?
       ORDER BY CASE s.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                coalesce(s.amount_cents, 0) DESC
       LIMIT 30`
    )
    .all(personId) as Array<Record<string, unknown>>;

  const expenseSignalIds = signalRows.filter((r) => r.rule === "disproportionate_expense").map((r) => r.id as number);
  const expenseBySignal = new Map<number, Record<string, unknown>>();
  if (expenseSignalIds.length > 0) {
    const ph = expenseSignalIds.map(() => "?").join(", ");
    for (const row of db()
      .prepare(
        `SELECT se.signal_id AS signalId, ce.id, ce.description, ce.amount_cents AS amountCents,
                ce.year, ce.supplier_name AS supplierName
         FROM signal_evidence se JOIN campaign_expense ce ON ce.id = se.record_id
         WHERE se.signal_id IN (${ph}) AND se.table_name = 'campaign_expense'`
      )
      .all(...expenseSignalIds) as Array<Record<string, unknown>>) {
      expenseBySignal.set(row.signalId as number, row);
    }
  }

  const cycleSignalIds = signalRows.filter((r) => r.rule === "circular_donations").map((r) => r.id as number);
  const graphIdsBySignal = new Map<number, string[]>();
  if (cycleSignalIds.length > 0) {
    const ph = cycleSignalIds.map(() => "?").join(", ");
    for (const row of db()
      .prepare(
        `SELECT sa.signal_id AS signalId,
                CASE WHEN sa.type = 'person' THEN p.cpf ELSE c.cnpj END AS cpfCnpj
         FROM signal_actor sa
         LEFT JOIN people p ON sa.type = 'person' AND p.id = sa.actor_id
         LEFT JOIN companies c ON sa.type = 'company' AND c.id = sa.actor_id
         WHERE sa.signal_id IN (${ph})
         ORDER BY sa.rowid`
      )
      .all(...cycleSignalIds) as Array<{ signalId: number; cpfCnpj: string | null }>) {
      if (!row.cpfCnpj) continue;
      const ids = graphIdsBySignal.get(row.signalId) ?? [];
      ids.push(row.cpfCnpj);
      graphIdsBySignal.set(row.signalId, ids);
    }
  }

  const signalsCount = (
    db()
      .prepare("SELECT count(DISTINCT signal_id) AS n FROM signal_actor WHERE type = 'person' AND actor_id = ?")
      .get(personId) as { n: number }
  ).n;

  return {
    signals: signalRows.map((r) => {
      const id = r.id as number;
      const expenseRow = expenseBySignal.get(id);
      return {
        id,
        type: r.type as string,
        severity: r.severity as Signal["severity"],
        explanation: r.explanation as string,
        role: r.role as string,
        rule: r.rule as string,
        ruleVersion: r.ruleVersion as string,
        expense: expenseRow ? {
          id: expenseRow.id as number,
          description: (expenseRow.description as string) ?? null,
          amountCents: (expenseRow.amountCents as number) ?? 0,
          year: expenseRow.year as number,
          supplierName: (expenseRow.supplierName as string) ?? null,
        } : null,
        graphIds: graphIdsBySignal.get(id) ?? null,
        cycleNodes: r.rule === "circular_donations" ? parseCycleChain(r.explanation as string) : null,
        cycleAmountCents: r.rule === "circular_donations" ? ((r.amountCents as number) ?? null) : null,
        cyclePathLength: r.rule === "circular_donations" ? ((r.pathLength as number) ?? null) : null,
        aiReview: r.aiVerdict
          ? {
              verdict: r.aiVerdict as AiVerdict,
              confidence: (r.aiConfidence as string) ?? null,
              explanation: (r.aiExplanation as string) ?? "",
              model: (r.aiModel as string) ?? "",
            }
          : null,
      };
    }),
    signalsCount,
  };
}

export type TopSupplier = {
  cnpj: string;
  name: string;
  totalCents: number;
  paymentCount: number;
  candidacyCount: number;
};

let yearsVersion=0;
function invalidateYearCaches(){const version=dataVersion();if(version===yearsVersion)return;cachedCandidacyYears=null;cachedExpenseYears=null;cachedAssetYears=null;yearsVersion=version;}
let cachedCandidacyYears: number[] | null = null;

export function getCandidacyYears(): number[] {
  invalidateYearCaches();
  if (cachedCandidacyYears) return cachedCandidacyYears;
  const rows = db()
    .prepare("SELECT DISTINCT year FROM politician_history ORDER BY year DESC")
    .all() as Array<{ year: number }>;
  cachedCandidacyYears = rows.map((row) => row.year);
  return cachedCandidacyYears;
}

let cachedExpenseYears: number[] | null = null;

export function getExpenseYears(): number[] {
  invalidateYearCaches();
  if (cachedExpenseYears) return cachedExpenseYears;
  const rows = db()
    .prepare("SELECT DISTINCT year FROM campaign_expense ORDER BY year DESC")
    .all() as Array<{ year: number }>;
  cachedExpenseYears = rows.map((r) => r.year);
  return cachedExpenseYears;
}

let cachedAssetYears: number[] | null = null;

export function getAssetYears(): number[] {
  invalidateYearCaches();
  if (cachedAssetYears) return cachedAssetYears;
  const rows = db()
    .prepare("SELECT DISTINCT year FROM declared_assets ORDER BY year DESC")
    .all() as Array<{ year: number }>;
  cachedAssetYears = rows.map((r) => r.year);
  return cachedAssetYears;
}

export type AssetsRankingRow = {
  personId: number;
  name: string | null;
  assetCount: number;
  assetTotalCents: number;
  office: string | null;
  partyAbbr: string | null;
  state: string | null;
  year: number | null;
  photoUrl: string | null;
};

export type AssetsRankingPage = { rows: AssetsRankingRow[]; total: number };

export function getAssetsRanking(opts: {
  year?: number;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}): AssetsRankingPage {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const sortDir = opts.order === "asc" ? "ASC" : "DESC";
  const yearArgs = opts.year != null ? [opts.year] : [];

  // Each declaration is a full snapshot, so "all years" uses only each person's latest year
  const latestYearJoin = opts.year != null
    ? ""
    : `JOIN (
         SELECT person_id, max(year) AS year
         FROM declared_assets
         WHERE person_id IS NOT NULL
         GROUP BY person_id
       ) latest ON latest.person_id = da.person_id AND latest.year = da.year`;
  const yearWhere = opts.year != null ? "WHERE da.year = ? AND da.person_id IS NOT NULL" : "WHERE da.person_id IS NOT NULL";

  const total = (
    db()
      .prepare(
        `SELECT count(*) AS n FROM (
           SELECT da.person_id FROM declared_assets da ${latestYearJoin} ${yearWhere}
           GROUP BY da.person_id
         )`
      )
      .get(...yearArgs) as { n: number }
  ).n;

  const rows = db()
    .prepare(
      `WITH agg AS (
         SELECT da.person_id, count(*) AS assetCount, coalesce(sum(da.value_cents), 0) AS assetTotalCents
         FROM declared_assets da
         ${latestYearJoin}
         ${yearWhere}
         GROUP BY da.person_id
       )
       SELECT a.person_id AS personId, p.canonical_name AS name, a.assetCount, a.assetTotalCents,
              ph.office, ph.party_abbr AS partyAbbr, ph.state, ph.year
       FROM agg a
       JOIN people p ON p.id = a.person_id
       LEFT JOIN politician_history ph ON ph.id = (
         -- unique row id avoids fan-out when a person has several candidacies in one year
         SELECT ph2.id FROM politician_history ph2
         WHERE ph2.person_id = a.person_id${opts.year != null ? " AND ph2.year = ?" : ""}
         ORDER BY ph2.year DESC, ph2.id DESC
         LIMIT 1
       )
       ORDER BY a.assetTotalCents ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(...yearArgs, ...yearArgs, limit, offset) as Array<Record<string, unknown>>;

  const photoUrls = batchPhotoUrls(rows.map((r) => r.personId as number));
  return {
    total,
    rows: rows.map((r) => ({
      personId: r.personId as number,
      name: (r.name as string) ?? null,
      assetCount: r.assetCount as number,
      assetTotalCents: r.assetTotalCents as number,
      office: (r.office as string) ?? null,
      partyAbbr: (r.partyAbbr as string) ?? null,
      state: (r.state as string) ?? null,
      year: (r.year as number) ?? null,
      photoUrl: photoUrls.get(r.personId as number) ?? null,
    })),
  };
}

export type AssetsGrowthRow = {
  personId: number;
  name: string | null;
  office: string | null;
  partyAbbr: string | null;
  state: string | null;
  firstYear: number;
  lastYear: number;
  firstCents: number;
  lastCents: number;
  growthCents: number;
  /** null when firstCents <= 0 */
  growthPct: number | null;
  photoUrl: string | null;
};

export type AssetsGrowthPage = { rows: AssetsGrowthRow[]; total: number };

export function getAssetsGrowthRanking(opts: {
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}): AssetsGrowthPage {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const sortDir = opts.order === "asc" ? "ASC" : "DESC";

  const CTE = `
    WITH bounds AS (
      SELECT person_id, min(year) AS firstYear, max(year) AS lastYear
      FROM declared_assets
      WHERE person_id IS NOT NULL
      GROUP BY person_id
      HAVING count(DISTINCT year) >= 2
    ),
    first_total AS (
      SELECT da.person_id, coalesce(sum(da.value_cents), 0) AS totalCents
      FROM declared_assets da JOIN bounds b ON b.person_id = da.person_id AND da.year = b.firstYear
      GROUP BY da.person_id
    ),
    last_total AS (
      SELECT da.person_id, coalesce(sum(da.value_cents), 0) AS totalCents
      FROM declared_assets da JOIN bounds b ON b.person_id = da.person_id AND da.year = b.lastYear
      GROUP BY da.person_id
    ),
    growth AS (
      SELECT b.person_id, b.firstYear, b.lastYear, f.totalCents AS firstCents, l.totalCents AS lastCents,
             (l.totalCents - f.totalCents) AS growthCents
      FROM bounds b
      JOIN first_total f ON f.person_id = b.person_id
      JOIN last_total l ON l.person_id = b.person_id
    )
  `;

  const total = (
    db().prepare(`${CTE} SELECT count(*) AS n FROM growth`).get() as { n: number }
  ).n;

  const rows = db()
    .prepare(
      `${CTE}
       SELECT g.person_id AS personId, p.canonical_name AS name, g.firstYear, g.lastYear,
              g.firstCents, g.lastCents, g.growthCents,
              ph.office, ph.party_abbr AS partyAbbr, ph.state
       FROM growth g
       JOIN people p ON p.id = g.person_id
       LEFT JOIN politician_history ph ON ph.id = (
         SELECT ph2.id FROM politician_history ph2
         WHERE ph2.person_id = g.person_id
         ORDER BY ph2.year DESC, ph2.id DESC
         LIMIT 1
       )
       ORDER BY g.growthCents ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Array<Record<string, unknown>>;

  const photoUrls = batchPhotoUrls(rows.map((r) => r.personId as number));
  return {
    total,
    rows: rows.map((r) => {
      const firstCents = r.firstCents as number;
      const lastCents = r.lastCents as number;
      return {
        personId: r.personId as number,
        name: (r.name as string) ?? null,
        office: (r.office as string) ?? null,
        partyAbbr: (r.partyAbbr as string) ?? null,
        state: (r.state as string) ?? null,
        firstYear: r.firstYear as number,
        lastYear: r.lastYear as number,
        firstCents,
        lastCents,
        growthCents: r.growthCents as number,
        growthPct: firstCents > 0 ? ((lastCents - firstCents) / firstCents) * 100 : null,
        photoUrl: photoUrls.get(r.personId as number) ?? null,
      };
    }),
  };
}

export function getTopSuppliers(year: number | null, limit = 10): TopSupplier[] {
  const sql = `
    SELECT
      supplier_cpf_cnpj AS cnpj,
      max(coalesce(supplier_name_rfb, supplier_name)) AS name,
      sum(amount_cents) AS totalCents,
      count(*) AS paymentCount,
      count(DISTINCT tse_candidacy_id) AS candidacyCount
    FROM campaign_expense
    WHERE supplier_company_id IS NOT NULL
      ${year != null ? "AND year = ?" : ""}
    GROUP BY supplier_cpf_cnpj
    ORDER BY totalCents DESC
    LIMIT ?
  `;
  const params = year != null ? [year, limit] : [limit];
  const rows = db().prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    cnpj: r.cnpj as string,
    name: (r.name as string) ?? "(nome não disponível)",
    totalCents: r.totalCents as number,
    paymentCount: r.paymentCount as number,
    candidacyCount: r.candidacyCount as number,
  }));
}

export type EntitySanction = {
  id: number;
  registry: string;
  category: string | null;
  fineAmountCents: number | null;
  startDate: string | null;
  endDate: string | null;
  sanctioningAgency: string | null;
  agencySphere: string | null;
  provenance: Provenance;
};

export type CompanyRegistry = {
  legalName: string | null;
  tradeName: string | null;
  openedAt: string | null;
  registryStatus: string | null;
  legalNature: string | null;
  primaryCnae: string | null;
  shareCapitalCents: number | null;
  size: string | null;
  city: string | null;
  state: string | null;
  provenance: Provenance;
};

export type CompanyPartner = {
  id: number;
  partnerName: string;
  role: string | null;
  entryDate: string | null;
};

export type EntityProfile = {
  cpfCnpj: string;
  isCompany: boolean;
  displayName: string | null;
  personId: number | null;
  companyKind: string | null;
  registry: CompanyRegistry | null;
  partners: CompanyPartner[];
  donationsGivenTotal: { count: number; totalCents: number };
  paymentsReceivedTotal: { count: number; totalCents: number };
  sanctions: EntitySanction[];
};

export function candidatePersonId(cpfCnpj: string): number | null {
  const digits = graphToken(cpfCnpj);
  if (!validGraphToken(digits)) return null;
  const row =
    digits.length === 11
      ? (db().prepare("SELECT id FROM people WHERE cpf = ?").get(digits) as { id: number } | undefined)
      : (db()
          .prepare(
            `SELECT p.id FROM campaign_org co JOIN companies c ON c.id = co.company_id
             JOIN people p ON p.id = co.person_id WHERE c.cnpj = ? LIMIT 1`
          )
          .get(digits) as { id: number } | undefined);
  return row?.id ?? null;
}

export function getEntityProfile(cpfCnpj: string, opts: { year?: number } = {}): EntityProfile | null {
  const { year } = opts;
  const digits = graphToken(cpfCnpj);
  if (!validGraphToken(digits)) return null;
  const isCompany = digits.length === 14;

  let personId: number | null = null;
  let companyKind: string | null = null;
  let displayName: string | null = null;
  let registry: CompanyRegistry | null = null;
  let partners: CompanyPartner[] = [];

  if (isCompany) {
    const company = db()
      .prepare("SELECT kind, legal_name FROM companies WHERE cnpj = ?")
      .get(digits) as { kind: string | null; legal_name: string | null } | undefined;
    if (company) {
      companyKind = company.kind;
      displayName = company.legal_name;
    }

    // Emenda beneficiaries can exist before they have a companies/registry row.
    // Keep their CNPJ links resolvable and use the name published by the source.
    const earmarkBeneficiary = hasTable("parliamentary_earmark_beneficiary")
      ? (db()
          .prepare(
            `SELECT beneficiary_name AS name
             FROM parliamentary_earmark_beneficiary
             WHERE beneficiary_doc = ? AND beneficiary_type LIKE 'Pessoa Jur%'
               AND earmark_code != 'Sem informação'
             GROUP BY beneficiary_name
             ORDER BY count(*) DESC, max(collected_at) DESC
             LIMIT 1`
          )
          .get(digits) as { name: string | null } | undefined)
      : undefined;
    if (earmarkBeneficiary) {
      displayName = earmarkBeneficiary.name ?? displayName;
      companyKind = companyKind ?? "earmark_beneficiary";
    }

    const registryRow = db()
      .prepare(
        `SELECT t.legal_name AS legalName, t.trade_name AS tradeName, t.opened_at AS openedAt,
                t.registry_status AS registryStatus, t.legal_nature AS legalNature,
                t.primary_cnae AS primaryCnae, t.share_capital_cents AS shareCapitalCents,
                t.size, t.city, t.state,
                ${PROVENANCE_COLUMNS}
         FROM company_registry t
         ${PROVENANCE_JOIN}
         WHERE t.cnpj = ?`
      )
      .get(digits) as Record<string, unknown> | undefined;
    if (registryRow) {
      displayName = (registryRow.legalName as string) ?? displayName;
      registry = {
        legalName: (registryRow.legalName as string) ?? null,
        tradeName: (registryRow.tradeName as string) ?? null,
        openedAt: (registryRow.openedAt as string) ?? null,
        registryStatus: (registryRow.registryStatus as string) ?? null,
        legalNature: (registryRow.legalNature as string) ?? null,
        primaryCnae: (registryRow.primaryCnae as string) ?? null,
        shareCapitalCents: (registryRow.shareCapitalCents as number) ?? null,
        size: (registryRow.size as string) ?? null,
        city: (registryRow.city as string) ?? null,
        state: (registryRow.state as string) ?? null,
        provenance: pickProvenance(registryRow),
      };
    }

    partners = (
      db()
        .prepare(
          `SELECT id, partner_name AS partnerName, role, entry_date AS entryDate
           FROM company_partner WHERE cnpj = ? ORDER BY entry_date DESC`
        )
        .all(digits) as Array<{ id: number; partnerName: string; role: string | null; entryDate: string | null }>
    ).map((p) => ({ id: p.id, partnerName: p.partnerName, role: p.role, entryDate: p.entryDate }));
  } else {
    const person = db()
      .prepare("SELECT id, canonical_name FROM people WHERE cpf = ?")
      .get(digits) as { id: number; canonical_name: string | null } | undefined;
    if (person) {
      personId = person.id;
      displayName = person.canonical_name;
    }
  }

  const entityYearClause = year != null ? " AND year = ?" : "";
  const entityYearArgs = year != null ? [year] : [];

  const donationsAgg = db()
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(amount_cents), 0) AS total
       FROM campaign_donation WHERE donor_cpf_cnpj = ?${entityYearClause}`
    )
    .get(digits, ...entityYearArgs) as { n: number; total: number };

  const paymentsAgg = db()
    .prepare(
      `SELECT count(*) AS n, coalesce(sum(amount_cents), 0) AS total
       FROM campaign_expense WHERE supplier_cpf_cnpj = ?${entityYearClause}`
    )
    .get(digits, ...entityYearArgs) as { n: number; total: number };

  // year filter not applied: activity in another year still makes a real page
  if (personId === null && companyKind === null && registry === null) {
    const hasDonation = db().prepare("SELECT 1 FROM campaign_donation WHERE donor_cpf_cnpj = ? LIMIT 1").get(digits);
    const hasPayment = db().prepare("SELECT 1 FROM campaign_expense WHERE supplier_cpf_cnpj = ? LIMIT 1").get(digits);
    if (!hasDonation && !hasPayment) {
      const hasSanction = db()
        .prepare("SELECT 1 FROM sanction WHERE cpf_cnpj = ? LIMIT 1")
        .get(digits);
      if (!hasSanction) return null;
    }
  }

  const sanctionRows = db()
    .prepare(
      `SELECT t.id, t.registry, t.category, t.fine_amount_cents AS fineAmountCents,
              t.start_date AS startDate, t.end_date AS endDate,
              t.sanctioning_agency AS sanctioningAgency, t.agency_sphere AS agencySphere,
              ${PROVENANCE_COLUMNS}
       FROM sanction t
       ${PROVENANCE_JOIN}
       WHERE t.cpf_cnpj = ?
       ORDER BY t.start_date DESC`
    )
    .all(digits) as Array<Record<string, unknown>>;

  return {
    cpfCnpj: digits,
    isCompany,
    displayName,
    personId,
    companyKind,
    registry,
    partners,
    donationsGivenTotal: { count: donationsAgg.n, totalCents: donationsAgg.total },
    paymentsReceivedTotal: { count: paymentsAgg.n, totalCents: paymentsAgg.total },
    sanctions: sanctionRows.map((r) => ({
      id: r.id as number,
      registry: r.registry as string,
      category: (r.category as string) ?? null,
      fineAmountCents: (r.fineAmountCents as number) ?? null,
      startDate: (r.startDate as string) ?? null,
      endDate: (r.endDate as string) ?? null,
      sanctioningAgency: (r.sanctioningAgency as string) ?? null,
      agencySphere: (r.agencySphere as string) ?? null,
      provenance: pickProvenance(r),
    })),
  };
}

export type FinanceRow = {
  id: number;
  year: number;
  date: string | null;
  amountCents: number;
  paidCents: number | null; // expenses only
  counterpartyName: string | null;
  counterpartyDoc: string | null;
  counterpartyPersonId: number | null;
  counterpartyOpenedAt: string | null;
  detail: string | null;
  counterpartyIsPoliticianOwned: boolean;
  counterpartyPhotoUrl: string | null;
  provenance: Provenance;
};

export type FinancePage = { rows: FinanceRow[]; total: number; pageSize: number };

export const FINANCE_PAGE_SIZE = 25;

export type FinanceSort = "amount" | "paid" | "year" | "date" | "name";

export type FinanceQuery = {
  scope: "candidate" | "entity";
  id: string; // personId (candidate scope) or cpf/cnpj (entity scope)
  dir: "received" | "spent" | "given";
  page?: number;
  q?: string;
  sort?: FinanceSort;
  order?: "asc" | "desc";
  year?: number;
  dateFrom?: string; // 'YYYY-MM-DD', inclusive
  dateTo?: string; // 'YYYY-MM-DD', inclusive
  amountMinCents?: number;
  amountMaxCents?: number;
  onlyPoliticianOwned?: boolean;
};

// safe literals interpolated into ORDER BY
const FINANCE_SORT_COL: Record<FinanceSort, string> = {
  amount: "amountCents",
  paid: "paidCents",
  year: "yr",
  date: "date",
  name: "counterpartyName",
};

export function getFinancePage(params: FinanceQuery): FinancePage {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const offset = (page - 1) * FINANCE_PAGE_SIZE;
  const q = params.q?.trim() ?? "";
  const sortCol = FINANCE_SORT_COL[params.sort ?? "amount"] ?? "amountCents";
  const sortDir = params.order === "asc" ? "ASC" : "DESC";

  let where: string;
  let select: string;
  let from: string;
  let dateCol: string; // raw expression, reused in WHERE
  let paidExpr: string; // "NULL" when there is no paid concept
  const args: unknown[] = [];

  // politician-owned: a company partner is also a candidate; table may be missing in older DBs
  const politicianOwnedExists = hasTable("candidate_supplier_partner")
    ? `EXISTS (SELECT 1 FROM candidate_supplier_partner csp JOIN companies comp ON comp.id = csp.company_id WHERE comp.cnpj = %CNPJ_COL%)`
    : "0";
  let politicianOwnedExpr = "0";

  if (params.scope === "candidate" && params.dir === "received") {
    dateCol = "t.receipt_date";
    paidExpr = "NULL";
    politicianOwnedExpr = politicianOwnedExists.replace("%CNPJ_COL%", "t.donor_cpf_cnpj");
    from = `campaign_donation t JOIN campaign_org co ON co.id = t.campaign_org_id
            LEFT JOIN company_registry cr ON cr.cnpj = t.donor_cpf_cnpj
            ${PROVENANCE_JOIN}`;
    select = `t.id, t.year AS yr, ${dateCol} AS date, t.amount_cents AS amountCents, ${paidExpr} AS paidCents,
              t.donor_name AS counterpartyName, t.donor_cpf_cnpj AS counterpartyDoc,
              NULL AS counterpartyPersonId, cr.opened_at AS counterpartyOpenedAt, t.origin AS detail,
              ${politicianOwnedExpr} AS counterpartyIsPoliticianOwned, ${PROVENANCE_COLUMNS}`;
    where = "co.person_id = ?";
    args.push(Number(params.id));
    // SQLite LIKE is ASCII-only case-insensitive; donor_name is raw TSE text (accents not folded)
    if (q) { where += " AND t.donor_name LIKE ?"; args.push(`%${q}%`); }
  } else if (params.scope === "candidate" && params.dir === "spent") {
    dateCol = "t.expense_date";
    paidExpr = `(SELECT coalesce(sum(x.amount_cents), 0) FROM campaign_expense_payment x
                 WHERE x.campaign_expense_id = t.id)`;
    politicianOwnedExpr = politicianOwnedExists.replace("%CNPJ_COL%", "t.supplier_cpf_cnpj");
    from = `campaign_expense t JOIN campaign_org co ON co.id = t.campaign_org_id
            LEFT JOIN company_registry cr ON cr.cnpj = t.supplier_cpf_cnpj
            ${PROVENANCE_JOIN}`;
    select = `t.id, t.year AS yr, ${dateCol} AS date, t.amount_cents AS amountCents,
              ${paidExpr} AS paidCents,
              t.supplier_name AS counterpartyName, t.supplier_cpf_cnpj AS counterpartyDoc,
              NULL AS counterpartyPersonId, cr.opened_at AS counterpartyOpenedAt, t.description AS detail,
              ${politicianOwnedExpr} AS counterpartyIsPoliticianOwned, ${PROVENANCE_COLUMNS}`;
    where = "co.person_id = ?";
    args.push(Number(params.id));
    if (q) {
      where += " AND (t.supplier_name LIKE ? OR t.description LIKE ?)";
      args.push(`%${q}%`, `%${q}%`);
    }
  } else {
    const isGiven = params.dir === "given";
    dateCol = isGiven ? "t.receipt_date" : "t.expense_date";
    paidExpr = isGiven
      ? "NULL"
      : `(SELECT coalesce(sum(x.amount_cents), 0) FROM campaign_expense_payment x WHERE x.campaign_expense_id = t.id)`;
    from = `${isGiven ? "campaign_donation" : "campaign_expense"} t
            JOIN campaign_org co ON co.id = t.campaign_org_id
            LEFT JOIN people p ON p.id = co.person_id
            ${PROVENANCE_JOIN}`;
    select = `t.id, t.year AS yr, ${dateCol} AS date,
              t.amount_cents AS amountCents,
              ${paidExpr} AS paidCents,
              p.canonical_name AS counterpartyName, t.cnpj AS counterpartyDoc,
              co.person_id AS counterpartyPersonId, NULL AS counterpartyOpenedAt, t.origin AS detail,
              0 AS counterpartyIsPoliticianOwned, ${PROVENANCE_COLUMNS}`;
    where = isGiven ? "t.donor_cpf_cnpj = ?" : "t.supplier_cpf_cnpj = ?";
    args.push(digitsOnly(params.id));
    if (q) { where += " AND p.canonical_name LIKE ?"; args.push(`%${normalizeName(q)}%`); }
  }

  if (params.year != null) {
    where += " AND t.year = ?";
    args.push(params.year);
  }

  if (params.dateFrom) { where += ` AND ${dateCol} >= ?`; args.push(params.dateFrom); }
  if (params.dateTo) { where += ` AND ${dateCol} <= ?`; args.push(params.dateTo); }

  if (params.amountMinCents != null || params.amountMaxCents != null) {
    const min = params.amountMinCents ?? 0;
    const max = params.amountMaxCents ?? Number.MAX_SAFE_INTEGER;
    // paidExpr is NULL for donations/given, so that side never matches
    where += ` AND ((t.amount_cents BETWEEN ? AND ?) OR (${paidExpr} IS NOT NULL AND (${paidExpr}) BETWEEN ? AND ?))`;
    args.push(min, max, min, max);
  }

  if (params.onlyPoliticianOwned && params.scope === "candidate") {
    where += ` AND ${politicianOwnedExpr}`;
  }

  // from/select/where are fixed literals; user values are bound parameters
  const total = (
    db().prepare(`SELECT count(*) AS n FROM ${from} WHERE ${where}`).get(...args) as { n: number }
  ).n;
  const rows = db()
    .prepare(
      `SELECT ${select} FROM ${from} WHERE ${where}
       ORDER BY (${sortCol} IS NULL), ${sortCol} ${sortDir}, t.id ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(...args, FINANCE_PAGE_SIZE, offset) as Array<Record<string, unknown>>;

  const photoUrls = batchPhotoUrls(
    rows.map((r) => r.counterpartyPersonId as number | null).filter((id): id is number => id != null)
  );

  return {
    total,
    pageSize: FINANCE_PAGE_SIZE,
    rows: rows.map((r) => ({
      id: r.id as number,
      year: r.yr as number,
      date: (r.date as string) ?? null,
      amountCents: (r.amountCents as number) ?? 0,
      paidCents: r.paidCents == null ? null : (r.paidCents as number),
      counterpartyName: (r.counterpartyName as string) ?? null,
      counterpartyDoc: (r.counterpartyDoc as string) ?? null,
      counterpartyPersonId: (r.counterpartyPersonId as number) ?? null,
      counterpartyOpenedAt: (r.counterpartyOpenedAt as string) ?? null,
      detail: (r.detail as string) ?? null,
      counterpartyIsPoliticianOwned: Boolean(r.counterpartyIsPoliticianOwned),
      counterpartyPhotoUrl: r.counterpartyPersonId != null
        ? (photoUrls.get(r.counterpartyPersonId as number) ?? null)
        : null,
      provenance: pickProvenance(r),
    })),
  };
}

export type GraphSearchResult = {
  type: "person" | "company";
  cpfCnpj: string;
  label: string;
  sublabel: string | null;
};

export function searchEntities(rawQuery: string, limit = 15): GraphSearchResult[] {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  const digits = digitsOnly(query);

  if (digits.length === 11 || digits.length === 14) {
    const ident = getGraphIdentity([digits]).get(digits);
    if (ident && ident.canonical !== digits) {
      return [{ type: "person", cpfCnpj: ident.canonical, label: ident.name ?? ident.canonical, sublabel: "político" }];
    }
    const isCompany = digits.length === 14;
    if (isCompany) {
      const row = db()
        .prepare(
          `SELECT c.cnpj, coalesce(cr.legal_name, c.legal_name) AS name, c.kind
           FROM companies c LEFT JOIN company_registry cr ON cr.company_id = c.id
           WHERE c.cnpj = ?`
        )
        .get(digits) as { cnpj: string; name: string | null; kind: string | null } | undefined;
      if (row) {
        return [{ type: "company", cpfCnpj: row.cnpj, label: row.name ?? formatCnpjLocal(row.cnpj),
                   sublabel: row.kind }];
      }
      return [{ type: "company", cpfCnpj: digits, label: formatCnpjLocal(digits), sublabel: null }];
    }
    const row = db()
      .prepare("SELECT cpf, canonical_name FROM people WHERE cpf = ?")
      .get(digits) as { cpf: string; canonical_name: string | null } | undefined;
    if (row) {
      return [{ type: "person", cpfCnpj: row.cpf, label: row.canonical_name ?? digits, sublabel: null }];
    }
    return [{ type: "person", cpfCnpj: digits, label: digits, sublabel: null }];
  }

  return searchPeople(query,limit*2).flatMap((r):GraphSearchResult[]=>r.kind==="candidato"?r.cpf?[{type:"person",cpfCnpj:r.cpf,label:r.canonicalName,sublabel:`${r.latestOffice||"Pessoa"} · ${r.latestState||"UF não informada"}`}]:[]:r.kind==="empresa"?[{type:"company",cpfCnpj:r.cnpj,label:r.canonicalName,sublabel:"empresa"}]:r.kind==="socio"?[{type:"person",cpfCnpj:`soc:${r.partnerId}`,label:r.canonicalName,sublabel:`Sócio · ${r.companyName}`}]:[{type:"person",cpfCnpj:r.cpf,label:r.canonicalName,sublabel:"doador ou fornecedor"}]).slice(0,limit);
}

function formatCnpjLocal(cnpj: string): string {
  return cnpj.length === 14
    ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
    : cnpj;
}

export type GraphNodeKind = "politician" | "donor" | "supplier" | "sanctioned" | "company" | "person" | "self";

export type GraphNodeInfo = {
  cpfCnpj: string;
  type: "person" | "company";
  kind: GraphNodeKind;
  label: string;
  sanctioned: boolean;
  registryStatus: string | null; // companies only
  personId: number | null; // set only for candidates
  photoUrl: string | null;
};

export type GraphEdgeKind = "donation" | "payment" | "ownership" | "administration" | "possibleidentity";
function graphToken(value:string){return /^soc:[1-9][0-9]*$/.test(value)?value:digitsOnly(value);}
function validGraphToken(value:string){return /^soc:[1-9][0-9]*$/.test(value)||/^([0-9]{11}|[0-9]{14})$/.test(value);}

export type GraphEdge = {
  source: string; // cpfCnpj (the donor, or the politician who paid)
  target: string; // cpfCnpj (the politician who received, or the supplier paid)
  kind: GraphEdgeKind;
  amountCents: number;
  count: number;
  evidence?: {role:string|null;entryDate:string|null;collectedAt:string;url:string;partnerId:number};
};

function lookupNodes(
  rawIds: string[],
  edges: Array<{ source: string; target: string; kind: GraphEdgeKind }> = []
): Map<string, GraphNodeInfo> {
  const clean = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  const placeholders = clean.map(() => "?").join(", ");
  const nodeById = new Map<string, GraphNodeInfo>();
  if (clean.length === 0) return nodeById;

  // Only people who ran for office have a `people` row, so presence there marks a politician
  const people = db()
    .prepare(`SELECT id, cpf, canonical_name FROM people WHERE cpf IN (${placeholders})`)
    .all(...clean) as Array<{ id: number; cpf: string; canonical_name: string | null }>;
  const companies = db()
    .prepare(
      `SELECT c.cnpj, c.kind, coalesce(cr.legal_name, c.legal_name) AS name,
              cr.registry_status AS registryStatus
       FROM companies c LEFT JOIN company_registry cr ON cr.company_id = c.id
       WHERE c.cnpj IN (${placeholders})`
    )
    .all(...clean) as Array<{ cnpj: string; kind: string | null; name: string | null; registryStatus: string | null }>;
  const sanctioned = new Set(
    (
      db()
        .prepare(`SELECT DISTINCT cpf_cnpj FROM sanction WHERE cpf_cnpj IN (${placeholders})`)
        .all(...clean) as Array<{ cpf_cnpj: string }>
    ).map((r) => r.cpf_cnpj)
  );
  // A campaign committee CNPJ resolves to its candidate; fallback for raw CNPJs reaching here
  const committeeOwner = new Map<string, { name: string | null; personId: number }>();
  for (const r of db()
    .prepare(
      `SELECT DISTINCT c.cnpj, p.canonical_name AS name, p.id AS personId FROM campaign_org co
       JOIN companies c ON c.id = co.company_id JOIN people p ON p.id = co.person_id
       WHERE c.cnpj IN (${placeholders}) AND co.cnpj=c.cnpj`
    )
    .all(...clean) as Array<{ cnpj: string; name: string | null; personId: number }>) {
    if (!committeeOwner.has(r.cnpj)) committeeOwner.set(r.cnpj, { name: r.name, personId: r.personId });
  }

  for (const id of clean) {
    nodeById.set(id, {
      cpfCnpj: id, type: id.length === 14 ? "company" : "person",
      kind: id.length === 14 ? "company" : "person",
      label: id.length === 14 ? formatCnpjLocal(id) : id,
      sanctioned: sanctioned.has(id), registryStatus: null, personId: null, photoUrl: null,
    });
  }
  for(const id of clean.filter(id=>id.startsWith("soc:"))){const row=partnerById(Number(id.slice(4)));const node=nodeById.get(id);if(row&&node){node.label=row.partnerName;node.type=(row.document?.replace(/\D/g,"").length??0)>=8&&!row.document?.includes("*")?"company":"person";node.kind=node.type;}}
  for (const p of people) {
    const n = nodeById.get(p.cpf);
    if (n) {
      n.label = p.canonical_name ?? p.cpf;
      n.kind = "politician";
      n.personId = p.id;
    }
  }
  for (const c of companies) {
    const n = nodeById.get(c.cnpj);
    if (n) {
      n.label = c.name ?? formatCnpjLocal(c.cnpj);
      n.registryStatus = c.registryStatus;
      if (c.kind === "donor" || c.kind === "supplier") n.kind = c.kind;
    }
  }
  // Citizens without a `people` row are colored by edge role: donor or supplier
  for (const e of edges) {
    if (e.kind === "donation") {
      const n = nodeById.get(e.source);
      if (n && n.type === "person" && n.kind === "person") n.kind = "donor";
    } else if (e.kind === "payment") {
      const n = nodeById.get(e.target);
      if (n && n.type === "person" && n.kind === "person") n.kind = "supplier";
    }
  }
  for (const [cnpj, owner] of committeeOwner) {
    const n = nodeById.get(cnpj);
    if (n) {
      n.kind = "politician";
      if (owner.name) n.label = owner.name;
      n.personId = owner.personId;
    }
  }
  // sanctioned overrides every other kind
  for (const n of nodeById.values()) {
    if (n.sanctioned) n.kind = "sanctioned";
  }
  const photoUrls = batchPhotoUrls([...nodeById.values()].map((n) => n.personId).filter((id): id is number => id != null));
  for (const n of nodeById.values()) {
    if (n.personId != null) n.photoUrl = photoUrls.get(n.personId) ?? null;
  }
  return nodeById;
}

// One money edge touching `anchor`; self-financing rows are excluded in SQL
type IncidentRow = {
  anchor: string;
  other: string;
  kind: GraphEdgeKind;
  amountCents: number;
  n: number;
  anchorIsSource: 0 | 1;
  evidence?: GraphEdge["evidence"];
};

function incidentEdges(anchorIds: string[],year?:number): IncidentRow[] {
  if (anchorIds.length === 0) return [];
  const ph = anchorIds.map(() => "?").join(", ");
  const sql = `
    SELECT d.donor_cpf_cnpj AS anchor, p.cpf AS other, 'donation' AS kind,
           sum(d.amount_cents) AS amountCents, count(*) AS n, 1 AS anchorIsSource
    FROM campaign_donation d JOIN campaign_org co ON co.id = d.campaign_org_id
    JOIN people p ON p.id = co.person_id
    WHERE d.donor_cpf_cnpj IN (${ph}) AND p.cpf IS NOT NULL AND d.donor_cpf_cnpj != p.cpf ${year ? `AND d.year=${year}`:""}
    GROUP BY d.donor_cpf_cnpj, p.cpf
    UNION ALL
    SELECT p.cpf AS anchor, d.donor_cpf_cnpj AS other, 'donation',
           sum(d.amount_cents), count(*), 0
    FROM campaign_donation d JOIN campaign_org co ON co.id = d.campaign_org_id
    JOIN people p ON p.id = co.person_id
    WHERE p.cpf IN (${ph}) AND d.donor_cpf_cnpj IS NOT NULL AND d.donor_cpf_cnpj != p.cpf ${year ? `AND d.year=${year}`:""}
    GROUP BY p.cpf, d.donor_cpf_cnpj
    UNION ALL
    SELECT p.cpf AS anchor, e.supplier_cpf_cnpj AS other, 'payment',
           sum(e.amount_cents), count(*), 1
    FROM campaign_expense e JOIN campaign_org co ON co.id = e.campaign_org_id
    JOIN people p ON p.id = co.person_id
    WHERE p.cpf IN (${ph}) AND e.supplier_cpf_cnpj IS NOT NULL AND p.cpf != e.supplier_cpf_cnpj ${year ? `AND e.year=${year}`:""}
    GROUP BY p.cpf, e.supplier_cpf_cnpj
    UNION ALL
    SELECT e.supplier_cpf_cnpj AS anchor, p.cpf AS other, 'payment',
           sum(e.amount_cents), count(*), 0
    FROM campaign_expense e JOIN campaign_org co ON co.id = e.campaign_org_id
    JOIN people p ON p.id = co.person_id
    WHERE e.supplier_cpf_cnpj IN (${ph}) AND p.cpf IS NOT NULL AND p.cpf != e.supplier_cpf_cnpj ${year ? `AND e.year=${year}`:""}
    GROUP BY e.supplier_cpf_cnpj, p.cpf
  `;
  const params: string[] = [];
  for (let i = 0; i < 4; i++) params.push(...anchorIds);
  const rows=db().prepare(sql).all(...params) as IncidentRow[];
  const seen=new Set<string>();
  for(const anchor of anchorIds){
    const person=anchor.length===11?db().prepare("SELECT id FROM people WHERE cpf=?").get(anchor) as {id:number}|undefined:undefined;
    const partner=anchor.startsWith("soc:")?partnerById(Number(anchor.slice(4))):null;
    const related=partner?partnerOtherCompanies(partner):anchor.length===14?companyPartners(anchor):person?personCompanies(person.id):[];
    for(const relation of related){
      const owner=relation.confidence==="documento"&&relation.personCpf?relation.personCpf:relation.href.startsWith("/cnpj/")?relation.href.split("/").pop()!: `soc:${relation.id}`;
      const kind:GraphEdgeKind=/ADMIN|DIRETOR|PRESIDENTE/i.test(relation.role||"")?"administration":"ownership";
      const other=anchor.length===14?owner:person&&owner!==anchor?`soc:${relation.id}`:relation.cnpj;
      const linkKind:GraphEdgeKind=person&&owner!==anchor?"possibleidentity":kind;
      const key=`${anchor}|${other}|${linkKind}`;if(anchor===other||seen.has(key))continue;seen.add(key);
      rows.push({anchor,other,kind:linkKind,amountCents:0,n:1,anchorIsSource:anchor.length===14?0:1,evidence:{role:relation.role,entryDate:relation.entryDate,collectedAt:relation.collectedAt,url:relation.sourceUrl,partnerId:relation.id}});
    }
  }
  return rows;
}

type GraphIdentity = { canonical: string; name: string | null; aliases: string[] };

function getGraphIdentity(ids: string[]): Map<string, GraphIdentity> {
  const out = new Map<string, GraphIdentity>();
  const clean = [...new Set(ids.map(digitsOnly).filter((d) => d.length === 11 || d.length === 14))];
  if (clean.length === 0) return out;
  const ph = clean.map(() => "?").join(", ");

  const cnpjOwner = new Map<string, string>();
  for (const r of db()
    .prepare(
      `SELECT DISTINCT c.cnpj, p.cpf FROM campaign_org co
       JOIN companies c ON c.id = co.company_id JOIN people p ON p.id = co.person_id
       WHERE c.cnpj IN (${ph}) AND co.cnpj=c.cnpj AND p.cpf IS NOT NULL`
    )
    .all(...clean) as Array<{ cnpj: string; cpf: string }>) {
    if (!cnpjOwner.has(r.cnpj)) cnpjOwner.set(r.cnpj, r.cpf);
  }

  const cpfs = [...new Set([...clean.filter((d) => d.length === 11), ...cnpjOwner.values()])];
  const byCpf = new Map<string, { name: string | null; cnpjs: Set<string> }>();
  if (cpfs.length > 0) {
    const cph = cpfs.map(() => "?").join(", ");
    for (const r of db()
      .prepare(
        `SELECT p.cpf, p.canonical_name AS name, c.cnpj
         FROM people p
         LEFT JOIN campaign_org co ON co.person_id = p.id
         LEFT JOIN companies c ON c.id = co.company_id AND c.cnpj=co.cnpj
         WHERE p.cpf IN (${cph})`
      )
      .all(...cpfs) as Array<{ cpf: string; name: string | null; cnpj: string | null }>) {
      const rec = byCpf.get(r.cpf) ?? { name: r.name, cnpjs: new Set<string>() };
      if (r.cnpj) rec.cnpjs.add(r.cnpj);
      byCpf.set(r.cpf, rec);
    }
  }

  for (const id of clean) {
    if (id.length === 11 && byCpf.has(id)) {
      const rec = byCpf.get(id)!;
      out.set(id, { canonical: id, name: rec.name, aliases: [id, ...rec.cnpjs] });
    } else if (id.length === 14 && cnpjOwner.has(id)) {
      const cpf = cnpjOwner.get(id)!;
      const rec = byCpf.get(cpf);
      out.set(id, { canonical: cpf, name: rec?.name ?? null, aliases: [cpf, ...(rec?.cnpjs ?? [])] });
    } else {
      out.set(id, { canonical: id, name: null, aliases: [id] });
    }
  }
  return out;
}

function incidentToEdge(r: IncidentRow): GraphEdge {
  const [source, target] = r.anchorIsSource ? [r.anchor, r.other] : [r.other, r.anchor];
  return { source, target, kind: r.kind, amountCents: r.amountCents, count: r.n, evidence:r.evidence };
}

export function getGraphPaths(
  newIdRaw: string, existingIdsRaw: string[],year?:number
): { nodes: GraphNodeInfo[]; edges: GraphEdge[] } {
  const newDigits = graphToken(newIdRaw);
  if (!validGraphToken(newDigits)) return { nodes: [], edges: [] };
  const existingDigits = [
    ...new Set(existingIdsRaw.map(graphToken).filter(validGraphToken)),
  ];

  const idents = getGraphIdentity([newDigits, ...existingDigits]);
  const canon = (raw: string) => idents.get(raw)?.canonical ?? raw;
  const newId = canon(newDigits);
  const existing = [...new Set(existingDigits.map(canon).filter((d) => d !== newId))];
  const onCanvas = new Set([newId, ...existing]);

  const canonToAliases = new Map<string, string[]>();
  for (const it of idents.values()) canonToAliases.set(it.canonical, it.aliases);
  const aliasToCanon = new Map<string, string>();
  for (const [c, aliases] of canonToAliases) for (const a of aliases) aliasToCanon.set(a, c);
  const anchorAliases = [...new Set([newId, ...existing].flatMap((c) => canonToAliases.get(c) ?? [c]))];

  const rawRows = incidentEdges(anchorAliases,year);
  const otherIdents = getGraphIdentity([...new Set(rawRows.map((r) => r.other))]);
  const rows: IncidentRow[] = rawRows
    .map((r) => ({
      ...r,
      anchor: aliasToCanon.get(r.anchor) ?? r.anchor,
      other: ["donation","payment"].includes(r.kind)?otherIdents.get(r.other)?.canonical ?? r.other:r.other,
    }))
    .filter((r) => r.anchor !== r.other);

  // Arrays, not one row: A->B donation plus B->A payment forms a 2-node cycle
  const fromNew = new Map<string, IncidentRow[]>();
  const fromExisting = new Map<string, IncidentRow[]>();
  for (const r of rows) {
    const bucket = r.anchor === newId ? fromNew : fromExisting;
    const list = bucket.get(r.other) ?? [];
    list.push(r);
    bucket.set(r.other, list);
  }

  const edges: GraphEdge[] = [];
  const connectorIds = new Set<string>();

  for (const e of existing) {
    for (const r of fromNew.get(e) ?? []) edges.push(incidentToEdge(r));
  }
  for (const [m, nEdges] of fromNew) {
    if (onCanvas.has(m)) continue;
    const eEdges = fromExisting.get(m);
    if (!eEdges || eEdges.length === 0) continue;
    connectorIds.add(m);
    for (const r of nEdges) edges.push(incidentToEdge(r));
    for (const r of eEdges) edges.push(incidentToEdge(r));
  }

  const allIds = [newId, ...existing, ...connectorIds];
  const nodeById = lookupNodes(allIds, edges);

  const seen = new Set<string>();
  const deduped = edges.filter((e) => {
    const k = `${e.source}|${e.target}|${e.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { nodes: [...nodeById.values()], edges: deduped };
}

export function resolveGraphNode(cpfCnpj: string): GraphNodeInfo | null {
  const digits = graphToken(cpfCnpj);
  if (!validGraphToken(digits)) return null;
  const ident = getGraphIdentity([digits]).get(digits);
  const canonical = ident?.canonical ?? digits;
  const node = lookupNodes([canonical]).get(canonical) ?? null;
  if (node && ident?.name) {
    node.label = ident.name;
    node.kind = "politician";
  }
  return node;
}

export function getGraphNodeNetwork(
  rawId: string, limit = 80,year?:number,relation=""
): { nodes: GraphNodeInfo[]; edges: GraphEdge[]; truncated: boolean } {
  const digits = graphToken(rawId);
  if (!validGraphToken(digits)) return { nodes: [], edges: [], truncated: false };
  const ident = getGraphIdentity([digits]).get(digits);
  const canonical = ident?.canonical ?? digits;
  const aliases = ident?.aliases ?? [digits];

  const rawRows = incidentEdges(aliases,year).filter(r=>!relation||relation==="todos"||(relation==="societario"?!["donation","payment"].includes(r.kind):relation==="financeiro"?["donation","payment"].includes(r.kind):r.kind===relation));
  const otherIdents = getGraphIdentity([...new Set(rawRows.map((r) => r.other))]);
  const rows: IncidentRow[] = rawRows
    .map((r) => ({ ...r, anchor: canonical, other: ["donation","payment"].includes(r.kind)?otherIdents.get(r.other)?.canonical ?? r.other:r.other }))
    .filter((r) => r.anchor !== r.other);

  const merged = new Map<string, IncidentRow>();
  for (const r of rows) {
    const key = `${r.kind}|${r.anchorIsSource}|${r.other}`;
    const cur = merged.get(key);
    if (cur) {
      cur.amountCents += r.amountCents;
      cur.n += r.n;
    } else {
      merged.set(key, { ...r });
    }
  }

  let edgeRows = [...merged.values()];
  const truncated = edgeRows.length > limit;
  if (truncated) {
    edgeRows = edgeRows.sort((a, b) => Number(!!b.evidence)-Number(!!a.evidence)||b.amountCents - a.amountCents).slice(0, limit);
  }
  const edges = edgeRows.map(incidentToEdge);
  const allIds = new Set([canonical, ...edges.flatMap((e) => [e.source, e.target])]);
  const nodeById = lookupNodes([...allIds], edges);
  if (ident?.name) {
    const n = nodeById.get(canonical);
    if (n) { n.label = ident.name; n.kind = "politician"; }
  }
  return { nodes: [...nodeById.values()], edges, truncated };
}

export type CircularDonationActor = {
  cpfCnpj: string;
  label: string;
  type: "person" | "company";
};

export type AiVerdict = "bizarro" | "plausivel" | "inconclusivo";

export type AiReviewBrief = {
  verdict: AiVerdict;
  confidence: string | null;
  explanation: string;
  model: string;
};

export type CircularDonationSignal = {
  id: number;
  severity: "high" | "medium" | "low";
  explanation: string;
  amountCents: number;
  pathLength: number;
  actors: CircularDonationActor[];
  aiReview: AiReviewBrief | null;
};

export type CircularDonationSort = "severity" | "amount" | "path_length";

export type CircularDonationSummary = {
  total: number;
  bySeverity: Record<string, number>;
  ruleVersion: string | null;
  maxDepth: number | null;
  runAt: string | null;
};

const CIRCULAR_RULE = "circular_donations";

export function getCircularDonationSummary(): CircularDonationSummary {
  const bySeverity = Object.fromEntries(
    (
      db()
        .prepare(
          `SELECT s.severity, count(*) AS n FROM signal s
           JOIN rule_run rr ON rr.id = s.rule_run_id
           WHERE rr.rule = ? GROUP BY s.severity`
        )
        .all(CIRCULAR_RULE) as Array<{ severity: string; n: number }>
    ).map((r) => [r.severity, r.n])
  );
  const total = Object.values(bySeverity).reduce((a, b) => a + b, 0);
  const lastRun = db()
    .prepare(
      `SELECT rule_version AS ruleVersion, params, run_at AS runAt
       FROM rule_run WHERE rule = ? ORDER BY id DESC LIMIT 1`
    )
    .get(CIRCULAR_RULE) as { ruleVersion: string; params: string | null; runAt: string } | undefined;
  let maxDepth: number | null = null;
  if (lastRun?.params) {
    try {
      maxDepth = (JSON.parse(lastRun.params) as { max_depth?: number }).max_depth ?? null;
    } catch {
      maxDepth = null;
    }
  }
  return {
    total, bySeverity,
    ruleVersion: lastRun?.ruleVersion ?? null,
    maxDepth,
    runAt: lastRun?.runAt ?? null,
  };
}

const SORT_CLAUSE: Record<CircularDonationSort, string> = {
  severity: "CASE s.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, s.id",
  amount: "coalesce(s.amount_cents, 0) DESC, s.id",
  path_length: "coalesce(s.path_length, 0) ASC, coalesce(s.amount_cents, 0) DESC, s.id",
};

export function getCircularDonationSignals(opts: {
  severity?: "high" | "medium" | "low";
  sort?: CircularDonationSort;
  limit?: number;
  offset?: number;
}): CircularDonationSignal[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const orderBy = SORT_CLAUSE[opts.sort ?? "severity"] ?? SORT_CLAUSE.severity;
  const rows = db()
    .prepare(
      `SELECT s.id, s.severity, s.explanation,
              coalesce(s.amount_cents, 0) AS amountCents, coalesce(s.path_length, 0) AS pathLength,
              ar.verdict AS aiVerdict, ar.confidence AS aiConfidence,
              ar.explanation AS aiExplanation, ar.model AS aiModel
       FROM signal s JOIN rule_run rr ON rr.id = s.rule_run_id
       LEFT JOIN signal_ai_review ar ON ar.signal_id = s.id
         AND ar.reviewed_at = (SELECT max(x.reviewed_at) FROM signal_ai_review x WHERE x.signal_id = s.id)
       WHERE rr.rule = ? AND (? IS NULL OR s.severity = ?)
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(CIRCULAR_RULE, opts.severity ?? null, opts.severity ?? null, limit, offset) as Array<{
      id: number; severity: string; explanation: string; amountCents: number; pathLength: number;
      aiVerdict: string | null; aiConfidence: string | null; aiExplanation: string | null; aiModel: string | null;
    }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  const actorRows = db()
    .prepare(
      `SELECT sa.signal_id AS signalId, sa.type,
              CASE WHEN sa.type = 'person' THEN p.cpf ELSE c.cnpj END AS cpfCnpj,
              CASE WHEN sa.type = 'person' THEN p.canonical_name
                   ELSE coalesce(cr.legal_name, c.legal_name) END AS label
       FROM signal_actor sa
       LEFT JOIN people p ON sa.type = 'person' AND p.id = sa.actor_id
       LEFT JOIN companies c ON sa.type = 'company' AND c.id = sa.actor_id
       LEFT JOIN company_registry cr ON cr.company_id = c.id
       WHERE sa.signal_id IN (${placeholders})`
    )
    .all(...ids) as Array<{ signalId: number; type: "person" | "company"; cpfCnpj: string | null; label: string | null }>;

  const actorsBySignal = new Map<number, CircularDonationActor[]>();
  for (const a of actorRows) {
    if (!a.cpfCnpj) continue;
    const list = actorsBySignal.get(a.signalId) ?? [];
    list.push({ cpfCnpj: a.cpfCnpj, label: a.label ?? a.cpfCnpj, type: a.type });
    actorsBySignal.set(a.signalId, list);
  }

  return rows.map((r): CircularDonationSignal => ({
    id: r.id,
    severity: r.severity as CircularDonationSignal["severity"],
    explanation: r.explanation,
    amountCents: r.amountCents,
    pathLength: r.pathLength,
    actors: actorsBySignal.get(r.id) ?? [],
    aiReview: r.aiVerdict
      ? {
          verdict: r.aiVerdict as AiVerdict,
          confidence: r.aiConfidence,
          explanation: r.aiExplanation ?? "",
          model: r.aiModel ?? "",
        }
      : null,
  }));
}

export type AiReviewRow = {
  signalId: number;
  rule: string;
  ruleLabel: string;
  signalExplanation: string;
  signalAmountCents: number;
  verdict: AiVerdict;
  confidence: string | null;
  explanation: string;
  facts: string[];
  model: string;
  reviewedAt: string;
  graphIds: string[] | null; // circular_donations only
};

const RULE_LABEL: Record<string, string> = {
  circular_donations: "doação circular",
  disproportionate_expense: "despesa desproporcional",
};

export function getAiReviewSummary(): { total: number; byVerdict: Record<string, number>; model: string | null } {
  const byVerdict = Object.fromEntries(
    (
      db()
        .prepare(`SELECT verdict, count(*) AS n FROM signal_ai_review GROUP BY verdict`)
        .all() as Array<{ verdict: string; n: number }>
    ).map((r) => [r.verdict, r.n])
  );
  const total = Object.values(byVerdict).reduce((a, b) => a + b, 0);
  const model = (
    db().prepare(`SELECT model FROM signal_ai_review ORDER BY reviewed_at DESC LIMIT 1`).get() as
      | { model: string }
      | undefined
  )?.model ?? null;
  return { total, byVerdict, model };
}

const VERDICT_ORDER = "CASE ar.verdict WHEN 'bizarro' THEN 0 WHEN 'inconclusivo' THEN 1 ELSE 2 END";

export function getAiReviewCount(opts: { verdict?: AiVerdict; rule?: string }): number {
  return (
    db()
      .prepare(
        `SELECT count(*) AS n FROM signal_ai_review ar
         JOIN signal s ON s.id = ar.signal_id
         JOIN rule_run rr ON rr.id = s.rule_run_id
         WHERE (? IS NULL OR ar.verdict = ?) AND (? IS NULL OR rr.rule = ?)`
      )
      .get(opts.verdict ?? null, opts.verdict ?? null, opts.rule ?? null, opts.rule ?? null) as { n: number }
  ).n;
}

export function getAiReviews(opts: {
  verdict?: AiVerdict;
  rule?: string;
  limit?: number;
  offset?: number;
}): AiReviewRow[] {
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;
  const rows = db()
    .prepare(
      `SELECT ar.signal_id AS signalId, rr.rule, s.explanation AS signalExplanation,
              coalesce(s.amount_cents, (
                SELECT ce.amount_cents FROM signal_evidence se
                JOIN campaign_expense ce ON ce.id = se.record_id
                WHERE se.signal_id = s.id AND se.table_name = 'campaign_expense' LIMIT 1
              ), 0) AS signalAmountCents,
              ar.verdict, ar.confidence, ar.explanation, ar.facts, ar.model, ar.reviewed_at AS reviewedAt
       FROM signal_ai_review ar
       JOIN signal s ON s.id = ar.signal_id
       JOIN rule_run rr ON rr.id = s.rule_run_id
       WHERE (? IS NULL OR ar.verdict = ?) AND (? IS NULL OR rr.rule = ?)
         AND ar.reviewed_at = (SELECT max(x.reviewed_at) FROM signal_ai_review x WHERE x.signal_id = ar.signal_id)
       ORDER BY ${VERDICT_ORDER}, signalAmountCents DESC
       LIMIT ? OFFSET ?`
    )
    .all(opts.verdict ?? null, opts.verdict ?? null, opts.rule ?? null, opts.rule ?? null, limit, offset) as Array<{
      signalId: number; rule: string; signalExplanation: string; signalAmountCents: number;
      verdict: string; confidence: string | null; explanation: string; facts: string | null;
      model: string; reviewedAt: string;
    }>;
  if (rows.length === 0) return [];

  const cycleIds = rows.filter((r) => r.rule === "circular_donations").map((r) => r.signalId);
  const graphIdsBySignal = new Map<number, string[]>();
  if (cycleIds.length > 0) {
    const ph = cycleIds.map(() => "?").join(", ");
    for (const row of db()
      .prepare(
        `SELECT sa.signal_id AS signalId,
                CASE WHEN sa.type = 'person' THEN p.cpf ELSE c.cnpj END AS cpfCnpj
         FROM signal_actor sa
         LEFT JOIN people p ON sa.type = 'person' AND p.id = sa.actor_id
         LEFT JOIN companies c ON sa.type = 'company' AND c.id = sa.actor_id
         WHERE sa.signal_id IN (${ph})`
      )
      .all(...cycleIds) as Array<{ signalId: number; cpfCnpj: string | null }>) {
      if (!row.cpfCnpj) continue;
      const list = graphIdsBySignal.get(row.signalId) ?? [];
      list.push(row.cpfCnpj);
      graphIdsBySignal.set(row.signalId, list);
    }
  }

  return rows.map((r): AiReviewRow => {
    let facts: string[] = [];
    try {
      const parsed = JSON.parse(r.facts ?? "[]");
      if (Array.isArray(parsed)) facts = parsed.map((f) => String(f));
    } catch {
      facts = [];
    }
    return {
      signalId: r.signalId,
      rule: r.rule,
      ruleLabel: RULE_LABEL[r.rule] ?? r.rule,
      signalExplanation: r.signalExplanation,
      signalAmountCents: r.signalAmountCents,
      verdict: r.verdict as AiVerdict,
      confidence: r.confidence,
      explanation: r.explanation,
      facts,
      model: r.model,
      reviewedAt: r.reviewedAt,
      graphIds: graphIdsBySignal.get(r.signalId) ?? null,
    };
  });
}

export type PoliticianNetworkNode = {
  personId: number;
  label: string;
  amountCents: number; // amount of this edge
  photoUrl: string | null;
};

export type PoliticianNetworkBranch = {
  node: PoliticianNetworkNode;
  children: PoliticianNetworkNode[]; // depth 2
};

export type PoliticianDonationNetwork = {
  donatedTo: PoliticianNetworkBranch[]; // right side, depth 1 + 2
  receivedFrom: PoliticianNetworkBranch[]; // left side, depth 1 + 2
};

const MAX_PER_LEVEL = 6;

function politicianDonationEdges(
  personId: number, direction: "donated_to" | "received_from"
): PoliticianNetworkNode[] {
  const sql = direction === "donated_to"
    ? `SELECT co.person_id AS personId, coalesce(p2.canonical_name, '(sem nome)') AS label,
              sum(d.amount_cents) AS amountCents
       FROM campaign_donation d
       JOIN campaign_org co ON co.id = d.campaign_org_id
       JOIN people p2 ON p2.id = co.person_id
       WHERE d.donor_person_id = ? AND co.person_id != ?
       GROUP BY co.person_id ORDER BY amountCents DESC LIMIT ?`
    : `SELECT d.donor_person_id AS personId, coalesce(p2.canonical_name, '(sem nome)') AS label,
              sum(d.amount_cents) AS amountCents
       FROM campaign_donation d
       JOIN campaign_org co ON co.id = d.campaign_org_id
       JOIN people p2 ON p2.id = d.donor_person_id
       WHERE co.person_id = ? AND d.donor_person_id IS NOT NULL AND d.donor_person_id != ?
       GROUP BY d.donor_person_id ORDER BY amountCents DESC LIMIT ?`;
  const rows = db().prepare(sql).all(personId, personId, MAX_PER_LEVEL) as Array<
    Omit<PoliticianNetworkNode, "photoUrl">
  >;
  return rows.map((r) => ({ ...r, photoUrl: null }));
}

export function getPoliticianDonationNetwork(personId: number): PoliticianDonationNetwork {
  const build = (direction: "donated_to" | "received_from"): PoliticianNetworkBranch[] =>
    politicianDonationEdges(personId, direction).map((node) => ({
      node,
      children: politicianDonationEdges(node.personId, direction).filter((c) => c.personId !== personId),
    }));

  const donatedTo = build("donated_to");
  const receivedFrom = build("received_from");

  const allIds = [
    ...donatedTo.flatMap((b) => [b.node.personId, ...b.children.map((c) => c.personId)]),
    ...receivedFrom.flatMap((b) => [b.node.personId, ...b.children.map((c) => c.personId)]),
  ];
  const photoUrls = batchPhotoUrls(allIds);
  const patch = (n: PoliticianNetworkNode) => {
    n.photoUrl = photoUrls.get(n.personId) ?? null;
  };
  for (const b of [...donatedTo, ...receivedFrom]) {
    patch(b.node);
    b.children.forEach(patch);
  }

  return { donatedTo, receivedFrom };
}

export type SupplierPartnerRow = {
  personId: number;
  personName: string | null;
  companyCnpj: string;
  companyName: string | null;
  partnerRole: string | null;
  partnerSince: string | null;
  paymentsTotalCents: number;
  paymentsCount: number;
  payerCandidacies: number;
  paidBySelf: boolean;
};

export type SupplierPartnerFilter = "all" | "self" | "others";

export function getSupplierPartnerSummary(): {
  total: number;
  self: number;
  others: number;
  totalCents: number;
} {
  if (!hasTable("candidate_supplier_partner")) return { total: 0, self: 0, others: 0, totalCents: 0 };
  const row = db()
    .prepare(
      `SELECT count(*) AS total,
              coalesce(sum(paid_by_self), 0) AS self,
              coalesce(sum(payments_total_cents), 0) AS totalCents
       FROM candidate_supplier_partner`
    )
    .get() as { total: number; self: number; totalCents: number };
  return { total: row.total, self: row.self, others: row.total - row.self, totalCents: row.totalCents };
}

export function getSupplierPartnerCount(opts: { filter?: SupplierPartnerFilter; q?: string }): number {
  if (!hasTable("candidate_supplier_partner")) return 0;
  const { where, args } = supplierPartnerWhere(opts);
  return (
    db()
      .prepare(
        `SELECT count(*) AS n
         FROM candidate_supplier_partner csp
         JOIN people p ON p.id = csp.person_id
         JOIN companies c ON c.id = csp.company_id
         ${where}`
      )
      .get(...args) as { n: number }
  ).n;
}

function supplierPartnerWhere(opts: { filter?: SupplierPartnerFilter; q?: string }): {
  where: string;
  args: unknown[];
} {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (opts.filter === "self") clauses.push("csp.paid_by_self = 1");
  if (opts.filter === "others") clauses.push("csp.paid_by_self = 0");
  const q = opts.q?.trim();
  if (q) {
    clauses.push("(p.canonical_name LIKE ? OR coalesce(cr.legal_name, c.legal_name) LIKE ?)");
    args.push(`%${normalizeName(q)}%`, `%${q}%`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
}

export function getSupplierPartners(opts: {
  filter?: SupplierPartnerFilter;
  q?: string;
  limit?: number;
  offset?: number;
}): SupplierPartnerRow[] {
  if (!hasTable("candidate_supplier_partner")) return [];
  const limit = opts.limit ?? 40;
  const offset = opts.offset ?? 0;
  const { where, args } = supplierPartnerWhere(opts);
  const rows = db()
    .prepare(
      `SELECT csp.person_id AS personId, p.canonical_name AS personName,
              c.cnpj AS companyCnpj, coalesce(cr.legal_name, c.legal_name) AS companyName,
              csp.partner_role AS partnerRole, csp.partner_since AS partnerSince,
              csp.payments_total_cents AS paymentsTotalCents, csp.payments_count AS paymentsCount,
              csp.payer_candidacies AS payerCandidacies, csp.paid_by_self AS paidBySelf
       FROM candidate_supplier_partner csp
       JOIN people p ON p.id = csp.person_id
       JOIN companies c ON c.id = csp.company_id
       LEFT JOIN company_registry cr ON cr.company_id = c.id
       ${where}
       ORDER BY csp.payments_total_cents DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    personId: r.personId as number,
    personName: (r.personName as string) ?? null,
    companyCnpj: r.companyCnpj as string,
    companyName: (r.companyName as string) ?? null,
    partnerRole: (r.partnerRole as string) ?? null,
    partnerSince: (r.partnerSince as string) ?? null,
    paymentsTotalCents: (r.paymentsTotalCents as number) ?? 0,
    paymentsCount: (r.paymentsCount as number) ?? 0,
    payerCandidacies: (r.payerCandidacies as number) ?? 0,
    paidBySelf: !!r.paidBySelf,
  }));
}

export const DISCOURSE_GROUP_CATEGORIES = [
  "lgbtfobia", "racismo", "misoginia", "capacitismo", "xenofobia", "regionalismo",
  "aporofobia", "gordofobia", "antissemitismo", "intolerancia_religiosa", "etarismo_saude",
] as const;
export const DISCOURSE_OTHER_CATEGORIES = ["desumanizacao", "xingamento_pessoal"] as const;
export type DiscourseCategory =
  | (typeof DISCOURSE_GROUP_CATEGORIES)[number]
  | (typeof DISCOURSE_OTHER_CATEGORIES)[number];
export type DiscourseSeverity = "high" | "medium" | "low";

export type DiscourseSignal = {
  postId: number;
  handle: string;
  personId: number | null;
  personName: string | null;
  party: string | null;
  state: string | null;
  kind: string;
  text: string;
  url: string | null;
  postedAt: string | null;
  matchedTerms: string[];
  severity: DiscourseSeverity | null;
  categories: string[];
  quote: string | null;
  explanation: string | null;
  replyToHandle: string | null;
};

function discourseWhere(opts: {
  category?: string;
  severity?: string;
  group?: boolean;
  handle?: string;
  q?: string;
  personId?: number;
}): { where: string; args: unknown[] } {
  const clauses = ["r.is_offensive = 1"];
  const args: unknown[] = [];
  if (opts.personId != null) {
    clauses.push("a.person_id = ?");
    args.push(opts.personId);
  }
  if (opts.category) {
    clauses.push("r.categories LIKE ?");
    args.push(`%"${opts.category}"%`);
  } else if (opts.group) {
    clauses.push(`(${DISCOURSE_GROUP_CATEGORIES.map(() => "r.categories LIKE ?").join(" OR ")})`);
    args.push(...DISCOURSE_GROUP_CATEGORIES.map((c) => `%"${c}"%`));
  }
  if (opts.severity && ["high", "medium", "low"].includes(opts.severity)) {
    clauses.push("r.severity = ?");
    args.push(opts.severity);
  }
  const h = opts.handle?.trim().replace(/^@/, "").toLowerCase();
  if (h) {
    clauses.push("a.handle = ?");
    args.push(h);
  }
  const q = opts.q?.trim();
  if (q) {
    clauses.push("(p.text LIKE ? OR pe.canonical_name LIKE ? OR a.handle LIKE ?)");
    args.push(`%${q}%`, `%${normalizeName(q)}%`, `%${q.toLowerCase()}%`);
  }
  return { where: `WHERE ${clauses.join(" AND ")}`, args };
}

const DISCOURSE_FROM = `
  FROM social_post_review r
  JOIN social_post p ON p.id = r.social_post_id
  JOIN social_account a ON a.id = p.social_account_id
  LEFT JOIN people pe ON pe.id = a.person_id`;

export function getDiscourseSummary(): {
  reviewed: number;
  total: number;
  accounts: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const empty = { reviewed: 0, total: 0, accounts: 0, bySeverity: {}, byCategory: {} };
  if (!hasTable("social_post_review")) return empty;
  const reviewed = (db().prepare("SELECT count(*) AS n FROM social_post_review").get() as { n: number }).n;
  const total = (
    db().prepare("SELECT count(*) AS n FROM social_post_review WHERE is_offensive = 1").get() as { n: number }
  ).n;
  const accounts = (
    db()
      .prepare(
        `SELECT count(DISTINCT p.social_account_id) AS n
         FROM social_post_review r JOIN social_post p ON p.id = r.social_post_id
         WHERE r.is_offensive = 1`
      )
      .get() as { n: number }
  ).n;
  const bySeverity: Record<string, number> = {};
  for (const row of db()
    .prepare("SELECT severity, count(*) AS n FROM social_post_review WHERE is_offensive = 1 GROUP BY severity")
    .all() as Array<{ severity: string; n: number }>) {
    if (row.severity) bySeverity[row.severity] = row.n;
  }
  const byCategory: Record<string, number> = {};
  for (const row of db()
    .prepare("SELECT categories FROM social_post_review WHERE is_offensive = 1")
    .all() as Array<{ categories: string }>) {
    try {
      for (const c of JSON.parse(row.categories) as string[]) byCategory[c] = (byCategory[c] ?? 0) + 1;
    } catch {
      /* skip */
    }
  }
  return { reviewed, total, accounts, bySeverity, byCategory };
}

export function getDiscourseCount(opts: {
  category?: string;
  severity?: string;
  group?: boolean;
  handle?: string;
  q?: string;
  personId?: number;
}): number {
  if (!hasTable("social_post_review")) return 0;
  const { where, args } = discourseWhere(opts);
  return (
    db().prepare(`SELECT count(*) AS n ${DISCOURSE_FROM} ${where}`).get(...args) as { n: number }
  ).n;
}

const DISCOURSE_SEVERITY_RANK = "CASE r.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";

export function getDiscourseSignals(opts: {
  category?: string;
  severity?: string;
  group?: boolean;
  handle?: string;
  q?: string;
  personId?: number;
  limit?: number;
  offset?: number;
}): DiscourseSignal[] {
  if (!hasTable("social_post_review")) return [];
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;
  const { where, args } = discourseWhere(opts);
  const rows = db()
    .prepare(
      `SELECT p.id AS postId, a.handle AS handle, a.person_id AS personId,
              pe.canonical_name AS personName,
              (SELECT ph.party_abbr FROM politician_history ph
                 WHERE ph.person_id = a.person_id AND ph.result LIKE 'ELEITO%'
                 ORDER BY ph.year DESC LIMIT 1) AS party,
              (SELECT ph.state FROM politician_history ph
                 WHERE ph.person_id = a.person_id AND ph.result LIKE 'ELEITO%'
                 ORDER BY ph.year DESC LIMIT 1) AS state,
              p.kind AS kind, p.text AS text, p.url AS url, p.posted_at AS postedAt,
              p.matched_terms AS matchedTerms, p.reply_to_handle AS replyToHandle,
              r.severity AS severity, r.categories AS categories, r.quote AS quote,
              r.explanation AS explanation
       ${DISCOURSE_FROM}
       ${where}
       ORDER BY ${DISCOURSE_SEVERITY_RANK}, p.posted_at DESC, p.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    postId: r.postId as number,
    handle: r.handle as string,
    personId: (r.personId as number) ?? null,
    personName: (r.personName as string) ?? null,
    party: (r.party as string) ?? null,
    state: (r.state as string) ?? null,
    kind: r.kind as string,
    text: r.text as string,
    url: (r.url as string) ?? null,
    postedAt: (r.postedAt as string) ?? null,
    matchedTerms: safeJsonArray(r.matchedTerms as string),
    severity: (r.severity as DiscourseSeverity) ?? null,
    categories: safeJsonArray(r.categories as string),
    quote: (r.quote as string) ?? null,
    explanation: (r.explanation as string) ?? null,
    replyToHandle: (r.replyToHandle as string) ?? null,
  }));
}

// Keep in sync with CATEGORIES in elosys/rules/disproportionate_expense.py
const EXPENSE_CATEGORY_SPELLINGS: Record<string, string[]> = {
  CANETA: ["CANETA"],
  LAPIS: ["LAPIS", "LÁPIS"],
  LAPISEIRA: ["LAPISEIRA"],
  BORRACHA: ["BORRACHA"],
  APONTADOR: ["APONTADOR"],
  ADESIVO: ["ADESIVO"],
  CRACHA: ["CRACHA", "CRACHÁ"],
  ETIQUETA: ["ETIQUETA"],
  CLIPS: ["CLIPS"],
  GRAMPO: ["GRAMPO"],
  GRAMPEADOR: ["GRAMPEADOR"],
  REGUA: ["REGUA", "RÉGUA"],
  "BLOCO DE ANOTA": ["BLOCO DE ANOTA"],
  ENVELOPE: ["ENVELOPE"],
  "MARCADOR DE TEXTO": ["MARCADOR DE TEXTO"],
  PRANCHETA: ["PRANCHETA"],
  PERFURADOR: ["PERFURADOR"],
  ELASTICO: ["ELASTICO", "ELÁSTICO"],
};

export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_SPELLINGS);

export function getDisproportionateExpenseCount(): number {
  const row = db()
    .prepare(
      `SELECT count(*) AS n FROM signal s
       JOIN rule_run rr ON rr.id = s.rule_run_id
       WHERE rr.rule = 'disproportionate_expense'`
    )
    .get() as { n: number };
  return row.n;
}


export type ExpenseCategoryRow = {
  personId: number;
  name: string | null;
  photoUrl: string | null;
  office: string | null;
  state: string | null;
  categoryCents: number;
  categoryCount: number;
  revenueCents: number;
  /** null when revenueCents is 0 */
  sharePct: number | null;
  /** average sharePct of other same office+state candidates; null without peers */
  peerAvgSharePct: number | null;
  peerCount: number;
};

export type ExpenseCategoryPage = { rows: ExpenseCategoryRow[]; total: number };

// Full-table LIKE scan takes tens of seconds; cache per (category, year) since the DB is read-only
const expenseCategoryRankingCache = new Map<string, Array<Record<string, unknown>>>();
let rankingVersion=0;

export function getExpenseCategoryRanking(opts: {
  /** undefined = all categories */
  category?: string;
  /** undefined = all years */
  year?: number;
  limit?: number;
  offset?: number;
}): ExpenseCategoryPage {
  const spellings = opts.category != null
    ? EXPENSE_CATEGORY_SPELLINGS[opts.category]
    : Object.values(EXPENSE_CATEGORY_SPELLINGS).flat();
  if (!spellings) return { rows: [], total: 0 };
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const version=dataVersion();if(version!==rankingVersion){expenseCategoryRankingCache.clear();rankingVersion=version;}
  const cacheKey = `${opts.category ?? "*"}|${opts.year ?? "*"}`;
  let allRows = expenseCategoryRankingCache.get(cacheKey);
  if (!allRows) {
    const likeClause = spellings.map(() => "description LIKE ?").join(" OR ");
    const likeArgs = spellings.map((s) => `%${s}%`);
    const expenseYearClause = opts.year != null ? " AND year = ?" : "";
    const donationYearClause = opts.year != null ? " AND year = ?" : "";
    const yearArgs = opts.year != null ? [opts.year] : [];

    allRows = db()
      .prepare(
        `WITH matched_expense AS MATERIALIZED (
           SELECT campaign_org_id, amount_cents
           FROM campaign_expense
           WHERE (${likeClause})${expenseYearClause}
         ),
         matched_donation AS MATERIALIZED (
           SELECT campaign_org_id, amount_cents
           FROM campaign_donation
           WHERE 1=1${donationYearClause}
         ),
         cat_spend AS (
           SELECT co.person_id AS personId, sum(m.amount_cents) AS categoryCents, count(*) AS categoryCount,
                  co.office AS office, co.state AS state
           FROM matched_expense m JOIN campaign_org co ON co.id = m.campaign_org_id
           WHERE co.person_id IS NOT NULL
           GROUP BY co.person_id
         ),
         revenue AS (
           SELECT co.person_id AS personId, coalesce(sum(d.amount_cents), 0) AS revenueCents
           FROM matched_donation d JOIN campaign_org co ON co.id = d.campaign_org_id
           WHERE co.person_id IS NOT NULL
           GROUP BY co.person_id
         ),
         share AS (
           SELECT cs.personId, cs.categoryCents, cs.categoryCount, cs.office, cs.state,
                  coalesce(r.revenueCents, 0) AS revenueCents,
                  CASE WHEN coalesce(r.revenueCents, 0) > 0
                       THEN (cs.categoryCents * 100.0 / r.revenueCents) END AS sharePct
           FROM cat_spend cs LEFT JOIN revenue r ON r.personId = cs.personId
         ),
         -- group totals so each row can exclude itself from its peer average
         peer_group AS (
           SELECT office, state, sum(sharePct) AS sumSharePct, count(*) AS n
           FROM share WHERE sharePct IS NOT NULL
           GROUP BY office, state
         )
         SELECT s.personId, p.canonical_name AS name, s.office, s.state,
                s.categoryCents, s.categoryCount, s.revenueCents, s.sharePct,
                CASE
                  WHEN s.sharePct IS NOT NULL AND pg.n > 1 THEN (pg.sumSharePct - s.sharePct) / (pg.n - 1)
                  WHEN s.sharePct IS NULL AND pg.n > 0 THEN pg.sumSharePct / pg.n
                END AS peerAvgSharePct,
                CASE WHEN s.sharePct IS NOT NULL THEN coalesce(pg.n, 1) - 1 ELSE coalesce(pg.n, 0) END AS peerCount
         FROM share s
         JOIN people p ON p.id = s.personId
         LEFT JOIN peer_group pg ON pg.office = s.office AND pg.state = s.state
         ORDER BY s.categoryCents DESC`
      )
      .all(...likeArgs, ...yearArgs, ...yearArgs) as Array<Record<string, unknown>>;
    expenseCategoryRankingCache.set(cacheKey, allRows);
  }

  const total = allRows.length;
  const pageRows = allRows.slice(offset, offset + limit);
  const photoUrls = batchPhotoUrls(pageRows.map((r) => r.personId as number));
  return {
    total,
    rows: pageRows.map((r) => ({
      personId: r.personId as number,
      name: (r.name as string) ?? null,
      photoUrl: photoUrls.get(r.personId as number) ?? null,
      office: (r.office as string) ?? null,
      state: (r.state as string) ?? null,
      categoryCents: r.categoryCents as number,
      categoryCount: r.categoryCount as number,
      revenueCents: r.revenueCents as number,
      sharePct: (r.sharePct as number) ?? null,
      peerAvgSharePct: (r.peerAvgSharePct as number) ?? null,
      peerCount: (r.peerCount as number) ?? 0,
    })),
  };
}

export type ExpenseCategoryDetailRow = {
  id: number;
  description: string;
  amountCents: number;
  year: number;
  provenance: Provenance;
};

export function getPersonCategoryExpenseDetail(
  personId: number,
  category: string | undefined,
  year: number | undefined
): ExpenseCategoryDetailRow[] {
  const spellings = category != null
    ? EXPENSE_CATEGORY_SPELLINGS[category]
    : Object.values(EXPENSE_CATEGORY_SPELLINGS).flat();
  if (!spellings) return [];
  const likeClause = spellings.map(() => "t.description LIKE ?").join(" OR ");
  const likeArgs = spellings.map((s) => `%${s}%`);
  const yearClause = year != null ? " AND t.year = ?" : "";
  const yearArgs = year != null ? [year] : [];

  const rows = db()
    .prepare(
      `SELECT t.id, t.description, t.amount_cents AS amountCents, t.year, ${PROVENANCE_COLUMNS}
       FROM campaign_expense t JOIN campaign_org co ON co.id = t.campaign_org_id
       ${PROVENANCE_JOIN}
       WHERE co.person_id = ? AND (${likeClause})${yearClause}
       ORDER BY t.amount_cents DESC`
    )
    .all(personId, ...likeArgs, ...yearArgs) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    description: r.description as string,
    amountCents: r.amountCents as number,
    year: r.year as number,
    provenance: pickProvenance(r),
  }));
}

function safeJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}
