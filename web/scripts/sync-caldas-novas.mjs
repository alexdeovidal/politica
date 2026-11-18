import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const orgs = ["01787506000155", "00675468000186", "10796854000180"];
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const clock = Date.now();
const checked = new Date(clock).toISOString();
const dbPath = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(process.env.ELOSYS_DB_PATH ?? "../elosys.db"), "caldas-novas.db");
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath, { timeout: 5000 });
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS contract (
    id TEXT PRIMARY KEY, org TEXT NOT NULL, unit TEXT, supplier TEXT, supplier_cnpj TEXT,
    title TEXT NOT NULL, kind TEXT, initial INTEGER NOT NULL, amount_cents INTEGER,
    signed TEXT, published TEXT NOT NULL, process TEXT, number TEXT, tender TEXT,
    official_url TEXT NOT NULL, collected TEXT NOT NULL, search_text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS contract_date ON contract(published DESC, id DESC);
  CREATE INDEX IF NOT EXISTS contract_org_date ON contract(org, published DESC);
  CREATE TABLE IF NOT EXISTS sync_window (
    org TEXT NOT NULL, month TEXT NOT NULL, checked TEXT NOT NULL, PRIMARY KEY(org, month)
  );
`);

const normalize = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const clean = value => typeof value === "string" ? value.trim() || null : null;
const date = value => /^\d{4}-\d{2}-\d{2}/.test(value ?? "") ? value.slice(0, 10) : null;
const control = /^(\d{14})-2-(\d+)\/(\d{4})$/;

function transform(row, org) {
  const id = clean(row.numeroControlePNCP);
  const match = id?.match(control);
  if (!match || match[1] !== org || row.orgaoEntidade?.cnpj !== org) {
    throw new Error("Identificador de contrato inesperado no PNCP");
  }
  const published = date(row.dataPublicacaoPncp);
  if (!published) throw new Error("Contrato sem data de publicação");
  const title = clean(row.objetoContrato) ?? "Objeto não informado";
  const supplier = row.tipoPessoa === "PF" ? null : clean(row.nomeRazaoSocialFornecedor);
  const document = typeof row.niFornecedor === "string" ? row.niFornecedor.replace(/\D/g, "") : "";
  const supplierCnpj = /^\d{14}$/.test(document) && row.tipoPessoa !== "PF" ? document : null;
  const unit = clean(row.unidadeOrgao?.nomeUnidade);
  const process = clean(row.processo);
  const number = clean(row.numeroContratoEmpenho);
  const tender = clean(row.numeroControlePNCPCompra);
  const amount = Number.isFinite(row.valorGlobal) ? Math.round(row.valorGlobal * 100) : null;
  return [
    id, org, unit, supplier, supplierCnpj, title, clean(row.tipoContrato?.nome),
    normalize(row.tipoContrato?.nome ?? "").startsWith("contrato (termo inicial)") ? 1 : 0,
    Number.isSafeInteger(amount) ? amount : null, date(row.dataAssinatura), published, process, number, tender,
    `https://pncp.gov.br/app/contratos/${org}/${match[3]}/${Number(match[2])}`, checked,
    normalize([title, supplier, supplierCnpj, unit, process, number, id].filter(Boolean).join(" ")),
  ];
}

const put = db.prepare(`INSERT OR REPLACE INTO contract VALUES (${Array(17).fill("?").join(",")})`);
const status = db.prepare("SELECT checked FROM sync_window WHERE org = ? AND month = ?");
const save = db.transaction((org, month, rows) => {
  if ((status.get(org, month)?.checked ?? "") >= checked) return;
  db.prepare("DELETE FROM contract WHERE org = ? AND published >= ? AND published < ?")
    .run(org, month, nextMonth(month));
  for (const row of rows) put.run(...row);
  db.prepare("INSERT OR REPLACE INTO sync_window VALUES (?, ?, ?)").run(org, month, checked);
});

function nextMonth(month) {
  const date = new Date(month + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

async function collect(org, start, end) {
  const rows = [];
  for (let page = 1; page <= 30; page++) {
    const query = new URLSearchParams({
      cnpjOrgao: org, dataInicial: start.replaceAll("-", ""), dataFinal: end.replaceAll("-", ""),
      pagina: String(page), tamanhoPagina: "100",
    });
    const response = await fetch("https://pncp.gov.br/api/consulta/v1/contratos?" + query, {
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 204 && page === 1) return rows;
    if (!response.ok) throw new Error(`PNCP HTTP ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result.data) || !Number.isInteger(result.totalPaginas)) {
      throw new Error("Resposta inesperada do PNCP");
    }
    for (const record of result.data) {
      const row = transform(record, org);
      const published = date(record.dataPublicacaoPncp);
      if (!published || published < start || published > end) throw new Error("Data fora do período solicitado");
      rows.push(row);
    }
    if (page >= result.totalPaginas) return rows;
    await pause(400);
  }
  throw new Error("Limite de páginas excedido");
}

try {
  const months = [];
  for (let month = "2025-01-01"; month <= today; month = nextMonth(month)) months.unshift(month);
  let failed = 0, synced = 0;
  for (const [index, month] of months.entries()) {
    const lastDay = new Date(Date.parse(nextMonth(month)) - 86400000).toISOString().slice(0, 10);
    const end = lastDay < today ? lastDay : today;
    const refreshHours = index < 2 ? 5 : 24 * 7;
    for (const org of orgs) {
      const previous = status.get(org, month);
      if (previous && clock - Date.parse(previous.checked) < refreshHours * 3600000) continue;
      try {
        save(org, month, await collect(org, month, end));
        synced++;
      } catch (error) {
        failed++;
        console.warn(`[caldas-novas] ${org} ${month}: ${error.message}`);
      }
      await pause(400);
    }
  }
  console.log(`[caldas-novas] períodos atualizados: ${synced}; falhas: ${failed}`);
  if (failed) process.exitCode = 1;
} finally {
  db.close();
}
