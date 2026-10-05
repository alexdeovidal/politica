import {getLiveResultSnapshot, listLiveResultSnapshots} from "@/lib/live-election/service";
import {historySelectionFromParams} from "@/lib/live-election/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const idValue = params.get("id");
  if (idValue !== null) {
    const id = Number(idValue);
    if (!/^\d+$/.test(idValue) || !Number.isSafeInteger(id) || id < 1) return Response.json({error: "Identificador de histórico inválido."}, {status: 400, headers: {"Cache-Control": "no-store"}});
    try {
      const snapshot = getLiveResultSnapshot(id);
      return snapshot ? Response.json({snapshot}, {headers: {"Cache-Control": "no-store"}}) : Response.json({error: "Este resultado não foi encontrado no histórico."}, {status: 404, headers: {"Cache-Control": "no-store"}});
    } catch {
      return Response.json({error: "Não foi possível consultar o histórico."}, {status: 503, headers: {"Cache-Control": "no-store"}});
    }
  }
  let selection: ReturnType<typeof historySelectionFromParams>;
  try {
    selection = historySelectionFromParams(params);
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Selecione um recorte eleitoral válido."}, {status: 400, headers: {"Cache-Control": "no-store"}});
  }
  try {
    return Response.json({selection, snapshots: listLiveResultSnapshots(selection)}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return Response.json({error: "Não foi possível consultar o histórico."}, {status: 503, headers: {"Cache-Control": "no-store"}});
  }
}
