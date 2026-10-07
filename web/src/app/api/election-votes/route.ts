import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { rateLimit, cached, cacheResult } from "@/lib/platform/store";
import { runDatabaseWorker } from "@/lib/database-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VoteFilters = {
  year?: number;
  round?: number;
  officeCode?: string;
  state?: string;
  municipalityCode?: string;
  zone?: string;
  section?: string;
  place?: string;
  party?: string;
  q?: string;
  page?: number;
};

const CACHE_AGE_MS = 5 * 60_000;

function readFilters(params: URLSearchParams): VoteFilters {
  const rawYear = Number(params.get("ano"));
  const rawRound = Number(params.get("turno"));
  const rawPage = Number(params.get("page"));
  const bounded = (key: string, limit: number) => (params.get(key) || "").trim().slice(0, limit);
  const state = bounded("uf", 2).toUpperCase();
  return {
    year: Number.isInteger(rawYear) && rawYear >= 1994 && rawYear <= 2100 ? rawYear : undefined,
    round: rawRound === 1 || rawRound === 2 ? rawRound : undefined,
    officeCode: bounded("cargo", 4),
    state: /^[A-Z]{2}$/.test(state) ? state : "",
    municipalityCode: bounded("municipio", 12),
    zone: bounded("zona", 12),
    section: bounded("secao", 12),
    place: bounded("local", 120),
    party: bounded("partido", 24),
    q: bounded("q", 100),
    page: Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1,
  };
}

function cacheKey(value: unknown) {
  return `derived:election-votes:v1:${createHash("sha256")
    .update(JSON.stringify([databaseFingerprint(), value]))
    .digest("hex")}`;
}

async function databaseQuery<T>(
  mode: "options" | "search" | "details",
  filters: VoteFilters,
  historyIds: number[] = [],
  signal?: AbortSignal,
): Promise<T> {
  const key = cacheKey({ mode, filters, historyIds });
  const previous = cached<T>(key, CACHE_AGE_MS);
  if (previous) return previous;
  const result = await runDatabaseWorker<T>("election-votes-worker.cjs", {
    databasePath: databasePath(), mode, filters, historyIds,
  }, { signal, priority: 5, lane: "interactive" });
  if (!signal?.aborted) cacheResult(key, result, "local TSE election vote archive");
  return result;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") || "search";
  if (mode !== "options" && mode !== "search" && mode !== "details") {
    return NextResponse.json({ error: "Tipo de consulta inválido." }, { status: 400 });
  }

  const filters = readFilters(params);
  const historyIds = (params.get("ids") || "").split(",").slice(0, 3).map(Number);
  if (mode === "details" && historyIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "Candidaturas inválidas." }, { status: 400 });
  }

  try {
    const workerStartedAt = performance.now();
    const data = await databaseQuery(mode, filters, historyIds, request.signal);
    const workerDuration = performance.now() - workerStartedAt;
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": mode === "options"
          ? "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600"
          : "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
        "Server-Timing": `handler;dur=${(performance.now() - startedAt).toFixed(1)}, db-votes;dur=${workerDuration.toFixed(1)}`,
      },
    });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return new Response(null, { status: 499 });
    }
    console.error("Unable to load historical election votes:", error);
    return NextResponse.json({ error: "Não foi possível consultar os votos históricos agora." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Análise por IA indisponível no servidor." }, { status: 503 });

  let payload: { ids?: unknown; filters?: Record<string, unknown> };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const ids = Array.isArray(payload.ids)
    ? [...new Set(payload.ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 3)
    : [];
  if (!ids.length) return NextResponse.json({ error: "Selecione uma candidatura para analisar." }, { status: 400 });

  const source = new URLSearchParams();
  const filter = payload.filters || {};
  for (const [key, param] of [["year", "ano"], ["round", "turno"], ["officeCode", "cargo"], ["state", "uf"], ["municipalityCode", "municipio"], ["zone", "zona"], ["section", "secao"], ["place", "local"]] as const) {
    const value = filter[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) source.set(param, String(value).slice(0, 120));
  }
  const filters = readFilters(source);
  const key = cacheKey({ mode: "ai-analysis", filters, ids });
  const previous = cached<{ analysis: string }>(key, 6 * 60 * 60_000);
  if (previous) return NextResponse.json(previous);
  if (!rateLimit(request, "election-vote-ai", 3)) {
    return NextResponse.json({ error: "Limite de análises atingido. Aguarde um minuto para tentar novamente." }, { status: 429 });
  }

  try {
    const details = await databaseQuery<{ records: Array<Record<string, unknown>> }>("details", filters, ids, request.signal);
    if (!details.records.length) return NextResponse.json({ error: "Não há resultados suficientes para esta análise." }, { status: 404 });
    const context = details.records.map(record => ({
      candidatura: record.name,
      eleição: record.year,
      turno: record.round,
      cargo: record.office,
      estado: record.state,
      partido: record.party,
      votos_no_recorte: record.votes,
      percentual_sobre_votos_nominais_identificados: Number(Number(record.voteShare).toFixed(2)),
      posição_geral_no_recorte: record.rank,
      posição_no_partido_no_recorte: record.partyRank,
      principais_municípios: record.municipalityResults,
      evolução_por_eleição: record.timeline,
    }));
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        max_tokens: 550,
        messages: [
          { role: "system", content: "Você explica dados eleitorais públicos do Brasil com cautela. Escreva em português claro, em até quatro tópicos curtos. Use somente os números recebidos; descreva diferenças e padrões sem atribuir causas, intenção, fraude, mérito ou irregularidade. Não trate percentual de votos nominais identificados como percentual oficial de votos válidos. Avise que a análise resume a base consultada e que os registros oficiais do TSE são a referência." },
          { role: "user", content: `Resuma os resultados desta consulta. O conteúdo abaixo contém apenas agregados públicos do TSE:\n${JSON.stringify(context)}` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error("DeepSeek election analysis returned", response.status);
      return NextResponse.json({ error: "A análise por IA não respondeu agora. Os filtros e resultados seguem disponíveis." }, { status: 502 });
    }
    const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const analysis = typeof body.choices?.[0]?.message?.content === "string" ? body.choices[0].message.content.trim().slice(0, 4000) : "";
    if (!analysis) return NextResponse.json({ error: "A análise por IA não retornou texto." }, { status: 502 });
    cacheResult(key, { analysis }, "derived public election analysis");
    return NextResponse.json({ analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("Unable to generate election analysis:", error);
    return NextResponse.json({ error: "A análise por IA está temporariamente indisponível. Os filtros e resultados seguem disponíveis." }, { status: 502 });
  }
}
