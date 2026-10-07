import { NextResponse } from "next/server";
import {createHash} from "node:crypto";
import { getPersonVoteSectionsPage } from "@/lib/queries";

type VoteSectionsPage=ReturnType<typeof getPersonVoteSectionsPage>;
const PAGE_CACHE_TTL_MS=30*60_000;
const pageCache=new Map<string,{expiresAt:number;value:VoteSectionsPage}>();

function readPageCache(key:string):VoteSectionsPage|null{
  const entry=pageCache.get(key);
  if(!entry)return null;
  if(entry.expiresAt<=Date.now()){pageCache.delete(key);return null;}
  pageCache.delete(key);pageCache.set(key,entry);
  return entry.value;
}

function writePageCache(key:string,value:VoteSectionsPage){
  pageCache.delete(key);pageCache.set(key,{expiresAt:Date.now()+PAGE_CACHE_TTL_MS,value});
  while(pageCache.size>500)pageCache.delete(pageCache.keys().next().value!);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const historyId = Number(params.get("historyId"));
  const requestedPage = Number(params.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  const query = params.get("q") ?? "";

  if (!Number.isSafeInteger(historyId) || historyId <= 0) {
    return NextResponse.json({ sections: [], total: 0, pageSize: 25 }, { status: 400 });
  }

  const trimmedQuery=query.trim().slice(0,100);
  const cacheKey=createHash("sha256").update(`${historyId}:${page}:${trimmedQuery}`).digest("hex");
  let result=readPageCache(cacheKey);
  if(!result){
    result=getPersonVoteSectionsPage(historyId,page,trimmedQuery);
    writePageCache(cacheKey,result);
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
