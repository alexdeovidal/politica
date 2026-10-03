import { NextResponse } from "next/server";
import { getGraphPaths } from "@/lib/queries";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { newId?: unknown; existingIds?: unknown;year?:unknown }
    | null;
  const newId = typeof body?.newId === "string" ? body.newId : "";
  const existingIds = Array.isArray(body?.existingIds)
    ? body.existingIds.filter((v): v is string => typeof v === "string")
    : [];
  return NextResponse.json(getGraphPaths(newId, existingIds.slice(0,200),Number.isSafeInteger(Number(body?.year))&&Number(body?.year)>=1994&&Number(body?.year)<=2100?Number(body?.year):undefined));
}
