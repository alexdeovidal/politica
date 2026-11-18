import { databasePath } from "@/lib/db";
import { runDatabaseWorker } from "@/lib/database-worker";
import { activeStates } from "@/lib/state-accounts/registry";

export const SITE_ORIGIN = "https://politica007.com.br";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_BUDGET = 12 * 1024 * 1024;

type SitemapEntry = { path: string; lastModified?: string };
type SitemapIndex = { politicianBuckets: number[]; newsYears: number[] };
const cache = new Map<string, { xml: string; expiresAt: number; bytes: number }>();
const inFlight = new Map<string, Promise<string>>();
let cacheBytes = 0;

export const STATIC_SITEMAP_PATHS = [
  "/", "/news", "/apuracao", "/apuracao/historico", "/votos", "/grafo",
  "/ranking", "/contas-do-municipio/caldas-novas", "/contas-do-estado",
  ...activeStates().map(state => `/contas-do-estado/${state.slug}`), "/emendas", "/conexoes",
  "/redes", "/explorar", "/fontes", "/privacidade", "/comparar", "/sinais/doacao-circular",
  "/sinais/despesa-desproporcional", "/sinais/socio-fornecedor", "/sinais/discurso",
] as const;

function xmlEscape(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export function sitemapUrlset(entries: readonly SitemapEntry[]) {
  return `${XML_DECLARATION}\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${entries.map(entry => `  <url><loc>${xmlEscape(SITE_ORIGIN + entry.path)}</loc>${entry.lastModified ? `<lastmod>${xmlEscape(entry.lastModified)}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
}

async function cachedXml(key: string, build: () => Promise<string>) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, existing);
    return existing.xml;
  }
  if (existing) { cache.delete(key); cacheBytes -= existing.bytes; }
  const flight = inFlight.get(key);
  if (flight) return flight;
  const pending = build().then(xml => {
    const bytes = Buffer.byteLength(xml, "utf8");
    if (bytes <= CACHE_BUDGET) {
      while ((cacheBytes + bytes > CACHE_BUDGET || cache.size >= 64) && cache.size) {
        const oldest = cache.keys().next().value!;
        cacheBytes -= cache.get(oldest)!.bytes;
        cache.delete(oldest);
      }
      cache.set(key, { xml, bytes, expiresAt: Date.now() + CACHE_TTL });
      cacheBytes += bytes;
    }
    return xml;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

function worker<T>(data: Record<string, unknown>, signal?: AbortSignal) {
  return runDatabaseWorker<T>("seo-sitemap-worker.cjs", { databasePath: databasePath(), ...data }, { priority: -20, lane: "bulk", signal });
}

export function getSitemapIndex(signal?: AbortSignal) {
  return cachedXml("index", async () => {
    const { politicianBuckets, newsYears } = await worker<SitemapIndex>({ mode: "index" }, signal);
    const paths = ["/sitemaps/pages.xml", ...politicianBuckets.map(bucket => `/sitemaps/politicians-${bucket}.xml`), ...newsYears.map(year => `/sitemaps/news-${year}.xml`)];
    if (paths.length > 50000) throw new Error("Sitemap index exceeds the protocol URL limit");
    return `${XML_DECLARATION}\n<sitemapindex xmlns="${SITEMAP_NAMESPACE}">\n${paths.map(path => `  <sitemap><loc>${SITE_ORIGIN}${path}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
  });
}

export async function getSitemapFile(file: string, signal?: AbortSignal): Promise<string | null> {
  if (file === "pages.xml") return sitemapUrlset(STATIC_SITEMAP_PATHS.map(path => ({ path })));
  const politicians = /^politicians-(0|[1-9]\d{0,6})\.xml$/.exec(file);
  const news = /^news-(20\d{2}|2100)\.xml$/.exec(file);
  if (!politicians && !news) return null;
  if (politicians && Number(politicians[1]) > 1000000) return null;
  const xml = await cachedXml(file, async () => {
    const entries = await worker<SitemapEntry[]>(politicians ? { mode: "politicians", bucket: Number(politicians[1]) } : { mode: "news", year: Number(news![1]) }, signal);
    return entries.length ? sitemapUrlset(entries) : "";
  });
  return xml || null;
}

export function sitemapResponse(xml: string) {
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600", "X-Content-Type-Options": "nosniff" } });
}

export function sitemapUnavailable(error: unknown) {
  console.error("Unable to serve sitemap:", error);
  return new Response("Sitemap temporariamente indisponível. Tente novamente em alguns minutos.\n", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "300" } });
}
