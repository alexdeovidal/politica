import type { Municipality } from "./municipal-registry";

export const directoryPath = "/contas-do-municipio";
export const directoryPageSize = 12;
const sortNames = new Intl.Collator("pt-BR", { sensitivity: "base" });
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

type Input = Record<string, string | string[] | undefined>;

export function directoryQuery(params: Input, states: readonly string[]) {
  const raw = (key: string) => typeof params[key] === "string" ? params[key].trim().slice(0, 80) : "";
  const uf = raw("uf").toUpperCase();
  const valid = states.includes(uf);
  const page = raw("pagina");
  return {
    uf: valid ? uf : "",
    q: valid ? raw("q") : "",
    includePending: valid && raw("cobertura") === "todas",
    page: valid && /^\d{1,6}$/.test(page) ? Math.max(1, Number(page)) : 1,
  };
}

export function municipalDirectory(cities: readonly Municipality[], published: ReadonlySet<string>, filters: ReturnType<typeof directoryQuery>) {
  const coverage = new Map<string, { uf: string; name: string; total: number; ready: number }>();
  for (const city of cities) {
    const state = coverage.get(city.uf) ?? { uf: city.uf, name: city.state, total: 0, ready: 0 };
    state.total++;
    if (published.has(city.code)) state.ready++;
    coverage.set(city.uf, state);
  }
  const states = Array.from(coverage.values()).sort((a, b) => sortNames.compare(a.name, b.name));
  const state = coverage.get(filters.uf);
  const tokens = normalize(filters.q).split(/\s+/).filter(Boolean);
  const matches = state ? cities.filter(city => {
    if (city.uf !== state.uf || (!filters.includePending && !published.has(city.code))) return false;
    const value = normalize(`${city.name} ${city.code}`);
    return tokens.every(token => value.includes(token));
  }).sort((a, b) => sortNames.compare(a.name, b.name) || a.code.localeCompare(b.code)) : [];
  const pages = Math.max(1, Math.ceil(matches.length / directoryPageSize));
  const page = Math.min(filters.page, pages);
  const start = (page - 1) * directoryPageSize;
  return { states, state, page, pages, first: matches.length ? start + 1 : 0,
    last: Math.min(start + directoryPageSize, matches.length), total: matches.length, rows: matches.slice(start, start + directoryPageSize) };
}

export function directoryHref(uf?: string, q = "", includePending = false, page = 1) {
  if (!uf) return directoryPath;
  const params = new URLSearchParams({ uf });
  if (q) params.set("q", q);
  if (includePending) params.set("cobertura", "todas");
  if (page > 1) params.set("pagina", String(page));
  return `${directoryPath}?${params}`;
}
