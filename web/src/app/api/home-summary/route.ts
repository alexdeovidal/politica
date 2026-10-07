import { NextResponse } from "next/server";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { cached, cacheResult } from "@/lib/platform/store";
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

async function summaryFor(year: number | null, fingerprint: string): Promise<HomeSummary> {
  const yearKey = year ?? 0;
  const cacheKey = `derived:home-summary:v1:${yearKey}`;
  const stored = cached<StoredSummary>(cacheKey, 365 * 24 * 60 * 60 * 1000);
  if (stored?.fingerprint === fingerprint && stored.value) return stored.value;

  const flightKey = `${fingerprint}:${yearKey}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;

  const flight = runDatabaseWorker<HomeSummary>("home-summary-worker.cjs", {
    databasePath: databasePath(),
    year,
  }).then((value) => {
    cacheResult(cacheKey, { fingerprint, value } satisfies StoredSummary, "local database home summary snapshot");
    return value;
  }).finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, flight);
  return flight;
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
