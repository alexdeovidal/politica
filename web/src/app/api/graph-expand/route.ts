import { NextResponse } from "next/server";
import { isolatedQuery } from "@/lib/isolated-query";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { cpfCnpj?: unknown;year?:unknown;limit?:unknown;relation?:unknown } | null;
  const cpfCnpj = typeof body?.cpfCnpj === "string" ? body.cpfCnpj : "";
  const year=Number(body?.year)||undefined;const requestedLimit=Number(body?.limit)||80;if(!Number.isSafeInteger(requestedLimit))return NextResponse.json({error:"Limite inválido"},{status:400});const limit=Math.min(400,Math.max(20,requestedLimit));
  if(year&&(!Number.isSafeInteger(year)||year<1994||year>2100))return NextResponse.json({error:"Ano inválido"},{status:400});
  const relation=typeof body?.relation==="string"?body.relation:"";if(!["","donation","payment","ownership","administration","possibleidentity"].includes(relation))return NextResponse.json({error:"Relação inválida"},{status:400});
  try {
    return NextResponse.json(await isolatedQuery({ mode: "graph-expand", cpfCnpj, limit, year, relation }, request.signal));
  } catch {
    return NextResponse.json({ error: "A consulta está ocupada. Tente novamente em instantes." }, { status: 503, headers: { "Retry-After": "2" } });
  }
}
