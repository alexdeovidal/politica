import Database from "better-sqlite3";
import path from "node:path";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { analyzeTerms, parseTerm } from "./contract-amendment-rules.mjs";

const file = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(process.env.ELOSYS_DB_PATH ?? "../elosys.db"), "caldas-novas.db");
if (existsSync(file)) {
  const db = new Database(file, {timeout: 2500});
  try {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='contract'").get()) await sync(db);
  } finally { db.close(); }
}

async function sync(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS municipal_amendment (
      contract_id TEXT PRIMARY KEY, checked TEXT NOT NULL, severity TEXT NOT NULL, pending INTEGER NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS municipal_amendment_attempt (contract_id TEXT PRIMARY KEY, attempted TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS municipal_amendment_pause (id INTEGER PRIMARY KEY CHECK(id=1), until_ms INTEGER NOT NULL);
  `);
  if ((db.prepare("SELECT until_ms FROM municipal_amendment_pause WHERE id=1").get()?.until_ms ?? 0) > Date.now()) return;
  const recent = new Date(Date.now() - 12 * 3600_000).toISOString();
  const refresh = new Date(Date.now() - 7 * 86400_000).toISOString();
  const targets = db.prepare(`
    SELECT c.id,c.title FROM contract c LEFT JOIN municipal_amendment a ON a.contract_id=c.id
    LEFT JOIN municipal_amendment_attempt t ON t.contract_id=c.id
    WHERE c.initial=1 AND (a.checked IS NULL OR a.checked < ?) AND (t.attempted IS NULL OR t.attempted < ?)
    ORDER BY a.checked IS NOT NULL, t.attempted IS NOT NULL, c.amount_cents DESC, c.id LIMIT 12
  `).all(refresh, recent);
  const save = db.prepare(`
    INSERT INTO municipal_amendment VALUES (?,?,?,?,?)
    ON CONFLICT(contract_id) DO UPDATE SET checked=excluded.checked,severity=excluded.severity,pending=excluded.pending,payload=excluded.payload
    WHERE excluded.checked > municipal_amendment.checked
  `);
  const mark = db.prepare("INSERT OR REPLACE INTO municipal_amendment_attempt VALUES (?,?)");
  async function fetchPncp(url, emptyAllowed = false) {
    const r = await fetch(url, {signal: AbortSignal.timeout(12_000),headers: {Accept: "application/json"}});
    if (r.status === 429 || r.status === 503) {
      const header = r.headers.get("Retry-After") ?? "";
      const until = /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header) || 0;
      db.prepare("INSERT OR REPLACE INTO municipal_amendment_pause VALUES (1,?)").run(Math.max(until, Date.now() + 30 * 60_000));
      await r.body?.cancel();
      throw Object.assign(new Error(`PNCP HTTP ${r.status}`),{pause:true});
    }
    if (r.status === 204 && emptyAllowed) return [];
    if (!r.ok) throw new Error(`PNCP HTTP ${r.status}`);
    return r.json();
  }
  let saved = 0;
  for (const contract of targets) {
    const id = /^(\d{14})-2-(\d{1,12})\/(\d{4})$/.exec(contract.id);
    if (!id) continue;
    const [,cnpj,seq,year] = id;
    const endpoint = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/contratos/${year}/${Number(seq)}`;
    const observed = new Date().toISOString();
    try {
      const input = await fetchPncp(endpoint + "/termos", true);
      if (!Array.isArray(input) || input.length > 1000) throw new Error("Lista de termos inesperada");
      const terms = input.map(parseTerm).sort((a,b) => a.seq - b.seq);
      if (new Set(terms.map(t=>t.seq)).size !== terms.length) throw new Error("Sequência duplicada nos termos");
      let detail = {objetoContrato: contract.title,valorInicial: null};
      if (terms.length) {
        await sleep(1100);
        detail = await fetchPncp(endpoint);
        if (detail?.numeroControlePNCP !== contract.id) throw new Error("Detalhe retornou outro contrato");
      }
      const totals = analyzeTerms(detail, terms);
      save.run(contract.id, observed, totals.severity, totals.pending, JSON.stringify({
        ...totals, terms, checked: observed, source: endpoint + "/termos",
      }));
      mark.run(contract.id,observed);
      saved++;
    } catch (error) {
      if (error.pause) break;
      mark.run(contract.id,observed);
      console.warn(`[caldas-amendments] ${contract.id}: ${error.message}`);
    }
    await sleep(1500);
  }
  if (targets.length) console.log(`[caldas-amendments] ${saved} contratos consultados`);
}
