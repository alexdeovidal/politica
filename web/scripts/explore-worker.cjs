const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

try {
  database.function("normalize_public_name", { deterministic: true }, normalizeName);
  if (workerData.mode === "options") {
    parentPort.postMessage({
      years: database.prepare("SELECT DISTINCT year FROM politician_history ORDER BY year DESC").all().map(row => row.year),
      offices: database.prepare("SELECT DISTINCT office FROM politician_history WHERE office IS NOT NULL ORDER BY office").all().map(row => row.office),
      states: database.prepare("SELECT DISTINCT state FROM politician_history WHERE state IS NOT NULL ORDER BY state").all().map(row => row.state),
    });
  } else {
    const clauses = [];
    const args = [];
    for (const [field, value] of [["year", workerData.year], ["state", workerData.state], ["office", workerData.office]]) {
      if (value) { clauses.push(`ph.${field} = ?`); args.push(value); }
    }
    for (const token of normalizeName(workerData.q).split(" ").filter(Boolean)) {
      clauses.push("(instr(ph.normalized_name, ?) > 0 OR instr(normalize_public_name(coalesce(ph.ballot_name, '')), ?) > 0)");
      args.push(token, token);
    }
    for (const token of normalizeName(workerData.city).split(" ").filter(Boolean)) {
      clauses.push("instr(normalize_public_name(coalesce(ph.municipality, ph.electoral_unit, '')), ?) > 0");
      args.push(token);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = database.prepare(`SELECT count(DISTINCT ph.person_id) AS total FROM politician_history ph ${where}`).get(...args).total;
    const page = Math.max(1, Math.floor(Number(workerData.page) || 1));
    const rows = database.prepare(`WITH ranked AS (
      SELECT ph.id, row_number() OVER(PARTITION BY ph.person_id ORDER BY ph.year DESC, ph.round DESC, ph.id DESC) AS n
      FROM politician_history ph ${where}
    ), chosen AS (SELECT id FROM ranked WHERE n = 1)
    SELECT ph.person_id AS personId, ph.full_name AS name, ph.ballot_name AS ballotName,
           ph.year, ph.office, ph.state, ph.municipality, ph.party_abbr AS party, ph.result
    FROM chosen JOIN politician_history ph ON ph.id = chosen.id
    ORDER BY ph.full_name LIMIT 24 OFFSET ?`).all(...args, (page - 1) * 24);
    parentPort.postMessage({ rows, total, page });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Failed to explore candidacies" });
} finally {
  database.close();
}
