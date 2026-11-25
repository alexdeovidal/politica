import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata } from "@/lib/seo-metadata";
import { formatBRL } from "@/lib/format";
import { findMunicipality, municipalities, municipalHref } from "@/lib/municipal-registry";
import { getMunicipalFiscal, getMunicipalProcurement } from "@/lib/municipal-live";
import { sumCents } from "@/lib/state-accounts/comparison";

export const revalidate = 120;
export const dynamicParams = false;
export function generateStaticParams() {
  return municipalities.filter(c=>!c.existing).map(c=>({uf:c.uf.toLowerCase(),cidade:c.slug}));
}
type RouteProps={params:Promise<{uf:string;cidade:string}>};
async function getCity({params}:RouteProps) {
  const {uf,cidade}=await params;
  const city=findMunicipality(uf,cidade);
  if(!city) notFound();
  return city;
}
export async function generateMetadata(props:RouteProps) {
  const city=await getCity(props);
  return pageMetadata(`Contas de ${city.name} · ${city.uf} | Política007`,
    `Receitas realizadas, execução de despesas e contratos recentes de ${city.name}, com fontes e recortes oficiais.`,municipalHref(city));
}
const date=(s:string)=>s.slice(0,10).split("-").reverse().join("/");
const labels={revenue:"Receita realizada",committed:"Despesa empenhada",settled:"Despesa liquidada",paid:"Despesa paga"} as const;

export default async function MunicipalPublicPage(props:RouteProps) {
  const city=await getCity(props);
  const fiscal=getMunicipalFiscal(city);
  const contracts=getMunicipalProcurement(city);
  return <div className="flex flex-col gap-6">
    <PageHeader group="Contas do Município" current={city.name} />
    <header className="card p-6 sm:p-9">
      <Link href="/contas-do-municipio" prefetch={false} className="source-link">Escolher outro estado ou cidade</Link>
      <p className="mt-4 text-xs uppercase tracking-wide text-[var(--muted)]">{city.state} · IBGE {city.code}</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">Contas de {city.name}</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">Acompanhe o orçamento declarado ao Tesouro e contratos recentes do órgão municipal cadastrado no PNCP. Contrato, empenho, liquidação e pagamento são coisas diferentes.</p>
      <nav aria-label="Seções do painel" className="mt-4 flex flex-wrap gap-4 text-sm underline"><a href="#orcamento">Orçamento</a><a href="#contratos">Contratos recentes</a><a href="#fontes">Fontes e cobertura</a></nav>
    </header>
    <section id="orcamento" className="grid gap-4">
      <h2 className="text-xl font-semibold">Execução orçamentária</h2>
      {fiscal ? <><p className="text-sm text-[var(--muted)]">RREO consolidado do município, sem despesas intraorçamentárias. Versão dos dados: {date(fiscal.collected)}.</p>
        {fiscal.reports.map((r,i)=>{
          const areaSum=sumCents(r.areas.map(a=>a.cents));
          return <details key={r.year} open={i===0} className="card p-5 sm:p-7">
            <summary className="cursor-pointer text-lg font-semibold">{r.year} · {r.period}º bimestre · até {date(r.end)}</summary>
            <dl className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(labels).map(([k,label])=><div key={k} className="rounded border border-[var(--border-1)] p-4">
                <dt className="text-sm text-[var(--muted)]">{label}</dt><dd className="mt-2 break-words font-semibold">{formatBRL(r.totals[k as keyof typeof labels])}</dd>
              </div>)}
            </dl>
            <h3 className="mb-2 font-semibold">Despesas liquidadas por função</h3>
            {(r.annex02Total!==r.totals.settled || areaSum!==r.annex02Total) && <p className="mb-3 rounded border border-[var(--border-2)] p-3 text-sm">Os totais dos anexos ou a soma das funções divergem. Os registros oficiais foram preservados sem rateios nem estimativas.</p>}
            <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={`Funções em ${r.year}`}><table className="w-full text-sm">
              <thead><tr><th scope="col" className="p-2 text-left">Função</th><th scope="col" className="p-2 text-right">Liquidado</th></tr></thead>
              <tbody>{r.areas.map(a=><tr key={a.name} className="border-t border-[var(--border-1)]"><th className="p-2 text-left font-normal" scope="row">{a.name}</th><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatBRL(a.cents)}</td></tr>)}</tbody>
            </table></div>
            <p className="mt-3 flex flex-wrap gap-4"><a className="source-link" href={r.balance.url}>RREO · totais</a><a className="source-link" href={r.functions.url}>RREO · funções</a></p>
          </details>;
        })}
      </> : <p className="card p-5">Nenhuma versão fiscal validada disponível.</p>}
    </section>
    <section id="contratos" className="card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Contratos recentes</h2>
      {contracts ? <>
        <p className="mb-4 mt-2 text-sm text-[var(--muted)]">PNCP · órgão cadastrado com CNPJ {contracts.org} · publicações de {date(contracts.start)} a {date(contracts.end)}. Foram encontrados {contracts.total} registros. Esta lista mostra até 100 e não inclui automaticamente fundos, Câmara ou outros órgãos com CNPJ próprio.</p>
        {contracts.records.length>0 ? <ul className="divide-y divide-[var(--border-1)]">
          {contracts.records.map(r=><li key={r.id} className="py-3 text-sm"><a className="source-link" href={r.url}>{r.title}</a>
          <p className="mt-1 text-[var(--muted)]">{date(r.published)} · {r.amount===null?"Valor não informado":`${formatBRL(r.amount)} · valor informado no PNCP`}</p></li>)}
        </ul> : <p>Nenhum registro retornou para este órgão e esta janela.</p>}
      </> : <p className="mt-2 text-sm">A primeira coleta de contratos ainda não está disponível.</p>}
    </section>
    <section id="fontes" className="card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Fontes e cobertura</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">O RREO depende da publicação bimestral pelo município. Os contratos vêm de um recorte do PNCP e não representam pagamentos. Em caso de falha, o painel mantém a última coleta validada.</p>
      <p className="mt-3 flex gap-4"><a className="source-link" href="https://apidatalake.tesouro.gov.br/docs/siconfi/">Tesouro Nacional</a><a className="source-link" href="https://pncp.gov.br/">Portal Nacional de Contratações Públicas</a></p>
    </section>
  </div>;
}
