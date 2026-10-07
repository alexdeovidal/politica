import { NextResponse } from "next/server";
import {createHash} from "node:crypto";
import { searchPeople,getPersonCandidacies } from "@/lib/queries";

const SEARCH_CACHE_TTL_MS=5*60_000;
const searchCache=new Map<string,{expiresAt:number;results:unknown}>();

export async function GET(request: Request) {
  const params=new URL(request.url).searchParams;const q=params.get("q")??"";
  const year=Number(params.get("ano"))||undefined,office=params.get("cargo")||"",state=params.get("uf")||"",city=params.get("cidade")||"";
  const boundedQuery=q.slice(0,120);
  const cacheKey=createHash("sha256").update(JSON.stringify([boundedQuery.toLocaleLowerCase("pt-BR"),year,office,state,city])).digest("hex");
  const digits=q.replace(/\D/g,"");
  const privateQuery=digits.length>=6&&/^[\d./\-\s]+$/.test(q);
  const previous=privateQuery?undefined:searchCache.get(cacheKey);
  let results:unknown;
  if(previous&&previous.expiresAt>Date.now()){
    searchCache.delete(cacheKey);searchCache.set(cacheKey,previous);results=previous.results;
  }else{
    if(previous)searchCache.delete(cacheKey);
    results=searchPeople(boundedQuery,25,{year,office,state,city}).flatMap(r=>{if(!year&&!office&&!state&&!city)return [r];if(r.kind!=="candidato")return [];const h=getPersonCandidacies(r.personId).find(h=>(!year||h.year===year)&&(!office||h.office===office)&&(!state||h.state===state)&&(!city||h.municipality===city));return h?[{...r,latestYear:h.year,latestOffice:h.office,latestState:h.state,latestPartyAbbr:h.partyAbbr,latestResult:h.result}]:[];});
    if(!privateQuery){
      searchCache.set(cacheKey,{expiresAt:Date.now()+SEARCH_CACHE_TTL_MS,results});
      while(searchCache.size>500)searchCache.delete(searchCache.keys().next().value!);
    }
  }
  const cacheControl=privateQuery?"private, no-store":"public, max-age=0, s-maxage=300, stale-while-revalidate=600";
  return NextResponse.json({ results },{headers:{"Cache-Control":cacheControl}});
}
