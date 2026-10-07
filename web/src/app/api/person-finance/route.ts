import { NextResponse } from "next/server";
import {
  getCachedPersonFinanceInsights,
  getCachedPersonFinanceSummary,
} from "@/lib/platform/person-finance";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const personId = Number(params.get("personId"));
  const yearValue = params.get("year");
  const year = yearValue === null ? undefined : Number(yearValue);
  const part = params.get("part");

  if (
    !Number.isSafeInteger(personId) || personId < 1 ||
    (year !== undefined && (!Number.isSafeInteger(year) || year < 1994 || year > 2100)) ||
    (part !== "summary" && part !== "insights")
  ) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  try {
    const result = part === "summary"
      ? await getCachedPersonFinanceSummary(personId, year)
      : await getCachedPersonFinanceInsights(personId, year);
    return NextResponse.json(result.value, {
      headers: {
        "Cache-Control": "no-store",
        "X-Snapshot-Stale": result.stale ? "1" : "0",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar os dados financeiros agora." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
