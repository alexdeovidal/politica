const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");
database.function("normalize_public_name", { deterministic: true }, normalizeName);

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

try {
  const { historyId, page, group, state } = workerData;
  const query = String(workerData.query || "").slice(0, 120);
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  if (!tables.has("election_vote_section")) {
    parentPort.postMessage({ rows: [], total: 0, states: [], votes: 0, municipalityTotals: [] });
  } else {
    const expression = group === "zone"
      ? "municipality || ' · zona ' || zone_number"
      : group === "polling"
        ? "municipality || ' · ' || coalesce(polling_place_name,'Local não informado') || ' · local ' || coalesce(polling_place_number,'sem número') || ' · zona ' || zone_number"
        : "municipality";
    const where = "history_id=? AND (?='' OR state=?)";
    const args = [historyId, state, state];
    const cte = `WITH grouped AS (
      SELECT state, ${expression} AS label, sum(votes) AS votes, count(*) AS sections
      FROM election_vote_section WHERE ${where}
      GROUP BY state, ${expression}
    )`;
    const rows = database.prepare(
      `${cte} SELECT * FROM grouped
       WHERE instr(normalize_public_name(label),normalize_public_name(?))>0
       ORDER BY votes DESC LIMIT 25 OFFSET ?`
    ).all(...args, query, (page - 1) * 25);
    const total = database.prepare(
      `${cte} SELECT count(*) AS n FROM grouped
       WHERE instr(normalize_public_name(label),normalize_public_name(?))>0`
    ).get(...args, query).n;
    const states = database.prepare(
      "SELECT state,sum(votes) AS votes FROM election_vote_section WHERE history_id=? GROUP BY state"
    ).all(historyId);
    const votes = database.prepare(
      "SELECT coalesce(sum(votes),0) AS n FROM election_vote_section WHERE history_id=?"
    ).get(historyId).n;
    const municipalityTotals = state
      ? database.prepare(
          "SELECT normalize_public_name(municipality) AS name,sum(votes) AS votes FROM election_vote_section WHERE history_id=? AND state=? GROUP BY normalize_public_name(municipality)"
        ).all(historyId, state)
      : [];

    parentPort.postMessage({ rows, total, states, votes, municipalityTotals });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Vote territory query failed" });
} finally {
  database.close();
}
