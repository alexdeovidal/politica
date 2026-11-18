import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsNavigationKey,
  createNavigationDeduplicator,
  getAnalyticsPage,
  markAnalyticsReady,
  parseAnalyticsConsent,
  readAnalyticsConsent,
  sanitizeAnalyticsReferrer,
  saveAnalyticsConsent,
  stopAnalytics,
  updateAnalyticsPage,
  validMeasurementId,
} from "./analytics";

test("sensitive routes are grouped without retaining identifiers, query strings or titles", () => {
  const cases = [
    ["/cpf/123.456.789-00?nome=Maria%20Silva#documento", "/cpf/perfil"],
    ["/cnpj/12345678000199", "/cnpj/perfil"],
    ["/politico/12345?nome=Maria%20Silva", "/politico/perfil"],
    ["/politico/12345/relatorio-trajetoria", "/politico/perfil/relatorio-trajetoria"],
    ["/socios/maria-silva", "/socios/perfil"],
    ["/news/2026-11-18/maria-silva-12345678900", "/news/materia"],
    ["/news/2026-11-18", "/news/arquivo"],
    ["/contas-do-municipio/caldas-novas/12345678000199", "/contas-do-municipio/caldas-novas/contrato"],
    ["/explorar?nome=Maria%20Silva&cpf=12345678900", "/explorar"],
  ];
  for (const [input, expected] of cases) {
    const page = getAnalyticsPage(input);
    assert.equal(page?.path, expected);
    assert.doesNotMatch(JSON.stringify(page), /Maria|Silva|12345|2026|[?#]/i);
  }
  for (const input of ["/busca/maria-silva", "/cpf/12345/detalhe", "//evil.example/cpf/12345", "https://evil.example/", "/__proto__"]) {
    assert.equal(getAnalyticsPage(input), null, input);
  }
});

test("referrers retain only allowlisted sources or a sanitized internal section", () => {
  assert.equal(sanitizeAnalyticsReferrer("https://www.google.com/search?q=12345678900"), "https://www.google.com/");
  assert.equal(sanitizeAnalyticsReferrer("https://politica007.com.br/cpf/12345678900?nome=Maria#details"), "https://politica007.com.br/cpf/perfil");
  assert.equal(sanitizeAnalyticsReferrer("https://maria-silva.example/12345678900"), "");
  assert.equal(sanitizeAnalyticsReferrer("https://www.google.com.evil.example/search"), "");
  assert.equal(sanitizeAnalyticsReferrer("javascript:alert(1)"), "");
  assert.equal(sanitizeAnalyticsReferrer("not-a-url"), "");
});

test("duplicate effects are ignored while different profiles still count as separate navigations", () => {
  const navigation = createNavigationDeduplicator();
  assert.equal(navigation.claim(analyticsNavigationKey("/cpf/111?nome=Ana")!), true);
  assert.equal(navigation.claim(analyticsNavigationKey("/cpf/111?nome=Bia#filtro")!), false);
  assert.equal(navigation.claim(analyticsNavigationKey("/cpf/222")!), true);
  assert.equal(navigation.claim(analyticsNavigationKey("/cpf/111")!), true);
  navigation.reset();
  assert.equal(navigation.claim("/cpf/111"), true);
});

test("only an explicit valid consent and a valid measurement ID are accepted", () => {
  assert.equal(parseAnalyticsConsent(null), null);
  assert.equal(parseAnalyticsConsent("true"), null);
  assert.equal(parseAnalyticsConsent("granted"), "granted");
  assert.equal(parseAnalyticsConsent("denied"), "denied");
  assert.equal(validMeasurementId("G-TEST123456"), "G-TEST123456");
  assert.equal(validMeasurementId("G-TEST123456&l=other"), null);
  assert.equal(validMeasurementId("G-placeholder"), null);
});

test("late tag load, repeated readiness, withdrawal, and blocked storage fail safely", () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const commands: IArguments[] = [];
  const removedCookies: string[] = [];
  const mockWindow: Record<string, unknown> = {
    location: { hostname: "politica007.com.br" },
    politica007AnalyticsLayer: commands,
    localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } },
  };
  const mockDocument = {
    get cookie() { return "politica007_ga=test; politica007_ga_TEST123456=test; theme=dark"; },
    set cookie(value: string) { removedCookies.push(value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: mockWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: mockDocument });
  const id = "G-TEST123456";
  const views = () => commands.filter((command) => command[0] === "event" && command[1] === "page_view");
  try {
    assert.equal(updateAnalyticsPage(id, "/cpf/12345678900", null), false);
    assert.equal(commands.length, 0, "no consent means no Google commands");
    assert.equal(updateAnalyticsPage(id, "/cpf/12345678900", "granted"), true);
    assert.equal(views().length, 0, "wait for the tag before measuring");
    const initialConfig = commands.find((command) => command[0] === "config");
    assert.equal(initialConfig?.[1], id, "configure the destination before the tag is ready");
    assert.equal((initialConfig?.[2] as Record<string, unknown>).send_page_view, false);
    assert.ok(commands.some((command) => command[0] === "set" && command[1] === "send_page_view" && command[2] === false), "automatic views are disabled globally before the script loads");
    assert.equal(commands[0][0], "consent", "consent is queued before initialization");
    assert.equal((commands[0][2] as Record<string, unknown>).analytics_storage, "granted");
    const initialDefaults = commands.find((command) => command[0] === "set" && typeof command[1] === "object")?.[1] as Record<string, unknown>;
    assert.equal(initialDefaults.page_location, "https://politica007.com.br/cpf/perfil", "safe page defaults precede library execution");
    assert.doesNotMatch(JSON.stringify(commands), /12345678900/);
    stopAnalytics(id);
    markAnalyticsReady(id);
    assert.equal(views().length, 0, "withdrawal cancels a pending page view");

    updateAnalyticsPage(id, "/cpf/12345678900", "granted", "https://www.google.com/search?q=Maria");
    markAnalyticsReady(id);
    updateAnalyticsPage(id, "/cpf/12345678900?nome=Maria", "granted");
    assert.equal(views().length, 1, "onReady and effects do not double-count");
    updateAnalyticsPage(id, "/cpf/98765432100", "granted");
    assert.equal(views().length, 2, "another profile has its own page view");
    assert.doesNotMatch(JSON.stringify(commands), /12345678900|98765432100|Maria|search\?q/);
    assert.equal((views()[1][2] as Record<string, string>).page_referrer, "https://politica007.com.br/cpf/perfil");

    updateAnalyticsPage(id, "/unknown/Maria", "granted");
    assert.equal(views().length, 2);
    assert.equal(mockWindow[`ga-disable-${id}`], true, "unknown routes also stop automatic events");
    assert.equal(saveAnalyticsConsent("denied"), false);
    assert.equal(readAnalyticsConsent(), "denied", "a refusal survives in memory when storage fails");
    assert.ok(removedCookies.some((cookie) => cookie.startsWith("politica007_ga=")));
    assert.ok(removedCookies.every((cookie) => !cookie.startsWith("theme=")));
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
