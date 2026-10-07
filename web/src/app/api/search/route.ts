import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { runPersistentSearchWorker } from "@/lib/database-worker";
import type { SearchResult } from "@/lib/queries";

const SEARCH_CACHE_TTL_MS = 5 * 60_000;
const searchCache = new Map<string, { expiresAt: number; results: SearchResult[] }>();

type SearchWorkerResponse = { results: SearchResult[] };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const year = Number(params.get("ano")) || undefined;
  const office = params.get("cargo") || "";
  const state = params.get("uf") || "";
  const city = params.get("cidade") || "";
  const boundedQuery = q.slice(0, 120);
  if (boundedQuery.length < 2) {
    return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } });
  }
  const cacheKey = createHash("sha256")
    .update(JSON.stringify([boundedQuery.toLocaleLowerCase("pt-BR"), year, office, state, city]))
    .digest("hex");
  const digits = q.replace(/\D/g, "");
  const privateQuery = digits.length >= 6 && /^[\d./\-\s]+$/.test(q);
  const previous = privateQuery ? undefined : searchCache.get(cacheKey);
  let results: SearchResult[];

  if (previous && previous.expiresAt > Date.now()) {
    searchCache.delete(cacheKey);
    searchCache.set(cacheKey, previous);
    results = previous.results;
  } else {
    if (previous) searchCache.delete(cacheKey);
    try {
      const response = await runPersistentSearchWorker<SearchWorkerResponse>({
        query: boundedQuery,
        limit: 25,
        filters: { year, office, state, city },
      }, { signal: request.signal });
      results = response.results;
    } catch (error) {
      if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        return new Response(null, { status: 499 });
      }
      throw error;
    }
    if (!privateQuery) {
      searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results });
      while (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value!);
    }
  }

  const cacheControl = privateQuery ? "private, no-store" : "public, max-age=0, s-maxage=300, stale-while-revalidate=600";
  return NextResponse.json({ results }, { headers: { "Cache-Control": cacheControl } });
}
