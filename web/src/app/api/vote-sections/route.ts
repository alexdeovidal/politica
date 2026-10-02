import { NextResponse } from "next/server";
import { getPersonVoteSectionsPage } from "@/lib/queries";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const historyId = Number(params.get("historyId"));
  const requestedPage = Number(params.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  const query = params.get("q") ?? "";

  if (!Number.isSafeInteger(historyId) || historyId <= 0) {
    return NextResponse.json({ sections: [], total: 0, pageSize: 25 }, { status: 400 });
  }

  return NextResponse.json(getPersonVoteSectionsPage(historyId, page, query), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
