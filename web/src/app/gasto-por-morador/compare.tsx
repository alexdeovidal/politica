import Link from "next/link";
import { allMunicipalities } from "@/lib/municipal-catalog-server";
import { ageLabels, cityCostHref, cityFor, fiscalEntity, number, rankingPath, reais, stateAllocation, stateFor } from "@/lib/per-capita";
import { STATES } from "@/lib/state-accounts/registry";

type Params=Record<string,string|string[]|undefined>;
const stateList=[...STATES].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
const valid=(p:Params,k:string)=>typeof p[k]==="string"?p[k]:"";
const region=(value:string,fallback:string)=>STATES.some(s=>s.uf===value)?value:fallback;
function pick(p:Params, side:"1"|"2") {
  const defaults=side==="1"?["GO","5204508"]:["SP","3550308"];
  const uf=region(valid(p,"uf"+side),defaults[0]);
  const code=p["cidade"+side]===undefined && !p["etapa"] && uf===defaults[0] ? defaults[1] : valid(p,"cidade"+side);
  const found=cityFor(code), city=found?.uf===uf?found:undefined;
  const state=stateFor(uf), municipal=city ? fiscalEntity(city.code) : undefined;
  const estimate=city && state ? stateAllocation(city.code,state) : null;
  const title=city ? `${city.name} · ${uf}` : state?.name ?? uf;
  const population=city ? estimate?.population : state?.population;
  return {uf,city,state,municipal,estimate,title,population};
}
const pair=(annual:number|undefined,monthly:number|undefined)=>annual===undefined||monthly===undefined?"Não informado":<><strong className="whitespace-nowrap">{reais(annual)}</strong><span className="block whitespace-nowrap text-xs text-[var(--muted)]">{reais(monthly)}/mês</span></>;

export function SpendingCompare({params,area}:{params:Params;area:string}) {
  const effective={...params, ...(valid(params,"oe") && params.uf1===undefined ? {uf1:valid(params,"oe"),cidade1:valid(params,"oc")} : {})};
  const a=pick(effective,"1"), b=pick(effective,"2");
  const compare=[a,b];
  return <section className="card min-w-0 scroll-mt-24 p-5 sm:p-7" id="comparar" aria-labelledby="comparar-title">
    <h2 className="text-2xl font-semibold" id="comparar-title">Compare estados e cidades</h2>
    <p className="my-2 text-sm text-[var(--muted)]">Escolha duas UFs e atualize a lista. Depois escolha os municípios, ou deixe “Estado inteiro”. Todos os valores são de 2025; o valor mensal é a média de 12 meses.</p>
    <form action={rankingPath+"#comparar"} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="area" value={area}/><input type="hidden" name="etapa" value="ufs"/>
      {compare.map((s,i)=><label key={i} className="grid gap-1 text-sm">Estado {i+1}<select className="input" name={`uf${i+1}`} defaultValue={s.uf} key={s.uf}>{stateList.map(state=><option key={state.uf} value={state.uf}>{state.name}</option>)}</select></label>)}
      <button className="btn" type="submit">Atualizar lista de cidades</button>
    </form>
    <form action={rankingPath+"#comparar"} className="my-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="area" value={area}/>
      {compare.map((s,i)=><div key={i} className="min-w-0 max-w-full"><input type="hidden" name={`uf${i+1}`} value={s.uf}/>
        <label className="grid gap-1 text-sm">Cidade {i+1} · {s.uf}<select className="input max-w-full" name={`cidade${i+1}`} defaultValue={s.city?.code??""} key={s.uf+":"+s.city?.code}>
          <option value="">Estado inteiro</option>
          {allMunicipalities().filter(city=>city.uf===s.uf).sort((x,y)=>x.name.localeCompare(y.name,"pt-BR")).map(city=><option key={city.code} value={city.code}>{city.name}</option>)}
        </select></label></div>)}
      <button className="btn btn--primary" type="submit">Comparar</button>
    </form>
    <div tabIndex={0} role="region" aria-label="Comparação anual e mensal lado a lado" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr><th scope="col" className="p-2 text-left">Indicador · ano e média mensal</th>{compare.map((s,i)=><th key={i} scope="col" className="p-2 text-right"><Link className="source-link" href={s.city?cityCostHref(s.city.code):s.state?.href??rankingPath} prefetch={false}>{s.title}</Link></th>)}</tr></thead>
        <tbody>
          <tr className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left">População IBGE 2025</th>{compare.map((s,i)=><td key={i} className="p-2 text-right">{s.population?number.format(s.population):"Não informado"}</td>)}</tr>
          <tr className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left">Governo estadual · por morador</th>{compare.map((s,i)=><td key={i} className="p-2 text-right">{pair(s.state?s.state.totalCents/s.state.population:undefined,s.state?s.state.totalCents/s.state.population/12:undefined)}</td>)}</tr>
          <tr className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left">Governo estadual · total no local <span className="block text-xs font-normal text-[var(--muted)]">Estimativa se for município</span></th>{compare.map((s,i)=><td key={i} className="p-2 text-right">{s.city?pair(s.estimate?.annual,s.estimate?.monthly):pair(s.state?.totalCents,s.state?s.state.totalCents/12:undefined)}</td>)}</tr>
          {compare.some(s=>s.city) && ageLabels.map((label,i)=><tr key={label} className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left font-normal">{label} · rateio estadual</th>{compare.map((s,j)=><td key={j} className="p-2 text-right">{s.city?pair(s.estimate?.groups[i]?.annual,s.estimate?.groups[i]?.monthly):"Apenas municípios"}</td>)}</tr>)}
          {compare.some(s=>s.city) && <tr className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left">Prefeitura · por morador</th>{compare.map((s,i)=><td key={i} className="p-2 text-right">{s.city?pair(s.municipal?s.municipal.totalCents/s.municipal.population:undefined,s.municipal?s.municipal.totalCents/s.municipal.population/12:undefined):"Não se aplica"}</td>)}</tr>}
          {compare.some(s=>s.city) && <tr className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left">Prefeitura · total liquidado</th>{compare.map((s,i)=><td key={i} className="p-2 text-right">{s.city?pair(s.municipal?.totalCents,s.municipal?s.municipal.totalCents/12:undefined):"Não se aplica"}</td>)}</tr>}
        </tbody>
      </table>
    </div>
    <p className="mt-3 text-xs text-[var(--muted)]">Para cidades, a despesa estadual é estimada pela média estadual por habitante. As faixas seguem as proporções do Censo 2022, não despesas registradas por idade. A soma não inclui a prefeitura.</p>
  </section>;
}
