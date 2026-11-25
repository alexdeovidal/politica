import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isISODate, sumCents } from "./comparison";
import { getStateBySlug, hasFiscalCoverage } from "./registry";
import type { FiscalSnapshot } from "./dashboard-model";

export const fiscalMeasures = ["committedCents", "settledCents", "updatedBudgetCents"] as const;
type Measure = typeof fiscalMeasures[number];
type FiscalReport = FiscalSnapshot & {
  uf: string;
  ibgeCode: number;
  reconciliation: Record<Measure, { sumOfFunctions: number; balanceTotal: number; differenceCents: number;
    functionReportTotal: number; functionReportSourceRow: number; breakdownDifferenceCents: number }>;
};
export type NationalFiscal = { schemaVersion: 1; uf: string; name: string; collectedAt: string; snapshots: FiscalReport[] };
const cache = new Map<string, NationalFiscal>();

export function getNationalFiscal(slug: string): NationalFiscal | null {
  const state = getStateBySlug(slug, false);
  if (!state || !hasFiscalCoverage(state.slug)) return null;
  const old = cache.get(slug);
  if (old) return old;
  const data = JSON.parse(readFileSync(path.join(process.cwd(), "data/state-accounts", state.slug, "fiscal.json"), "utf8")) as NationalFiscal;
  const assert: (condition: unknown) => asserts condition = condition => {
    if (!condition) throw new Error("Snapshot fiscal inválido para " + state.uf);
  };
  assert(data.schemaVersion === 1 && data.uf === state.uf && data.name === state.name
    && Number.isFinite(Date.parse(data.collectedAt)) && Array.isArray(data.snapshots) && data.snapshots.length > 0);
  const years = new Set<number>();
  for (const report of data.snapshots) {
    assert(report.uf === state.uf && report.ibgeCode === state.ibgeCode && Number.isInteger(report.year)
      && report.year >= 2000 && Number.isInteger(report.period) && report.period >= 1 && report.period <= 6
      && !years.has(report.year) && isISODate(report.periodStart) && isISODate(report.periodEnd)
      && report.periodStart === report.year + "-01-01"
      && report.periodEnd === new Date(Date.UTC(report.year, report.period * 2, 0)).toISOString().slice(0, 10)
      && report.periodEnd <= data.collectedAt.slice(0, 10));
    years.add(report.year);
    for (const [source, annex] of [[report.balanceSource, "01"], [report.functionSource, "02"]] as const) {
      const url = new URL(source.url);
      assert(url.origin === "https://apidatalake.tesouro.gov.br" && url.pathname === "/ords/siconfi/tt/rreo"
        && url.searchParams.get("id_ente") === String(state.ibgeCode) && url.searchParams.get("an_exercicio") === String(report.year)
        && url.searchParams.get("nr_periodo") === String(report.period) && url.searchParams.get("no_anexo") === "RREO-Anexo " + annex
        && typeof source.sha256 === "string" && /^[a-f0-9]{64}$/.test(source.sha256));
    }
    assert([...fiscalMeasures, "paidCents" as const, "revenueCents" as const]
      .every(key => Number.isSafeInteger(report.totals[key])));
    assert(Array.isArray(report.functions) && report.functions.length > 0
      && new Set(report.functions.map(row => row.code)).size === report.functions.length);
    assert(report.functions.every(row => /^\d{2}$/.test(row.code) && row.paidCents === null && row.name
      && fiscalMeasures.every(key => row[key] === null || Number.isSafeInteger(row[key]))));
    for (const key of fiscalMeasures) {
      const line = report.reconciliation[key];
      assert(Number.isSafeInteger(line.functionReportTotal) && Number.isSafeInteger(line.functionReportSourceRow)
        && line.functionReportSourceRow > 0 && line.balanceTotal === report.totals[key]
        && line.sumOfFunctions === sumCents(report.functions.flatMap(row => row[key] === null ? [] : [row[key]]))
        && line.differenceCents === line.sumOfFunctions - line.balanceTotal
        && line.breakdownDifferenceCents === line.sumOfFunctions - line.functionReportTotal);
    }
  }
  cache.set(slug, data);
  return data;
}
