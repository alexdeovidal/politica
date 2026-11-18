import { categoryLabels, isISODate, validateFinancialRecord } from "./comparison";
import type { DashboardSnapshot, EvidenceRecord, LedgerId } from "./dashboard-model";
import type { BrazilianUf } from "./types";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Snapshot estadual inválido: ${message}`);
}
function sourceUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

/** Fail closed when a state's manifest or accounting metadata does not match its route. */
export function assertDashboardSnapshot(value: unknown, uf: BrazilianUf): asserts value is DashboardSnapshot {
  requireValue(object(value), "manifesto ausente");
  requireValue(value.schemaVersion === 1 && value.uf === uf, "versão de esquema ou UF divergente");
  requireValue(typeof value.name === "string" && value.name.trim(), "nome ausente");
  requireValue(typeof value.collectedAt === "string" && Number.isFinite(Date.parse(value.collectedAt)), "data de coleta inválida");
  requireValue(typeof value.version === "string" && /-[a-f0-9]{12}$/.test(value.version), "versão sem identidade dos registros");
  requireValue(Array.isArray(value.years) && value.years.length > 0 && value.years.every(year => Number.isInteger(year) && year >= 1900 && year <= 9999)
    && new Set(value.years).size === value.years.length, "anos inválidos");
  const years = value.years as number[];
  requireValue(object(value.windows), "cobertura temporal ausente");
  for (const year of years) {
    const window = value.windows[String(year)];
    requireValue(object(window) && typeof window.start === "string" && typeof window.end === "string"
      && isISODate(window.start) && isISODate(window.end) && window.start <= window.end
      && window.start.startsWith(`${year}-`) && window.end.startsWith(`${year}-`), "janela temporal inválida");
    requireValue(Array.isArray(window.months) && window.months.length > 0 && new Set(window.months).size === window.months.length
      && window.months.every(month => typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
        && month >= (window.start as string).slice(0, 7) && month <= (window.end as string).slice(0, 7)), "meses de cobertura inválidos");
  }
  requireValue(Array.isArray(value.sources) && value.sources.length > 0, "fontes ausentes");
  const ids = new Set<string>();
  for (const source of value.sources) {
    requireValue(object(source) && typeof source.id === "string" && source.id.length > 0 && !ids.has(source.id), "fonte duplicada ou sem identidade");
    requireValue(sourceUrl(source.url) && (!source.downloadUrl || sourceUrl(source.downloadUrl)), "URL de fonte inválida");
    requireValue(!source.sha256 || (typeof source.sha256 === "string" && /^[a-f0-9]{64}$/.test(source.sha256)), "hash de fonte inválido");
    ids.add(source.id);
  }
  const validMonth = (month: unknown) => typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && years.includes(Number(month.slice(0, 4)));
  for (const key of ["monthly", "companyMonthly"] as const) {
    requireValue(Array.isArray(value[key]), "agregados mensais ausentes");
    for (const cell of value[key]) requireValue(object(cell) && validMonth(cell.month) && Number.isSafeInteger(cell.amountCents)
      && Number.isSafeInteger(cell.count) && (cell.count as number) >= 0 && typeof cell.agencyId === "string"
      && typeof cell.category === "string" && Object.hasOwn(categoryLabels, cell.category), "agregado financeiro inválido");
  }
  requireValue(Array.isArray(value.invoiceMonthly), "agregados documentais ausentes");
  for (const cell of value.invoiceMonthly) requireValue(object(cell) && validMonth(cell.month)
    && [cell.grossCents, cell.netCents, cell.count, cell.invalidNetCount].every(Number.isSafeInteger), "agregado de notas inválido");
  requireValue(object(value.surgery) && Array.isArray(value.surgery.monthly), "indicadores cirúrgicos ausentes");
  // A health source can include historical production before the financial comparison years.
  for (const cell of value.surgery.monthly) requireValue(object(cell) && typeof cell.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(cell.month)
    && Number.isSafeInteger(cell.procedures) && (cell.procedures as number) >= 0, "quantidade de procedimentos inválida");
  requireValue(Array.isArray(value.fiscal) && Array.isArray(value.coverage), "cobertura fiscal ausente");
}

/** Validate document identity and provenance before exposing or summing a published ledger. */
export function assertEvidenceRecords(value: unknown, snapshot: DashboardSnapshot): asserts value is EvidenceRecord[] {
  requireValue(Array.isArray(value), "registros ausentes");
  const sourceIds = new Set(snapshot.sources.map(source => source.id));
  const ids = new Set<string>(), documents = new Set<string>(), officialPayments = new Set<string>();
  const scopes: Record<LedgerId, string> = { treasury: "state-disbursement", invoices: "paid-invoice-face-value", companies: "state-company", pce: "pce-transfer-detail" };
  for (const raw of value) {
    requireValue(object(raw), "linha inválida");
    const row = raw as EvidenceRecord;
    requireValue(validateFinancialRecord(row).length === 0 && row.uf === snapshot.uf && row.stage === "paid", "identidade ou valor financeiro inválido");
    requireValue(Object.hasOwn(scopes, row.ledger) && row.scope === scopes[row.ledger], "universo contábil inválido");
    requireValue(row.ledger === "invoices" || row.ledger === "pce" ? row.consolidationRole === "reference"
      : !row.consolidationRole || row.consolidationRole === "primary", "papel de consolidação inválido");
    requireValue(sourceIds.has(row.sourceId) && String(row.sourceRow ?? "").length > 0, "proveniência desconhecida");
    requireValue(snapshot.years.includes(Number(row.date.slice(0, 4))) && row.date <= snapshot.collectedAt.slice(0, 10), "data fora da versão publicada");
    requireValue(!ids.has(row.id), "identidade de registro duplicada"); ids.add(row.id);
    const key = JSON.stringify([row.ledger, row.uf, row.agencyId, row.stage, row.dedupKey]);
    requireValue(!documents.has(key), "documento financeiro duplicado"); documents.add(key);
    if (row.ledger === "treasury" && row.commitment && row.paymentOrder) {
      const op = JSON.stringify([row.agencyId, row.commitment, row.paymentOrder]);
      requireValue(!officialPayments.has(op), "ordem de pagamento repetida ou divergente"); officialPayments.add(op);
    }
    for (const field of ["grossCents", "netCents", "commissionCents"] as const)
      requireValue(row[field] == null || Number.isSafeInteger(row[field]), "valor documental fora da precisão segura");
  }
}
