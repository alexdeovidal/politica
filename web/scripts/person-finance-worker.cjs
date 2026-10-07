const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

try {
  const personId = Number(workerData.personId);
  const year = Number.isInteger(workerData.year) && workerData.year > 0 ? workerData.year : null;
  if (!Number.isSafeInteger(personId) || personId < 1) throw new Error("Invalid person id");

  const yearClause = year !== null ? " AND t.year = ?" : "";
  const yearArgs = year !== null ? [year] : [];
  const aggregate = sql => database.prepare(sql).get(personId, ...yearArgs);

  const donations = aggregate(
    `SELECT count(*) AS n, coalesce(sum(t.amount_cents), 0) AS total
     FROM campaign_donation t JOIN campaign_org co ON co.id = t.campaign_org_id
     WHERE co.person_id = ?${yearClause}`,
  );
  const expenses = aggregate(
    `SELECT count(*) AS n, coalesce(sum(t.amount_cents), 0) AS total
     FROM campaign_expense t JOIN campaign_org co ON co.id = t.campaign_org_id
     WHERE co.person_id = ?${yearClause}`,
  );
  const electoralFund = aggregate(
    `SELECT count(*) AS n, coalesce(sum(t.amount_cents), 0) AS total
     FROM campaign_donation t JOIN campaign_org co ON co.id = t.campaign_org_id
     WHERE co.person_id = ? AND t.source IN ('FUNDO ESPECIAL', 'FUNDO PARTIDARIO')${yearClause}`,
  );
  const payments = database.prepare(
    `SELECT count(*) AS n, coalesce(sum(p.amount_cents), 0) AS total
     FROM campaign_expense_payment p
     JOIN campaign_expense ce ON ce.id = p.campaign_expense_id
     JOIN campaign_org co ON co.id = ce.campaign_org_id
     WHERE co.person_id = ?${year !== null ? " AND ce.year = ?" : ""}`,
  ).get(personId, ...yearArgs);

  const suppliers = database.prepare(
    `SELECT t.supplier_cpf_cnpj AS doc, max(t.supplier_name) AS name,
            coalesce(sum(t.amount_cents), 0) AS cents
     FROM campaign_expense t JOIN campaign_org co ON co.id = t.campaign_org_id
     WHERE co.person_id = ?${yearClause}
     GROUP BY t.supplier_cpf_cnpj
     ORDER BY cents DESC
     LIMIT 5`,
  ).all(personId, ...yearArgs);
  const donationOrigins = database.prepare(
    `SELECT coalesce(t.source, 'Origem não informada') AS name,
            coalesce(sum(t.amount_cents), 0) AS cents
     FROM campaign_donation t JOIN campaign_org co ON co.id = t.campaign_org_id
     WHERE co.person_id = ?${yearClause}
     GROUP BY t.source
     ORDER BY cents DESC`,
  ).all(personId, ...yearArgs);
  const expenseYears = database.prepare(
    `SELECT t.year, coalesce(sum(t.amount_cents), 0) AS cents, count(*) AS n
     FROM campaign_expense t JOIN campaign_org co ON co.id = t.campaign_org_id
     WHERE co.person_id = ?
     GROUP BY t.year
     ORDER BY t.year`,
  ).all(personId);

  parentPort.postMessage({
    donationsCount: donations.n,
    donationsTotalCents: donations.total,
    expensesCount: expenses.n,
    expensesTotalCents: expenses.total,
    paymentsTotalCents: payments.total,
    paymentsCount: payments.n,
    electoralFundTotalCents: electoralFund.total,
    electoralFundCount: electoralFund.n,
    suppliers,
    donationOrigins,
    expenseYears,
  });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Failed to calculate candidate finances" });
} finally {
  database.close();
}
