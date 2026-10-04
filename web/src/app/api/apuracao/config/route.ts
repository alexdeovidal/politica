import {getLiveConfig, publicConfig, SourceUnavailable, unavailableResultMessage} from "@/lib/live-election/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, turn = Number(params.get("turno") || 1), state = (params.get("uf") || "br").toLowerCase();
  if (![1, 2].includes(turn) || !/^(br|[a-z]{2})$/.test(state)) return Response.json({error: "Consulta inválida."}, {status: 400});
  try { return Response.json(publicConfig(await getLiveConfig(turn), state), {headers: {"Cache-Control": "public, max-age=0, s-maxage=60"}}); }
  catch (error) { return Response.json(unavailableResultMessage(error), {status: error instanceof SourceUnavailable ? 503 : 400, headers: {"Cache-Control": "no-store"}}); }
}
