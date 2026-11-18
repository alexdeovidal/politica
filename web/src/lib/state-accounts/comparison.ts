import type {
  ComparisonContext, ComparisonOptions, ComparisonResult, ExpenseCategory,
  FinancialStage, RecordFilters, StateAccountRecord,
} from "./types";
import { getStateByUf } from "./registry";

export const stageLabels: Record<FinancialStage, string> = {
  paid: "Pago", settled: "Liquidado", committed: "Empenhado", contracted: "Contratado",
  budgeted: "Orçado", transferred: "Transferido", announced: "Anunciado",
};
export const categoryLabels: Record<ExpenseCategory, string> = {
  publicity: "Publicidade", "institutional-publicity": "Publicidade institucional", "legal-publicity": "Publicidade legal",
  "elective-surgeries": "Cirurgias eletivas", health: "Saúde", education: "Educação", sanitation: "Saneamento",
  security: "Segurança", transport: "Transporte", other: "Outras despesas",
};

/** Parses Brazilian-formatted reais exactly. Empty, ambiguous and rounded inputs are rejected. */
export function parseBRLCents(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    // Decimal strings remove binary floating point error without guessing extra decimals.
    const raw = String(input);
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return null;
    return parseDecimalCents(raw);
  }
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/^R\$\s*/, "").replace(/\u00a0/g, " ").trim();
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) return null;
  return parseDecimalCents(raw.replace(/\./g, "").replace(",", "."));
}

/** Parses a machine decimal in reais; never treats a dot as a thousands separator. */
export function parseDecimalCents(input: unknown): number | null {
  if (typeof input !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(input)) return null;
  const negative = input.startsWith("-");
  const [whole, fraction = ""] = input.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(negative ? -cents : cents);
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateFinancialRecord(row: StateAccountRecord): string[] {
  const errors: string[] = [];
  if (typeof row.uf !== "string" || getStateByUf(row.uf)?.uf !== row.uf) errors.push("UF desconhecida ou inválida.");
  if (!Number.isSafeInteger(row.amountCents)) errors.push("Valor monetário não é um inteiro seguro de centavos.");
  if (!isISODate(row.date) || !isISODate(row.periodStart) || !isISODate(row.periodEnd)) errors.push("Data financeira ou período inválido.");
  else if (row.periodStart > row.periodEnd || row.date < row.periodStart || row.date > row.periodEnd) errors.push("Data financeira fora do período declarado.");
  if (!Object.hasOwn(stageLabels, row.stage)) errors.push("Etapa financeira desconhecida.");
  if (!Object.hasOwn(categoryLabels, row.category)) errors.push("Categoria desconhecida.");
  if (!row.id?.trim() || !row.dedupKey?.trim() || !row.agencyId?.trim() || !row.sourceId?.trim() || !row.scope?.trim()) errors.push("Identidade, fonte, órgão ou universo contábil ausente.");
  if (row.coverage !== "complete" && row.coverage !== "partial") errors.push("Cobertura não declarada.");
  return errors;
}

const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Filters dates of financial events. Does not pretend to extend source coverage. */
export function filterRecords(rows: readonly StateAccountRecord[], filters: RecordFilters): StateAccountRecord[] {
  if ((filters.from && !isISODate(filters.from)) || (filters.to && !isISODate(filters.to)) ||
    (filters.from && filters.to && filters.from > filters.to)) return [];
  const query = filters.q?.trim() ? normalized(filters.q.trim()) : "";
  return rows.filter(row => (!filters.uf || row.uf === filters.uf) &&
    (!filters.agencyIds?.length || filters.agencyIds.includes(row.agencyId)) &&
    (!filters.categories?.length || filters.categories.includes(row.category)) &&
    (!filters.stages?.length || filters.stages.includes(row.stage)) &&
    (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to) &&
    (!query || normalized(`${row.description} ${row.supplier ?? ""} ${row.supplierDocument ?? ""} ${row.agencyId}`).includes(query)));
}

function identity(row: StateAccountRecord): string {
  return JSON.stringify([row.uf, row.agencyId, row.stage, row.dedupKey]);
}
function fingerprint(row: StateAccountRecord): string {
  return JSON.stringify([row.amountCents, row.date, row.category, row.scope, row.financialNature ?? "other",
    row.consolidationRole ?? "primary", row.parentRecordId ?? ""]);
}

export function deduplicateRecords(rows: readonly StateAccountRecord[]) {
  const records = new Map<string, StateAccountRecord>();
  const conflicts: string[] = [];
  let duplicateCount = 0;
  for (const row of rows) {
    const key = identity(row);
    const existing = records.get(key);
    if (!existing) { records.set(key, row); continue; }
    duplicateCount++;
    if (fingerprint(existing) !== fingerprint(row)) conflicts.push(`Documento ${row.dedupKey} possui versões financeiras divergentes.`);
    // A second copy can never promote known partial coverage to complete coverage.
    if (row.coverage === "partial" && existing.coverage === "complete") records.set(key, { ...existing, coverage: "partial" });
  }
  return { records: [...records.values()], duplicateCount, conflicts };
}

export function sumCents(values: readonly number[]): number {
  let total = BigInt(0);
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new RangeError("Valor monetário inválido: centavos inteiros são obrigatórios.");
    total += BigInt(value);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError("Total monetário excede a precisão segura.");
  return Number(total);
}

/** Excludes agency/vehicle detail and documentary references from consolidated money totals. */
export function aggregateRecords(rows: readonly StateAccountRecord[]) {
  const validated = rows.flatMap(row => validateFinancialRecord(row));
  if (validated.length) throw new Error(validated[0]);
  const { records, duplicateCount, conflicts } = deduplicateRecords(rows);
  if (conflicts.length) throw new Error(conflicts[0]);
  const included = records.filter(row => !row.consolidationRole || row.consolidationRole === "primary");
  return {
    amountCents: sumCents(included.map(row => row.amountCents)),
    count: included.length,
    coverage: included.some(row => row.coverage === "partial") ? "partial" as const : "complete" as const,
    records: included,
    duplicateCount,
    excludedCount: records.length - included.length,
  };
}

export function groupRecords(rows: readonly StateAccountRecord[], key: keyof StateAccountRecord | ((row: StateAccountRecord) => string)) {
  const buckets = new Map<string, StateAccountRecord[]>();
  for (const row of aggregateRecords(rows).records) {
    const label = typeof key === "function" ? key(row) : String(row[key] ?? "Não informado");
    const bucket = buckets.get(label) ?? [];
    bucket.push(row);
    buckets.set(label, bucket);
  }
  return [...buckets].map(([key, records]) => ({ key, ...aggregateRecords(records) }))
    .sort((a, b) => b.amountCents - a.amountCents || a.key.localeCompare(b.key, "pt-BR"));
}

function inferContext(rows: readonly StateAccountRecord[], declared: ComparisonContext | undefined, reasons: string[]): ComparisonContext | null {
  if (!rows.length) return null;
  const stages = new Set(rows.map(row => row.stage));
  const scopes = new Set(rows.map(row => row.scope));
  const ufs = new Set(rows.map(row => row.uf));
  if (stages.size !== 1 || scopes.size !== 1 || ufs.size !== 1) {
    reasons.push("Um recorte contém etapas, estados ou universos contábeis diferentes.");
    return null;
  }
  if (declared) {
    if (!isISODate(declared.periodStart) || !isISODate(declared.periodEnd) || declared.periodStart > declared.periodEnd ||
      rows.some(row => row.date < declared.periodStart || row.date > declared.periodEnd || row.stage !== declared.stage || row.scope !== declared.scope)) {
      reasons.push("O recorte declarado não corresponde às datas, à etapa ou ao universo dos registros.");
      return null;
    }
    // Declaring a wider window must not disguise data covering only part of it.
    const partial = declared.coverage === "partial" || rows.some(row => row.coverage === "partial" ||
      row.periodStart > declared.periodStart || row.periodEnd < declared.periodEnd);
    return { ...declared, coverage: partial ? "partial" : "complete" };
  }
  const periods = new Set(rows.map(row => `${row.periodStart}/${row.periodEnd}`));
  if (periods.size !== 1) {
    reasons.push("Há períodos de cobertura distintos; selecione uma janela comum explícita.");
    return null;
  }
  return { periodStart: rows[0].periodStart, periodEnd: rows[0].periodEnd, stage: rows[0].stage, scope: rows[0].scope,
    coverage: rows.some(row => row.coverage === "partial") ? "partial" : "complete" };
}

/** Partial means captured amounts in the same universe/window, never the complete state total. */
export function compareRecords(left: readonly StateAccountRecord[], right: readonly StateAccountRecord[], options: ComparisonOptions = {}): ComparisonResult {
  const base: ComparisonResult = { status: "missing", leftCents: null, rightCents: null, differenceCents: null, ratio: null,
    reasons: [], leftCount: 0, rightCount: 0, duplicateCount: 0, excludedCount: 0, leftContext: null, rightContext: null };
  let a: ReturnType<typeof aggregateRecords>, b: ReturnType<typeof aggregateRecords>;
  try { a = aggregateRecords(left); b = aggregateRecords(right); }
  catch (error) { return { ...base, status: "incompatible", reasons: [error instanceof Error ? error.message : "Registros financeiros inválidos."] }; }
  base.leftCents = a.count ? a.amountCents : null;
  base.rightCents = b.count ? b.amountCents : null;
  base.leftCount = a.count; base.rightCount = b.count;
  base.duplicateCount = a.duplicateCount + b.duplicateCount;
  base.excludedCount = a.excludedCount + b.excludedCount;
  if (!a.count || !b.count) return { ...base, reasons: ["Não há registros financeiros identificados para um dos recortes. Ausência de registro não significa gasto zero."] };
  const reasons: string[] = [];
  base.leftContext = inferContext(a.records, options.leftContext, reasons);
  base.rightContext = inferContext(b.records, options.rightContext, reasons);
  const leftContext = base.leftContext, rightContext = base.rightContext;
  if (leftContext && rightContext) {
    if (a.records[0].uf !== b.records[0].uf) reasons.push("Os recortes pertencem a estados diferentes.");
    if (leftContext.periodStart !== rightContext.periodStart || leftContext.periodEnd !== rightContext.periodEnd) reasons.push("Os períodos são diferentes. Compare a mesma janela temporal.");
    if (leftContext.stage !== rightContext.stage) reasons.push("As etapas financeiras são diferentes. Pago, contratado e anunciado não são a mesma medida.");
    if (leftContext.scope !== rightContext.scope) reasons.push("Os universos contábeis são diferentes. Desembolso estadual e despesa de empresa estatal precisam ser separados.");
  }
  const leftIds = new Set(a.records.map(identity));
  if (b.records.some(row => leftIds.has(identity(row)))) reasons.push("Os recortes compartilham o mesmo documento financeiro; as categorias não são independentes.");
  if (a.amountCents < 0 || b.amountCents <= 0) reasons.push("A razão exige total não negativo à esquerda e base positiva à direita; saldo zero ou estornos não permitem a divisão.");
  if (reasons.length || !leftContext || !rightContext) return { ...base, status: "incompatible", reasons: [...new Set(reasons)] };
  let differenceCents: number;
  try { differenceCents = sumCents([a.amountCents, -b.amountCents]); }
  catch { return { ...base, status: "incompatible", reasons: ["A diferença excede a precisão monetária segura."] }; }
  const partial = leftContext.coverage === "partial" || rightContext.coverage === "partial";
  return { ...base, status: partial ? "partial" : "comparable", differenceCents, ratio: a.amountCents / b.amountCents,
    reasons: partial ? ["Comparação dos valores identificados no recorte. A cobertura é parcial e não representa o total de gastos do Estado."] : [] };
}

/** Excel/LibreOffice must not execute text starting with a formula marker. */
export function safeCsvCell(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return '""';
    return String(value);
  }
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** BOM + semicolon separated data; financial stage and provenance survive every export. */
export function buildCsv(rows: readonly StateAccountRecord[], sources: readonly { id: string; url: string }[] = []): string {
  const urls = new Map(sources.map(source => [source.id, source.url]));
  const header = ["id", "uf", "orgao", "categoria", "etapa", "natureza", "valor_centavos", "data", "periodo_inicio", "periodo_fim",
    "fornecedor", "documento_fornecedor", "descricao", "fonte_id", "fonte_url", "linha_origem", "cobertura", "universo", "papel_consolidacao", "chave_documento"];
  const lines = rows.map(row => [row.id, row.uf, row.agencyId, row.category, row.stage, row.financialNature ?? "other", row.amountCents,
    row.date, row.periodStart, row.periodEnd, row.supplier, row.supplierDocument, row.description, row.sourceId, urls.get(row.sourceId),
    row.sourceRow, row.coverage, row.scope, row.consolidationRole ?? "primary", row.dedupKey]);
  return "\uFEFF" + [header, ...lines].map(line => line.map(safeCsvCell).join(";")).join("\r\n") + "\r\n";
}
