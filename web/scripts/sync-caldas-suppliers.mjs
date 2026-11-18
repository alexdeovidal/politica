import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const file = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(process.env.ELOSYS_DB_PATH ?? "../elosys.db"), "caldas-novas.db");
const source = "https://brasilapi.com.br/api/cnpj/v1/";
const clean = value => typeof value === "string" ? value.trim() || null : null;
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && value !== "0000-00-00" ? value : null;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function supplierSnapshot(payload, cnpj) {
  if (payload.cnpj !== cnpj || !clean(payload.razao_social) || !Array.isArray(payload.qsa) || payload.qsa.some(row => !clean(row?.nome_socio))) {
    throw new Error("Registro cadastral incompleto ou inesperado");
  }
  const partners = payload.qsa.map(row => {
    const document = clean(row.cnpj_cpf_do_socio) ?? "";
    const corporate = /^\d{14}$/.test(document) ? document : null;
    return {
      key: hash([clean(row.nome_socio), corporate ?? (/^\*{3}\d{6}\*{2}$/.test(document) ? document : null)]),
      name: clean(row.nome_socio), role: clean(row.qualificacao_socio), entry: date(row.data_entrada_sociedade), corporate,
    };
  }).sort((a, b) => a.key.localeCompare(b.key) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    name: clean(payload.razao_social), tradeName: clean(payload.nome_fantasia),
    status: clean(payload.descricao_situacao_cadastral), statusDate: date(payload.data_situacao_cadastral),
    nature: clean(payload.natureza_juridica), city: clean(payload.municipio), state: clean(payload.uf),
    capital: Number.isSafeInteger(Math.round(payload.capital_social * 100)) && payload.capital_social != null
      ? Math.round(payload.capital_social * 100) : null,
    partners,
  };
}

export function saveSnapshot(db, cnpj, snapshot, observed) {
  const digest = hash(snapshot);
  db.transaction(() => {
    const latest = db.prepare("SELECT digest, observed FROM supplier_snapshot WHERE cnpj=? ORDER BY id DESC LIMIT 1").get(cnpj);
    if (latest && latest.observed >= observed) return;
    if (latest?.digest !== digest) {
      db.prepare("INSERT INTO supplier_snapshot(cnpj, observed, digest, payload) VALUES (?,?,?,?)")
        .run(cnpj, observed, digest, JSON.stringify(snapshot));
    }
    db.prepare(`INSERT INTO supplier_check VALUES (?,?,?)
      ON CONFLICT(cnpj) DO UPDATE SET attempted=excluded.attempted, successful=excluded.successful
      WHERE excluded.attempted >= supplier_check.attempted`).run(cnpj, observed, observed);
  })();
}

export function supplierSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_snapshot (
      id INTEGER PRIMARY KEY, cnpj TEXT NOT NULL, observed TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS supplier_snapshot_latest ON supplier_snapshot(cnpj, id DESC);
    CREATE TABLE IF NOT EXISTS supplier_check (cnpj TEXT PRIMARY KEY, attempted TEXT NOT NULL, successful TEXT);
    CREATE TABLE IF NOT EXISTS supplier_pause (id INTEGER PRIMARY KEY CHECK(id=1), until_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS supplier_kinship (
      contract_id TEXT NOT NULL, cnpj TEXT NOT NULL, partner TEXT NOT NULL, official TEXT NOT NULL,
      office TEXT NOT NULL, relationship TEXT NOT NULL, source_url TEXT NOT NULL,
      document_date TEXT NOT NULL, evidence TEXT NOT NULL,
      PRIMARY KEY(contract_id, partner, official, relationship, source_url)
    );
  `);
}

async function sync() {
  if (!existsSync(file)) return;
  const db = new Database(file, {timeout: 2000});
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='contract'").get()) return;
    supplierSchema(db);
    db.exec("CREATE INDEX IF NOT EXISTS contract_supplier_date ON contract(supplier_cnpj, published DESC, id DESC)");
    if ((db.prepare("SELECT until_ms FROM supplier_pause WHERE id=1").get()?.until_ms ?? 0) > Date.now()) return;
    const now = new Date();
    const retry = new Date(now.getTime() - 12 * 3600_000).toISOString();
    const refresh = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const list = db.prepare(`
      SELECT c.supplier_cnpj AS cnpj
      FROM contract c LEFT JOIN supplier_check s ON s.cnpj=c.supplier_cnpj
      WHERE c.supplier_cnpj IS NOT NULL AND (s.attempted IS NULL OR s.attempted < ?)
        AND (s.successful IS NULL OR s.successful < ?)
      GROUP BY c.supplier_cnpj
      ORDER BY min(s.successful) IS NOT NULL, min(s.attempted) IS NOT NULL, sum(max(coalesce(c.amount_cents,0),0)) DESC
      LIMIT 12`).all(retry, refresh);
    let saved = 0;
    for (const { cnpj } of list) {
      if (!/^\d{14}$/.test(cnpj)) continue;
      const observed = new Date().toISOString();
      try {
        const response = await fetch(source + cnpj, {
          signal: AbortSignal.timeout(12_000),
          headers: { Accept: "application/json", "User-Agent": "Politica007/1.0 (+https://politica007.com.br)" },
        });
        if (response.status === 429 || response.status === 503) {
          const header = response.headers.get("Retry-After") ?? "";
          const requested = /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header) || 0;
          db.prepare("INSERT OR REPLACE INTO supplier_pause VALUES (1, ?)").run(Math.max(requested, Date.now() + 30 * 60_000));
          await response.body?.cancel();
          break;
        }
        if (!response.ok) throw new Error(`BrasilAPI HTTP ${response.status}`);
        saveSnapshot(db, cnpj, supplierSnapshot(await response.json(), cnpj), observed);
        saved++;
      } catch (error) {
        db.prepare(`INSERT INTO supplier_check VALUES (?,?,NULL)
          ON CONFLICT(cnpj) DO UPDATE SET attempted=excluded.attempted WHERE excluded.attempted >= supplier_check.attempted`).run(cnpj, observed);
        console.warn(`[caldas-suppliers] ${cnpj}: ${error.message}`);
      }
      await sleep(1700);
    }
    if (list.length) console.log(`[caldas-suppliers] ${saved} cadastros validados`);
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await sync();
