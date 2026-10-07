const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });

try {
  const requestedYear = Number.isInteger(workerData.year) ? workerData.year : null;
  const candidacyYears = database.prepare("SELECT DISTINCT year FROM politician_history ORDER BY year DESC").all().map(row => row.year);
  const expenseYears = database.prepare("SELECT DISTINCT year FROM campaign_expense ORDER BY year DESC").all().map(row => row.year);
  const year = requestedYear !== null && expenseYears.includes(requestedYear) ? requestedYear : null;
  const yearFilter = year !== null ? " WHERE year = ?" : "";
  const args = year !== null ? [year] : [];
  const count = sql => database.prepare(sql).get(...args).n;
  const sum = sql => database.prepare(sql).get(...args).n || 0;
  const bounds = database.prepare("SELECT min(year) AS lo, max(year) AS hi FROM politician_history").get();

  parentPort.postMessage({
    selectedYear: year,
    candidacyYears,
    expenseYears,
    stats: {
      people: year !== null
        ? count("SELECT count(DISTINCT person_id) AS n FROM politician_history WHERE year = ?")
        : count("SELECT count(*) AS n FROM people"),
      candidacies: count(`SELECT count(*) AS n FROM politician_history${yearFilter}`),
      campaignOrgs: count(`SELECT count(*) AS n FROM campaign_org${yearFilter}`),
      socialMedia: count(`SELECT count(*) AS n FROM social_media${yearFilter}`),
      donationsTotalCents: sum(`SELECT coalesce(sum(amount_cents), 0) AS n FROM campaign_donation${yearFilter}`),
      expensesTotalCents: sum(`SELECT coalesce(sum(amount_cents), 0) AS n FROM campaign_expense${yearFilter}`),
      years: year !== null ? String(year) : bounds.lo && bounds.hi ? `${bounds.lo}–${bounds.hi}` : "—",
    },
  });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Failed to calculate home summary" });
} finally {
  database.close();
}
