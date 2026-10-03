import { NextResponse } from "next/server";
import { searchPeople,getPersonCandidacies } from "@/lib/queries";

export async function GET(request: Request) {
  const params=new URL(request.url).searchParams;const q=params.get("q")??"";
  const year=Number(params.get("ano"))||undefined,office=params.get("cargo")||"",state=params.get("uf")||"",city=params.get("cidade")||"";
  const results = searchPeople(q.slice(0,120), 25,{year,office,state,city}).flatMap(r=>{if(!year&&!office&&!state&&!city)return [r];if(r.kind!=="candidato")return [];const h=getPersonCandidacies(r.personId).find(h=>(!year||h.year===year)&&(!office||h.office===office)&&(!state||h.state===state)&&(!city||h.municipality===city));return h?[{...r,latestYear:h.year,latestOffice:h.office,latestState:h.state,latestPartyAbbr:h.partyAbbr,latestResult:h.result}]:[];});
  return NextResponse.json({ results });
}
