/** Only these section names, never the visitor's input, may leave the portal. */
export const ANALYTICS_ORIGIN = "https://politica007.com.br";
export const ANALYTICS_DATA_LAYER = "politica007AnalyticsLayer";
export const ANALYTICS_CONSENT_KEY = "politica007:analytics-consent:v1";
export const ANALYTICS_PREFERENCES_EVENT = "politica007:analytics-preferences";

export type AnalyticsConsent = "granted" | "denied";
export type AnalyticsPage = { path: string; title: string };

const sections: Record<string, string> = {
  "/": "Visão geral",
  "/news": "Notícias",
  "/apuracao": "Apuração eleitoral",
  "/apuracao/historico": "Histórico da apuração",
  "/votos": "Histórico eleitoral",
  "/grafo": "Relações entre pessoas e empresas",
  "/ranking": "Patrimônio declarado",
  "/contas-do-municipio/caldas-novas": "Contas do Município",
  "/emendas": "Emendas parlamentares",
  "/conexoes": "Conexões",
  "/redes": "Publicações e temas",
  "/ficha-publica": "Minha ficha pública",
  "/explorar": "Minha cidade e candidaturas",
  "/acompanhar": "Minhas consultas",
  "/fontes": "Fontes e atualização",
  "/comparar": "Comparar candidaturas",
  "/relacao": "Relações",
  "/sinais/doacao-circular": "Ciclos de recursos eleitorais",
  "/sinais/despesa-desproporcional": "Despesas fora do padrão",
  "/sinais/socio-fornecedor": "Sócios de fornecedores",
  "/sinais/discurso": "Atividade em redes sociais",
  "/sinais/analise-ia": "Análise de registros",
  "/privacidade": "Privacidade e medição de acesso",
};

const groupedRoutes: ReadonlyArray<[RegExp, AnalyticsPage]> = [
  [/^\/cpf\/[^/]+$/, { path: "/cpf/perfil", title: "Consulta de pessoa física" }],
  [/^\/cnpj\/[^/]+$/, { path: "/cnpj/perfil", title: "Consulta de empresa" }],
  [/^\/politico\/[^/]+\/relatorio-trajetoria$/, { path: "/politico/perfil/relatorio-trajetoria", title: "Relatório de trajetória" }],
  [/^\/politico\/[^/]+$/, { path: "/politico/perfil", title: "Perfil de candidatura" }],
  [/^\/socios\/[^/]+$/, { path: "/socios/perfil", title: "Quadro societário" }],
  [/^\/news\/\d{4}-\d{2}-\d{2}\/[^/]+$/, { path: "/news/materia", title: "Matéria sobre dados públicos" }],
  [/^\/news\/\d{4}-\d{2}-\d{2}$/, { path: "/news/arquivo", title: "Arquivo de notícias" }],
  [/^\/contas-do-municipio\/caldas-novas\/[^/]+$/, { path: "/contas-do-municipio/caldas-novas/contrato", title: "Contrato municipal" }],
];

/** Query strings, hashes, and unrecognized routes are never sent to Google. */
export function analyticsNavigationKey(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  return pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
}

export function getAnalyticsPage(pathname: string): AnalyticsPage | null {
  const path = analyticsNavigationKey(pathname);
  if (!path) return null;
  if (Object.prototype.hasOwnProperty.call(sections, path)) {
    return { path, title: sections[path] };
  }
  for (const [pattern, page] of groupedRoutes) {
    if (pattern.test(path)) return { ...page };
  }
  return null;
}

const referralHosts = new Set([
  "google.com", "www.google.com", "google.com.br", "www.google.com.br",
  "bing.com", "www.bing.com", "duckduckgo.com", "www.duckduckgo.com",
  "search.yahoo.com", "br.search.yahoo.com",
  "facebook.com", "www.facebook.com", "m.facebook.com", "l.facebook.com", "lm.facebook.com",
  "instagram.com", "www.instagram.com", "l.instagram.com",
  "twitter.com", "www.twitter.com", "x.com", "www.x.com", "t.co",
  "youtube.com", "www.youtube.com", "chatgpt.com", "www.chatgpt.com",
]);

export function sanitizeAnalyticsReferrer(referrer: string): string {
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.hostname === "politica007.com.br" || url.hostname === "www.politica007.com.br") {
      const page = getAnalyticsPage(url.pathname);
      return page ? `${ANALYTICS_ORIGIN}${page.path}` : "";
    }
    // A known source's hostname is sufficient for attribution; paths can identify people.
    return referralHosts.has(url.hostname) ? `https://${url.hostname}/` : "";
  } catch {
    return "";
  }
}

export function createNavigationDeduplicator() {
  let lastKey: string | null = null;
  return {
    claim(key: string) {
      if (lastKey === key) return false;
      lastKey = key;
      return true;
    },
    reset() { lastKey = null; },
  };
}

export function validMeasurementId(value: string | undefined): string | null {
  const id = value?.trim();
  return id && /^G-[A-Z0-9]{6,20}$/.test(id) ? id : null;
}

export function parseAnalyticsConsent(value: string | null): AnalyticsConsent | null {
  return value === "granted" || value === "denied" ? value : null;
}

let memoryConsent: AnalyticsConsent | null = null;

export function readAnalyticsConsent(): AnalyticsConsent | null {
  try {
    memoryConsent = parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_KEY));
  } catch {
    // Storage can be unavailable. An explicit choice still works for this open page.
  }
  return memoryConsent;
}

export function saveAnalyticsConsent(choice: AnalyticsConsent): boolean {
  memoryConsent = choice;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

export function isAnalyticsHost(): boolean {
  return typeof window !== "undefined" &&
    ["politica007.com.br", "www.politica007.com.br"].includes(window.location.hostname);
}

declare global {
  interface Window {
    politica007AnalyticsLayer?: IArguments[];
  }
}

type PendingPage = { key: string; page: AnalyticsPage; referrer: string };
type AnalyticsRuntime = {
  id: string;
  ready: boolean;
  configured: boolean;
  enabled: boolean;
  consentGranted: boolean;
  pending: PendingPage | null;
  previousPage: string;
  navigation: ReturnType<typeof createNavigationDeduplicator>;
};

// Persist across StrictMode effects, Script.onReady callbacks, and component remounts.
const runtimes = new Map<string, AnalyticsRuntime>();

function runtimeFor(id: string): AnalyticsRuntime {
  let runtime = runtimes.get(id);
  if (!runtime) {
    runtime = {
      id, ready: false, configured: false, enabled: false, consentGranted: false,
      pending: null, previousPage: "", navigation: createNavigationDeduplicator(),
    };
    runtimes.set(id, runtime);
  }
  return runtime;
}

function googleCommand(..._args: unknown[]) {
  const layer = window.politica007AnalyticsLayer ??= [];
  // gtag's documented queue format is an arguments object, not a custom event object.
  layer.push(arguments);
}

function disableGoogleCollection(id: string, disabled: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
}

const advertisingDenied = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

function flushPage(runtime: AnalyticsRuntime) {
  if (!runtime.ready || !runtime.enabled || !runtime.pending) return;
  const { key, page, referrer } = runtime.pending;
  if (!runtime.navigation.claim(key)) {
    runtime.pending = null;
    return;
  }

  const parameters = {
    page_location: `${ANALYTICS_ORIGIN}${page.path}`,
    page_title: `${page.title} | Politica007`,
    page_referrer: runtime.previousPage || sanitizeAnalyticsReferrer(referrer),
  };

  // Safe defaults also apply to Google's automatic session/engagement events.
  googleCommand("set", parameters);
  googleCommand("set", "ads_data_redaction", true);
  googleCommand("set", "url_passthrough", false);
  disableGoogleCollection(runtime.id, false);
  if (!runtime.configured) {
    googleCommand("consent", "default", { ...advertisingDenied, analytics_storage: "granted" });
    googleCommand("js", new Date());
    googleCommand("config", runtime.id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_prefix: "politica007",
      cookie_domain: "politica007.com.br",
      cookie_expires: 60 * 60 * 24 * 180,
      cookie_update: false,
      cookie_flags: "SameSite=Lax;Secure",
    });
    runtime.configured = true;
  } else if (!runtime.consentGranted) {
    googleCommand("consent", "update", { ...advertisingDenied, analytics_storage: "granted" });
  }
  runtime.consentGranted = true;
  googleCommand("event", "page_view", { send_to: runtime.id, ...parameters });
  runtime.previousPage = parameters.page_location;
  runtime.pending = null;
}

function removeAnalyticsCookies() {
  try {
    for (const part of document.cookie.split(";")) {
      const name = part.trim().split("=", 1)[0];
      if (!/^politica007_ga(?:_|$)/.test(name)) continue;
      const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
      document.cookie = expired;
      document.cookie = `${expired}; Domain=politica007.com.br`;
      document.cookie = `${expired}; Domain=.politica007.com.br`;
      document.cookie = `${expired}; Domain=${window.location.hostname}`;
    }
  } catch {
    // Refusing analytics must keep working when cookies are disabled by the browser.
  }
}

export function stopAnalytics(id: string) {
  disableGoogleCollection(id, true);
  const runtime = runtimes.get(id);
  if (runtime) {
    runtime.enabled = false;
    runtime.pending = null;
    runtime.previousPage = "";
    runtime.navigation.reset();
    if (runtime.configured && runtime.consentGranted) {
      googleCommand("consent", "update", { ...advertisingDenied, analytics_storage: "denied" });
    }
    runtime.consentGranted = false;
  }
  removeAnalyticsCookies();
}

export function updateAnalyticsPage(id: string, pathname: string, consent: AnalyticsConsent | null, referrer = "") {
  const page = getAnalyticsPage(pathname);
  const key = analyticsNavigationKey(pathname);
  if (consent !== "granted" || !page || !key || !isAnalyticsHost()) {
    stopAnalytics(id);
    return;
  }
  const runtime = runtimeFor(id);
  runtime.enabled = true;
  runtime.pending = { key, page, referrer };
  flushPage(runtime);
}

export function markAnalyticsReady(id: string) {
  const runtime = runtimeFor(id);
  runtime.ready = true;
  flushPage(runtime);
}
