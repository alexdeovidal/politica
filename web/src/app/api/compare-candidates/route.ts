import { getCandidateComparison } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const rawIds = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = rawIds.split(",").slice(0, 3).map((value) => Number(value));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return Response.json({ error: "IDs inválidos." }, { status: 400 });
  }

  return Response.json({ records: getCandidateComparison(ids) });
}
