import { PilotCard } from "../../../gasto-por-morador/pilot-card";
import { StateAllocation } from "../../../gasto-por-morador/state-allocation";
import { Files } from "lucide-react";
import { MunicipalDashboard } from "../../caldas-novas/painel";
import styles from "../../caldas-novas/painel.module.css";
import { directoryHref } from "@/lib/municipal-directory";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata } from "@/lib/seo-metadata";
import { formatBRL } from "@/lib/format";
import { findPublishedMunicipality } from "@/lib/municipal-catalog-server";
import { municipalities, municipalHref } from "@/lib/municipal-registry";
import { getMunicipalFiscal, getMunicipalProcurement } from "@/lib/municipal-live";
import { sumCents } from "@/lib/state-accounts/comparison";

export const revalidate = 120;
export const dynamicParams = true;
export function generateStaticParams() {
  return municipalities.filter(c=>!c.existing).map(c=>({uf:c.uf.toLowerCase(),cidade:c.slug}));
}
type RouteProps={params:Promise<{uf:string;cidade:string}>};
async function getCity({params}:RouteProps) {
  const {uf,cidade}=await params;
  const city=findPublishedMunicipality(uf,cidade);
  if(!city) notFound();
  return city;
}
export async function generateMetadata(props:RouteProps) {
  const city=await getCity(props);
  return pageMetadata(`Contas de ${city.name} · ${city.uf} | Política007`,
    `Receitas realizadas, execução de despesas e contratos recentes de ${city.name}, com fontes e recortes oficiais.`,municipalHref(city));
}
const date=(s:string)=>s.slice(0,10).split("-").reverse().join("/");

export default async function MunicipalPublicPage(props:RouteProps) {
  const city=await getCity(props);
  const fiscal=getMunicipalFiscal(city);
  const contracts=getMunicipalProcurement(city);
  const reports = (fiscal?.reports ?? []).map(report => ({
    year: report.year, period: report.period, ...report.totals, origins: [],
    areas: report.areas.map(area => ({ name: area.name, amount: area.cents })).sort((a, b) => b.amount - a.amount),
    balanceUrl: report.balance.url, executionUrl: report.functions.url, collected: fiscal?.collected ?? "",
  })).sort((a, b) => b.year - a.year);
  const divergentYears = (fiscal?.reports ?? []).filter(report => report.annex02Total !== report.totals.settled ||
    sumCents(report.areas.map(area => area.cents)) !== report.annex02Total).map(report => report.year);
  return <div className="flex flex-col gap-6">
    <PageHeader group="Contas do Município" current={city.name} />
    <div id="orcamento" className="scroll-mt-20"><MunicipalDashboard reports={reports} groups={[]} labels={{}} path={municipalHref(city)}
      resultCount={contracts?.total ?? 0} scope="Recorte publicado" filterParams={{}} flowRevenue={[]} funding={[]}
      flowFilters={{}} initialTrailStep={0}
      municipality={{ name: city.name, state: city.state, code: city.code, directory: directoryHref(city.uf),
        contractsReady: Boolean(contracts), divergentYears }} /></div>
    <StateAllocation code={city.code} />
    <PilotCard code={city.code} />
    <section id="buscar-contratos" className="card scroll-mt-20 p-5 sm:p-7">
      <div id="contratos" className={`${styles.sectionHead} scroll-mt-20`}>
        <div><h2 className="flex items-center gap-2"><Files size={21} aria-hidden /> Contratos recentes</h2>
          <p>Consulte os registros no Portal Nacional de Contratações Públicas.</p></div>
      </div>
      {contracts ? <>
        <p className="mb-4 mt-2 text-sm text-[var(--muted)]">PNCP · órgão cadastrado com CNPJ {contracts.org} · publicações de {date(contracts.start)} a {date(contracts.end)}. Foram encontrados {contracts.total} registros. Esta lista mostra até 100 e não inclui automaticamente fundos, Câmara ou outros órgãos com CNPJ próprio.</p>
        {contracts.records.length>0 ? <ul className="divide-y divide-[var(--border-1)]">
          {contracts.records.map(r=><li key={r.id} className="py-3 text-sm"><a className="source-link" href={r.url}>{r.title}</a>
          <p className="mt-1 text-[var(--muted)]">{date(r.published)} · {r.amount===null?"Valor não informado":`${formatBRL(r.amount)} · valor informado no PNCP`}</p></li>)}
        </ul> : <p>Nenhum registro retornou para este órgão e esta janela.</p>}
      </> : <p className="mt-2 text-sm">{city.pncpOrg ? "A primeira coleta de contratos ainda não está disponível." : "O órgão municipal ainda não foi validado para consulta ao PNCP. A ausência desta base não indica que não houve contratos."}</p>}
    </section>
    {reports.length > 0 && <section aria-labelledby="tabelas-fiscais" className="card p-5 sm:p-7">
      <div className={styles.sectionHead}>
        <div><h2 id="tabelas-fiscais">Demonstrativos por exercício</h2><p>Veja os valores completos, sem arredondamento visual, e abra os anexos oficiais.</p></div>
      </div>
      <div className="grid gap-3">{reports.map(report => <details key={report.year} className="rounded-xl border border-[var(--border-1)] p-4">
        <summary className="cursor-pointer font-semibold">{report.year} · {report.period}º bimestre</summary>
        <div className="mt-3 overflow-x-auto" role="region" tabIndex={0} aria-label={`Demonstrativo de ${report.year}`}>
          <table className="w-full text-sm">
            <caption className="sr-only">Valores do RREO de {report.year}</caption>
            <thead><tr><th className="p-2 text-left" scope="col">Indicador</th><th className="p-2 text-right" scope="col">Valor</th></tr></thead>
            <tbody>{[
              { name: "Receita realizada", amount: report.revenue },
              { name: "Despesa empenhada", amount: report.committed },
              { name: "Despesa liquidada", amount: report.settled },
              { name: "Despesa paga", amount: report.paid },
            ].map(row => <tr key={row.name} className="border-t border-[var(--border-1)]">
              <th className="p-2 text-left font-normal" scope="row">{row.name}</th>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatBRL(row.amount)}</td>
            </tr>)}</tbody>
            <tbody>
              <tr><th className="p-2 text-left" colSpan={2} scope="rowgroup">Despesas liquidadas por função</th></tr>
              {report.areas.map(row => <tr key={row.name} className="border-t border-[var(--border-1)]">
                <th className="p-2 text-left font-normal" scope="row">{row.name}</th>
                <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatBRL(row.amount)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {divergentYears.includes(report.year) && <p className="mt-2 text-sm text-[var(--muted)]">Os totais ou a soma das funções divergem entre os registros oficiais.</p>}
        <p className={styles.sourceLinks}><a className="source-link" href={report.balanceUrl}>RREO · totais</a><a className="source-link" href={report.executionUrl}>RREO · funções</a></p>
      </details>)}</div>
    </section>}
    <section id="fontes" className="card scroll-mt-20 p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Fontes e cobertura</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">O RREO depende da publicação bimestral pelo município. O PNCP aparece quando o órgão contratante e seu CNPJ são confirmados. Em caso de falha, o painel mantém a última coleta validada.{fiscal && ` Última coleta fiscal: ${date(fiscal.collected)}.`}</p>
      <p className="mt-3 flex flex-wrap gap-4"><a className="source-link" href="https://apidatalake.tesouro.gov.br/docs/siconfi/">Tesouro Nacional</a><a className="source-link" href="https://pncp.gov.br/">Portal Nacional de Contratações Públicas</a></p>
    </section>
  </div>;
}
