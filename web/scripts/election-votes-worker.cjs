const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

database.function("normalize_public_name", { deterministic: true }, normalizeName);

const filters = workerData.filters || {};

function clausesFor({ includeParty = true, includeQuery = true, includePlace = true, includeIdentity = true } = {}) {
  const clauses = [];
  const args = [];
  const values = [
    ["v.year", filters.year], ["v.round", filters.round], ["v.office_code", filters.officeCode],
    ["v.state", filters.state], ["v.municipality_code", filters.municipalityCode],
    ["v.zone_number", filters.zone], ["v.section_number", filters.section],
  ];
  for (const [field, value] of values) {
    if (value !== undefined && value !== null && value !== "") {
      clauses.push(`${field} = ?`);
      args.push(value);
    }
  }
  if (includePlace && filters.place) {
    clauses.push("instr(normalize_public_name(coalesce(v.polling_place_name,'') || ' ' || coalesce(v.polling_place_address,'') || ' ' || coalesce(v.polling_place_number,'')), ?) > 0");
    args.push(normalizeName(filters.place));
  }
  if (includeParty && filters.party) {
    clauses.push("normalize_public_name(coalesce(h.party_abbr,'')) = ?");
    args.push(normalizeName(filters.party));
  }
  if (includeQuery && filters.q) {
    for (const token of normalizeName(filters.q).split(" ").filter(Boolean).slice(0, 8)) {
      clauses.push("(instr(normalize_public_name(coalesce(h.full_name,'') || ' ' || coalesce(h.ballot_name,'')), ?) > 0 OR instr(normalize_public_name(coalesce(h.party_abbr,'')), ?) > 0)");
      args.push(token, token);
    }
  }
  if (includeIdentity && filters.historyId) {
    clauses.push("v.history_id = ?");
    args.push(filters.historyId);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
}

function matchedPlaceFilter() {
  if (!filters.place) return null;
  const catalogExists = Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='election_vote_section_fts'",
  ).get());
  if (!catalogExists || !database.prepare("SELECT 1 FROM election_vote_section_catalog LIMIT 1").get()) return null;
  const tokens = normalizeName(filters.place).split(" ").filter(Boolean).slice(0, 8);
  if (!tokens.length) return null;

  const match = tokens.map(token => `"${token.replaceAll('"', '""')}"`).join(" AND ");
  const clauses = ["election_vote_section_fts MATCH ?"];
  const args = [match];
  for (const [field, value] of [
    ["year", filters.year], ["round", filters.round], ["state", filters.state],
    ["municipality_code", filters.municipalityCode], ["zone_number", filters.zone], ["section_number", filters.section],
  ]) {
    if (value !== undefined && value !== null && value !== "") {
      clauses.push(`c.${field} = ?`);
      args.push(value);
    }
  }

  return {
    args,
    cte: `matched_places AS MATERIALIZED (
      SELECT c.year, c.round, c.state, c.municipality_code, c.zone_number, c.section_number
      FROM election_vote_section_fts
      JOIN election_vote_section_catalog c ON c.id = election_vote_section_fts.rowid
      WHERE ${clauses.join(" AND ")}
    )`,
    join: `JOIN matched_places mp ON v.year = mp.year AND v.round = mp.round
      AND v.state IS mp.state AND v.municipality_code IS mp.municipality_code
      AND v.zone_number = mp.zone_number AND v.section_number = mp.section_number`,
  };
}

function queryOptions() {
  const table = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='election_vote_section'").get();
  if (!table) return { years: [], rounds: [], offices: [], states: [], municipalities: [], zones: [], parties: [] };
  const year = Number(filters.year) || 0;
  const round = Number(filters.round) || 0;
  const office = String(filters.officeCode || "");
  const state = String(filters.state || "");
  const municipalityCode = String(filters.municipalityCode || "");
  const catalogReady = Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='election_vote_section_catalog'",
  ).get()) && Boolean(database.prepare("SELECT 1 FROM election_vote_section_catalog LIMIT 1").get());
  const catalogTable = "election_vote_section_catalog";
  const scopeReady = catalogReady && Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='election_vote_filter_scope'",
  ).get()) && Boolean(database.prepare("SELECT 1 FROM election_vote_filter_scope LIMIT 1").get());
  const optionsTable = scopeReady ? "election_vote_filter_scope" : catalogReady ? catalogTable : "election_vote_section";
  const candidateYears = catalogReady ? [] : database.prepare(
    "SELECT DISTINCT year FROM politician_history WHERE year >= 2012 ORDER BY year DESC",
  ).all().map(row => row.year);
  const hasVotesInYear = catalogReady ? null : database.prepare("SELECT 1 FROM election_vote_section WHERE year = ? LIMIT 1");
  const years = catalogReady
    ? database.prepare(`SELECT DISTINCT year FROM ${optionsTable} ORDER BY year DESC`).all().map(row => row.year)
    : candidateYears.filter(value => hasVotesInYear.get(value));

  const roundWhere = round ? "year = ? AND round = ?" : "year = ?";
  const roundArgs = round ? [year, round] : [year];
  const rounds = year
    ? database.prepare(`SELECT DISTINCT round FROM ${optionsTable} WHERE year = ? ORDER BY round`).all(year).map(row => row.round)
    : [];
  const officeCodes = year
    ? database.prepare(`SELECT DISTINCT office_code AS code FROM election_vote_section WHERE ${roundWhere} AND office_code IS NOT NULL ORDER BY office_code`).all(...roundArgs)
    : [];
  const labelForOffice = database.prepare(`
    SELECT office AS label FROM election_vote_section
    WHERE ${roundWhere} AND office_code = ? AND office IS NOT NULL LIMIT 1
  `);
  const offices = officeCodes.map(({ code }) => ({
    code: String(code),
    label: labelForOffice.get(...roundArgs, code)?.label || String(code),
  })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const officeLabel = offices.find(item => item.code === office)?.label || "";

  const scopeClauses = [round ? "year = ? AND round = ?" : "year = ?"];
  const scopeArgs = [...roundArgs];
  if (office && !catalogReady) { scopeClauses.push("office_code = ?"); scopeArgs.push(office); }
  const states = year
    ? database.prepare(`SELECT DISTINCT state FROM ${optionsTable} WHERE ${scopeClauses.join(" AND ")} AND ${scopeReady ? "state <> ''" : "state IS NOT NULL"} ORDER BY state`).all(...scopeArgs).map(row => row.state)
    : [];

  const municipalityClauses = [...scopeClauses];
  const municipalityArgs = [...scopeArgs];
  if (state) { municipalityClauses.push("state = ?"); municipalityArgs.push(state); }
  const municipalities = state && year
    ? database.prepare(`
        SELECT DISTINCT municipality_code AS code, municipality AS label
        FROM ${optionsTable}
        WHERE ${municipalityClauses.join(" AND ")} AND ${scopeReady ? "municipality_code <> ''" : "municipality_code IS NOT NULL"}
        ORDER BY label
      `).all(...municipalityArgs)
    : [];

  const zoneClauses = [...municipalityClauses];
  const zoneArgs = [...municipalityArgs];
  if (municipalityCode) { zoneClauses.push("municipality_code = ?"); zoneArgs.push(municipalityCode); }
  const zones = municipalityCode && year
    ? database.prepare(`SELECT DISTINCT zone_number AS zone FROM ${optionsTable} WHERE ${zoneClauses.join(" AND ")} AND ${scopeReady ? "zone_number <> ''" : "1=1"} ORDER BY CAST(zone_number AS INTEGER)`).all(...zoneArgs).map(row => row.zone)
    : [];

  const partyClauses = ["year = ?"];
  const partyArgs = [year];
  if (round) { partyClauses.push("coalesce(round, 1) = ?"); partyArgs.push(round); }
  if (officeLabel) { partyClauses.push("office = ?"); partyArgs.push(officeLabel); }
  if (state) { partyClauses.push("state = ?"); partyArgs.push(state); }
  const parties = year && officeLabel
    ? database.prepare(`SELECT DISTINCT party_abbr AS party FROM politician_history WHERE ${partyClauses.join(" AND ")} AND party_abbr IS NOT NULL ORDER BY party_abbr`).all(...partyArgs).map(row => row.party)
    : [];
  return { years, rounds, offices, states, municipalities, zones, parties, filterScope: { year, round, office, state, municipalityCode }, hasPlaceOptions: Boolean(state && municipalityCode) };
}

function querySearch() {
  const page = Math.min(10000, Math.max(1, Number(filters.page) || 1));
  const pageSize = 25;
  if (!filters.year || !filters.round || !filters.officeCode) {
    return { rows: [], total: 0, page, pageSize, totalNominalVotes: 0, totalSections: 0 };
  }

  const placeFilter = matchedPlaceFilter();
  const filtered = clausesFor({ includePlace: !placeFilter });
  const withPlaces = placeFilter ? `WITH ${placeFilter.cte}, ` : "WITH ";
  const joinPlaces = placeFilter ? placeFilter.join : "";
  const placeArgs = placeFilter ? placeFilter.args : [];
  const candidates = database.prepare(`
    ${withPlaces}tallies AS (
      SELECT h.id AS historyId, h.person_id AS personId, v.year AS year, v.round AS round,
             coalesce(h.ballot_name, h.full_name, 'Nome não informado') AS name,
             h.full_name AS legalName, h.office AS office, h.state AS state,
             h.municipality AS municipality, h.party_abbr AS party,
             h.candidate_number AS candidateNumber,
             sum(v.votes) AS votes,
             count(*) AS sections,
             count(DISTINCT v.municipality_code) AS municipalities
      FROM election_vote_section v
      ${joinPlaces}
      JOIN politician_history h ON h.id = v.history_id
      ${filtered.sql}
      GROUP BY h.id
    )
    SELECT historyId, personId, name, legalName, office, state, municipality, party,
           candidateNumber, votes, sections, municipalities
    FROM tallies
    ORDER BY votes DESC, name COLLATE NOCASE, historyId
    LIMIT ? OFFSET ?
  `).all(...placeArgs, ...filtered.args, pageSize, (page - 1) * pageSize);

  const totalRow = database.prepare(`
    ${placeFilter ? `WITH ${placeFilter.cte}` : ""}
    SELECT count(*) AS total FROM (
      SELECT v.history_id FROM election_vote_section v
      ${joinPlaces}
      JOIN politician_history h ON h.id = v.history_id
      ${filtered.sql}
      GROUP BY v.history_id
    )
  `).get(...placeArgs, ...filtered.args);
  const scope = clausesFor({ includeParty: false, includeQuery: false, includePlace: !placeFilter });
  const scopeRow = database.prepare(`
    ${placeFilter ? `WITH ${placeFilter.cte}` : ""}
    SELECT coalesce(sum(v.votes), 0) AS totalVotes,
           count(DISTINCT v.municipality_code || ':' || v.zone_number || ':' || v.section_number) AS sections
    FROM election_vote_section v ${joinPlaces} JOIN politician_history h ON h.id = v.history_id ${scope.sql}
  `).get(...placeArgs, ...scope.args);

  return {
    rows: candidates.map(row => ({
      ...row,
      voteShare: scopeRow.totalVotes ? row.votes / scopeRow.totalVotes * 100 : 0,
    })),
    total: totalRow.total,
    page,
    pageSize,
    totalNominalVotes: scopeRow.totalVotes,
    totalSections: scopeRow.sections,
  };
}

function queryDetails() {
  const ids = [...new Set((workerData.historyIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 3);
  if (!ids.length || !filters.year || !filters.round || !filters.officeCode) return { records: [] };

  const placeFilter = matchedPlaceFilter();
  const base = clausesFor({ includeParty: false, includeQuery: false, includeIdentity: false, includePlace: !placeFilter });
  const withPlaces = placeFilter ? `WITH ${placeFilter.cte}, ` : "WITH ";
  const joinPlaces = placeFilter ? placeFilter.join : "";
  const placeArgs = placeFilter ? placeFilter.args : [];
  const idPlaceholders = ids.map(() => "?").join(",");
  const ranking = database.prepare(`
    ${withPlaces}tallies AS (
      SELECT h.id AS historyId, h.party_abbr AS party, sum(v.votes) AS votes
      FROM election_vote_section v ${joinPlaces} JOIN politician_history h ON h.id = v.history_id
      ${base.sql}
      GROUP BY h.id
    ), ranked AS (
      SELECT historyId, party, votes,
        row_number() OVER (ORDER BY votes DESC, historyId) AS overallRank,
        row_number() OVER (PARTITION BY coalesce(party,'') ORDER BY votes DESC, historyId) AS partyRank
      FROM tallies
    )
    SELECT * FROM ranked WHERE historyId IN (${idPlaceholders})
  `).all(...placeArgs, ...base.args, ...ids);
  const rankById = new Map(ranking.map(row => [row.historyId, row]));

  const records = [];
  for (const historyId of ids) {
    const candidate = database.prepare(`
      SELECT h.id AS historyId, h.person_id AS personId,
             coalesce(h.ballot_name, h.full_name, 'Nome não informado') AS name,
             h.full_name AS legalName, h.year, h.round, h.office,
             h.state, h.municipality, h.electoral_unit AS electoralUnit,
             h.party_abbr AS party, h.candidate_number AS candidateNumber,
             (SELECT v.office_code FROM election_vote_section v WHERE v.history_id = h.id LIMIT 1) AS officeCode
      FROM politician_history h
      WHERE h.id = ? AND h.year = ? AND h.round = ?
        AND EXISTS (SELECT 1 FROM election_vote_section v WHERE v.history_id = h.id AND v.office_code = ?)
    `).get(historyId, filters.year, filters.round, filters.officeCode);
    if (!candidate) continue;

    const summary = database.prepare(`
      ${placeFilter ? `WITH ${placeFilter.cte}` : ""}
      SELECT coalesce(sum(v.votes), 0) AS votes,
             count(*) AS sections,
             count(DISTINCT v.municipality_code) AS municipalities
      FROM election_vote_section v ${joinPlaces} JOIN politician_history h ON h.id = v.history_id
      ${base.sql} AND v.history_id = ?
    `).get(...placeArgs, ...base.args, historyId);
    if (!summary || !summary.votes) continue;

    const denominator = database.prepare(`
      ${placeFilter ? `WITH ${placeFilter.cte}` : ""}
      SELECT coalesce(sum(v.votes),0) AS votes FROM election_vote_section v
      ${joinPlaces} JOIN politician_history h ON h.id = v.history_id ${base.sql}
    `).get(...placeArgs, ...base.args).votes;
    const municipalities = database.prepare(`
      ${placeFilter ? `WITH ${placeFilter.cte}` : ""}
      SELECT v.municipality AS name, v.state AS state, sum(v.votes) AS votes,
             count(DISTINCT v.zone_number || ':' || v.section_number) AS sections
      FROM election_vote_section v ${joinPlaces} JOIN politician_history h ON h.id = v.history_id
      ${base.sql} AND v.history_id = ?
      GROUP BY v.municipality_code, v.municipality, v.state
      ORDER BY votes DESC LIMIT 12
    `).all(...placeArgs, ...base.args, historyId);
    const places = database.prepare(`
      ${placeFilter ? `WITH ${placeFilter.cte}` : ""}
      SELECT coalesce(v.polling_place_name, 'Local sem nome publicado') AS name,
             v.polling_place_number AS placeNumber, v.municipality AS municipality,
             v.state AS state, v.zone_number AS zone, v.section_number AS section,
             v.polling_place_address AS address, sum(v.votes) AS votes
      FROM election_vote_section v ${joinPlaces} JOIN politician_history h ON h.id = v.history_id
      ${base.sql} AND v.history_id = ?
      GROUP BY v.municipality_code, v.zone_number, v.polling_place_number, v.polling_place_name,
               v.polling_place_address, v.section_number, v.municipality, v.state
      ORDER BY votes DESC LIMIT 12
    `).all(...placeArgs, ...base.args, historyId);
    const timeline = database.prepare(`
      SELECT v.year, v.round, h.party_abbr AS party, h.state, sum(v.votes) AS votes
      FROM election_vote_section v JOIN politician_history h ON h.id = v.history_id
      WHERE h.person_id = ? AND v.office_code = ?
      GROUP BY v.year, v.round, h.party_abbr, h.state
      ORDER BY v.year, v.round
    `).all(candidate.personId, candidate.officeCode);
    const rank = rankById.get(historyId);
    records.push({
      ...candidate,
      votes: summary.votes,
      sections: summary.sections,
      municipalitiesCount: summary.municipalities,
      voteShare: denominator ? summary.votes / denominator * 100 : 0,
      rank: rank?.overallRank ?? null,
      partyRank: rank?.partyRank ?? null,
      municipalityResults: municipalities,
      pollingResults: places,
      timeline,
    });
  }
  return { records };
}

try {
  const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='election_vote_section'").get();
  if (!exists) parentPort.postMessage({ years: [], rows: [], total: 0, records: [] });
  else if (workerData.mode === "options") parentPort.postMessage(queryOptions());
  else if (workerData.mode === "search") parentPort.postMessage(querySearch());
  else if (workerData.mode === "details") parentPort.postMessage(queryDetails());
  else parentPort.postMessage({ error: "Unknown election vote query mode" });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Election vote query failed" });
} finally {
  database.close();
}
