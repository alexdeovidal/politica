import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { safeCsvCell, sumCents } from "./comparison";
import { getStateBySlug } from "./registry";
import { assertDashboardSnapshot, assertEvidenceRecords } from "./validation";
import type { DashboardSnapshot, EvidencePage, EvidenceQuery, EvidenceRecord } from "./dashboard-model";

const ROOT = path.join(process.cwd(), "data", "state-accounts");
const cache = new Map<string, { snapshot: DashboardSnapshot; records?: EvidenceRecord[] }>();

export function getStateDashboard(slug: string): DashboardSnapshot {
  const state = getStateBySlug(slug);
  if (!state) throw new Error("Estado sem integração publicada");
  let entry = cache.get(state.slug);
  if (!entry) {
    // Resolve filesystem paths only from the registry, never from an unchecked URL.
    const snapshot: unknown = JSON.parse(readFileSync(path.join(ROOT, state.slug, "summary.json"), "utf8"));
    assertDashboardSnapshot(snapshot, state.uf);
    entry = { snapshot }; cache.set(state.slug, entry);
  }
  return entry.snapshot;
}

export function getStateRecords(slug: string): EvidenceRecord[] {
  const snapshot = getStateDashboard(slug);
  const entry = cache.get(slug)!;
  if (!entry.records) {
    const raw = gunzipSync(readFileSync(path.join(ROOT, slug, "records.json.gz")));
    const digest = createHash("sha256").update(raw).digest("hex");
    const audit = JSON.parse(readFileSync(path.join(ROOT, slug, "audit.json"), "utf8")) as { recordsSha256?: string };
    if (audit.recordsSha256 !== digest || !snapshot.version.endsWith(`-${digest.slice(0, 12)}`))
      throw new Error("Snapshot estadual inválido: registros e manifesto pertencem a versões diferentes");
    const records: unknown = JSON.parse(raw.toString("utf8"));
    assertEvidenceRecords(records, snapshot);
    entry.records = records;
  }
  return entry.records;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function queryStateRecords(slug: string, query: EvidenceQuery, all = false): EvidencePage {
  const snapshot = getStateDashboard(slug);
  const needle = normalize(query.q);
  const rows = getStateRecords(slug).filter(row => {
    if (row.ledger !== query.ledger || !row.date.startsWith(String(query.year)) || row.date < query.from || row.date > query.to) return false;
    if (query.agency && row.agencyId !== query.agency && row.agency !== query.agency) return false;
    if (query.category === "publicity" && !["institutional-publicity", "legal-publicity"].includes(row.category)) return false;
    if (query.category && query.category !== "all" && query.category !== "publicity" && row.category !== query.category) return false;
    return !needle || normalize(`${row.supplier ?? ""} ${row.supplierDocument ?? ""} ${row.vehicle ?? ""} ${row.campaign ?? ""} ${row.municipality ?? ""} ${row.description} ${row.commitment ?? ""} ${row.agency}`).includes(needle);
  }).sort((a, b) => b.date.localeCompare(a.date) || b.amountCents - a.amountCents || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(pages, Math.max(1, query.page));
  const selected = all ? rows : rows.slice((page - 1) * 25, page * 25);
  const sourceIds = new Set(selected.map(row => row.sourceId));
  return { rows: selected, total: rows.length, pages, page,
    amountCents: sumCents(rows.map(row => row.amountCents)),
    sources: snapshot.sources.filter(source => sourceIds.has(source.id)) };
}

export function evidenceCsv(result: EvidencePage): string {
  const sources = new Map(result.sources.map(source => [source.id, source]));
  const headers = ["id", "uf", "base", "orgao", "data_pagamento", "categoria", "etapa", "natureza", "valor_centavos", "valor_reais",
    "fornecedor", "cnpj", "veiculo", "campanha", "meio", "municipio", "empenho", "ordem_pagamento", "descricao",
    "bruto_nota_centavos", "liquido_nota_centavos", "fonte", "arquivo_fonte", "linha", "cobertura", "criterio"];
  return "\uFEFF" + [headers, ...result.rows.map(row => [row.id, row.uf, row.ledger, row.agency, row.date, row.category, row.stage,
    row.financialNature, row.amountCents, (row.amountCents / 100).toFixed(2), row.supplier, row.supplierDocument, row.vehicle,
    row.campaign, row.medium, row.municipality, row.commitment, row.paymentOrder, row.description, row.grossCents, row.netCents,
    sources.get(row.sourceId)?.url, sources.get(row.sourceId)?.downloadUrl, row.sourceRow, row.coverage, row.classificationRule])]
    .map(row => row.map(safeCsvCell).join(";")).join("\r\n") + "\r\n";
}
