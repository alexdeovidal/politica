import { NextResponse } from "next/server";
import { isolatedQuery } from "@/lib/isolated-query";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { newId?: unknown; existingIds?: unknown;year?:unknown }
    | null;
  const newId = typeof body?.newId === "string" ? body.newId : "";
  const existingIds = Array.isArray(body?.existingIds)
    ? body.existingIds.filter((v): v is string => typeof v === "string")
    : [];
  try {
    return NextResponse.json(await isolatedQuery({ mode: "graph-paths", newId, existingIds: existingIds.slice(0,200), year: Number.isSafeInteger(Number(body?.year)) && Number(body?.year)>=1994 && Number(body?.year)<=2100 ? Number(body?.year) : undefined }, request.signal));
  } catch {
    return NextResponse.json({ error: "A consulta está ocupada. Tente novamente em instantes." }, { status: 503, headers: { "Retry-After": "2" } });
  }
}
