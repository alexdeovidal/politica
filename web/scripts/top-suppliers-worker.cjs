const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });

try {
  const year = Number.isInteger(workerData.year) ? workerData.year : null;
  const rows = database.prepare(`
    SELECT
      supplier_cpf_cnpj AS cnpj,
      max(coalesce(supplier_name_rfb, supplier_name)) AS name,
      sum(amount_cents) AS totalCents,
      count(*) AS paymentCount,
      count(DISTINCT tse_candidacy_id) AS candidacyCount
    FROM campaign_expense
    WHERE supplier_company_id IS NOT NULL
      ${year !== null ? "AND year = ?" : ""}
    GROUP BY supplier_cpf_cnpj
    ORDER BY totalCents DESC
    LIMIT 10
  `).all(...(year !== null ? [year] : []));

  parentPort.postMessage({
    suppliers: rows.map(row => ({
      cnpj: row.cnpj,
      name: row.name || "(nome não disponível)",
      totalCents: row.totalCents,
      paymentCount: row.paymentCount,
      candidacyCount: row.candidacyCount,
    })),
  });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Failed to calculate supplier ranking" });
} finally {
  database.close();
}
