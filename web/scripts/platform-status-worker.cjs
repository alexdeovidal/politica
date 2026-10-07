const { parentPort, workerData } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const { existsSync, statSync } = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const database = new Database(workerData.databasePath, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");
database.function("normalize_public_name", { deterministic: true }, normalizeName);
const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
const platformDatabasePath = workerData.platformDatabasePath;
const platformDatabase = platformDatabasePath && existsSync(platformDatabasePath)
  ? new Database(platformDatabasePath, { readonly: true, fileMustExist: true })
  : null;
const platformTables = new Set(platformDatabase
  ? platformDatabase.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name)
  : []);

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

function hasTable(name) { return tables.has(name); }
function hasPlatformTable(name) { return platformTables.has(name); }

function updateRows(databaseHandle, digest, sql, args) {
  for (const row of databaseHandle.prepare(sql).iterate(...args)) digest.update(JSON.stringify(row));
}

function databaseSignature() {
  return [workerData.databasePath, `${workerData.databasePath}-wal`].map(filename => {
    try {
      const file = statSync(filename);
      return [file.dev, file.ino, file.size, file.mtimeMs, file.ctimeMs].join(":");
    } catch {
      return "missing";
    }
  }).join("|");
}

function fingerprint(input) {
  let url;
  try { url = new URL(input, "https://politica007.com.br"); } catch { return null; }
  if (url.origin !== "https://politica007.com.br") return null;

  const person = /^\/politico\/(\d+)$/.exec(url.pathname);
  const company = /^\/cnpj\/(\d{14})$/.exec(url.pathname);
  const digest = createHash("sha256");

  if (person) {
    const id = Number(person[1]);
    const selectedYear = Number(url.searchParams.get("ano")) || 0;
    if (!Number.isSafeInteger(id)) return null;
    const queries = [
      "SELECT canonical_name,cpf FROM people WHERE id=?",
      "SELECT year,round,office,party_abbr,state,municipality,candidacy_status,result FROM politician_history WHERE person_id=? ORDER BY year,round,tse_candidacy_id",
      "SELECT d.year,d.tse_receipt_id,d.donor_cpf_cnpj,d.amount_cents FROM campaign_donation d JOIN campaign_org co ON co.id=d.campaign_org_id WHERE co.person_id=? ORDER BY d.year,d.tse_receipt_id",
      "SELECT e.year,e.tse_expense_id,e.supplier_cpf_cnpj,e.amount_cents FROM campaign_expense e JOIN campaign_org co ON co.id=e.campaign_org_id WHERE co.person_id=? ORDER BY e.year,e.tse_expense_id",
      "SELECT year,asset_type,description,value_cents FROM declared_assets WHERE person_id=? ORDER BY year,asset_type,description,value_cents",
    ];
    for (let sql of queries) {
      let args = [id];
      if (selectedYear && !sql.startsWith("SELECT canonical_name")) {
        const field = sql.includes("campaign_donation") ? "d.year"
          : sql.includes("campaign_expense") ? "e.year" : "year";
        sql = sql.replace(" ORDER BY", ` AND ${field}=? ORDER BY`);
        args = [id, selectedYear];
      }
      updateRows(database, digest, sql, args);
    }

    for (const table of ["electoral_case_candidate", "election_vote_section"]) {
      if (!hasTable(table)) continue;
      const sql = table === "electoral_case_candidate"
        ? "SELECT c.case_number,c.closed_at,c.last_decision_at,c.last_decision_type,cc.pole FROM electoral_case_candidate cc JOIN electoral_case c ON c.id=cc.case_id WHERE cc.person_id=? ORDER BY c.case_number,cc.pole"
        : "SELECT h.year,v.round,v.state,v.municipality_code,v.zone_number,v.section_number,v.votes FROM election_vote_section v JOIN politician_history h ON h.id=v.history_id WHERE h.person_id=? ORDER BY h.year,v.round,v.state,v.municipality_code,v.zone_number,v.section_number";
      updateRows(database, digest, sql, [id]);
    }

    if (platformDatabase && hasPlatformTable("external_record")) {
      updateRows(platformDatabase, digest,
        "SELECT id,title,event_date,json_extract(payload,'$.sha256') AS documentHash,json_extract(payload,'$.textComplete') AS textComplete FROM external_record WHERE entity_key=? AND source='TSE propostas' ORDER BY id",
        [String(id)]);
    }
    if (hasTable("company_partner")) {
      updateRows(database, digest,
        "SELECT cp.partner_name,cp.partner_doc_masked,cp.role,cp.entry_date FROM company_partner cp JOIN people p ON p.canonical_name=normalize_public_name(cp.partner_name) WHERE p.id=? ORDER BY cp.cnpj,cp.partner_name,cp.entry_date",
        [id]);
    }
  } else if (company) {
    const cnpj = company[1];
    updateRows(database, digest, "SELECT legal_name,kind FROM companies WHERE cnpj=?", [cnpj]);
    if (hasTable("company_registry")) {
      updateRows(database, digest,
        "SELECT legal_name,trade_name,opened_at,registry_status,registry_status_date,legal_nature,primary_cnae,share_capital_cents,size,city,state FROM company_registry WHERE cnpj=?",
        [cnpj]);
    }
    updateRows(database, digest,
      "SELECT year,tse_receipt_id,amount_cents,cnpj FROM campaign_donation WHERE donor_cpf_cnpj=? ORDER BY year,tse_receipt_id,cnpj", [cnpj]);
    if (hasTable("company_partner")) {
      updateRows(database, digest,
        "SELECT partner_name,partner_doc_masked,role,entry_date FROM company_partner WHERE cnpj=? ORDER BY partner_name,entry_date", [cnpj]);
    }
    updateRows(database, digest,
      "SELECT year,tse_expense_id,amount_cents,cnpj FROM campaign_expense WHERE supplier_cpf_cnpj=? ORDER BY year,tse_expense_id,cnpj", [cnpj]);
    if (platformDatabase && hasPlatformTable("external_record")) {
      updateRows(platformDatabase, digest,
        "SELECT id,title,event_date,json_extract(payload,'$.valorGlobal') AS value FROM external_record WHERE entity_key=? AND source='PNCP' ORDER BY id",
        [cnpj]);
    }
  } else if (url.pathname === "/comparar") {
    const ids = (url.searchParams.get("ids") || "").split(",")
      .map(Number).filter(value => Number.isSafeInteger(value) && value > 0).slice(0, 4);
    if (!ids.length) return null;
    const year = url.searchParams.get("ano") || "";
    for (const id of ids) {
      const item = fingerprint(`/politico/${id}?ano=${year}`);
      if (item) digest.update(item.fingerprint);
    }
    digest.update(year);
  } else if (url.pathname === "/explorar") {
    // The previous implementation streamed and JSON-serialized the full election
    // history for every saved regional search. A database-file signature detects
    // updates without blocking the web process or walking millions of rows.
    digest.update(JSON.stringify([url.pathname, url.search, workerData.databaseVersion || databaseSignature()]));
  } else {
    return null;
  }

  return { fingerprint: digest.digest("hex"), checkedAt: new Date().toISOString() };
}

try {
  const items = workerData.paths.map(input => {
    const value = fingerprint(input);
    return { path: input, fingerprint: value?.fingerprint ?? null, checkedAt: value?.checkedAt ?? null };
  });
  parentPort.postMessage({ items });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Followed-page worker failed" });
} finally {
  platformDatabase?.close();
  database.close();
}
