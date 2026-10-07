import { NextResponse } from "next/server";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { cached, cacheCollectedAt, cacheResult } from "@/lib/platform/store";
import { runDatabaseWorker } from "@/lib/database-worker";
import type { TopSupplier } from "@/lib/queries";

export const runtime = "nodejs";

type StoredRanking = { fingerprint: string; suppliers: TopSupplier[] };
const inFlight = new Map<string, Promise<TopSupplier[]>>();
const MAX_CACHE_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const REVALIDATE_AFTER_MS = 5 * 60 * 1000;

function refreshSuppliers(year: number | null, fingerprint: string, key: string, flightKey: string, preemptible = false): Promise<TopSupplier[]> {
  const existing = inFlight.get(flightKey);
  if (existing) return existing;

  const flight = runDatabaseWorker<{ suppliers: TopSupplier[] }>("top-suppliers-worker.cjs", {
    databasePath: databasePath(),
    year,
  }, { priority: preemptible ? -10 : 0, preemptible }).then(({ suppliers }) => {
    cacheResult(key, { fingerprint, suppliers } satisfies StoredRanking, "local database supplier ranking snapshot");
    return suppliers;
  }).finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, flight);
  return flight;
}

async function suppliersFor(year: number | null, fingerprint: string): Promise<TopSupplier[]> {
  const key = `derived:top-suppliers:v1:${year ?? "all"}`;
  const stored = cached<StoredRanking>(key, MAX_CACHE_AGE_MS);
  const flightKey = `${year ?? "all"}`;
  if (stored && Array.isArray(stored.suppliers)) {
    const updatedAt = cacheCollectedAt(key);
    const cacheAge = updatedAt ? Date.now() - Date.parse(updatedAt) : Number.POSITIVE_INFINITY;
    const dataChanged = stored.fingerprint !== fingerprint;
    if (!dataChanged || cacheAge < REVALIDATE_AFTER_MS) return stored.suppliers;

    // Keep the ranking available while SQLite finishes the heavier recomputation.
    void refreshSuppliers(year, fingerprint, key, flightKey, true).catch((error) => {
      console.error("Unable to refresh supplier ranking:", error);
    });
    return stored.suppliers;
  }

  return refreshSuppliers(year, fingerprint, key, flightKey);
}

export async function GET(request: Request) {
  const yearParam = new URL(request.url).searchParams.get("year");
  const parsedYear = yearParam && yearParam !== "all" ? Number(yearParam) : null;
  if (parsedYear !== null && !Number.isInteger(parsedYear)) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }

  try {
    const suppliers = await suppliersFor(parsedYear, databaseFingerprint());
    return NextResponse.json({ suppliers }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("Unable to load supplier ranking:", error);
    return NextResponse.json({ error: "Não foi possível carregar o ranking agora." }, { status: 503 });
  }
}
