import { NextResponse } from "next/server";
import { databaseFingerprint, databaseFingerprintsMatch, databasePath } from "@/lib/db";
import { cached, cacheCollectedAt, cacheResult } from "@/lib/platform/store";
import { runDatabaseWorker } from "@/lib/database-worker";
import { getTseUpdateStatus } from "@/lib/tse-update-status";

export const runtime = "nodejs";

type HomeStats = {
  people: number;
  candidacies: number;
  campaignOrgs: number;
  socialMedia: number;
  donationsTotalCents: number;
  expensesTotalCents: number;
  years: string;
};

type HomeSummary = {
  selectedYear: number | null;
  candidacyYears: number[];
  expenseYears: number[];
  stats: HomeStats;
};

type StoredSummary = { fingerprint: string; value: HomeSummary };
const inFlight = new Map<string, Promise<HomeSummary>>();
const MAX_CACHE_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const REVALIDATE_AFTER_MS = 5 * 60 * 1000;

function refreshSummary(year: number | null, fingerprint: string, cacheKey: string, flightKey: string, preemptible = false): Promise<HomeSummary> {
  const existing = inFlight.get(flightKey);
  if (existing) return existing;

  const flight = runDatabaseWorker<HomeSummary>("home-summary-worker.cjs", {
    databasePath: databasePath(),
    year,
  }, { priority: preemptible ? -10 : 0, preemptible }).then((value) => {
    cacheResult(cacheKey, { fingerprint, value } satisfies StoredSummary, "local database home summary snapshot");
    return value;
  }).finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, flight);
  return flight;
}

async function summaryFor(year: number | null, fingerprint: string): Promise<HomeSummary> {
  const yearKey = year ?? 0;
  const cacheKey = `derived:home-summary:v1:${yearKey}`;
  const stored = cached<StoredSummary>(cacheKey, MAX_CACHE_AGE_MS);
  const flightKey = `${yearKey}`;
  if (stored?.value) {
    const updatedAt = cacheCollectedAt(cacheKey);
    const cacheAge = updatedAt ? Date.now() - Date.parse(updatedAt) : Number.POSITIVE_INFINITY;
    const dataChanged = !databaseFingerprintsMatch(stored.fingerprint, fingerprint);
    if (!dataChanged || cacheAge < REVALIDATE_AFTER_MS) return stored.value;

    // WAL writes can change the database fingerprint many times per minute.
    // Serve the last complete snapshot immediately and refresh it in the background.
    void refreshSummary(year, fingerprint, cacheKey, flightKey, true).catch((error) => {
      console.error("Unable to refresh home summary:", error);
    });
    return stored.value;
  }

  return refreshSummary(year, fingerprint, cacheKey, flightKey);
}

export async function GET(request: Request) {
  const yearParam = new URL(request.url).searchParams.get("ano");
  const parsedYear = yearParam ? Number(yearParam) : null;
  if (parsedYear !== null && !Number.isInteger(parsedYear)) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }

  try {
    const [summary, tseUpdateStatus] = await Promise.all([
      summaryFor(parsedYear, databaseFingerprint()),
      Promise.resolve(getTseUpdateStatus()),
    ]);
    return NextResponse.json({ ...summary, tseUpdateStatus }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("Unable to load home summary:", error);
    return NextResponse.json({ error: "Não foi possível carregar os indicadores agora." }, { status: 503 });
  }
}
