import {rateLimit} from "@/lib/platform/store";
import {selectionFromParams} from "@/lib/live-election/model";
import {getLiveSectionVotePage, LocalSectionDatabaseUnavailable} from "@/lib/live-election/sections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const candidateId = params.get("candidato") || "";
  const page = Number(params.get("pagina") || 1);
  const sectionQuery = (params.get("q") || "").trim();
  const sectionFilter = (params.get("secao") || "").trim();
  if (!/^[\d-]{1,40}$/.test(candidateId) || !Number.isSafeInteger(page) || page < 1 || page > 10000 || sectionQuery.length > 100 || sectionFilter && !/^\d{1,4}$/.test(sectionFilter)) return Response.json({error: "Pesquise pelo nome da escola, endereço ou número da seção."}, {status: 400, headers: {"Cache-Control": "no-store"}});
  if (!rateLimit(request, "live-section-votes", 180)) return Response.json({error: "Muitas consultas em pouco tempo. Aguarde alguns instantes e tente novamente."}, {status: 429, headers: {"Cache-Control": "no-store", "Retry-After": "60"}});
  try {
    const payload = await getLiveSectionVotePage(selectionFromParams(params), candidateId, page, sectionQuery, sectionFilter);
    return Response.json(payload, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    const status = error instanceof LocalSectionDatabaseUnavailable ? 503 : 400;
    return Response.json({error: error instanceof Error ? error.message : "Consulta inválida."}, {status, headers: {"Cache-Control": "no-store", ...(status === 503 ? {"Retry-After": "30"} : {})}});
  }
}
