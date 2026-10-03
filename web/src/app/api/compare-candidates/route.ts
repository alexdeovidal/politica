import { getCandidateComparison } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const year = params.has("ano") ? Number(params.get("ano")) : undefined;
  if(year !== undefined && (!Number.isInteger(year) || year < 1994 || year > 2100)) return Response.json({error:"Ano inválido."},{status:400});
  const rawIds = params.get("ids") ?? "";
  const ids = rawIds.split(",").slice(0, 3).map((value) => Number(value));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return Response.json({ error: "IDs inválidos." }, { status: 400 });
  }

  return Response.json({ records: getCandidateComparison(ids,year) });
}
