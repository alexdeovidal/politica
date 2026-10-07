import { createHash } from "node:crypto";
import { Suspense } from "react";
import Link from "next/link";
import { runCachedDatabaseWorker } from "@/lib/database-worker";
import type { ExploreFilters as Filters } from "@/lib/platform/discovery";
import { PageHeader } from "@/components/shell/shell-context";

export const dynamic = "force-dynamic";

type ExploreOptions = { years: number[]; offices: string[]; states: string[] };
type ExploreResult = {
  rows: Array<{ personId: number; name: string; ballotName: string | null; year: number; office: string; state: string; municipality: string; party: string; result: string | null }>;
  total: number;
  page: number;
};

export default async function ExplorePage({ searchParams }: PageProps<"/explorar">) {
  const sp = await searchParams;
  const value = (key: string) => typeof sp[key] === "string" ? (sp[key] as string).slice(0, 120) : "";
  const yearValue = Number(value("ano"));
  const filters: Filters = {
    q: value("q"),
    year: Number.isInteger(yearValue) && yearValue >= 1900 && yearValue <= 2100 ? yearValue : undefined,
    state: value("uf"),
    office: value("cargo"),
    city: value("cidade"),
    page: Math.min(10000, Math.max(1, Number(value("page")) || 1)),
  };

  return <main className="platform-page">
    <PageHeader group="Consulta local" current="Minha cidade e candidaturas" />
    <h1>Conheça as candidaturas da sua região</h1>
    <p>Escolha eleição, estado, cargo e município. Para cargos estaduais ou nacionais, o registro de candidatura pode indicar a unidade eleitoral em vez de um município.</p>
    <Suspense fallback={<ExploreFiltersFallback />}>
      <ExploreFiltersPanel filters={filters} />
    </Suspense>
    <Suspense fallback={<ExploreResultsFallback />}>
      <ExploreResultsPanel filters={filters} />
    </Suspense>
  </main>;
}

async function ExploreFiltersPanel({ filters }: { filters: Filters }) {
  const options = await runCachedDatabaseWorker<ExploreOptions>(
    "derived:explore-options:v1",
    "explore-worker.cjs",
    { mode: "options" },
    "local database exploration filter snapshot",
  );
  return <form className="platform-form" action="/explorar">
    <label>Nome ou nome de urna<input name="q" defaultValue={filters.q} /></label>
    <label>Eleição<select name="ano" defaultValue={filters.year ? String(filters.year) : ""}><option value="">Todas</option>{options.years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
    <label>Estado<select name="uf" defaultValue={filters.state || ""}><option value="">Todos</option>{options.states.map(state => <option key={state} value={state}>{state}</option>)}</select></label>
    <label>Cargo<select name="cargo" defaultValue={filters.office || ""}><option value="">Todos</option>{options.offices.map(office => <option key={office} value={office}>{office}</option>)}</select></label>
    <label>Município ou unidade eleitoral<input name="cidade" defaultValue={filters.city} /></label>
    <button className="btn" type="submit">Explorar</button>
  </form>;
}

async function ExploreResultsPanel({ filters }: { filters: Filters }) {
  const cacheId = createHash("sha256").update(JSON.stringify(filters)).digest("hex");
  const result = await runCachedDatabaseWorker<ExploreResult>(
    `derived:explore-results:v1:${cacheId}`,
    "explore-worker.cjs",
    { mode: "results", ...filters },
    "local database exploration results snapshot",
  );
  const paramsForPage = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.year) params.set("ano", String(filters.year));
    if (filters.state) params.set("uf", filters.state);
    if (filters.office) params.set("cargo", filters.office);
    if (filters.city) params.set("cidade", filters.city);
    params.set("page", String(page));
    return `/explorar?${params}`;
  };

  return <>
    <p>{result.total.toLocaleString("pt-BR")} pessoas encontradas · página {result.page}</p>
    <div className="platform-grid">{result.rows.map(row => <article className="card" key={row.personId}>
      <Link className="link-primary font-medium" href={`/politico/${row.personId}?ano=${row.year}`}>{row.ballotName || row.name}</Link>
      <p>{row.name}</p><p>{row.office} · {row.party}/{row.state} · {row.year}</p>
      <p>{row.municipality} · {row.result || "Resultado não informado"}</p>
      <Link href={`/comparar?ids=${row.personId}&ano=${row.year}`} className="btn">Adicionar à comparação</Link>
      <a className="source-link" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-${row.year}`} target="_blank" rel="noopener noreferrer">Fonte oficial TSE</a>
    </article>)}</div>
    {result.page > 1 && <Link className="btn" href={paramsForPage(result.page - 1)}>Página anterior</Link>}
    {result.page * 24 < result.total && <Link className="btn" href={paramsForPage(result.page + 1)}>Próxima página</Link>}
    {!result.total && <p>Nenhuma candidatura encontrada com esses filtros.</p>}
  </>;
}

function ExploreFiltersFallback() {
  return <div className="card" aria-live="polite" aria-busy="true"><p className="text-sm text-[var(--muted)]">Preparando filtros da consulta…</p></div>;
}

function ExploreResultsFallback() {
  return <section className="card" aria-live="polite" aria-busy="true"><p className="text-sm text-[var(--muted)]">Buscando candidaturas em segundo plano…</p></section>;
}
