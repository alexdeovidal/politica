import Link from "next/link";
import Form from "next/form";
import { ChartNoAxesCombined, Landmark, MapPinned } from "lucide-react";
import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata } from "@/lib/seo-metadata";
import { activeFiscalEntities, cityCostHref, educationPilot, fiscalPilot, number, ranked, rankingPath, reais, type Entity } from "@/lib/per-capita";
import { PilotCard } from "./pilot-card";
import { STATES } from "@/lib/state-accounts/registry";
import { allMunicipalities } from "@/lib/municipal-catalog-server";
import { FederalSummary } from "./federal-summary";
import { SpendingCompare } from "./compare";
import { PrivateSchoolSimulator } from "./simulator";
import municipal from "../contas-do-municipio/caldas-novas/painel.module.css";

export const metadata = pageMetadata("Gasto público por morador | Política007",
  "Compare despesas liquidadas por morador em saúde, educação e outras funções. Compare estados, DF e municípios com dados de 2025.", rankingPath);

const collator = new Intl.Collator("pt-BR");
const areas = ["Saúde","Educação","Total", ...[...new Set(fiscalPilot.entities.flatMap(row=>Object.keys(row.functions)))].sort(collator.compare).filter(name=>name !== "Saúde" && name !== "Educação")];

const pageSize=25;
type Query=Record<string,string|string[]|undefined>;
function Ranking({ scope, area, filters }: { scope: Entity["scope"]; area: string; filters: Query }) {
  const uf=typeof filters.ruf==="string" && STATES.some(s=>s.uf===filters.ruf)?filters.ruf:"";
  const q=typeof filters.q==="string"?filters.q.trim().slice(0,80):"";
  const fold=(s:string)=>s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  const entities=activeFiscalEntities().filter(row=>row.scope===scope && (scope==="state" || !uf || row.uf===uf));
  const rows = ranked(entities, scope, area).map((r,i)=>({...r,rank:i+1}));
  const filtered=scope==="state"?rows:rows.filter(r=>fold(r.entity.name+" "+r.entity.code).includes(fold(q)));
  const title = scope === "state" ? "Estados e DF" : "Municípios";
  const target=scope==="state"?STATES.length:allMunicipalities().filter(c=>!uf||c.uf===uf).length;
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const page=scope==="city" && typeof filters.pagina==="string" && /^\d{1,6}$/.test(filters.pagina)?Math.max(1,Math.min(pages,Number(filters.pagina))):1;
  const start=(page-1)*pageSize;
  const visible=scope==="state"?rows:filtered.slice(start,start+pageSize);
  const chartMax=rows.length?Math.max(0,rows[0].amount/rows[0].entity.population):0;
  const href=(p:number)=>rankingPath+"?"+new URLSearchParams({area,ruf:uf,q,pagina:String(p)})+"#rank-city";
  return <section className="card min-w-0 p-4 sm:p-6" aria-labelledby={`rank-${scope}`}>
    <h3 id={`rank-${scope}`} className="text-lg font-semibold">{title} · {number.format(rows.length)} de {number.format(target)} com dado nesta função</h3>
    <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={`Ranking de ${title.toLowerCase()} por morador`}>
      <table className="w-full text-sm">
        <thead><tr><th className="p-2 text-left" scope="col">Posição</th><th className="p-2 text-left" scope="col">Local</th><th className="p-2 text-right" scope="col">Por morador no ano e no mês</th><th className="p-2 text-right" scope="col">Valor liquidado</th></tr></thead>
        <tbody>{visible.map(({entity,amount,rank})=>{
          const per = amount/entity.population;
          return <tr key={entity.code} className="border-t border-[var(--border-1)]">
            <td className="p-2 tabular-nums">{rank}º</td>
            <th scope="row" className="p-2 text-left">
              <Link href={scope==="city"?cityCostHref(entity.code):entity.href} prefetch={false} className="font-semibold underline decoration-[var(--border-2)] underline-offset-2">{entity.name}{scope === "city" ? ` · ${entity.uf}` : ""}</Link>
              <span className="block text-xs font-normal text-[var(--muted)]">{number.format(entity.population)} habitantes</span>
            </th>
            <td className="p-2 text-right font-semibold tabular-nums"><span className="whitespace-nowrap">{reais(per)}</span><span className="block whitespace-nowrap text-xs font-normal text-[var(--muted)]">{reais(per/12)}/mês</span><span aria-hidden="true" className="ml-auto mt-1 block h-1 rounded bg-[var(--green)]" style={{width:`${chartMax>0 ? Math.max(0,per)/chartMax*100 : 0}%`}} /></td>
            <td className="whitespace-nowrap p-2 text-right tabular-nums">{reais(amount)} <a className="source-link block" href={entity.source} aria-label={`Demonstrativo do Tesouro: ${entity.name}`}>Fonte</a></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!visible.length && <p className="mt-3 text-sm text-[var(--muted)]">Nenhum resultado validado com esses filtros.</p>}
    {scope==="city" && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-auto">{filtered.length ? number.format(start+1)+"–"+number.format(Math.min(start+pageSize,filtered.length))+" de "+number.format(filtered.length) : "0 resultados"}</span>
      {page>1 && <Link className="btn" prefetch={false} href={href(page-1)}>Anterior</Link>}{page<pages && <Link className="btn" prefetch={false} href={href(page+1)}>Próxima</Link>}
    </div>}
    {rows.length<target && <p className="mt-3 text-xs text-[var(--muted)]">Ausência de dado não vira zero. A ficha municipal pode ter rateio estadual mesmo sem um demonstrativo municipal validado.</p>}
  </section>;
}

export default async function PublicSpending({ searchParams }: { searchParams: Promise<Query> }) {
  const filters=await searchParams;
  const request=filters.area;
  const area = typeof request==="string" && areas.includes(request) ? request : "Saúde";
  return <div className={municipal.dashboard}>
    <PageHeader group="Transparência" current="Gasto por morador" />
    <header className={municipal.hero}>
      <div><span className={municipal.eyebrow}><Landmark size={17} aria-hidden /> Finanças públicas · Brasil 2025</span>
        <h1>Gasto público por morador</h1>
        <p>Compare quanto estados e prefeituras liquidaram em saúde, educação e outras áreas, levando em conta quantas pessoas moram em cada local.</p></div>
      <nav className="flex flex-wrap gap-2" aria-label="Seções do relatório">
        <a className="btn btn--primary" href="#ranking"><ChartNoAxesCombined size={16} aria-hidden /> Ver rankings</a>
        <a className="btn" href="#comparar">Comparar estado e cidade</a>
        <a className="btn" href="#uniao">Gasto da União</a>
        <a className="btn" href="#simulador-saude">Simular planos de saúde</a>
        <a className="btn" href="#simulador">Simular escola particular</a>
      </nav>
    </header>
    <div className="grid gap-4 xl:grid-cols-2">
      <PilotCard code="52" listing /><PilotCard code="5204508" listing />
    </div>
    <FederalSummary />
    <SpendingCompare params={filters} area={area} />
    <section id="ranking" className="grid scroll-mt-24 gap-4" aria-labelledby="ranking-title">
      <div className="card p-5 sm:p-7">
        <h2 id="ranking-title" className="text-2xl font-semibold">Ranking por função</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Estados e prefeituras têm rankings separados porque suas atribuições são diferentes. Gastar mais não significa prestar um serviço melhor.</p>
        <Form action={rankingPath+"#ranking"} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm font-medium">Área do orçamento<select name="area" className="input" defaultValue={area} key={area}>
            {areas.map(value=><option key={value} value={value}>{value === "Total" ? "Total liquidado (Anexo 02)" : value}</option>)}
          </select></label>
          <label className="grid gap-1.5 text-sm">UF para municípios<select name="ruf" className="input" defaultValue={typeof filters.ruf==="string"?filters.ruf:""}><option value="">Todas</option>{STATES.map(s=><option key={s.uf} value={s.uf}>{s.uf}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm">Buscar município<input name="q" className="input" maxLength={80} defaultValue={typeof filters.q==="string"?filters.q.slice(0,80):""} /></label>
          <button className="btn" type="submit">Atualizar ranking</button>
        </Form>
      </div>
      <Ranking scope="state" area={area} filters={filters} /><Ranking scope="city" area={area} filters={filters} />
    </section>
    <PrivateSchoolSimulator entities={["5204508","52"].map(code=>({code,name:code==="52"?"Goiás":"Caldas Novas",count:educationPilot[code].enrollment}))} />
    <section id="fontes" className="card scroll-mt-24 p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><MapPinned size={18} aria-hidden /> Como ler os números</h2>
      <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm text-[var(--muted)]">
        <li>Numerador: RREO Anexo 02 do 6º bimestre de 2025, despesa liquidada acumulada até 31/12, excluídas operações intraorçamentárias. Liquidado significa obrigação reconhecida, não pagamento já efetuado.</li>
        <li>Denominador: população residente estimada pelo IBGE em 01/07/2025. As matrículas são o número de vínculos da rede mantenedora no Censo Escolar 2025, não a população que frequenta qualquer escola do território.</li>
        <li>O ranking usa a razão sem arredondamento. O total vem da própria fonte e não da soma das funções. Havendo divergência, os números oficiais ficam preservados.</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href={fiscalPilot.populationUrl} className="source-link">IBGE · arquivo de população</a>
        <a href="https://apidatalake.tesouro.gov.br/docs/siconfi/" className="source-link">Tesouro · documentação</a>
        <a href="https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/sinopses-estatisticas/educacao-basica" className="source-link">Inep · Censo Escolar</a>
      </div>
    </section>
  </div>;
}
