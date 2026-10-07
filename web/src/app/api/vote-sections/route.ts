import { NextResponse } from "next/server";
import {createHash} from "node:crypto";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { cached, cacheResult } from "@/lib/platform/store";
import { runDatabaseWorker } from "@/lib/database-worker";

export const runtime = "nodejs";

type VoteSectionsPage={ sections: import("@/lib/queries").CandidateVoteSection[]; total: number; pageSize: number };
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
  const fingerprint=databaseFingerprint();
  const cacheKey=`derived:vote-sections:v1:${createHash("sha256").update(`${fingerprint}:${historyId}:${page}:${trimmedQuery}`).digest("hex")}`;
  let result=readPageCache(cacheKey)??cached<VoteSectionsPage>(cacheKey,PAGE_CACHE_TTL_MS);
  if(!result){
    try {
      result=await runDatabaseWorker<VoteSectionsPage>("vote-sections-worker.cjs",{
        databasePath: databasePath(), historyId, page, query: trimmedQuery,
      },{signal:request.signal,priority:5,lane:"interactive"});
    } catch(error) {
      if(request.signal.aborted||(error instanceof Error&&error.name==="AbortError")) return new Response(null,{status:499});
      console.error("Unable to load historical vote sections:",error);
      return NextResponse.json({error:"Não foi possível carregar os locais agora."},{status:503});
    }
    if(!request.signal.aborted){
      writePageCache(cacheKey,result);
      cacheResult(cacheKey,result,"local database historical vote sections");
    }
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
