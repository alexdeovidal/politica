import { createHash } from "node:crypto";
import { Suspense } from "react";
import Link from "next/link";
import { runCachedDatabaseWorker } from "@/lib/database-worker";
import type { EarmarkPaymentRow } from "@/lib/queries";
import { formatBRL, formatCnpj } from "@/lib/format";
import { PageHeader } from "@/components/shell/shell-context";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchAvatar } from "@/components/search-avatar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
type EarmarkPage = { rows: EarmarkPaymentRow[]; total: number; types: string[]; page: number };

export default async function EmendasPage({ searchParams }: PageProps<"/emendas">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  const page = Math.min(10000, Math.max(1, Number(sp.page) || 1));
  const parsedYear = Number(sp.ano);
  const year = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100 ? parsedYear : undefined;
  const type = typeof sp.tipo === "string" ? sp.tipo.slice(0, 120) : "";
  const includePublic = sp.destino === "todos";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader group="Politica007" current="Emendas Parlamentares" />

      <section>
        <h1 className="text-[26px] leading-tight font-medium tracking-tight">
          Emendas parlamentares — autoria, valores e favorecidos
        </h1>
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Registros coletados do Portal da Transparência com favorecido pessoa jurídica. O filtro permite incluir órgãos públicos e intermediários bancários. Favorecido não significa necessariamente fornecedor contratado. O autor é identificado só
          por <strong style={{ color: "var(--fg-2)" }}>nome</strong>, não por CPF (a fonte não tem
          esse vínculo): é um cruzamento provável, não uma identidade confirmada.
        </p>

        <Suspense fallback={<EarmarkSummaryFallback />}>
          <EarmarkFilters q={q} year={year} type={type} includePublic={includePublic} page={page} />
        </Suspense>
        <a className="source-link" href="https://portaldatransparencia.gov.br/emendas" target="_blank" rel="noopener noreferrer">Fonte oficial · Portal da Transparência</a>
      </section>

      <Suspense fallback={<EarmarkResultsFallback />}>
        <EarmarkResults q={q} year={year} type={type} includePublic={includePublic} page={page} />
      </Suspense>
    </div>
  );
}

async function getEarmarkPage({ q, year, type, includePublic, page }: {
  q: string; year?: number; type: string; includePublic: boolean; page: number;
}) {
  const filters = { q, year, type, includePublic, page };
  const cacheId = createHash("sha256").update(JSON.stringify(filters)).digest("hex");
  return runCachedDatabaseWorker<EarmarkPage>(
    `derived:earmark-page:v1:${cacheId}`,
    "earmark-page-worker.cjs",
    filters,
    "local database earmark page snapshot",
    { lane: "bulk", priority: -10, staleWhileRevalidate: true },
  );
}

async function EarmarkFilters({ q, year, type, includePublic, page }: {
  q: string; year?: number; type: string; includePublic: boolean; page: number;
}) {
  const { types } = await runCachedDatabaseWorker<{ types: string[] }>(
    "derived:earmark-options:v1",
    "earmark-page-worker.cjs",
    { mode: "options" },
    "local database earmark filter options",
  );
  return <>
    <form className="mt-5 flex flex-wrap items-center gap-2" action="/emendas">
      <div className="input" style={{ width: 280 }}>
        <input name="q" defaultValue={q} placeholder="buscar autor ou empresa…" />
      </div>
      <label>Ano<input className="input" type="number" name="ano" defaultValue={year}/></label>
      <label>Tipo<select className="input" name="tipo" defaultValue={type}><option value="">Todos</option>{types.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Favorecidos<select className="input" name="destino" defaultValue={includePublic ? "todos" : "empresas"}><option value="empresas">Empresas · exclui órgãos e bancos intermediários</option><option value="todos">Todas as pessoas jurídicas</option></select></label>
      <button className="btn">Aplicar filtros</button>
    </form>
  </>;
}

async function EarmarkResults({ q, year, type, includePublic, page }: {
  q: string; year?: number; type: string; includePublic: boolean; page: number;
}) {
  const { rows, total } = await getEarmarkPage({ q, year, type, includePublic, page });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (nextPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextPage > 1) params.set("page", String(nextPage));
    if (year) params.set("ano", String(year));
    if (type) params.set("tipo", type);
    if (includePublic) params.set("destino", "todos");
    const query = params.toString();
    return `/emendas${query ? `?${query}` : ""}`;
  };

  return <>
    <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
      <span style={{ color: "var(--fg-1)" }}>{total.toLocaleString("pt-BR")}</span> registros de emendas e favorecidos
    </div>
    <section>
      {rows.length === 0 ? (
        <EmptyState icon="◌" title={q ? "nada para essa busca." : "nenhum registro de emenda encontrado."} />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="table min-w-[680px]">
              <thead><tr><th>autor da emenda</th><th>empresa</th><th className="text-right">valor</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.earmarkCode}-${r.companyCnpj}`}>
                    <td>
                      <div className="flex items-center gap-2">
                        {r.authorPersonId != null ? <SearchAvatar photoUrl={r.authorPhotoUrl} name={r.authorName ?? "?"} /> : null}
                        <div>
                          {r.authorPersonId != null ? <Link href={`/politico/${r.authorPersonId}`} className="hover:underline">{r.authorName ?? "autor não identificado"}</Link> : <span>{r.authorName ?? "autor não identificado"}</span>}
                          {r.year ? <div className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>{r.year}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[240px]">
                      <Link href={`/cnpj/${r.companyCnpj}`} className="hover:underline">{r.companyName ?? formatCnpj(r.companyCnpj)}</Link>
                      <div className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>{formatCnpj(r.companyCnpj)}</div>
                    </td>
                    <td className="num">{formatBRL(r.amountCents)}<div className="text-xs whitespace-normal">Valor recebido pelo favorecido</div>{r.sourceUrl && <a className="source-link" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Arquivo oficial</a>}<details className="text-xs whitespace-normal"><summary>Finalidade e execução</summary><p>{r.earmarkType || "Tipo não informado"} · {r.locality || "Localidade não informada"}</p><p>{r.purpose || "Finalidade não informada na coleta"}</p><p>Coleta: {r.collectedAt ? new Date(r.collectedAt).toLocaleString("pt-BR") : "Não informada"}</p></details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? <div className="table-footer"><PaginationLinks page={page} totalPages={totalPages} makeHref={hrefFor} /></div> : null}
        </div>
      )}
    </section>
  </>;
}

function EarmarkSummaryFallback() {
  return <div className="mt-6 h-24 rounded border border-[var(--border-1)]" aria-live="polite" aria-busy="true"><p className="p-4 text-sm text-[var(--muted)]">Carregando filtros sem interromper a navegação…</p></div>;
}

function EarmarkResultsFallback() {
  return <section className="table-wrap" aria-live="polite" aria-busy="true"><p className="p-6 text-sm text-[var(--muted)]">Buscando emendas em segundo plano…</p></section>;
}
