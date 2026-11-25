import "server-only";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { STATES } from "./state-accounts/registry";
import { municipalities, type Municipality } from "./municipal-registry";

type Row = [code: string, name: string, slug: string];
const overrides = new Map(municipalities.map(city => [city.code,city]));
let catalog: Municipality[] | undefined;
let active: Set<string> | undefined;
let next = 0;
export const municipalStorage = () => process.env.MUNICIPAL_REFRESH_DIR || "/data/municipal-accounts-refresh";

export function allMunicipalities(): readonly Municipality[] {
  if (!catalog) {
    const index = new Map(overrides);
    for (const s of STATES) {
      if (s.uf === "DF") continue;
      const file = path.join(process.cwd(),"data/municipal-accounts/catalog",s.uf+".json");
      const rows = JSON.parse(readFileSync(file,"utf8")) as Row[];
      for (const [code,name,slug] of rows) if (!index.has(code))
        index.set(code,{uf:s.uf,state:s.name,code,slug,name,existing:false,pncpOrg:null});
    }
    catalog = [...index.values()];
  }
  return catalog;
}

export function municipalPublishedCodes() {
  if (!active || Date.now()>=next) {
    const codes = new Set(overrides.keys());
    try {
      for (const entry of readdirSync(municipalStorage(),{withFileTypes:true})) {
        if (!entry.isFile()) continue;
        const code=/^(\d{7})-fiscal\.json$/.exec(entry.name)?.[1];
        if (code) codes.add(code);
      }
      active=codes;
    } catch(error) {
      if ((error as NodeJS.ErrnoException).code!=="ENOENT") console.error("Catálogo de contas municipais:",error);
      active=active??codes;
    }
    next=Date.now()+60_000;
  }
  return active;
}

export const publishedMunicipalities = () => allMunicipalities().filter(city=>municipalPublishedCodes().has(city.code));
export const findPublishedMunicipality = (uf:string, slug:string) => allMunicipalities().find(city=>
  !city.existing && city.uf.toLowerCase()===uf && city.slug===slug && municipalPublishedCodes().has(city.code));
