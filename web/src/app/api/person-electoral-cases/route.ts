import { NextResponse } from "next/server";
import { getPersonElectoralCases } from "@/lib/queries";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const personId = Number(params.get("personId"));
  const requestedOffset = Number(params.get("offset") ?? "0");
  const query = (params.get("q") ?? "").slice(0, 120);

  if (
    !Number.isSafeInteger(personId) || personId <= 0 ||
    !Number.isSafeInteger(requestedOffset) || requestedOffset < 0
  ) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = getPersonElectoralCases(personId, Math.min(requestedOffset, 1_000_000), 8, query);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
