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
          Emendas parlamentares — destinos, autores e valores
        </h1>
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Pesquise pelo destino informado na emenda, cidade do favorecido, nome do autor ou favorecido. Confira as colunas para distinguir o local de aplicação da cidade cadastral de quem recebeu o pagamento. O favorecido pode não ser o destino final do recurso. Os dados vêm do Portal da Transparência, e a associação do autor ao perfil é feita pelo nome.
        </p>

        <Suspense fallback={<EarmarkSummaryFallback />}>
          <EarmarkFilters q={q} year={year} type={type} includePublic={includePublic} />
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
    `derived:earmark-page:v2:${cacheId}`,
    "earmark-page-worker.cjs",
    filters,
    "local database earmark page snapshot",
    { lane: "bulk", priority: -10, staleWhileRevalidate: true },
  );
}

async function EarmarkFilters({ q, year, type, includePublic }: {
  q: string; year?: number; type: string; includePublic: boolean;
}) {
  const { types } = await runCachedDatabaseWorker<{ types: string[] }>(
    "derived:earmark-options:v1",
    "earmark-page-worker.cjs",
    { mode: "options" },
    "local database earmark filter options",
  );
  return <>
    <form className="mt-5 flex flex-wrap items-end gap-3" action="/emendas">
      <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
        Destino, cidade do favorecido, autor ou nome do favorecido
        <input className="input" name="q" defaultValue={q} placeholder="Ex.: Caldas Novas" />
      </label>
      <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
        Ano da emenda<input className="input" type="number" name="ano" min="2014" max="2100" defaultValue={year} placeholder="Todos os anos" />
      </label>
      <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
        Tipo da emenda<select className="input" name="tipo" defaultValue={type}><option value="">Todos os tipos</option>{types.map((name) => <option key={name}>{name}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
        Favorecidos<select className="input" name="destino" defaultValue={includePublic ? "todos" : "empresas"}><option value="empresas">Empresas e entidades privadas</option><option value="todos">Incluir órgãos públicos e bancos</option></select>
      </label>
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
      <span style={{ color: "var(--fg-1)" }}>{total.toLocaleString("pt-BR")}</span> registros encontrados para os filtros
    </div>
    <section>
      {rows.length === 0 ? (
        <EmptyState icon="◌" title={q ? "nada para essa busca." : "nenhum registro de emenda encontrado."} />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="table min-w-[820px]">
              <thead><tr><th>autor da emenda</th><th>favorecido</th><th>local de aplicação (fonte)</th><th className="text-right">valor recebido</th></tr></thead>
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
                    <td className="max-w-[240px]">
                      <div>{formatDestinationMunicipalities(r.destinationMunicipalities)}</div>
                      {formatDestinationLocalities(r.destinationLocalities) ? <div className="text-xs whitespace-normal" style={{ color: "var(--muted)" }}>{formatDestinationLocalities(r.destinationLocalities)}</div> : null}
                      {r.beneficiaryLocation ? <div className="text-xs whitespace-normal" style={{ color: "var(--muted-2)" }}>Cidade do favorecido (cadastro): {r.beneficiaryLocation}</div> : null}
                    </td>
                    <td className="num">{formatBRL(r.amountCents)}
                      <details className="text-xs whitespace-normal"><summary>Detalhes da emenda</summary><p>{r.earmarkType || "Tipo não informado"} · {r.purpose || "Finalidade não informada"}</p><p>Coleta: {r.collectedAt ? new Date(r.collectedAt).toLocaleString("pt-BR") : "Não informada"}</p>{r.sourceUrl && <a className="source-link" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Arquivo oficial</a>}</details>
                    </td>
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

function normalizePlace(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

function formatDestinationMunicipalities(value: string | null | undefined) {
  if (!value) return "Município não informado";
  const multipleValues = new Set(["MULTIPLO", "MULTIPLOS", "VARIOS", "VARIOS MUNICIPIOS", "DIVERSOS"]);
  const notReportedValues = new Set(["", "SEM INFORMACAO", "NAO INFORMADO", "NAO INFORMADA"]);
  const locations = value.split(",").map((location) => {
    const [municipalityPart, ...stateParts] = location.split("/");
    const municipality = municipalityPart?.trim() ?? "";
    const state = stateParts.join("/").trim();
    const normalizedMunicipality = normalizePlace(municipality);
    if (multipleValues.has(normalizedMunicipality)) return "Vários municípios";
    if (notReportedValues.has(normalizedMunicipality)) return state ? `${state} (UF)` : "Município não informado";
    return state && normalizePlace(state) !== normalizedMunicipality ? `${municipality}/${state}` : municipality;
  });
  return [...new Set(locations)].join(" · ") || "Município não informado";
}

function formatDestinationLocalities(value: string | null | undefined) {
  if (!value) return "";
  const placeholders = new Set(["MULTIPLO", "MULTIPLOS", "VARIOS", "VARIOS MUNICIPIOS", "DIVERSOS", "SEM INFORMACAO"]);
  const localities = value.split(",").filter((locality) => !placeholders.has(normalizePlace(locality)));
  return [...new Set(localities)].join(" · ");
}

function EarmarkSummaryFallback() {
  return <div className="mt-6 h-24 rounded border border-[var(--border-1)]" aria-live="polite" aria-busy="true"><p className="p-4 text-sm text-[var(--muted)]">Carregando filtros sem interromper a navegação…</p></div>;
}

function EarmarkResultsFallback() {
  return <section className="table-wrap" aria-live="polite" aria-busy="true"><p className="p-6 text-sm text-[var(--muted)]">Buscando emendas em segundo plano…</p></section>;
}
