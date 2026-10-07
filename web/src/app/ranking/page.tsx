import { Suspense } from "react";
import Link from "next/link";
import { runCachedDatabaseWorker } from "@/lib/database-worker";
import type { AssetsGrowthPage, AssetsRankingPage } from "@/lib/queries";
import { formatBRL } from "@/lib/format";
import { PageHeader } from "@/components/shell/shell-context";
import { YearSelect } from "@/components/ui/year-select";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchAvatar } from "@/components/search-avatar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const TIPOS = [
  { value: "bens", label: "bens declarados" },
  { value: "crescimento", label: "maior crescimento" },
] as const;
type Tipo = (typeof TIPOS)[number]["value"];

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const sp = await searchParams;

  const tipoParam = typeof sp.tipo === "string" ? sp.tipo : "";
  const tipo: Tipo = TIPOS.some((t) => t.value === tipoParam) ? (tipoParam as Tipo) : "bens";

  const anoParam = typeof sp.ano === "string" ? Number(sp.ano) : NaN;
  const year = Number.isInteger(anoParam) && anoParam >= 1900 && anoParam <= 2100 ? anoParam : undefined;

  const page = Math.max(1, Number(sp.page) || 1);

  const hrefFor = (params: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    if (params.tipo && params.tipo !== "bens") usp.set("tipo", params.tipo);
    if (params.ano) usp.set("ano", params.ano);
    if (params.page && params.page !== "1") usp.set("page", params.page);
    const qs = usp.toString();
    return `/ranking${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        group="Politica007"
        current="Ranking"
        actions={
          tipo === "bens" ? (
            <Suspense fallback={<span className="block h-8 w-36 animate-pulse rounded bg-[var(--hover)]" aria-hidden="true" />}>
              <RankingYearSelect year={year} />
            </Suspense>
          ) : undefined
        }
      />

      <section>
        <h1 className="text-[26px] leading-tight font-medium tracking-tight">
          Ranking de candidatos — {tipo === "bens" ? "bens declarados" : "maior crescimento patrimonial"}
        </h1>
        {tipo === "bens" ? (
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Quem declarou maior valor total de bens no registro de candidatura (TSE,{" "}
            <code>bem_candidato</code>) — soma direta dos valores declarados, sem nenhuma regra de
            detecção em cima. Em &ldquo;todos os anos&rdquo;, usa a declaração mais recente de cada
            pessoa (cada candidatura já declara o patrimônio completo, não um acréscimo — somar anos
            diferentes contaria o mesmo dinheiro mais de uma vez).{" "}
            <strong style={{ color: "var(--fg-2)" }}>Não é indício de nada por si só</strong> — mais
            bens pode ser só mais detalhamento na declaração, não mais patrimônio.
          </p>
        ) : (
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Diferença entre o patrimônio declarado na candidatura mais antiga e na mais recente de
            cada pessoa — só entra quem tem pelo menos duas declarações em anos diferentes.{" "}
            <strong style={{ color: "var(--fg-2)" }}>Não é indício de nada por si só</strong> — pode
            ser detalhamento diferente entre declarações, não crescimento real de patrimônio.
          </p>
        )}

        <Suspense fallback={<p className="mt-3 h-4" aria-hidden="true" />}>
          <RankingSources year={year} />
        </Suspense>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TIPOS.map((t) => (
            <Link
              key={t.value}
              href={hrefFor({ tipo: t.value })}
              className={`btn${tipo === t.value ? " btn--primary" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <Suspense fallback={<RankingResultsFallback />}>
          <RankingResults tipo={tipo} page={page} year={year} hrefFor={hrefFor} />
        </Suspense>
      </section>
    </div>
  );
}

async function RankingYearSelect({ year }: { year?: number }) {
  const { years } = await runCachedDatabaseWorker<{ years: number[] }>(
    "derived:asset-years:v1",
    "assets-ranking-worker.cjs",
    { mode: "years" },
    "local database asset year list snapshot",
  );
  return <YearSelect basePath="/ranking" years={years} value={year} allLabel="todos (declaração mais recente)" />;
}

async function RankingSources({ year }: { year?: number }) {
  const { years } = await runCachedDatabaseWorker<{ years: number[] }>(
    "derived:asset-years:v1",
    "assets-ranking-worker.cjs",
    { mode: "years" },
    "local database asset year list snapshot",
  );
  return <p className="mt-3 text-[10px] leading-relaxed text-[var(--muted-2)]">
    Fontes oficiais das declarações no TSE:{" "}
    {(year ? [year] : years).map((sourceYear, index) => (
      <span key={sourceYear}>
        {index ? ", " : ""}<a className="source-link source-link--inline" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-${sourceYear}`} target="_blank" rel="noopener noreferrer">{sourceYear}</a>
      </span>
    ))}
  </p>;
}

async function RankingResults({
  tipo, page, year, hrefFor,
}: {
  tipo: Tipo;
  page: number;
  year?: number;
  hrefFor: (params: Record<string, string | undefined>) => string;
}) {
  const data = await runCachedDatabaseWorker<AssetsRankingPage | AssetsGrowthPage>(
    `derived:assets-ranking:v1:${tipo}:${year ?? "all"}:${page}`,
    "assets-ranking-worker.cjs",
    { type: tipo, page, year, limit: PAGE_SIZE },
    "local database asset ranking snapshot",
    { lane: "bulk", priority: -10, staleWhileRevalidate: true },
  );
  return tipo === "bens"
    ? <BensTable page={page} year={year} hrefFor={hrefFor} rows={(data as AssetsRankingPage).rows} total={data.total} />
    : <CrescimentoTable page={page} hrefFor={hrefFor} rows={(data as AssetsGrowthPage).rows} total={data.total} />;
}

function RankingResultsFallback() {
  return <div className="table-wrap" aria-live="polite" aria-busy="true"><p className="p-6 text-sm text-[var(--muted)]">Carregando o ranking sem interromper a navegação…</p></div>;
}

function BensTable({
  page, year, hrefFor, rows, total,
}: { page: number; year?: number; hrefFor: (p: Record<string, string | undefined>) => string; rows: AssetsRankingPage["rows"]; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (rows.length === 0) {
    return <EmptyState icon="◌" title={`nenhum candidato com bens declarados${year ? ` em ${year}` : ""}.`} />;
  }

  return (
    <div className="table-wrap">
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>candidato</th>
              <th className="text-right">quantidade de bens</th>
              <th className="text-right" aria-sort="descending">valor total declarado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.personId}>
                <td className="num" style={{ color: "var(--muted-2)" }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <SearchAvatar photoUrl={r.photoUrl} name={r.name ?? "?"} />
                    <div>
                      <Link href={`/politico/${r.personId}`} className="hover:underline">
                        {r.name ?? "(sem nome)"}
                      </Link>
                      {r.office ? (
                        <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
                          {r.office}
                          {r.partyAbbr ? ` · ${r.partyAbbr}` : ""}
                          {r.state ? `/${r.state}` : ""}
                          {r.year ? ` · ${r.year}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="num">{r.assetCount.toLocaleString("pt-BR")}</td>
                <td className="num">{formatBRL(r.assetTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="table-footer">
          <PaginationLinks
            page={page}
            totalPages={totalPages}
            makeHref={(p) => hrefFor({ tipo: "bens", ano: year ? String(year) : undefined, page: String(p) })}
          />
        </div>
      ) : null}
    </div>
  );
}

function CrescimentoTable({
  page, hrefFor, rows, total,
}: { page: number; hrefFor: (p: Record<string, string | undefined>) => string; rows: AssetsGrowthPage["rows"]; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (rows.length === 0) {
    return <EmptyState icon="◌" title="nenhum candidato com pelo menos duas declarações de bens em anos diferentes." />;
  }

  return (
    <div className="table-wrap">
      <div className="overflow-x-auto">
        <table className="table min-w-[720px]">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>candidato</th>
              <th className="text-right">{"1ª declaração"}</th>
              <th className="text-right">{"última declaração"}</th>
              <th className="text-right" aria-sort="descending">crescimento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.personId}>
                <td className="num" style={{ color: "var(--muted-2)" }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <SearchAvatar photoUrl={r.photoUrl} name={r.name ?? "?"} />
                    <div>
                      <Link href={`/politico/${r.personId}`} className="hover:underline">
                        {r.name ?? "(sem nome)"}
                      </Link>
                      {r.office ? (
                        <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
                          {r.office}
                          {r.partyAbbr ? ` · ${r.partyAbbr}` : ""}
                          {r.state ? `/${r.state}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="num" style={{ color: "var(--muted)" }}>
                  {formatBRL(r.firstCents)}
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>{r.firstYear}</div>
                </td>
                <td className="num" style={{ color: "var(--muted)" }}>
                  {formatBRL(r.lastCents)}
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>{r.lastYear}</div>
                </td>
                <td className={`num ${r.growthCents >= 0 ? "text-elo-green" : "text-elo-red"}`}>
                  {r.growthCents >= 0 ? "+" : ""}{formatBRL(r.growthCents)}
                  {r.growthPct != null ? (
                    <div className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>
                      {r.growthPct >= 0 ? "+" : ""}{r.growthPct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="table-footer">
          <PaginationLinks
            page={page}
            totalPages={totalPages}
            makeHref={(p) => hrefFor({ tipo: "crescimento", page: String(p) })}
          />
        </div>
      ) : null}
    </div>
  );
}
