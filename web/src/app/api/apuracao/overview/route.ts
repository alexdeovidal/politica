import {selectionFromParams} from "@/lib/live-election/model";
import {getLiveOverview, SourceUnavailable, unavailableResultMessage} from "@/lib/live-election/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return Response.json(await getLiveOverview(selectionFromParams(new URL(request.url).searchParams)), {headers: {"Cache-Control": "public, max-age=0, s-maxage=5"}}); }
  catch (error) { return Response.json(unavailableResultMessage(error), {status: error instanceof SourceUnavailable ? 503 : 400, headers: {"Cache-Control": "no-store"}}); }
}
