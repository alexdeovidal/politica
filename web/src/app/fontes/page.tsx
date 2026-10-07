import Link from "next/link";
import { auditStatus } from "@/lib/platform/audit-status";
import { platformStore } from "@/lib/platform/store";
import { coverage } from "@/lib/platform/discovery";
import { getTseUpdateStatus } from "@/lib/tse-update-status";
import { TseUpdateStatus } from "@/components/tse-update-status";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { PageHeader } from "@/components/shell/shell-context";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
type SearchParams = Record<string, string | string[] | undefined>;
type SyncRun = { source: string; status: string; checkedAt: string; changedAt: string | null };
type CoverageRow = { name: string; agency: string; sourceUrl: string; collectedAt: string | null; collections: number };

function requestedPage(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function rangeLabel(total: number, page: number) {
  if (!total) return "Nenhum resultado";
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  return `Exibindo ${first.toLocaleString("pt-BR")}–${last.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const audit = auditStatus();
  const store = platformStore();
  const runsTotal = (store.prepare("SELECT count(*) AS total FROM sync_run").get() as { total: number }).total;
  const runsPages = Math.max(1, Math.ceil(runsTotal / PAGE_SIZE));
  const runsPage = Math.min(requestedPage(query.execucoes), runsPages);
  const runs = store.prepare(`SELECT source,status,checked_at AS checkedAt,changed_at AS changedAt
    FROM sync_run ORDER BY id DESC LIMIT ? OFFSET ?`).all(PAGE_SIZE, (runsPage - 1) * PAGE_SIZE) as SyncRun[];

  const allCoverageRows = coverage();
  const coverageTotal = allCoverageRows.length;
  const coveragePages = Math.max(1, Math.ceil(coverageTotal / PAGE_SIZE));
  const coveragePage = Math.min(requestedPage(query.cobertura), coveragePages);
  const coverageRows = allCoverageRows.slice((coveragePage - 1) * PAGE_SIZE, coveragePage * PAGE_SIZE);

  const status = getTseUpdateStatus({
    sourcesPage: requestedPage(query.fontes),
    historyPage: requestedPage(query.historico),
  });
  const currentPages = {
    execucoes: runsPage,
    fontes: status.sourcesPage,
    historico: status.historyPage,
    cobertura: coveragePage,
  };
  const hrefFor = (key: keyof typeof currentPages, page: number) => {
    const params = new URLSearchParams();
    const nextPages = { ...currentPages, [key]: page };
    for (const [name, value] of Object.entries(nextPages)) {
      if (value > 1) params.set(name, String(value));
    }
    const search = params.toString();
    return `/fontes${search ? `?${search}` : ""}`;
  };

  return (
    <main className="platform-page">
      <PageHeader group="Transparência" current="Fontes e cobertura" />
      <h1>Fontes, atualização e cobertura</h1>
      <TseUpdateStatus status={status} />
      <p>A data de coleta de uma fonte não significa que todos os seus registros foram alterados nessa data. Cada informação exibe a coleta correspondente. Ausência de registro não equivale à ausência de atividade.</p>

      <section>
        <h2>Conferência dos registros coletados</h2>
        {audit ? <>
          <p>Última conferência: {new Date(audit.checkedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília). Verifica metadados de origem, documentos de campanha, totais por eleição e valores inválidos de votação na base coletada. Não certifica cada linha dos arquivos originais nem informações ainda não coletadas.</p>
          <p>Referências de arquivo inconsistentes: {audit.flags.fileReferences} · documentos de campanha divergentes: {audit.flags.campaignDocuments} · votos negativos: {audit.flags.negativeVotes}. {audit.flags.duplicateDocuments > 0 ? "Há documentos presentes em mais de um registro de pessoa; vínculos exigem conferência de identidade." : "Não foram encontrados documentos completos duplicados nessa conferência."}</p>
        </> : <p>A conferência automática ainda não possui resultado publicado neste ambiente.</p>}
        <a className="source-link" href="https://dadosabertos.tse.jus.br/">Catálogo oficial do TSE para conferir os conjuntos</a>
      </section>

      <section>
        <h2>Integrações complementares</h2>
        <p>Câmara e Senado: consulta sob demanda, cache por até quatro horas. PNCP: janela recente e preenchimento gradual do histórico. Propostas: documentos publicados pelo TSE. Os horários abaixo mostram execuções reais dos coletores.</p>
        {runs.length ? <>
          {runs.map((run, index) => <article className="platform-source-row" key={`${run.source}-${run.checkedAt}-${index}`}>
            <h3>{run.source}</h3>
            <p>{run.status === "success" ? "Verificação concluída" : run.status === "partial" ? "Coleta em andamento · continuará na próxima execução" : "Falha na consulta"} · {new Date(run.checkedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
            {run.changedAt ? <p>Registros integrados: {new Date(run.changedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p> : null}
          </article>)}
          {runsPages > 1 ? <div className="table-footer">
            <p className="text-sm text-[var(--muted)]">{rangeLabel(runsTotal, runsPage)} consultas de integração</p>
            <PaginationLinks page={runsPage} totalPages={runsPages} ariaLabel="Paginação das consultas de integração" prefetch={false} makeHref={page => hrefFor("execucoes", page)} />
          </div> : null}
        </> : <p>Nenhuma execução complementar registrada ainda.</p>}
      </section>

      <section>
        <h2>Verificação por conjunto monitorado</h2>
        <p>{rangeLabel(status.sourcesTotal, status.sourcesPage)} fontes monitoradas.</p>
        {status.sources?.map(source => <article className="platform-source-row" key={source.name}>
          <h3>{source.name.replace(/_/g, " ")}</h3>
          <p>Estado: {({ updated: "Atualizado", unchanged: "Sem mudança", pending: "Alteração detectada · integração pendente", failed: "Falha na consulta" } as Record<string, string>)[source.status] || source.status} · verificado: {source.checkedAt ? new Date(source.checkedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "não informado"}</p>
          <p>Integrado em: {source.syncedAt ? new Date(source.syncedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "não informado"}</p>
          <a className="source-link" href={source.url}>Arquivo oficial monitorado</a>
        </article>)}
        <PaginationLinks page={status.sourcesPage} totalPages={status.sourcesPages} ariaLabel="Paginação das fontes monitoradas" prefetch={false} makeHref={page => hrefFor("fontes", page)} />
      </section>

      <section>
        <h2>Histórico recente de verificações</h2>
        <p>{rangeLabel(status.historyTotal, status.historyPage)} verificações.</p>
        {status.history?.length ? status.history.map((item, index) => <p key={`${item.source}-${item.checked_at}-${index}`}>
          {item.source} · {item.status} · {new Date(item.checked_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>) : <p>Nenhuma verificação registrada ainda.</p>}
        <PaginationLinks page={status.historyPage} totalPages={status.historyPages} ariaLabel="Paginação do histórico de verificações" prefetch={false} makeHref={page => hrefFor("historico", page)} />
      </section>

      <section>
        <h2>Cobertura por fonte</h2>
        <p>{rangeLabel(coverageTotal, coveragePage)} fontes.</p>
        <div className="platform-grid">
          {coverageRows.map(row => <article className="card" key={row.name}>
            <h2>{row.name}</h2>
            <p>{row.agency}</p>
            <p>Última coleta: {row.collectedAt ? new Date(row.collectedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Ainda não coletada"} (Brasília)</p>
            <p>{row.collections.toLocaleString("pt-BR")} arquivos/coletas registrados</p>
            <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">Consultar a fonte</a>
          </article>)}
        </div>
        <PaginationLinks page={coveragePage} totalPages={coveragePages} ariaLabel="Paginação da cobertura por fonte" prefetch={false} makeHref={page => hrefFor("cobertura", page)} />
      </section>
    </main>
  );
}
