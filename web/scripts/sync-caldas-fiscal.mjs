import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const endpoint = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo";
const dbPath = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(process.env.ELOSYS_DB_PATH ?? "../elosys.db"), "caldas-novas.db");
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath, { timeout: 5000 });
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE IF NOT EXISTS fiscal_snapshot (year INTEGER PRIMARY KEY, period INTEGER NOT NULL, payload TEXT NOT NULL, checked TEXT NOT NULL)");
const get = db.prepare("SELECT period, checked FROM fiscal_snapshot WHERE year = ?");
const save = db.prepare(`INSERT INTO fiscal_snapshot VALUES (?, ?, ?, ?)
  ON CONFLICT(year) DO UPDATE SET period=excluded.period, payload=excluded.payload, checked=excluded.checked
  WHERE excluded.period >= fiscal_snapshot.period AND excluded.checked > fiscal_snapshot.checked`);
const functions = new Set([
  "Legislativa", "Judiciária", "Essencial à Justiça", "Administração", "Defesa Nacional",
  "Segurança Pública", "Relações Exteriores", "Assistência Social", "Previdência Social",
  "Saúde", "Trabalho", "Educação", "Cultura", "Direitos da Cidadania", "Urbanismo",
  "Habitação", "Saneamento", "Gestão Ambiental", "Ciência e Tecnologia", "Agricultura",
  "Organização Agrária", "Indústria", "Comércio e Serviços", "Comunicações", "Energia",
  "Transporte", "Desporto e Lazer", "Encargos Especiais", "Reserva de Contingência",
]);
const revenueColumn = "Até o Bimestre (c)";
const expensesCode = "DespesasExcetoIntraOrcamentarias";
const asCents = value => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;
function amount(rows, code, column) {
  const matches = rows.filter(row => row.rotulo === "Padrão" && row.cod_conta === code && row.coluna === column);
  if (matches.length > 1) throw new Error("Siconfi retornou conta fiscal duplicada");
  return asCents(matches[0]?.valor);
}

async function report(year, period, annex) {
  const query = new URLSearchParams({
    an_exercicio: String(year), nr_periodo: String(period),
    co_tipo_demonstrativo: "RREO", no_anexo: `RREO-Anexo ${annex}`, id_ente: "5204508",
  });
  const url = `${endpoint}?${query}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Siconfi HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.items) || data.hasMore || data.items.some(row =>
    Number(row.cod_ibge) !== 5204508 || Number(row.exercicio) !== year || Number(row.periodo) !== period ||
    row.anexo !== `RREO-Anexo ${annex}`)) throw new Error("Siconfi retornou demonstrativo incompleto ou inesperado");
  return { url, rows: data.items };
}

async function update(year, lastPeriod) {
  const previous = get.get(year);
  if (previous && Date.now() - Date.parse(previous.checked) < 6 * 3600_000) return;
  for (let period = lastPeriod; period >= (previous?.period ?? 1); period--) {
    const balance = await report(year, period, "01");
    if (balance.rows.length === 0) continue;
    const execution = await report(year, period, "02");
    if (execution.rows.length === 0) continue;
    const revenue = amount(balance.rows, "ReceitasExcetoIntraOrcamentarias", revenueColumn);
    const committed = amount(balance.rows, expensesCode, "DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)");
    const settled = amount(balance.rows, expensesCode, "DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)");
    const paid = amount(balance.rows, expensesCode, "DESPESAS PAGAS ATÉ O BIMESTRE (j)");
    if ([revenue, committed, settled, paid].some(value => value === null)) throw new Error("Balanço fiscal sem totais obrigatórios");
    const areas = execution.rows.filter(row =>
      row.rotulo === "Total das Despesas Exceto Intra-Orçamentárias" &&
      row.coluna === "DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)" && functions.has(row.conta)
    ).map(row => ({ name: row.conta, amount: asCents(row.valor) }));
    if (new Set(areas.map(x => x.name)).size !== areas.length || areas.some(x => x.amount === null) ||
        Math.abs(areas.reduce((sum, x) => sum + x.amount, 0) - settled) > 1) {
      throw new Error("Funções de despesa não conciliam com o total liquidado");
    }
    const origins = [
      ["Tributos municipais", "ReceitaTributaria"],
      ["Transferências correntes da União", "TransferenciasCorrentesDaUniaoEDeSuasEntidades"],
      ["Transferências correntes dos estados", "TransferenciasCorrentesDosEstadosEDoDistritoFederalEDeSuasEntidades"],
    ].map(([name, code]) => ({ name, amount: amount(balance.rows, code, revenueColumn) }));
    if (origins.every(x => x.amount !== null && x.amount >= 0)) {
      const other = revenue - origins.reduce((sum, x) => sum + x.amount, 0);
      if (other >= 0) origins.push({ name: "Demais receitas", amount: other });
    }
    const collected = new Date().toISOString();
    save.run(year, period, JSON.stringify({
      year, period, revenue, committed, settled, paid, origins,
      areas: areas.filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount),
      balanceUrl: balance.url, executionUrl: execution.url, collected,
    }), collected);
    console.log(`[caldas-fiscal] ${year}: ${period}º bimestre salvo`);
    return;
  }
}

try {
  const [year, month] = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()).split("-").map(Number);
  for (const [exercise, period] of [[year, Math.floor((month - 1) / 2)], [year - 1, 6]]) {
    if (exercise < 2025) continue;
    try { await update(exercise, period); }
    catch (error) { console.warn(`[caldas-fiscal] ${exercise}: ${error.message}`); process.exitCode = 1; }
  }
} finally {
  db.close();
}
