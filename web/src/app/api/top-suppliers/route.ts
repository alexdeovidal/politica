import { NextResponse } from "next/server";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { cached, cacheResult } from "@/lib/platform/store";
import { runDatabaseWorker } from "@/lib/database-worker";
import type { TopSupplier } from "@/lib/queries";

export const runtime = "nodejs";

type StoredRanking = { fingerprint: string; suppliers: TopSupplier[] };
const inFlight = new Map<string, Promise<TopSupplier[]>>();

async function suppliersFor(year: number | null, fingerprint: string): Promise<TopSupplier[]> {
  const key = `derived:top-suppliers:v1:${year ?? "all"}`;
  const stored = cached<StoredRanking>(key, 365 * 24 * 60 * 60 * 1000);
  if (stored?.fingerprint === fingerprint && Array.isArray(stored.suppliers)) return stored.suppliers;

  const flightKey = `${fingerprint}:${year ?? "all"}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;

  const flight = runDatabaseWorker<{ suppliers: TopSupplier[] }>("top-suppliers-worker.cjs", {
    databasePath: databasePath(),
    year,
  }).then(({ suppliers }) => {
    cacheResult(key, { fingerprint, suppliers } satisfies StoredRanking, "local database supplier ranking snapshot");
    return suppliers;
  }).finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, flight);
  return flight;
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
