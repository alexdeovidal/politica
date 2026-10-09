const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

function normalizeSearch(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

database.function("normalize_public_name", { deterministic: true }, normalizeSearch);

try {
  const query = workerData.query || {};
  const year = Number(query.year);
  const round = Number(query.round);
  const officeCode = String(query.officeCode || "");
  const candidateId = String(query.candidateId || "");
  const state = String(query.state || "").toUpperCase();
  const municipalityCode = String(query.municipalityCode || "");
  const zone = String(query.zone || "");
  const selectedSection = String(query.sectionNumber || "");
  const search = String(query.search || "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const pageSize = 3;
  const sourceUnit = officeCode === "1" || state === "BR" || state === "ZZ" ? "BR" : state;
  const sourceFile = `votacao_secao_${year}_${sourceUnit}.zip`;

  const requiredTables = ["election_vote_section", "politician_history", "parse", "collection"];
  const presentTables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  if (requiredTables.some(table => !presentTables.has(table))) {
    parentPort.postMessage({ ready: false, rows: [], total: 0, page, pageSize, checkedAt: new Date().toISOString() });
  } else {
    const archiveReady = Boolean(database.prepare(`
      SELECT 1
      FROM election_vote_section v
      JOIN parse p ON p.id = v.provenance_id
      JOIN collection c ON c.id = p.collection_id
      WHERE v.year = ? AND instr(c.url, ?) > 0
      LIMIT 1
    `).get(year, `/${sourceFile}`));

    if (!archiveReady) {
      parentPort.postMessage({ ready: false, rows: [], total: 0, page, pageSize, checkedAt: new Date().toISOString() });
    } else {
      const history = database.prepare(`
        SELECT id
        FROM politician_history
        WHERE year = ? AND coalesce(round, 1) = ? AND tse_candidacy_id = ?
        LIMIT 1
      `).get(year, round, candidateId);

      const clauses = ["v.history_id = ?", "v.year = ?", "v.round = ?", "v.office_code = ?"];
      const args = [history?.id ?? -1, year, round, officeCode];
      if (state && state !== "BR") {
        clauses.push("v.state = ?");
        args.push(state);
      }
      if (municipalityCode) {
        clauses.push("v.municipality_code = ?");
        args.push(municipalityCode);
      }
      if (zone) {
        clauses.push("v.zone_number = ?");
        args.push(zone);
      }
      if (/^\d{1,4}$/.test(selectedSection)) {
        clauses.push("(v.section_number = ? OR CAST(v.section_number AS INTEGER) = ?)");
        args.push(selectedSection.padStart(4, "0"), Number(selectedSection));
      }

      const normalizedSearch = normalizeSearch(search);
      const numberMatch = normalizedSearch.match(/^(?:SECAO\s*)?(\d{1,4})$/);
      let cte = "";
      let placeJoin = "";
      let cteArgs = [];
      let searchTokens = [];
      let hasSearchIndex = false;
      if (numberMatch) {
        const sectionNumber = numberMatch[1].padStart(4, "0");
        clauses.push("(v.section_number = ? OR CAST(v.section_number AS INTEGER) = ?)");
        args.push(sectionNumber, Number(numberMatch[1]));
      } else if (normalizedSearch) {
        hasSearchIndex = presentTables.has("election_vote_section_fts")
          && presentTables.has("election_vote_section_catalog");
        searchTokens = normalizedSearch.split(" ").filter(Boolean).slice(0, 8);
        const placeClauses = ["c.year = ?", "c.round = ?"];
        cteArgs = [year, round];
        let placeSource = "election_vote_section_catalog c";
        if (hasSearchIndex) {
          const match = searchTokens.map(token => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
          placeClauses.unshift("election_vote_section_fts MATCH ?");
          cteArgs.unshift(match);
          placeSource = "election_vote_section_fts JOIN election_vote_section_catalog c ON c.id = election_vote_section_fts.rowid";
        } else {
          const placeText = "normalize_public_name(coalesce(c.polling_place_name,'') || ' ' || coalesce(c.polling_place_address,'') || ' ' || coalesce(c.polling_place_number,''))";
          for (const token of searchTokens) {
            placeClauses.push(`instr(${placeText}, ?) > 0`);
            cteArgs.push(token);
          }
        }
        if (state && state !== "BR") {
          placeClauses.push("c.state = ?");
          cteArgs.push(state);
        }
        if (municipalityCode) {
          placeClauses.push("c.municipality_code = ?");
          cteArgs.push(municipalityCode);
        }
        if (zone) {
          placeClauses.push("c.zone_number = ?");
          cteArgs.push(zone);
        }
        cte = `WITH matched_places AS MATERIALIZED (
          SELECT c.year, c.round, c.state, c.municipality_code, c.zone_number, c.section_number
          FROM ${placeSource}
          WHERE ${placeClauses.join(" AND ")}
        )`;
        placeJoin = `JOIN matched_places mp ON v.year = mp.year AND v.round = mp.round
          AND v.state IS mp.state AND v.municipality_code IS mp.municipality_code
          AND v.zone_number = mp.zone_number AND v.section_number = mp.section_number`;
      }

      const where = `WHERE ${clauses.join(" AND ")}`;
      const countMatches = () => database.prepare(`
        ${cte}
        SELECT count(*) AS total
        FROM election_vote_section v ${placeJoin}
        ${where}
      `).get(...cteArgs, ...args).total;
      let total = countMatches();
      if (total === 0 && normalizedSearch && hasSearchIndex && searchTokens.every(token => token.length >= 3)) {
        const placeText = "normalize_public_name(coalesce(c.polling_place_name,'') || ' ' || coalesce(c.polling_place_address,'') || ' ' || coalesce(c.polling_place_number,''))";
        const placeClauses = ["c.year = ?", "c.round = ?"];
        cteArgs = [year, round];
        if (state && state !== "BR") {
          placeClauses.push("c.state = ?");
          cteArgs.push(state);
        }
        if (municipalityCode) {
          placeClauses.push("c.municipality_code = ?");
          cteArgs.push(municipalityCode);
        }
        if (zone) {
          placeClauses.push("c.zone_number = ?");
          cteArgs.push(zone);
        }
        for (const token of searchTokens) {
          placeClauses.push(`instr(${placeText}, ?) > 0`);
          cteArgs.push(token);
        }
        cte = `WITH matched_places AS MATERIALIZED (
          SELECT c.year, c.round, c.state, c.municipality_code, c.zone_number, c.section_number
          FROM election_vote_section_catalog c
          WHERE ${placeClauses.join(" AND ")}
        )`;
        placeJoin = `JOIN matched_places mp ON v.year = mp.year AND v.round = mp.round
          AND v.state IS mp.state AND v.municipality_code IS mp.municipality_code
          AND v.zone_number = mp.zone_number AND v.section_number = mp.section_number`;
        total = countMatches();
      }
      const checkedAt = database.prepare(`
        ${cte}
        SELECT max(v.collected_at) AS checkedAt
        FROM election_vote_section v ${placeJoin}
        ${where}
      `).get(...cteArgs, ...args).checkedAt || new Date().toISOString();
      const rows = database.prepare(`
        ${cte}
        SELECT v.state, v.municipality, v.zone_number AS zone, v.section_number AS number,
               v.polling_place_number AS localCode, v.polling_place_name AS localName,
               v.polling_place_address AS address, v.votes
        FROM election_vote_section v ${placeJoin}
        ${where}
        ORDER BY v.votes DESC, v.state, v.municipality COLLATE NOCASE,
                 CAST(v.zone_number AS INTEGER), CAST(v.section_number AS INTEGER)
        LIMIT ? OFFSET ?
      `).all(...cteArgs, ...args, pageSize, (page - 1) * pageSize);

      parentPort.postMessage({
        ready: true,
        rows,
        total,
        page,
        pageSize,
        checkedAt,
      });
    }
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Live section vote query failed" });
} finally {
  if (database.open) database.close();
}
