const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

function photosFor(personIds) {
  const ids = [...new Set(personIds)];
  if (ids.length === 0 || !database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='candidate_photo'").get()) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = database.prepare(`
    SELECT person_id AS personId, photo_url AS photoUrl, max(year) AS year
    FROM candidate_photo
    WHERE person_id IN (${placeholders})
    GROUP BY person_id
  `).all(...ids);
  return new Map(rows.map(row => [row.personId, row.photoUrl]));
}

function years() {
  return database.prepare("SELECT DISTINCT year FROM declared_assets ORDER BY year DESC").all().map(row => row.year);
}

function assetsPage() {
  const limit = Math.min(100, Math.max(1, Number(workerData.limit) || 50));
  const offset = Math.max(0, (Math.max(1, Number(workerData.page) || 1) - 1) * limit);
  const year = Number.isInteger(workerData.year) ? workerData.year : null;
  const direction = workerData.order === "asc" ? "ASC" : "DESC";
  const yearArgs = year === null ? [] : [year];
  const latestJoin = year === null ? `JOIN (
    SELECT person_id, max(year) AS year
    FROM declared_assets
    WHERE person_id IS NOT NULL
    GROUP BY person_id
  ) latest ON latest.person_id = da.person_id AND latest.year = da.year` : "";
  const yearWhere = year === null ? "WHERE da.person_id IS NOT NULL" : "WHERE da.year = ? AND da.person_id IS NOT NULL";
  const aggregate = `WITH agg AS (
    SELECT da.person_id, count(*) AS assetCount, coalesce(sum(da.value_cents), 0) AS assetTotalCents
    FROM declared_assets da ${latestJoin} ${yearWhere}
    GROUP BY da.person_id
  )`;
  const rows = database.prepare(`${aggregate}
    SELECT a.person_id AS personId, p.canonical_name AS name, a.assetCount, a.assetTotalCents,
           ph.office, ph.party_abbr AS partyAbbr, ph.state, ph.year,
           count(*) OVER() AS total
    FROM agg a
    JOIN people p ON p.id = a.person_id
    LEFT JOIN politician_history ph ON ph.id = (
      SELECT ph2.id FROM politician_history ph2
      WHERE ph2.person_id = a.person_id${year === null ? "" : " AND ph2.year = ?"}
      ORDER BY ph2.year DESC, ph2.id DESC LIMIT 1
    )
    ORDER BY a.assetTotalCents ${direction}
    LIMIT ? OFFSET ?`).all(...yearArgs, ...(year === null ? [] : yearArgs), limit, offset);
  const total = rows.length ? rows[0].total : database.prepare(`${aggregate} SELECT count(*) AS total FROM agg`).get(...yearArgs).total;
  const photos = photosFor(rows.map(row => row.personId));
  return {
    rows: rows.map(row => ({
      personId: row.personId,
      name: row.name ?? null,
      assetCount: row.assetCount,
      assetTotalCents: row.assetTotalCents,
      office: row.office ?? null,
      partyAbbr: row.partyAbbr ?? null,
      state: row.state ?? null,
      year: row.year ?? null,
      photoUrl: photos.get(row.personId) ?? null,
    })),
    total,
  };
}

function growthPage() {
  const limit = Math.min(100, Math.max(1, Number(workerData.limit) || 50));
  const offset = Math.max(0, (Math.max(1, Number(workerData.page) || 1) - 1) * limit);
  const direction = workerData.order === "asc" ? "ASC" : "DESC";
  const cte = `WITH bounds AS (
    SELECT person_id, min(year) AS firstYear, max(year) AS lastYear
    FROM declared_assets WHERE person_id IS NOT NULL
    GROUP BY person_id HAVING count(DISTINCT year) >= 2
  ), first_total AS (
    SELECT da.person_id, coalesce(sum(da.value_cents), 0) AS totalCents
    FROM declared_assets da JOIN bounds b ON b.person_id = da.person_id AND da.year = b.firstYear
    GROUP BY da.person_id
  ), last_total AS (
    SELECT da.person_id, coalesce(sum(da.value_cents), 0) AS totalCents
    FROM declared_assets da JOIN bounds b ON b.person_id = da.person_id AND da.year = b.lastYear
    GROUP BY da.person_id
  ), growth AS (
    SELECT b.person_id, b.firstYear, b.lastYear, f.totalCents AS firstCents, l.totalCents AS lastCents,
           (l.totalCents - f.totalCents) AS growthCents
    FROM bounds b JOIN first_total f ON f.person_id = b.person_id JOIN last_total l ON l.person_id = b.person_id
  )`;
  const rows = database.prepare(`${cte}
    SELECT g.person_id AS personId, p.canonical_name AS name, g.firstYear, g.lastYear,
           g.firstCents, g.lastCents, g.growthCents, ph.office, ph.party_abbr AS partyAbbr, ph.state,
           count(*) OVER() AS total
    FROM growth g JOIN people p ON p.id = g.person_id
    LEFT JOIN politician_history ph ON ph.id = (
      SELECT ph2.id FROM politician_history ph2 WHERE ph2.person_id = g.person_id
      ORDER BY ph2.year DESC, ph2.id DESC LIMIT 1
    )
    ORDER BY g.growthCents ${direction} LIMIT ? OFFSET ?`).all(limit, offset);
  const total = rows.length ? rows[0].total : database.prepare(`${cte} SELECT count(*) AS total FROM growth`).get().total;
  const photos = photosFor(rows.map(row => row.personId));
  return {
    rows: rows.map(row => ({
      personId: row.personId,
      name: row.name ?? null,
      office: row.office ?? null,
      partyAbbr: row.partyAbbr ?? null,
      state: row.state ?? null,
      firstYear: row.firstYear,
      lastYear: row.lastYear,
      firstCents: row.firstCents,
      lastCents: row.lastCents,
      growthCents: row.growthCents,
      growthPct: row.firstCents > 0 ? ((row.lastCents - row.firstCents) / row.firstCents) * 100 : null,
      photoUrl: photos.get(row.personId) ?? null,
    })),
    total,
  };
}

try {
  if (workerData.mode === "years") parentPort.postMessage({ years: years() });
  else parentPort.postMessage(workerData.type === "crescimento" ? growthPage() : assetsPage());
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Failed to calculate asset ranking" });
} finally {
  database.close();
}
