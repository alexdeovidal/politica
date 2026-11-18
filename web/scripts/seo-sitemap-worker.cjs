// Sitemap reads use the existing bounded worker pool. Never generate news or
// scan the electoral database synchronously in Next.js's request process.
const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const { existsSync } = require("node:fs");
const path = require("node:path");

const batchSize = 10000;
const filename = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const platformFilename = process.env.POLITICA_PLATFORM_DB_PATH || path.join(path.dirname(filename), "politica-platform.db");
const connections = [];

function open(filename) {
  const connection = new Database(filename, { readonly: true, fileMustExist: true, timeout: 250 });
  connection.pragma("query_only = ON");
  connections.push(connection);
  return connection;
}

function platform() {
  // A new installation can have no saved editions yet. Reading a sitemap must
  // not create the platform store or trigger daily edition generation.
  if (!existsSync(platformFilename)) return null;
  const connection = open(platformFilename);
  return connection.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='daily_news'").get() ? connection : null;
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function run() {
  if (workerData.mode === "index") {
    const database = open(filename);
    // ix_ph_person is already part of the application's schema. The scan runs
    // only for the cached index, not once per sitemap or per candidate.
    const politicianBuckets = database.prepare(`
      SELECT DISTINCT CAST((h.person_id - 1) / ? AS INTEGER) AS bucket
      FROM politician_history h
      WHERE h.person_id > 0 AND EXISTS (SELECT 1 FROM people p WHERE p.id = h.person_id)
      ORDER BY bucket
    `).all(batchSize).map(row => row.bucket);
    const store = platform();
    const newsYears = store ? store.prepare(`
      SELECT DISTINCT substr(day, 1, 4) AS year FROM daily_news
      WHERE day <= ? AND length(day) = 10 AND payload <> '[]' ORDER BY year
    `).all(today()).map(row => Number(row.year)).filter(year => Number.isInteger(year) && year >= 2000 && year <= 2100) : [];
    return { politicianBuckets, newsYears };
  }

  if (workerData.mode === "politicians") {
    const bucket = workerData.bucket;
    if (!Number.isSafeInteger(bucket) || bucket < 0 || bucket > 1000000) throw new Error("Invalid sitemap bucket");
    const database = open(filename);
    // Stable primary-key ranges avoid OFFSET scans and keep every file below
    // 10,000 URLs, including when new candidates are added between crawls.
    return database.prepare(`
      SELECT p.id FROM people p
      WHERE p.id > ? AND p.id <= ?
        AND EXISTS (SELECT 1 FROM politician_history h WHERE h.person_id = p.id)
      ORDER BY p.id
    `).all(bucket * batchSize, (bucket + 1) * batchSize).map(row => ({ path: `/politico/${row.id}` }));
  }

  if (workerData.mode === "news") {
    const year = workerData.year;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid news sitemap year");
    const store = platform();
    if (!store) return [];
    const rows = store.prepare(`SELECT day, payload FROM daily_news WHERE day >= ? AND day < ? AND day <= ? ORDER BY day`).all(`${year}-01-01`, `${year + 1}-01-01`, today());
    const entries = [];
    for (const row of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day)) continue;
      const timestamp = Date.parse(`${row.day}T12:00:00Z`);
      if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== row.day) continue;
      const articles = JSON.parse(row.payload);
      if (!Array.isArray(articles)) throw new Error("Invalid archived news edition");
      if (articles.length) entries.push({ path: `/news/${row.day}` });
      for (const article of articles) {
        if (!article || !/^p\d+(-[a-z0-9-]+)?$/.test(article.slug || "")) continue;
        const publishedAt = Date.parse(article.publishedAt);
        entries.push({ path: `/news/${row.day}/${article.slug}`, ...(Number.isFinite(publishedAt) ? { lastModified: new Date(publishedAt).toISOString() } : {}) });
      }
    }
    if (entries.length > 50000) throw new Error("News sitemap exceeds the protocol URL limit");
    return entries;
  }
  throw new Error("Unknown sitemap mode");
}

try {
  parentPort.postMessage(run());
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Unable to read sitemap data" });
} finally {
  for (const connection of connections) connection.close();
}
