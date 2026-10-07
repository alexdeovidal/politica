import { createHash } from "node:crypto";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { cached, cacheResult } from "@/lib/platform/store";
import { runDatabaseWorker } from "@/lib/database-worker";
import { normalizeName } from "@/lib/normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Geometry = { type: string; coordinates: number[][][] | number[][][][] };
type Shapes = { features: { properties: { codarea: string }; geometry: Geometry }[] };
type TerritoryRow = { state: string; label: string; votes: number; sections: number };
type TerritoryState = { state: string; votes: number };
type MunicipalityTotal = { name: string; votes: number };
type TerritoryQuery = {
  rows: TerritoryRow[];
  total: number;
  states: TerritoryState[];
  votes: number;
  municipalityTotals: MunicipalityTotal[];
};
type ShapeFeature = { state: string; label: string; code: string; municipality: boolean; d: string };
type ShapeBase = { features: ShapeFeature[]; viewBox: string; url: string };

const UF: Record<string, string> = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
};
const shapeUrl = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=minima";
const MAX_CACHE_AGE_MS = 30 * 60_000;
const territoryCache = new Map<string, { expiresAt: number; value: TerritoryQuery }>();
const shapeCache = new Map<string, Promise<ShapeBase>>();

async function official<T>(url: string): Promise<T> {
  const value = cached<T>(url, 30 * 86_400_000);
  if (value) return value;
  const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
  if (!response.ok) throw new Error(`IBGE respondeu ${response.status}.`);
  const result = await response.json() as T;
  cacheResult(url, result, url);
  return result;
}

async function baseShapes(uf: string): Promise<ShapeBase> {
  const cachedShape = shapeCache.get(uf);
  if (cachedShape) return cachedShape;

  const flight = (async () => {
    const code = Object.entries(UF).find(([, state]) => state === uf)?.[0];
    const url = code
      ? `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${code}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima`
      : shapeUrl;
    const townsUrl = code ? `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios` : "";
    const [geo, towns] = await Promise.all([
      official<Shapes>(url),
      code ? official<{ id: number; nome: string }[]>(townsUrl) : Promise.resolve([]),
    ]);
    const names = new Map(towns.map((town) => [String(town.id), town.nome]));
    const points: number[][] = [];
    const features = geo.features.map((feature) => {
      const polygons = feature.geometry.type === "MultiPolygon"
        ? feature.geometry.coordinates as number[][][][]
        : [feature.geometry.coordinates as number[][][]];
      const label = code ? names.get(feature.properties.codarea) || feature.properties.codarea : UF[feature.properties.codarea];
      const d = polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y], index) => {
        const px = (x + 75) * 11;
        const py = (7 - y) * 11;
        points.push([px, py]);
        return `${index ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`;
      }).join(" ") + "Z").join(" ")).join(" ");
      return { state: code ? uf : UF[feature.properties.codarea], label, code: feature.properties.codarea, municipality: !!code, d };
    });
    const bounds = points.reduce(
      (result, [x, y]) => [Math.min(result[0], x), Math.min(result[1], y), Math.max(result[2], x), Math.max(result[3], y)],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    let viewBox = "0 0 490 470";
    if (code && points.length) viewBox = `${bounds[0] - 2} ${bounds[1] - 2} ${bounds[2] - bounds[0] + 4} ${bounds[3] - bounds[1] + 4}`;
    return { features, viewBox, url };
  })();
  shapeCache.set(uf, flight);
  try {
    return await flight;
  } catch (error) {
    shapeCache.delete(uf);
    throw error;
  }
}

function readTerritoryCache(key: string): TerritoryQuery | null {
  const entry = territoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    territoryCache.delete(key);
    return null;
  }
  territoryCache.delete(key);
  territoryCache.set(key, entry);
  return entry.value;
}

function writeTerritoryCache(key: string, value: TerritoryQuery) {
  territoryCache.delete(key);
  territoryCache.set(key, { expiresAt: Date.now() + MAX_CACHE_AGE_MS, value });
  while (territoryCache.size > 300) territoryCache.delete(territoryCache.keys().next().value!);
  cacheResult(key, value, "local database vote territory aggregates");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("historyId"));
  const page = Number(params.get("page") || 1);
  const group = params.get("group") || "municipality";
  const uf = params.get("uf") || "";
  const q = (params.get("q") || "").slice(0, 120);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(page) || page < 1 || page > 10_000 || !["municipality", "zone", "polling"].includes(group) || (uf && !/^[A-Z]{2}$/.test(uf))) {
    return Response.json({ error: "Consulta inválida." }, { status: 400 });
  }

  const fingerprint = databaseFingerprint();
  const key = `derived:vote-territories:v1:${createHash("sha256").update(`${fingerprint}:${id}:${page}:${group}:${uf}:${q}`).digest("hex")}`;
  let result = readTerritoryCache(key) || cached<TerritoryQuery>(key, MAX_CACHE_AGE_MS);
  if (!result) {
    try {
      result = await runDatabaseWorker<TerritoryQuery>("vote-territories-worker.cjs", {
        databasePath: databasePath(), historyId: id, page, group, state: uf, query: q,
      }, { signal: request.signal, priority: 5, lane: "interactive" });
      if (!request.signal.aborted) writeTerritoryCache(key, result);
    } catch (error) {
      if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) return new Response(null, { status: 499 });
      console.error("Unable to load vote territories:", error);
      return Response.json({ error: "Não foi possível carregar a distribuição territorial agora." }, { status: 503 });
    }
  }

  let map: ShapeBase = { features: [], viewBox: "0 0 490 470", url: shapeUrl };
  try {
    // Geography is supplemental. Parallel, bounded fetches keep a slow IBGE response from delaying the query indefinitely.
    map = await baseShapes(uf);
  } catch {
    // Keep the textual results available when the map source is unavailable.
  }
  const municipalityVotes = new Map(result.municipalityTotals.map((item) => [item.name, item.votes]));
  const features = map.features.map((feature) => ({
    ...feature,
    votes: feature.municipality ? municipalityVotes.get(normalizeName(feature.label)) || 0 : undefined,
  }));
  return Response.json({ rows: result.rows, total: result.total, page, states: result.states, shapes: features, viewBox: map.viewBox, votes: result.votes, shapeSource: map.url }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
  });
}
