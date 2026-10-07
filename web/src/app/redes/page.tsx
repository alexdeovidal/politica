import Link from "next/link";
import { Suspense } from "react";
import { databasePath } from "@/lib/db";
import { runDatabaseWorker } from "@/lib/database-worker";
import { PageHeader } from "@/components/shell/shell-context";
import { PaginationLinks } from "@/components/ui/pagination-links";

export const dynamic = "force-dynamic";

type PublicPost = {
  id: number;
  text: string;
  kind: string;
  postedAt: string | null;
  collectedAt: string;
  url: string | null;
  replyTo: string | null;
  handle: string;
  personId: number | null;
  name: string | null;
};
type PublicPostsResult = { total: number; page: number; rows: PublicPost[] };
type PublicPostsOptions = { query: string; theme: string; from: string; to: string; personId: number; page: number };

const resultCache = new Map<string, { expiresAt: number; result: PublicPostsResult }>();
const resultFlights = new Map<string, Promise<PublicPostsResult>>();
const RESULT_CACHE_TTL_MS = 30_000;

async function loadPublicPosts(options: PublicPostsOptions): Promise<PublicPostsResult> {
  const key = JSON.stringify(options);
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  let flight = resultFlights.get(key);
  if (!flight) {
    flight = runDatabaseWorker<PublicPostsResult>("social-data-worker.cjs", {
      databasePath: databasePath(), mode: "public-posts", ...options,
    }, { priority: -5, lane: "bulk" }).then((result) => {
      resultCache.set(key, { expiresAt: Date.now() + RESULT_CACHE_TTL_MS, result });
      while (resultCache.size > 128) resultCache.delete(resultCache.keys().next().value!);
      return result;
    }).finally(() => resultFlights.delete(key));
    resultFlights.set(key, flight);
  }
  return flight;
}

export default async function Page({ searchParams }: PageProps<"/redes">) {
  const p = await searchParams;
  const query = typeof p.q === "string" ? p.q.slice(0, 120) : "";
  const theme = typeof p.tema === "string" ? p.tema : "";
  const from = typeof p.de === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.de) ? p.de : "";
  const to = typeof p.ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.ate) ? p.ate : "";
  const personId = Number(p.pessoa) || 0;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(p.page) || 1)));

  return (
    <main className="platform-page">
      <PageHeader group="Consulta" current="Publicações e temas" />
      <h1>Publicações públicas e temas</h1>
      <p>Texto coletado de contas declaradas ao TSE. Não representa todas as publicações, nem comprova uma posição permanente. Temas são filtros por palavras, podem incluir citações ou críticas. Consulte o contexto original.</p>
      <form className="platform-form" action="/redes">
        <label>Nome, perfil ou trecho<input name="q" defaultValue={query} /></label>
        <label>Tema<select name="tema" defaultValue={theme}><option value="">Todos</option><option value="saude">Saúde</option><option value="educacao">Educação</option><option value="seguranca">Segurança</option><option value="economia">Economia</option><option value="ambiente">Meio ambiente</option></select></label>
        <label>De<input type="date" name="de" defaultValue={from} /></label>
        <label>Até<input type="date" name="ate" defaultValue={to} /></label>
        {personId > 0 && <input type="hidden" name="pessoa" value={personId} />}
        <button className="btn">Pesquisar em toda a coleta</button>
      </form>
      <Suspense fallback={<p aria-busy="true">Preparando as publicações em segundo plano…</p>}>
        <PublicPostsResults options={{ query, theme, from, to, personId, page }} />
      </Suspense>
    </main>
  );
}

async function PublicPostsResults({ options }: { options: PublicPostsOptions }) {
  let result: PublicPostsResult;
  try {
    result = await loadPublicPosts(options);
  } catch (error) {
    console.error("Unable to load public social posts:", error);
    return <p role="status">Não foi possível consultar as publicações agora. <a href="/redes" className="source-link">Tentar novamente</a></p>;
  }
  const { total, rows, page } = result;
  const href = (next: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of [["q", options.query], ["tema", options.theme], ["de", options.from], ["ate", options.to], ["pessoa", options.personId ? String(options.personId) : ""]]) {
      if (value) params.set(key, value);
    }
    params.set("page", String(next));
    return `/redes?${params}`;
  };

  return <>
    <p>{total.toLocaleString("pt-BR")} publicações encontradas</p>
    <div className="platform-grid">
      {rows.map((row) => <article className="card" key={row.id}>
        <h2>{row.personId ? <Link className="link-primary" href={`/politico/${row.personId}`}>{row.name || row.handle}</Link> : row.name || row.handle}</h2>
        <p>@{row.handle} · {row.kind === "reply" ? "Resposta" : row.kind === "quote" ? "Citação" : "Publicação"} · {row.postedAt ? new Date(row.postedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Data não informada"}</p>
        <p className="my-3 whitespace-pre-wrap">{row.text}</p>
        {row.replyTo && <p className="text-xs">Este texto é parte de uma conversa; leia a mensagem anterior na fonte para avaliar o contexto.</p>}
        {row.url && <a href={row.url} target="_blank" rel="noopener noreferrer" className="source-link" data-source-date={row.collectedAt}>Fonte original e contexto</a>}
        <p className="text-xs">Coletado em {new Date(row.collectedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
      </article>)}
    </div>
    {!rows.length && <p>Nenhuma publicação encontrada na coleta disponível. Isso não indica ausência de publicações ou de posicionamento.</p>}
    <PaginationLinks page={page} totalPages={Math.max(1, Math.ceil(total / 20))} makeHref={href} />
  </>;
}
