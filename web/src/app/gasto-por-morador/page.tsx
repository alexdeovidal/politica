import Link from "next/link";
import Form from "next/form";
import { ChartNoAxesCombined, Landmark, MapPinned } from "lucide-react";
import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata } from "@/lib/seo-metadata";
import { educationPilot, fiscalPilot, number, pilotEntity, ranked, rankingPath, reais, type Entity } from "@/lib/per-capita";
import { PilotCard } from "./pilot-card";
import { PrivateSchoolSimulator } from "./simulator";
import municipal from "../contas-do-municipio/caldas-novas/painel.module.css";

export const metadata = pageMetadata("Gasto público por morador | Política007",
  "Compare despesas liquidadas por morador em saúde, educação e outras funções. Piloto de 2025 com estados e municípios selecionados.", rankingPath);

const collator = new Intl.Collator("pt-BR");
const areas = ["Saúde","Educação","Total", ...[...new Set(fiscalPilot.entities.flatMap(row=>Object.keys(row.functions)))].sort(collator.compare).filter(name=>name !== "Saúde" && name !== "Educação")];

function Ranking({ scope, area }: { scope: Entity["scope"]; area: string }) {
  const entities = fiscalPilot.entities.filter(row=>row.scope===scope);
  const rows = ranked(entities, scope, area);
  const omitted = entities.filter(row=>!rows.some(r=>r.entity.code===row.code));
  const title = scope === "state" ? "Estados" : "Municípios";
  const chartMax = Math.max(0, ...rows.map(({amount,entity})=>amount/entity.population));
  return <section className="card min-w-0 p-4 sm:p-6" aria-labelledby={`rank-${scope}`}>
    <h3 id={`rank-${scope}`} className="text-lg font-semibold">{title} · {rows.length} de {entities.length} no recorte</h3>
    <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={`Ranking de ${title.toLowerCase()} por morador`}>
      <table className="w-full text-sm">
        <thead><tr><th className="p-2 text-left" scope="col">Posição</th><th className="p-2 text-left" scope="col">Local</th><th className="p-2 text-right" scope="col">Por morador</th><th className="p-2 text-right" scope="col">Valor liquidado</th></tr></thead>
        <tbody>{rows.map(({entity,amount},i)=>{
          const per = amount/entity.population;
          return <tr key={entity.code} className="border-t border-[var(--border-1)]">
            <td className="p-2 tabular-nums">{i+1}º</td>
            <th scope="row" className="p-2 text-left">
              <Link href={entity.href} prefetch={false} className="font-semibold underline decoration-[var(--border-2)] underline-offset-2">{entity.name}{scope === "city" ? ` · ${entity.uf}` : ""}</Link>
              <span className="block text-xs font-normal text-[var(--muted)]">{number.format(entity.population)} habitantes</span>
            </th>
            <td className="p-2 text-right font-semibold tabular-nums"><span className="whitespace-nowrap">{reais(per)}</span><span aria-hidden="true" className="ml-auto mt-1 block h-1 rounded bg-[var(--green)]" style={{width:`${chartMax>0 ? Math.max(0,per)/chartMax*100 : 0}%`}} /></td>
            <td className="whitespace-nowrap p-2 text-right tabular-nums">{reais(amount)} <a className="source-link block" href={entity.source} aria-label={`Demonstrativo do Tesouro: ${entity.name}`}>Fonte</a></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {omitted.length > 0 && <p className="mt-3 text-xs text-[var(--muted)]">Sem valor publicado nessa função: {omitted.map(row=>row.name).join(", ")}. Ausência não vira zero.</p>}
  </section>;
}

export default async function PublicSpending({ searchParams }: { searchParams: Promise<{ area?: string | string[] }> }) {
  const request = (await searchParams).area;
  const area = typeof request==="string" && areas.includes(request) ? request : "Saúde";
  return <div className={municipal.dashboard}>
    <PageHeader group="Transparência" current="Gasto por morador" />
    <header className={municipal.hero}>
      <div><span className={municipal.eyebrow}><Landmark size={17} aria-hidden /> Finanças públicas · piloto 2025</span>
        <h1>Gasto público por morador</h1>
        <p>Compare quanto estados e prefeituras liquidaram em saúde, educação e outras áreas, levando em conta quantas pessoas moram em cada local.</p></div>
      <nav className="flex flex-wrap gap-2" aria-label="Seções do piloto">
        <a className="btn btn--primary" href="#ranking"><ChartNoAxesCombined size={16} aria-hidden /> Ver rankings</a>
        <a className="btn" href="#simulador">Simular escola particular</a>
      </nav>
    </header>
    <div className="grid gap-4 xl:grid-cols-2">
      <PilotCard code="52" listing /><PilotCard code="5204508" listing />
    </div>
    <section id="ranking" className="grid scroll-mt-24 gap-4" aria-labelledby="ranking-title">
      <div className="card p-5 sm:p-7">
        <h2 id="ranking-title" className="text-2xl font-semibold">Ranking por função</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Amostra inicial de 3 estados e 10 municípios. Os rankings são separados: estados e prefeituras têm atribuições diferentes. Gastar mais não significa prestar um serviço melhor.</p>
        <Form action={rankingPath+"#ranking"} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm font-medium">Área do orçamento<select name="area" className="input" defaultValue={area} key={area}>
            {areas.map(value=><option key={value} value={value}>{value === "Total" ? "Total liquidado (Anexo 02)" : value}</option>)}
          </select></label><button className="btn" type="submit">Atualizar ranking</button>
        </Form>
      </div>
      <Ranking scope="state" area={area} /><Ranking scope="city" area={area} />
    </section>
    <PrivateSchoolSimulator entities={["5204508","52"].map(code=>({code,name:pilotEntity(code).name,count:educationPilot[code].enrollment}))} />
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
