import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { STATES } from "./registry";
import type { BrazilianUf } from "./types";

type Source = { url: string; sha256: string; months: number[] };
type Month = { month: string; quantity: number; approvedCents: number; rows: number };
type Snapshot = { schemaVersion: number; group: string; collectedAt: string; sources: Record<string, Source>;
  byUf: Record<BrazilianUf, Month[]> };
let cache: Snapshot | undefined;
function getSnapshot() {
  if (cache) return cache;
  const data = JSON.parse(readFileSync(path.join(process.cwd(), "data/state-accounts/national-sih.json"), "utf8")) as Snapshot;
  const fail = () => { throw new Error("Snapshot nacional do SIH/SUS inválido"); };
  if (data.schemaVersion !== 1 || data.group !== "04" || !Number.isFinite(Date.parse(data.collectedAt))) fail();
  for (const [year, source] of Object.entries(data.sources)) {
    const url = new URL(source.url);
    if (!/^\d{4}$/.test(year) || url.origin !== "https://dadosabertos.saude.gov.br"
      || !url.pathname.startsWith("/dataset/sih_producao_hospitalar/resource/")
      || !/^[a-f0-9]{64}$/.test(source.sha256) || !source.months.length
      || source.months.some(n => !Number.isInteger(n) || n < 1 || n > 12)
      || new Set(source.months).size !== source.months.length) fail();
  }
  if (Object.keys(data.byUf).length !== STATES.length) fail();
  for (const state of STATES) {
    const months = data.byUf[state.uf];
    if (!Array.isArray(months) || !months.length || new Set(months.map(r => r.month)).size !== months.length) fail();
    for (const row of months) {
      if (!/^\d{4}-\d{2}$/.test(row.month) || !data.sources[row.month.slice(0, 4)]?.months.includes(Number(row.month.slice(-2)))
        || ![row.quantity, row.approvedCents, row.rows].every(Number.isSafeInteger) || row.quantity < 0 || row.rows < 1) fail();
    }
  }
  cache = data;
  return data;
}
export function getSihProduction(uf: BrazilianUf) {
  const { group, collectedAt, sources, byUf } = getSnapshot();
  return { group, collectedAt, sources, months: byUf[uf] };
}
export type SihProduction = ReturnType<typeof getSihProduction>;
