import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { allMunicipalities, municipalPublishedCodes, municipalStorage } from "./municipal-catalog-server";
import { getMunicipalFiscal } from "./municipal-live";
import { municipalHref } from "./municipal-registry";
import { STATES } from "./state-accounts/registry";
import federal from "./per-capita-federal-2025.json";
export const federalFiscal=federal;

export type Entity = {
  scope: "state" | "city"; code: string; uf: string; name: string; href: string; population: number;
  educationSubfunctions?: Record<string, number | undefined>; totalCents: number;
  functions: Record<string, number | undefined> & { Saúde: number; Educação: number };
  reconciliationCents: number; source: string; sourceSha256: string;
};
type NationalSnapshot={year: number; period: number; end: string; populationDate: string; populationUrl: string; populationSha256: string; generatedAt: string; populationSet: Record<string,number|undefined>; entities: Entity[]};
const snapshot=JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(),"data/per-capita/national-2025.json.gz"))).toString("utf8")) as NationalSnapshot;
const ages=JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(),"data/per-capita/age-2022.json.gz"))).toString("utf8")) as {url:string; rows:Record<string,number[]|undefined>};
const entities: Entity[] = snapshot.entities.map(row => {
  if (row.scope !== "state" && row.scope !== "city") throw new Error("Esfera inválida");
  return { ...row, scope: row.scope };
});
const base = new Map(entities.map(entity=>[entity.code,entity]));
export const fiscalPilot = { ...snapshot, entities };
export const rankingPath = "/gasto-por-morador";
export const ageSource = ages.url;
export const populationFor = (code: string) => (snapshot.populationSet as Record<string,number|undefined>)[code];
export const stateFor = (uf: string) => {
  const s=STATES.find(state=>state.uf===uf);
  return s ? base.get(String(s.ibgeCode)) : undefined;
};
export const cityCostHref = (code: string) => rankingPath + "/" + code;
let cityIndex: Map<string,ReturnType<typeof allMunicipalities>[number]>|undefined;
export const cityFor = (code: string) => (cityIndex ??= new Map(allMunicipalities().map(city=>[city.code,city]))).get(code);
export const educationPilot: Record<string, { enrollment: number; network: string; source: string }> = {
  "52": { enrollment: 524994, network: "Rede estadual de Goiás", source: "https://pee.goias.gov.br/diagnostico/base-dados/?indicator=ED_BASICA_MATRICULAS&dependency=Estadual" },
  "5204508": { enrollment: 11212, network: "Rede municipal de Caldas Novas", source: "https://pee.goias.gov.br/diagnostico/base-dados/?indicator=ED_BASICA_MATRICULAS&municipality=5204508&dependency=Municipal" },
};
export const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const number = new Intl.NumberFormat("pt-BR");
export const reais = (cents: number) => currency.format(cents / 100);
export const resourceAmount = (entity: Entity, area: string) =>
  area === "Total" ? entity.totalCents : entity.functions[area] ?? null;

let liveRows: Entity[]=[];
function getNationalSupplement() {
  try {
    const disk=JSON.parse(readFileSync(path.join(municipalStorage(),"per-capita-2025-extra.json"),"utf8"));
    if(disk.year!==2025 || disk.period!==6 || disk.populationSha256!==snapshot.populationSha256 || !Array.isArray(disk.entities) || disk.entities.length>5596)
      throw new Error("Versão complementar incompatível");
    const unique=new Set<string>();
    const parsed:Entity[]=disk.entities.map((row: Entity)=>{
      const city=cityFor(row.code), state=stateFor(row.uf), population=populationFor(row.code);
      if(unique.has(row.code) || !population || population!==row.population || row.totalCents<=0 ||
        ![row.totalCents,row.functions?.Saúde,row.functions?.Educação,row.reconciliationCents].every(Number.isSafeInteger) ||
        !Object.values(row.functions).every(Number.isSafeInteger) ||
        (row.educationSubfunctions && !Object.values(row.educationSubfunctions).every(Number.isSafeInteger)) ||
        (row.scope==="city"?(!city||city.uf!==row.uf||city.name!==row.name||municipalHref(city)!==row.href):
          (row.scope!=="state"||state?.code!==row.code||state.name!==row.name||state.href!==row.href)))
        throw new Error("Registro complementar inconsistente");
      const source=new URL(row.source);
      if(source.origin!=="https://apidatalake.tesouro.gov.br" || source.pathname!=="/ords/siconfi/tt/rreo" ||
        source.searchParams.get("id_ente")!==row.code || source.searchParams.get("an_exercicio")!=="2025" ||
        source.searchParams.get("nr_periodo")!=="6" || source.searchParams.get("co_tipo_demonstrativo")!=="RREO" ||
        source.searchParams.get("no_anexo")!=="RREO-Anexo 02" || !/^[0-9a-f]{64}$/.test(row.sourceSha256))
        throw new Error("Fonte complementar inválida");
      unique.add(row.code);
      return row;
    });
    liveRows=parsed;
  } catch(error) {
    if((error as NodeJS.ErrnoException).code!=="ENOENT") console.error("Complemento gasto por morador:",error);
  }
  return liveRows;
}

let merged: Entity[]|undefined;
let mergeDeadline = 0;
export function activeFiscalEntities() {
  if (merged && Date.now()<mergeDeadline) return merged;
  const supplemental=getNationalSupplement();
  const out=[...entities,...supplemental.filter(row=>!base.has(row.code))];
  const loaded=new Set(out.map(row=>row.code));
  for (const code of municipalPublishedCodes()) {
    if(loaded.has(code)) continue;
    const city=cityFor(code), population=populationFor(code);
    if (!city || !population) continue;
    const report=getMunicipalFiscal(city)?.reports.find(item=>item.year===2025 && item.period===6);
    if (!report || report.annex02Total<=0) continue;
    const functions=Object.fromEntries(report.areas.map(item=>[item.name,item.cents]));
    const health=functions.Saúde, education=functions.Educação;
    if (!Number.isSafeInteger(health) || !Number.isSafeInteger(education)) continue;
    const sum=report.areas.reduce((value,item)=>value+item.cents,0);
    out.push({scope:"city",code,uf:city.uf,name:city.name,href:municipalHref(city),population,
      totalCents:report.annex02Total,functions:{...functions,Saúde:health,Educação:education},
      reconciliationCents:sum-report.annex02Total,source:report.functions.url,sourceSha256:report.functions.sha256});
  }
  mergeDeadline=Date.now()+120_000;
  return merged=out;
}
export const fiscalEntity=(code: string) => base.get(code) ?? activeFiscalEntities().find(row=>row.code===code);

export function ranked(entities: readonly Entity[], scope: Entity["scope"], area: string) {
  const rows = entities.filter(entity => entity.scope === scope && resourceAmount(entity, area) !== null)
    .map(entity => ({ entity, amount: resourceAmount(entity, area)! }));
  rows.sort((a,b) => {
    const left = BigInt(a.amount) * BigInt(b.entity.population);
    const right = BigInt(b.amount) * BigInt(a.entity.population);
    return left === right ? a.entity.name.localeCompare(b.entity.name, "pt-BR") || a.entity.code.localeCompare(b.entity.code) : left > right ? -1 : 1;
  });
  return rows;
}

// Integer apportionment: the sum shown is exactly the sum of the displayed groups.
function shares(total: bigint, weights: readonly number[]) {
  const w=weights.map(BigInt);
  const divisor=w.reduce((a,b)=>a+b,BigInt(0));
  if(divisor<=BigInt(0)) return [];
  const q=w.map(x=>total*x/divisor);
  const ix=w.map((x,i)=>({i,r:total*x%divisor})).sort((a,b)=>a.r===b.r?a.i-b.i:a.r>b.r?-1:1);
  const remainder=Number(total-q.reduce((a,b)=>a+b,BigInt(0)));
  for (const {i} of ix.slice(0,remainder)) q[i]++;
  return q.map(Number);
}
const rounded=(numerator: bigint, divisor: bigint)=> (numerator+divisor/BigInt(2))/divisor;
export const ageLabels=["Crianças e adolescentes (0 a 14)","Jovens (15 a 29)","Adultos e idosos (30 ou mais)"];
function governmentAllocation(cityCode: string, state: Pick<Entity,"population"|"totalCents">, uf?: string) {
  const city=cityFor(cityCode), pop=populationFor(cityCode);
  if(!city || (uf && city.uf!==uf) || !pop || state.population<=0 || state.totalCents<0) return null;
  const statePop=BigInt(state.population), cents=BigInt(state.totalCents), residents=BigInt(pop);
  const annual=rounded(cents*residents,statePop), monthly=rounded(cents*residents,statePop*BigInt(12));
  const annualPer=Number(rounded(cents,statePop)), monthlyPer=Number(rounded(cents,statePop*BigInt(12)));
  const census=(ages.rows as Record<string,number[]|undefined>)[cityCode];
  const groups=census ? shares(residents,census) : [];
  const annualGroups=shares(annual,groups), monthlyGroups=shares(monthly,groups);
  return { population:pop, annual:Number(annual),monthly:Number(monthly),annualPer,monthlyPer,
    groups:groups.map((count,i)=>({label:ageLabels[i],count,annual:annualGroups[i],monthly:monthlyGroups[i]})) };
}

export const stateAllocation=(code:string,state:Entity)=>governmentAllocation(code,state,state.uf);
export const federalAllocation=(code:string)=>governmentAllocation(code,federalFiscal);
