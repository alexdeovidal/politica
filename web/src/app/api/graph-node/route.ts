import { NextResponse } from "next/server";
import { isolatedQuery } from "@/lib/isolated-query";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { cpfCnpj?: unknown } | null;
  const cpfCnpj = typeof body?.cpfCnpj === "string" ? body.cpfCnpj : "";
  try {
    return NextResponse.json(await isolatedQuery({ mode: "graph-node", cpfCnpj }, request.signal));
  } catch {
    return NextResponse.json({ error: "A consulta está ocupada. Tente novamente em instantes." }, { status: 503, headers: { "Retry-After": "2" } });
  }
}
