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

function queryOptions() {
  const table = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='election_vote_section'").get();
  if (!table) return { years: [], rounds: [], offices: [], states: [], municipalities: [], zones: [], parties: [] };
  const year = Number(filters.year) || 0;
  const round = Number(filters.round) || 0;
  const office = String(filters.officeCode || "");
  const state = String(filters.state || "");
  const municipalityCode = String(filters.municipalityCode || "");
  const years = database.prepare("SELECT DISTINCT year FROM election_vote_section ORDER BY year DESC").all().map(row => row.year);
  const rounds = year
    ? database.prepare("SELECT DISTINCT round FROM election_vote_section WHERE year = ? ORDER BY round").all(year).map(row => row.round)
    : [];
  const offices = year
    ? database.prepare("SELECT DISTINCT office_code AS code, office AS label FROM election_vote_section WHERE year = ? AND (? = 0 OR round = ?) AND office IS NOT NULL ORDER BY office").all(year, round, round)
    : [];
  const states = year
    ? database.prepare("SELECT DISTINCT state FROM election_vote_section WHERE year = ? AND (? = 0 OR round = ?) AND (? = '' OR office_code = ?) AND state IS NOT NULL ORDER BY state").all(year, round, round, office, office).map(row => row.state)
    : [];
  const municipalities = state && year
    ? database.prepare("SELECT municipality_code AS code, max(municipality) AS label FROM election_vote_section WHERE year = ? AND (? = 0 OR round = ?) AND (? = '' OR office_code = ?) AND state = ? AND municipality_code IS NOT NULL GROUP BY municipality_code ORDER BY label").all(year, round, round, office, office, state)
    : [];
  const zones = municipalityCode && year
    ? database.prepare("SELECT DISTINCT zone_number AS zone FROM election_vote_section WHERE year = ? AND (? = 0 OR round = ?) AND (? = '' OR office_code = ?) AND (? = '' OR state = ?) AND municipality_code = ? ORDER BY CAST(zone_number AS INTEGER)").all(year, round, round, office, office, state, state, municipalityCode).map(row => row.zone)
    : [];
  const partyClauses = [];
  const partyArgs = [];
  if (year) { partyClauses.push("h.year = ?"); partyArgs.push(year); }
  if (round) { partyClauses.push("h.round = ?"); partyArgs.push(round); }
  if (office) { partyClauses.push("v.office_code = ?"); partyArgs.push(office); }
  if (state) { partyClauses.push("v.state = ?"); partyArgs.push(state); }
  if (municipalityCode) { partyClauses.push("v.municipality_code = ?"); partyArgs.push(municipalityCode); }
  const parties = year
    ? database.prepare(`SELECT DISTINCT h.party_abbr AS party FROM politician_history h JOIN election_vote_section v ON v.history_id = h.id ${partyClauses.length ? `WHERE ${partyClauses.join(" AND ")}` : ""} AND h.party_abbr IS NOT NULL ORDER BY h.party_abbr`).all(...partyArgs).map(row => row.party)
    : [];
  return { years, rounds, offices, states, municipalities, zones, parties, filterScope: { year, round, office, state, municipalityCode }, hasPlaceOptions: Boolean(state && municipalityCode) };
}

function querySearch() {
  const page = Math.min(10000, Math.max(1, Number(filters.page) || 1));
  const pageSize = 25;
  if (!filters.year || !filters.round || !filters.officeCode) {
    return { rows: [], total: 0, page, pageSize, totalNominalVotes: 0, totalSections: 0 };
  }

  const filtered = clausesFor();
  const candidates = database.prepare(`
    WITH tallies AS (
      SELECT h.id AS historyId, h.person_id AS personId, v.year AS year, v.round AS round,
             coalesce(h.ballot_name, h.full_name, 'Nome não informado') AS name,
             h.full_name AS legalName, h.office AS office, h.state AS state,
             h.municipality AS municipality, h.party_abbr AS party,
             h.candidate_number AS candidateNumber,
             sum(v.votes) AS votes,
             count(*) AS sections,
             count(DISTINCT v.municipality_code) AS municipalities
      FROM election_vote_section v
      JOIN politician_history h ON h.id = v.history_id
      ${filtered.sql}
      GROUP BY h.id
    )
    SELECT historyId, personId, name, legalName, office, state, municipality, party,
           candidateNumber, votes, sections, municipalities
    FROM tallies
    ORDER BY votes DESC, name COLLATE NOCASE, historyId
    LIMIT ? OFFSET ?
  `).all(...filtered.args, pageSize, (page - 1) * pageSize);

  const totalRow = database.prepare(`
    SELECT count(*) AS total FROM (
      SELECT v.history_id FROM election_vote_section v
      JOIN politician_history h ON h.id = v.history_id
      ${filtered.sql}
      GROUP BY v.history_id
    )
  `).get(...filtered.args);
  const scope = clausesFor({ includeParty: false, includeQuery: false });
  const scopeRow = database.prepare(`
    SELECT coalesce(sum(v.votes), 0) AS totalVotes,
           count(DISTINCT v.municipality_code || ':' || v.zone_number || ':' || v.section_number) AS sections
    FROM election_vote_section v JOIN politician_history h ON h.id = v.history_id ${scope.sql}
  `).get(...scope.args);

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

  const base = clausesFor({ includeParty: false, includeQuery: false, includeIdentity: false });
  const idPlaceholders = ids.map(() => "?").join(",");
  const ranking = database.prepare(`
    WITH tallies AS (
      SELECT h.id AS historyId, h.party_abbr AS party, sum(v.votes) AS votes
      FROM election_vote_section v JOIN politician_history h ON h.id = v.history_id
      ${base.sql}
      GROUP BY h.id
    ), ranked AS (
      SELECT historyId, party, votes,
        row_number() OVER (ORDER BY votes DESC, historyId) AS overallRank,
        row_number() OVER (PARTITION BY coalesce(party,'') ORDER BY votes DESC, historyId) AS partyRank
      FROM tallies
    )
    SELECT * FROM ranked WHERE historyId IN (${idPlaceholders})
  `).all(...base.args, ...ids);
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
      SELECT coalesce(sum(v.votes), 0) AS votes,
             count(*) AS sections,
             count(DISTINCT v.municipality_code) AS municipalities
      FROM election_vote_section v JOIN politician_history h ON h.id = v.history_id
      ${base.sql} AND v.history_id = ?
    `).get(...base.args, historyId);
    if (!summary || !summary.votes) continue;

    const denominator = database.prepare(`
      SELECT coalesce(sum(v.votes),0) AS votes FROM election_vote_section v
      JOIN politician_history h ON h.id = v.history_id ${base.sql}
    `).get(...base.args).votes;
    const municipalities = database.prepare(`
      SELECT v.municipality AS name, v.state AS state, sum(v.votes) AS votes,
             count(DISTINCT v.zone_number || ':' || v.section_number) AS sections
      FROM election_vote_section v JOIN politician_history h ON h.id = v.history_id
      ${base.sql} AND v.history_id = ?
      GROUP BY v.municipality_code, v.municipality, v.state
      ORDER BY votes DESC LIMIT 12
    `).all(...base.args, historyId);
    const places = database.prepare(`
      SELECT coalesce(v.polling_place_name, 'Local sem nome publicado') AS name,
             v.polling_place_number AS placeNumber, v.municipality AS municipality,
             v.state AS state, v.zone_number AS zone, v.section_number AS section,
             v.polling_place_address AS address, sum(v.votes) AS votes
      FROM election_vote_section v JOIN politician_history h ON h.id = v.history_id
      ${base.sql} AND v.history_id = ?
      GROUP BY v.municipality_code, v.zone_number, v.polling_place_number, v.polling_place_name,
               v.polling_place_address, v.section_number, v.municipality, v.state
      ORDER BY votes DESC LIMIT 12
    `).all(...base.args, historyId);
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
