import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { refreshedSnapshot } from "./state-accounts/refresh-store";
import { isISODate, sumCents } from "./state-accounts/comparison";
import type { Municipality } from "./municipal-registry";

type Source = { url: string; sha256: string };
export type MunicipalFiscal = { schema: number; code: string; collected: string; reports: {
  year: number; period: number; end: string; totals: Record<"revenue" | "committed" | "settled" | "paid", number>;
  areas: { name:string; cents:number }[]; annex02Total: number; balance: Source; functions: Source;
}[] };
export type MunicipalProcurement = { schema: number; code: string; collected:string; start:string; end:string;
  org: string; total: number; records:{id:string; title:string; published:string; amount:number|null; url:string}[] };
const dates = (value: string) => typeof value === "string" && Number.isFinite(Date.parse(value)) && value.slice(0,10) <= new Date().toISOString().slice(0,10);
function invariant(ok: unknown): asserts ok {
  if (!ok) throw new Error("Snapshot de contas municipais inválido");
}

export function validateMunicipalFiscal(raw: unknown, city: Municipality): MunicipalFiscal {
  const data = raw as MunicipalFiscal;
  invariant(data.schema === 1 && data.code === city.code && dates(data.collected));
  invariant(Array.isArray(data.reports) && data.reports.length > 0 && new Set(data.reports.map(r=>r.year)).size === data.reports.length);
  for(const r of data.reports) {
    invariant(Number.isSafeInteger(r.year) && r.year >= 2000 && Number.isInteger(r.period) && r.period >=1 && r.period<=6 &&
      r.end === new Date(Date.UTC(r.year,r.period*2,0)).toISOString().slice(0,10) && r.end<=data.collected.slice(0,10));
    invariant([r.totals.revenue,r.totals.committed,r.totals.settled,r.totals.paid,r.annex02Total].every(Number.isSafeInteger));
    invariant(Array.isArray(r.areas) && r.areas.length>0 && r.areas.length<=29 && new Set(r.areas.map(a=>a.name)).size===r.areas.length &&
      r.areas.every(a=>typeof a.name==="string" && a.name.length>0 && a.name.length<100 && Number.isSafeInteger(a.cents)));
    sumCents(r.areas.map(a=>a.cents));
    for(const [number,source] of [["01",r.balance],["02",r.functions]] as const) {
      const u = new URL(source.url);
      invariant(u.origin==="https://apidatalake.tesouro.gov.br" && u.pathname==="/ords/siconfi/tt/rreo" &&
        u.searchParams.get("id_ente")===city.code && u.searchParams.get("no_anexo")==="RREO-Anexo "+number &&
        u.searchParams.get("nr_periodo")===String(r.period) && u.searchParams.get("an_exercicio")===String(r.year) && /^[0-9a-f]{64}$/.test(source.sha256));
    }
  }
  return data;
}

export function validateMunicipalProcurement(raw: unknown, city: Municipality): MunicipalProcurement {
  const data = raw as MunicipalProcurement;
  invariant(data.schema === 1 && data.code === city.code && data.org===city.pncpOrg && dates(data.collected));
  invariant(isISODate(data.start) && isISODate(data.end) && data.start<=data.end && data.end<=data.collected.slice(0,10));
  invariant(Array.isArray(data.records) && data.total>=0 && Number.isSafeInteger(data.total) && data.records.length===Math.min(100,data.total) &&
    new Set(data.records.map(r=>r.id)).size===data.records.length);
  for(const r of data.records) {
    const m=/^(\d{14})-2-(\d+)\/(\d{4})$/.exec(r.id);
    invariant(m && m[1]===city.pncpOrg && Number.isSafeInteger(Number(m[2])) &&
      r.url===`https://pncp.gov.br/app/contratos/${m[1]}/${m[3]}/${Number(m[2])}`);
    invariant(isISODate(r.published) && r.published>=data.start && r.published<=data.end &&
      typeof r.title==="string" && r.title.length>0 && r.title.length<=1200 && (r.amount===null || Number.isSafeInteger(r.amount)));
  }
  return data;
}

const cache = new Map<string,()=>unknown>();
function store<T>(file:string, validator:(raw:unknown)=>T):T|null {
  let read=cache.get(file);
  if(!read) {
    let fallback:T|null=null;
    try {
      fallback=validator(JSON.parse(readFileSync(path.join(process.cwd(),"data/municipal-accounts",file),"utf8")));
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error;
    }
    read=refreshedSnapshot(file,fallback,validator,()=>process.env.MUNICIPAL_REFRESH_DIR||"/data/municipal-accounts-refresh");
    cache.set(file,read);
  }
  return read() as T|null;
}

export const getMunicipalFiscal = (city:Municipality) => store(city.code+"-fiscal.json",raw=>validateMunicipalFiscal(raw,city));
export const getMunicipalProcurement = (city:Municipality) => store(city.code+"-contracts.json",raw=>validateMunicipalProcurement(raw,city));
