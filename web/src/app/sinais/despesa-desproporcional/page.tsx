import { Suspense } from "react";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { runDatabaseWorker } from "@/lib/database-worker";
import {getTseUpdateStatus} from "@/lib/tse-update-status";
import {
  getExpenseYears,
  EXPENSE_CATEGORIES,
  type ExpenseCategoryRow,
} from "@/lib/queries";
import { expenseCategoryLabel } from "@/lib/format";
import { PageHeader } from "@/components/shell/shell-context";
import { YearSelect } from "@/components/ui/year-select";
import { ExpenseCategorySelect } from "@/components/ui/expense-category-select";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryExpenseRow } from "@/components/category-expense-row";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const ALL = "TODAS";
type RankingSnapshot = { total: number; rows: ExpenseCategoryRow[] };
const rankingCache = new Map<string, RankingSnapshot>();
const rankingFlights = new Map<string, Promise<RankingSnapshot>>();

async function loadExpenseRanking(category: string | undefined, year: number | undefined, page: number) {
  const fingerprint = databaseFingerprint();
  const key = `${fingerprint}:${category ?? "*"}:${year ?? "*"}`;
  let snapshot = rankingCache.get(key);
  if (!snapshot) {
    let flight = rankingFlights.get(key);
    if (!flight) {
      flight = runDatabaseWorker<{ rows: ExpenseCategoryRow[] }>("social-data-worker.cjs", {
        databasePath: databasePath(), mode: "expense-ranking", category, year,
      }, { priority: -5, lane: "bulk" }).then(({ rows }) => ({ total: rows.length, rows }))
        .then((result) => {
          rankingCache.set(key, result);
          while (rankingCache.size > 24) rankingCache.delete(rankingCache.keys().next().value!);
          return result;
        }).finally(() => rankingFlights.delete(key));
      rankingFlights.set(key, flight);
    }
    snapshot = await flight;
  }
  return { total: snapshot.total, rows: snapshot.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

export default async function DespesaDesproporcionalPage({
  searchParams,
}: PageProps<"/sinais/despesa-desproporcional">) {
  if(getTseUpdateStatus().derivedRefreshPending)return <main><h1>Análises em atualização</h1><p>As bases oficiais foram alteradas. As análises financeiras estão sendo recalculadas para preservar a coerência das evidências. Consulte os registros originais enquanto o processamento termina.</p><a className="source-link" href="/fontes">Ver atualização e fontes</a></main>;
  const sp = await searchParams;
  const years = getExpenseYears();

  const categoryParam = typeof sp.categoria === "string" ? sp.categoria : undefined;
  const category =
    categoryParam != null && EXPENSE_CATEGORIES.includes(categoryParam) ? categoryParam : undefined;
  const categoryLabel = category ? expenseCategoryLabel(category).toLowerCase() : "itens baratos (todas as categorias)";

  const yearParam = typeof sp.ano === "string" ? sp.ano : undefined;
  const year =
    yearParam === ALL ? undefined
    : years.includes(Number(yearParam)) ? Number(yearParam)
    : years[0];
  const yearLabel = year != null ? String(year) : "todos os anos";

  const page = Math.max(1, Number(sp.page) || 1);

  const hrefFor = (p: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    if (p.categoria && p.categoria !== ALL) usp.set("categoria", p.categoria);
    if (p.ano) usp.set("ano", p.ano);
    if (p.page && p.page !== "1") usp.set("page", p.page);
    const s = usp.toString();
    return `/sinais/despesa-desproporcional${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        group="Sinais"
        current="Despesa desproporcional"
        actions={<YearSelect basePath="/sinais/despesa-desproporcional" years={years} value={year} allLabel="todos" />}
      />

      <section>
        <h1 className="text-[26px] leading-tight font-medium tracking-tight">
          Quem mais gastou em itens baratos, por categoria
        </h1>
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Compara o gasto de cada candidato em itens baratos (canetas, adesivos, crachás…) com a{" "}
          <strong style={{ color: "var(--fg-2)" }}>mediana histórica da categoria</strong> e com a média
          de pares de <strong style={{ color: "var(--fg-2)" }}>mesmo cargo e estado</strong>. Indício de
          desproporção, não fraude confirmada.
        </p>

        <div className="mt-5">
          <ExpenseCategorySelect
            basePath="/sinais/despesa-desproporcional"
            categories={EXPENSE_CATEGORIES}
            value={category}
          />
        </div>
      </section>

      <section>
        {years.length === 0 ? (
          <EmptyState icon="◌" title="nenhuma despesa de campanha coletada ainda" hint={<code>elosys tse-accounts --db elosys.db</code>} />
        ) : (
          <Suspense fallback={<RankingFallback />}>
            <RankingResults category={category} categoryLabel={categoryLabel} year={year} yearLabel={yearLabel} page={page} hrefFor={hrefFor} />
          </Suspense>
        )}
      </section>
    </div>
  );
}

async function RankingResults({
  category, categoryLabel, year, yearLabel, page, hrefFor,
}: {
  category?: string;
  categoryLabel: string;
  year?: number;
  yearLabel: string;
  page: number;
  hrefFor: (params: Record<string, string | undefined>) => string;
}) {
  let result: RankingSnapshot & { rows: ExpenseCategoryRow[] };
  try {
    result = await loadExpenseRanking(category, year, page);
  } catch (error) {
    console.error("Unable to load disproportionate expense ranking:", error);
    return <EmptyState icon="◌" title="não foi possível carregar o ranking agora" hint={<a className="source-link" href={hrefFor({ categoria: category ?? ALL, ano: year != null ? String(year) : ALL, page: String(page) })}>Tentar novamente</a>} />;
  }
  const { rows, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (rows.length === 0) return <EmptyState icon="◌" title={`ninguém gastou em ${categoryLabel} em ${yearLabel}.`} />;

  return (
    <div className="table-wrap">
      <div className="overflow-x-auto">
        <table className="table min-w-[820px]">
          <thead><tr><th>candidato</th><th>cargo/estado</th><th className="text-right">gasto</th><th className="text-right">% receita</th><th className="text-right">média dos pares</th></tr></thead>
          <tbody>{rows.map((r) => <CategoryExpenseRow key={r.personId} r={r} category={category} year={year} />)}</tbody>
        </table>
      </div>
      {totalPages > 1 ? <div className="table-footer"><PaginationLinks page={page} totalPages={totalPages} makeHref={(p) => hrefFor({ categoria: category ?? ALL, ano: year != null ? String(year) : ALL, page: String(p) })} /></div> : null}
    </div>
  );
}

function RankingFallback() {
  return <div className="table-wrap" aria-busy="true"><p className="p-5 text-sm text-[var(--muted)]">Preparando o ranking em segundo plano…</p></div>;
}
