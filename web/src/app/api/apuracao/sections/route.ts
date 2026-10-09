import {rateLimit} from "@/lib/platform/store";
import {selectionFromParams} from "@/lib/live-election/model";
import {getLiveSectionVotePage} from "@/lib/live-election/sections";
import {SourceUnavailable, unavailableResultMessage} from "@/lib/live-election/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!rateLimit(request, "live-section-votes", 40)) return Response.json({error: "Muitas consultas por seção. Aguarde um minuto e tente novamente."}, {status: 429, headers: {"Cache-Control": "no-store", "Retry-After": "60"}});
  const params = new URL(request.url).searchParams;
  const candidateId = params.get("candidato") || "";
  const page = Number(params.get("pagina") || 1);
  const sectionQuery = (params.get("q") || "").trim();
  if (!/^[\d-]{1,40}$/.test(candidateId) || !Number.isSafeInteger(page) || page < 1 || page > 10000 || sectionQuery.length > 20 || (sectionQuery && !/^(?:se[cç][aã]o\s*)?\d{1,4}$/i.test(sectionQuery))) return Response.json({error: "Informe o número da seção, por exemplo 593."}, {status: 400, headers: {"Cache-Control": "no-store"}});
  try {
    const payload = await getLiveSectionVotePage(selectionFromParams(params), candidateId, page, sectionQuery);
    return Response.json(payload, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    const body = unavailableResultMessage(error);
    return Response.json(body, {status: error instanceof SourceUnavailable ? 503 : 400, headers: {"Cache-Control": "no-store", "Retry-After": String(body.retryAfterSeconds)}});
  }
}
