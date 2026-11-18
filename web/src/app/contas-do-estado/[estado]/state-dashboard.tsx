"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, Building2, Check, ChevronLeft, ChevronRight, CircleHelp,
  FileCheck2, Files, HeartPulse, Landmark, Layers3, ListFilter, MapPinned, Megaphone, Search, Share2, ShieldCheck, Wallet } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { DashboardSnapshot, EvidencePage, FiscalFunction, LedgerId, MonthlyCell } from "@/lib/state-accounts/dashboard-model";
import { getComparisonRatio, getKnownAmount, getSnapshotYearMonths, getTreasuryMonths } from "@/lib/state-accounts/availability";
import styles from "./state-dashboard.module.css";

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const n = new Intl.NumberFormat("pt-BR");
const compact = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 2 }).format(cents / 100);
const percent = (v: number) => new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(v);
const date = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const ratio = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
const publicity = (category: string) => ["institutional-publicity", "legal-publicity"].includes(category);
const categoryName = (c: string) => ({ "institutional-publicity": "Institucional", "legal-publicity": "Legal", "elective-surgeries": "Cirurgias eletivas", other: "Fora do recorte comparável" }[c] ?? c);
type Mode = "compare" | "publicity" | "health" | "budget" | "sources";
type Filters = { year: number; fromMonth: number; toMonth: number; agency: string; category: string };
type BudgetMeasure = "settledCents" | "committedCents" | "updatedBudgetCents";
type PublicityOptions = { ledger: "invoices" | "companies"; agency: string; group: "vehicle" | "medium" | "campaign" | "supplier" };
type BudgetOptions = { left: string; right: string; measure: BudgetMeasure };
type ViewOptions = { evidenceCategory: "publicity" | "elective-surgeries"; publicity: PublicityOptions;
  healthDetail: "treasury" | "pce"; budget: BudgetOptions; query: string; page: number };
type EvidenceControls = { query: string; page: number; onQueryChange: (query: string) => void; onPageChange: (page: number) => void };
const defaultView: ViewOptions = { evidenceCategory: "publicity", publicity: { ledger: "invoices", agency: "", group: "vehicle" },
  healthDetail: "treasury", budget: { left: "12", right: "10", measure: "settledCents" }, query: "", page: 1 };
const availableMonths = (data: DashboardSnapshot, year: number, mode: Mode) =>
  ["publicity", "health"].includes(mode) ? getSnapshotYearMonths(data, year) : getTreasuryMonths(data, year);
const monthLimit = (data: DashboardSnapshot, year: number, mode: Mode) => Math.max(1, ...availableMonths(data, year, mode));
const firstMonth = (data: DashboardSnapshot, year: number, mode: Mode) => availableMonths(data, year, mode)[0] ?? 1;

function sum(rows: readonly MonthlyCell[]) { return rows.reduce((total, row) => total + row.amountCents, 0); }
function count(rows: readonly MonthlyCell[]) { return rows.reduce((total, row) => total + row.count, 0); }
function selectedMonth(month: string, filters: Filters) {
  return month.startsWith(String(filters.year)) && Number(month.slice(5)) >= filters.fromMonth && Number(month.slice(5)) <= filters.toMonth;
}
function Money({ cents, large = false }: { cents: number | null; large?: boolean }) {
  return <span className={large ? styles.bigMoney : styles.money} data-missing={cents === null || undefined} title={cents === null ? undefined : formatBRL(cents)}>{cents === null ? "Sem valor identificado" : compact(cents)}</span>;
}
function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>{children}<ArrowUpRight size={13} aria-hidden="true" /></a>;
}
function SectionTitle({ index, title, text }: { index: string; title: string; text: string }) {
  return <header className={styles.sectionTitle}><span>{index}</span><div><h2>{title}</h2><p>{text}</p></div></header>;
}
function apiParams(data: DashboardSnapshot, filters: Filters, ledger: LedgerId, category = "all", agency = "") {
  return new URLSearchParams({ v: data.version, ledger, year: String(filters.year), fromMonth: String(filters.fromMonth),
    toMonth: String(filters.toMonth), category, agency });
}

export function StateDashboard({ data, slug }: { data: DashboardSnapshot; slug: string }) {
  const defaultYear = [...data.years].sort((a, b) => b - a).find(year => data.windows[String(year)]?.end === `${year}-12-31`) ?? Math.max(...data.years);
  const [mode, setMode] = useState<Mode>("compare");
  const [filters, setFilters] = useState<Filters>({ year: defaultYear, fromMonth: firstMonth(data, defaultYear, "compare"), toMonth: monthLimit(data, defaultYear, "compare"), agency: "", category: "publicity" });
  const [shared, setShared] = useState("");
  const [view, setView] = useState<ViewOptions>(defaultView);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedYear = Number(query.get("ano"));
    const year = data.years.includes(requestedYear) ? requestedYear : defaultYear;
    const requestedMode = query.get("visao") as Mode;
    const m: Mode = window.location.hash === "#fontes" ? "sources" : ["compare", "publicity", "health", "budget", "sources"].includes(requestedMode) ? requestedMode : "compare";
    const max = monthLimit(data, year, m), min = firstMonth(data, year, m);
    const first = Number(query.get("de") ?? min), last = Number(query.get("ate") ?? max);
    setMode(m);
    setFilters({ year, fromMonth: Number.isInteger(first) && first >= min && first <= max ? first : min,
      toMonth: Number.isInteger(last) && last >= first && last <= max ? last : max,
      agency: query.get("orgao")?.slice(0, 100) ?? "", category: ["institutional-publicity", "legal-publicity"].includes(query.get("tipo") ?? "") ? query.get("tipo")! : "publicity" });
    const ledger = query.get("base") === "companies" ? "companies" : "invoices";
    const requestedGroup = query.get("agrupar") ?? (ledger === "companies" ? "supplier" : "vehicle");
    const group = ["vehicle", "medium", "supplier", ...(ledger === "invoices" ? ["campaign"] : [])].includes(requestedGroup)
      ? requestedGroup as PublicityOptions["group"] : ledger === "companies" ? "supplier" : "vehicle";
    const requestedMeasure = query.get("medida") ?? "settledCents";
    const page = Number(query.get("pagina") ?? 1);
    setView({ evidenceCategory: query.get("documentos") === "elective-surgeries" ? "elective-surgeries" : "publicity",
      publicity: { ledger, agency: query.get("entidade")?.slice(0, 100) ?? "", group },
      healthDetail: query.get("detalhe") === "pce" ? "pce" : "treasury",
      budget: { left: query.get("areaA")?.slice(0, 10) ?? "12", right: query.get("areaB")?.slice(0, 10) ?? "10",
        measure: ["settledCents", "committedCents", "updatedBudgetCents"].includes(requestedMeasure) ? requestedMeasure as BudgetMeasure : "settledCents" },
      query: query.get("busca")?.slice(0, 160) ?? "", page: Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1 });
    setReady(true);
  }, [data, defaultYear]);
  useEffect(() => {
    if (!ready) return;
    const query = new URLSearchParams({ ano: String(filters.year), de: String(filters.fromMonth), ate: String(filters.toMonth), visao: mode });
    if (filters.agency) query.set("orgao", filters.agency);
    if (filters.category !== "publicity") query.set("tipo", filters.category);
    if (mode === "compare" && view.evidenceCategory !== "publicity") query.set("documentos", view.evidenceCategory);
    if (mode === "publicity") {
      query.set("base", view.publicity.ledger); query.set("agrupar", view.publicity.group);
      if (view.publicity.agency) query.set("entidade", view.publicity.agency);
    }
    if (mode === "health") query.set("detalhe", view.healthDetail);
    if (mode === "budget") { query.set("areaA", view.budget.left); query.set("areaB", view.budget.right); query.set("medida", view.budget.measure); }
    if (["compare", "publicity", "health"].includes(mode)) {
      if (view.query) query.set("busca", view.query);
      if (view.page > 1) query.set("pagina", String(view.page));
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${query}${mode === "sources" ? "#fontes" : ""}`);
    setShared("");
  }, [filters, mode, view, ready]);
  function change(next: Partial<Filters>, nextMode = mode) {
    const updated = { ...filters, ...next };
    const max = monthLimit(data, updated.year, nextMode), min = firstMonth(data, updated.year, nextMode);
    if (next.year && next.year !== filters.year) { updated.fromMonth = min; updated.toMonth = max; }
    updated.fromMonth = Math.max(min, Math.min(updated.fromMonth, max)); updated.toMonth = Math.max(min, Math.min(updated.toMonth, max));
    if (updated.fromMonth > updated.toMonth) updated.toMonth = updated.fromMonth;
    setFilters(updated); setMode(nextMode);
    setView(current => ({ ...current, page: 1, query: nextMode === mode ? current.query : "" }));
  }
  function changeView(next: Partial<ViewOptions>, clearQuery = false) {
    setView(current => ({ ...current, ...next, page: next.page ?? 1, query: clearQuery ? "" : next.query ?? current.query }));
  }
  const evidenceControls: EvidenceControls = { query: view.query, page: view.page,
    onQueryChange: query => changeView({ query }), onPageChange: page => changeView({ page }) };
  const central = useMemo(() => data.monthly.filter(row => selectedMonth(row.month, filters)), [data.monthly, filters]);
  const ads = central.filter(row => publicity(row.category) && (!filters.agency || row.agencyId === filters.agency) &&
    (filters.category === "publicity" || row.category === filters.category));
  const surgeries = central.filter(row => row.category === "elective-surgeries");
  const adTotal = getKnownAmount(ads), surgeryTotal = getKnownAmount(surgeries);
  const comparativeRatio = getComparisonRatio(adTotal, surgeryTotal);
  const scope = `${months[filters.fromMonth - 1]}–${months[filters.toMonth - 1]} de ${filters.year}`;
  const agencyMap = new Map<string, string>();
  for (const row of data.monthly) if (publicity(row.category)) agencyMap.set(row.agencyId, row.agency);
  // The two specifically requested secretariats remain inspectable even with an empty thematic recorte.
  if (data.uf === "GO") { agencyMap.set("2401", "Secretaria da Educação"); agencyMap.set("2850", "Fundo Estadual de Saúde"); }
  const agencies = [...agencyMap].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const tabs: { id: Mode; title: string; Icon: typeof BarChart3 }[] = [
    { id: "compare", title: "Comparar prioridades", Icon: BarChart3 }, { id: "publicity", title: "Publicidade por dentro", Icon: Megaphone },
    { id: "health", title: "Cirurgias e repasses", Icon: HeartPulse }, { id: "budget", title: "Orçamento por área", Icon: Landmark },
    { id: "sources", title: "Fontes e cobertura", Icon: FileCheck2 },
  ];
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setShared("Link copiado"); }
    catch { setShared("Use o endereço desta página para compartilhar"); }
  }
  return <div className={styles.dashboard}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}><span className={styles.liveDot} /> CONTAS DO ESTADO <span>/</span> {data.name.toLocaleUpperCase("pt-BR")}</div>
        <h1>O dinheiro público.<br /><span>As escolhas em perspectiva.</span></h1>
        <p>Da despesa ao documento. Compare publicidade, repasses para cirurgias e as áreas do orçamento de {data.name}.</p>
        <div className={styles.heroMeta}><span><ShieldCheck size={14} /> Fontes oficiais identificadas</span><span>Coleta: {date(data.collectedAt)}</span></div>
      </div>
      <Link href="/contas-do-estado" prefetch={false} className={styles.stateCard} aria-label={`${data.name}, ver cobertura dos estados`}>
        <span>ESTADO EM FOCO</span><strong>{data.uf}</strong><div>{data.name} <ArrowUpRight size={20} /></div><small>Uma estrutura para as 27 UFs</small>
      </Link>
    </header>
    <div className={styles.auditStrip}><span><Files size={16} /><strong>{n.format(data.scannedPayments)}</strong> ordens de pagamento examinadas</span>
      <span><Building2 size={16} /><strong>{data.scannedAgencies}</strong> unidades na base original</span><button onClick={() => change({}, "sources")}>Entenda a cobertura <ArrowRight size={14} /></button></div>
    <nav className={styles.tabs} aria-label="Visões das contas estaduais">{tabs.map(({ id, title, Icon }) => <button key={id} type="button" aria-pressed={mode === id}
      className={mode === id ? styles.activeTab : ""} onClick={() => change({}, id)}><Icon size={17} />{title}</button>)}</nav>
    <div className={styles.filters}>
      <div className={styles.filterLabel}><ListFilter size={17} /><span>Seu recorte</span></div>
      <label>Ano<select value={filters.year} onChange={event => change({ year: Number(event.target.value) })}>
        {data.years.map(year => <option key={year} value={year}>{year} · {data.windows[String(year)]?.end === `${year}-12-31` ? "ano fechado" : "parcial"}</option>)}</select></label>
      {mode !== "budget" && mode !== "sources" && <><label>De<select value={filters.fromMonth} onChange={event => change({ fromMonth: Number(event.target.value) })}>
        {availableMonths(data, filters.year, mode).map(month => <option key={month} value={month}>{months[month - 1]}{data.surgery.monthly.some(row => row.month === `${filters.year}-${String(month).padStart(2, "0")}` && row.partial) ? " · parcial" : ""}</option>)}</select></label>
        <label>Até<select value={filters.toMonth} onChange={event => change({ toMonth: Number(event.target.value) })}>
          {availableMonths(data, filters.year, mode).map(month => <option key={month} value={month} disabled={month < filters.fromMonth}>{months[month - 1]}{data.surgery.monthly.some(row => row.month === `${filters.year}-${String(month).padStart(2, "0")}` && row.partial) ? " · parcial" : ""}</option>)}</select></label></>}
      <button className={styles.shareButton} onClick={share} title="Copiar link com os filtros">{shared === "Link copiado" ? <Check size={17} /> : <Share2 size={17} />}<span>{shared || "Compartilhar recorte"}</span></button><span className="sr-only" role="status">{shared}</span>
    </div>

    {mode === "compare" && <>
      <SectionTitle index="01" title="Publicidade × repasses cirúrgicos" text="Dois destinos do dinheiro, no mesmo período e na mesma base de pagamentos estaduais." />
      <div className={styles.compareFilters}><label>Publicidade de<select value={filters.agency} onChange={event => change({ agency: event.target.value })}>
        <option value="">Todos os órgãos identificados</option>{agencies.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
        <label>Tipo de publicidade<select value={filters.category} onChange={event => change({ category: event.target.value })}>
          <option value="publicity">Institucional + legal</option><option value="institutional-publicity">Institucional</option><option value="legal-publicity">Legal / atos oficiais</option></select></label>
        <span className={styles.scopePill}>{scope} · etapa: pago</span></div>
      <div className={styles.comparison}>
        <div className={`${styles.compareCard} ${styles.adCard}`}><div className={styles.metricLabel}><Megaphone size={20} />PUBLICIDADE IDENTIFICADA</div>
          <Money cents={adTotal} large /><p>{adTotal === null ? "Nenhum pagamento classificado neste filtro." : formatBRL(adTotal)}</p>
          <div className={styles.cardTrack}><i style={{ width: `${adTotal !== null && surgeryTotal !== null ? Math.max(0, adTotal) / Math.max(adTotal, surgeryTotal, 1) * 100 : adTotal === null ? 0 : 100}%` }} /></div>
          <footer><span>{n.format(count(ads))} ordens com valor</span><button onClick={() => { changeView({ evidenceCategory: "publicity" }, true); document.getElementById("documentos")?.scrollIntoView({ behavior: "smooth" }); }}>Ver pagamentos <ArrowRight size={14} /></button></footer>
        </div>
        <div className={`${styles.compareCard} ${styles.healthCard}`}><div className={styles.metricLabel}><HeartPulse size={20} />DESTINAÇÃO CIRÚRGICA IDENTIFICADA</div>
          <Money cents={surgeryTotal} large /><p>{surgeryTotal === null ? "Nenhum pagamento classificado neste filtro." : formatBRL(surgeryTotal)}</p>
          <div className={styles.cardTrack}><i style={{ width: `${adTotal !== null && surgeryTotal !== null ? Math.max(0, surgeryTotal) / Math.max(adTotal, surgeryTotal, 1) * 100 : surgeryTotal === null ? 0 : 100}%` }} /></div>
          <footer><span>{n.format(count(surgeries))} ordens com valor</span><button onClick={() => { changeView({ evidenceCategory: "elective-surgeries" }, true); document.getElementById("documentos")?.scrollIntoView({ behavior: "smooth" }); }}>Ver repasses <ArrowRight size={14} /></button></footer>
        </div>
      </div>
      <div className={styles.comparisonReading}>
        <div><span>RAZÃO ENTRE OS RECORTES</span><strong className={comparativeRatio === null ? styles.unavailableValue : undefined}>{comparativeRatio === null ? "Indisponível" : `${ratio(comparativeRatio)}×`}</strong></div>
        <p><strong>São valores identificados, com cobertura parcial.</strong> O segundo recorte reúne destinações explícitas a cirurgias, principalmente repasses a fundos municipais. Não representa o custo total das cirurgias da rede. A diferença entre estes valores não mede quantas cirurgias poderiam ser realizadas.</p>
      </div>
      <MonthlyChart left={ads} right={surgeries} filters={filters} />
      <div className={styles.twoColumns}><RankedAgencies rows={ads} onChoose={id => change({ agency: id })} />
        <section className={styles.panel}><h3><ShieldCheck size={18} /> O que sustenta a comparação</h3><ol className={styles.methodSteps}>
          <li><span>01</span><div><strong>Uma única base de pagamentos</strong><p>O valor vem da ordem de pagamento da base estadual. A nota da agência serve para conferir o destino, sem contar o dinheiro novamente.</p></div></li>
          <li><span>02</span><div><strong>O objeto determina o tema</strong><p>Publicidade é identificada pelo empenho e pelo serviço. Na Saúde, transplantes e custeio geral não entram só por mencionar uma rubrica cirúrgica.</p></div></li>
          <li><span>03</span><div><strong>Os limites ficam visíveis</strong><p>Empresas estaduais, produção SUS e valores contratados têm universos próprios. As fontes e os recortes podem ser abertos e exportados.</p></div></li>
        </ol><button className={styles.textButton} onClick={() => change({}, "sources")}>Abrir metodologia e cobertura <ArrowRight size={15} /></button></section></div>
      <section id="documentos" className={styles.documentSection}><SectionTitle index="02" title="Abra os documentos por trás dos números" text="Pesquise fornecedores, municípios, objetos e empenhos. Cada linha mantém a referência à fonte." />
        <div className={styles.segmented}><button aria-pressed={view.evidenceCategory === "publicity"} onClick={() => changeView({ evidenceCategory: "publicity" }, true)}>Publicidade</button>
          <button aria-pressed={view.evidenceCategory === "elective-surgeries"} onClick={() => changeView({ evidenceCategory: "elective-surgeries" }, true)}>Destinação cirúrgica</button></div>
        <EvidenceTable data={data} slug={slug} filters={filters} ledger="treasury" category={view.evidenceCategory === "publicity" ? filters.category : view.evidenceCategory}
          agency={view.evidenceCategory === "publicity" ? filters.agency : ""} {...evidenceControls} /></section>
    </>}
    {mode === "publicity" && <PublicityView data={data} slug={slug} filters={filters} options={view.publicity}
      onChange={publicity => changeView({ publicity }, true)} evidenceControls={evidenceControls} />}
    {mode === "health" && <HealthView data={data} slug={slug} filters={filters} rows={surgeries} detail={view.healthDetail}
      onDetailChange={healthDetail => changeView({ healthDetail }, true)} evidenceControls={evidenceControls} />}
    {mode === "budget" && <BudgetView data={data} year={filters.year} options={view.budget} onChange={budget => changeView({ budget })} />}
    {mode === "sources" && <SourcesView data={data} slug={slug} />}
    <footer className={styles.pageFooter}><span>POLÍTICA007 <i /> DADOS PÚBLICOS, CONTEXTO VISÍVEL.</span><Link href="/contas-do-estado" prefetch={false}>Cobertura dos estados <ArrowRight size={14} /></Link></footer>
  </div>;
}

function MonthlyChart({ left, right, filters }: { left: MonthlyCell[]; right: MonthlyCell[]; filters: Filters }) {
  const series = months.map((label, i) => ({ label, month: i + 1, left: sum(left.filter(r => Number(r.month.slice(5)) === i + 1)),
    right: sum(right.filter(r => Number(r.month.slice(5)) === i + 1)), hasLeft: left.some(r => Number(r.month.slice(5)) === i + 1), hasRight: right.some(r => Number(r.month.slice(5)) === i + 1) }))
    .filter(r => r.month >= filters.fromMonth && r.month <= filters.toMonth);
  const max = Math.max(1, ...series.flatMap(r => [r.left, r.right]));
  return <section className={styles.panel}><div className={styles.chartTitle}><div><h3>Quando o dinheiro foi pago</h3><p>Mesma escala para os dois recortes · data da ordem de pagamento</p></div><div className={styles.legend}><span><i />Publicidade</span><span><i />Destinação cirúrgica</span></div></div>
    <div className={styles.chart} role="img" aria-label="Pagamentos mensais comparados, valores acessíveis na tabela abaixo">
      <div className={styles.chartScale}><span>{compact(max)}</span><span>{compact(max / 2)}</span><span>R$ 0</span></div>
      <div className={styles.chartColumns}>{series.map(r => <div key={r.label} className={styles.chartColumn}><div className={styles.barPair}>
        <i className={styles.adBar} style={{ height: `${Math.max(0, r.left) / max * 100}%` }} title={`${r.label}: publicidade ${r.hasLeft ? formatBRL(r.left) : "sem registro"}`} />
        <i className={styles.healthBar} style={{ height: `${Math.max(0, r.right) / max * 100}%` }} title={`${r.label}: destinação cirúrgica ${r.hasRight ? formatBRL(r.right) : "sem registro"}`} /></div><span>{r.label}</span></div>)}</div>
    </div>
    <details className={styles.chartTable}><summary>Ver os valores mensais em tabela</summary><table><thead><tr><th>Mês</th><th>Publicidade identificada</th><th>Destinação cirúrgica identificada</th></tr></thead><tbody>{series.map(r => <tr key={r.label}><th>{r.label}</th><td>{r.hasLeft ? formatBRL(r.left) : "Sem registro identificado"}</td><td>{r.hasRight ? formatBRL(r.right) : "Sem registro identificado"}</td></tr>)}</tbody></table></details>
  </section>;
}

function RankedAgencies({ rows, onChoose }: { rows: MonthlyCell[]; onChoose: (id: string) => void }) {
  const groups = new Map<string, { id: string; name: string; value: number }>();
  for (const r of rows) { const old = groups.get(r.agencyId) ?? { id: r.agencyId, name: r.agency, value: 0 }; old.value += r.amountCents; groups.set(r.agencyId, old); }
  const ranked = [...groups.values()].sort((a, b) => b.value - a.value), max = Math.max(1, ranked[0]?.value ?? 1), total = sum(rows);
  return <section className={styles.panel}><h3><Building2 size={18} /> Quem aparece na publicidade</h3><p className={styles.muted}>Clique em um órgão para refinar o recorte.</p>
    {!ranked.length && <p className={styles.empty}>Sem pagamentos identificados para estes filtros. Isso não comprova gasto zero.</p>}
    <div className={styles.rankList}>{ranked.slice(0, 8).map((r, i) => <button key={r.id} onClick={() => onChoose(r.id)}><span className={styles.rankIndex}>{String(i + 1).padStart(2, "0")}</span>
      <span className={styles.rankName}>{r.name}<i style={{ width: `${Math.max(0, r.value) / max * 100}%` }} /></span><span><strong>{compact(r.value)}</strong><small>{total > 0 ? percent(r.value / total) : "—"} do recorte</small></span></button>)}</div>
  </section>;
}

function EvidenceTable({ data, slug, filters, ledger, category = "all", agency = "", query, page, onQueryChange, onPageChange }:
  { data: DashboardSnapshot; slug: string; filters: Filters; ledger: LedgerId; category?: string; agency?: string } & EvidenceControls) {
  const [result, setResult] = useState<EvidencePage | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const treasuryEndMonth = Math.max(0, ...getTreasuryMonths(data, filters.year));
  const beyondCoverage = ledger === "treasury" && filters.fromMonth > treasuryEndMonth;
  const clamped = ledger === "treasury" && filters.toMonth > treasuryEndMonth;
  const effectiveFilters = clamped ? { ...filters, toMonth: treasuryEndMonth } : filters;
  const base = apiParams(data, effectiveFilters, ledger, category, agency).toString();
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setResult(null);
    if (beyondCoverage) { setLoading(false); return () => controller.abort(); }
    const timer = setTimeout(async () => { try {
      const params = new URLSearchParams(base); params.set("q", query); params.set("page", String(page));
      const response = await fetch(`/api/contas-do-estado/${slug}?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Não foi possível carregar os registros agora.");
      const body = await response.json() as EvidencePage;
      if (!Array.isArray(body.rows)) throw new Error("Resposta de dados indisponível.");
      if (!controller.signal.aborted) setResult(body);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Não foi possível carregar."); }
    finally { if (!controller.signal.aborted) setLoading(false); } }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, query, page, slug, attempt, beyondCoverage]);
  const csv = new URLSearchParams(base); csv.set("q", query); csv.set("format", "csv");
  const sourceMap = new Map((result?.sources ?? []).map(s => [s.id, s]));
  if (beyondCoverage) return <div className={styles.evidence} role="status"><p className={styles.empty}>O período escolhido está fora da cobertura das ordens de pagamento, disponível até {date(data.windows[String(filters.year)]?.end ?? "")}. Os dados de procedimentos podem alcançar outros meses. Esta lacuna não significa pagamento zero.</p></div>;
  return <div className={styles.evidence} aria-busy={loading}>
    {clamped && <p className={styles.muted}>Esta tabela e seu CSV incluem pagamentos até {date(data.windows[String(filters.year)].end)}, limite disponível nesta base.</p>}
    <div className={styles.evidenceToolbar}><label className={styles.search}><Search size={17} /><input value={query} maxLength={160} onChange={e => onQueryChange(e.target.value)} placeholder="Fornecedor, veículo, município, empenho…" aria-label="Pesquisar nos registros" /></label>
      <a className={styles.download} href={`/api/contas-do-estado/${slug}?${csv}`}><ArrowDownToLine size={16} />Exportar CSV</a></div>
    <div className={styles.resultMeta} aria-live="polite">{loading ? "Buscando registros…" : error || `${n.format(result?.total ?? 0)} registros · ${ledger === "invoices" ? "bruto das notas" : "valor registrado"}: ${result?.total ? formatBRL(result.amountCents) : "sem valor identificado"}`}</div>
    {error && <div role="alert" className={styles.empty}><p>{error}</p><button className={styles.textButton} onClick={() => setAttempt(value => value + 1)}>Tentar novamente <ArrowRight size={15} /></button></div>}
    {!error && result && <><div className={styles.tableScroll}><table className={styles.recordsTable}><thead><tr><th>Pagamento / órgão</th><th>{ledger === "invoices" ? "Agência e veículo" : "Favorecido e objeto"}</th><th>{ledger === "invoices" ? "Bruto da nota" : "Valor pago"}</th><th>Origem</th></tr></thead>
      <tbody>{result.rows.map(row => <tr key={row.id}><td><time dateTime={row.date}>{date(row.date)}</time><small>{row.agency}</small><span className={styles.miniTag}>{categoryName(row.category)}</span></td>
        <td><strong>{row.supplier || "Não informado"}</strong>{row.vehicle && <small>Veículo: {row.vehicle}</small>}
          <details className={styles.rowDetails}><summary>{row.campaign || row.description || "Ver registro"}</summary>
            <p>{row.description}</p>{row.budgetDescription && <p><b>Objeto do empenho:</b> {row.budgetDescription} {data.uf === "GO" && <SourceLink href="https://dadosabertos.go.gov.br/dataset/empenhos">Catálogo de empenhos</SourceLink>}</p>}
            {row.commitment && <p><b>Empenho:</b> {row.commitment}{row.paymentOrder ? ` · OP ${row.paymentOrder}` : ""}</p>}
            {row.supplierDocument && <p><b>CNPJ:</b> {row.supplierDocument}</p>}
            {row.classificationRule && <p><b>Critério:</b> {row.classificationRule}</p>}
            {ledger === "invoices" && <p><b>Líquido informado:</b> {row.netCents == null ? "Valor inconsistente ou ausente; excluído da soma líquida" : formatBRL(row.netCents)}. Bruto, líquido e comissão não devem ser somados.</p>}
            {row.qualityFlags?.length ? <p>Este registro tem observação de qualidade na fonte e deve ser conferido no documento original.</p> : null}
            <p><b>Referência:</b> {row.sourceRow} · <b>Natureza:</b> {row.financialNature === "transfer" ? "transferência" : ledger === "invoices" ? "nota com pagamento datado" : "pagamento registrado"}</p>
          </details></td><td className={styles.amountCell}>{formatBRL(row.amountCents)}</td><td>{sourceMap.get(row.sourceId) && <SourceLink href={sourceMap.get(row.sourceId)!.downloadUrl || sourceMap.get(row.sourceId)!.url}>Fonte</SourceLink>}</td></tr>)}</tbody></table></div>
      {!result.total && <p className={styles.empty}>Nenhum registro identificado para estes filtros. Ausência de registro não significa despesa zero.</p>}
      <div className={styles.pagination}><button disabled={result.page <= 1 || loading} onClick={() => onPageChange(result.page - 1)}><ChevronLeft size={16} />Anterior</button><span>Página {result.page} de {result.pages}</span><button disabled={result.page >= result.pages || loading} onClick={() => onPageChange(result.page + 1)}>Próxima<ChevronRight size={16} /></button></div></>}
  </div>;
}

function PublicityView({ data, slug, filters, options, onChange, evidenceControls }: { data: DashboardSnapshot; slug: string; filters: Filters;
  options: PublicityOptions; onChange: (options: PublicityOptions) => void; evidenceControls: EvidenceControls }) {
  const { ledger, agency, group } = options;
  const [rank, setRank] = useState<{ rows: { name: string; amountCents: number; count: number }[]; total: number; totalGroups: number } | null>(null);
  const [rankError, setRankError] = useState("");
  const [rankAttempt, setRankAttempt] = useState(0);
  const params = apiParams(data, filters, ledger, "all", agency); params.set("format", "insights"); params.set("group", group);
  const rankUrl = `/api/contas-do-estado/${slug}?${params}`;
  useEffect(() => { const controller = new AbortController(); setRank(null); setRankError("");
    fetch(rankUrl, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error("Ranking indisponível no momento."); return r.json(); }).then(body => {
      if (!Array.isArray(body.rows)) throw new Error("Agrupamento indisponível no momento.");
      if (!controller.signal.aborted) setRank(body);
    }).catch(e => { if (!controller.signal.aborted) setRankError(e.message); }); return () => controller.abort(); }, [rankUrl, rankAttempt]);
  const cells = data.invoiceMonthly.filter(r => selectedMonth(r.month, filters));
  const companies = data.companyMonthly.filter(r => selectedMonth(r.month, filters));
  const invoiceAgencies = [...new Set(data.invoiceMonthly.map(row => row.agency))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const companyAgencies = [...new Map(data.companyMonthly.map(row => [row.agencyId, row.agency])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const featuredCompany = companyAgencies.find(([id]) => id === "SANEAGO") ?? companyAgencies[0];
  return <><SectionTitle index="02" title="Quem recebeu. Onde apareceu. Qual campanha." text="O detalhamento das agências e das empresas estaduais, com a base de cada valor identificada." />
    <div className={styles.threeColumns}>{invoiceAgencies.slice(0, 2).map(name => { const subset = cells.filter(r => r.agency === name); const total = getKnownAmount(subset.map(row => ({ amountCents: row.grossCents }))); return <button key={name} className={styles.statCard} onClick={() => onChange({ ledger: "invoices", agency: name, group })}><span>{name}</span><Money cents={total} /><small>Bruto de notas com pagamento datado</small><footer>{n.format(subset.reduce((s, r) => s + r.count, 0))} notas <ArrowRight size={15} /></footer></button>; })}
      {featuredCompany && <button className={styles.statCard} onClick={() => onChange({ ledger: "companies", agency: featuredCompany[0], group: "supplier" })}><span>{featuredCompany[1]}</span><Money cents={getKnownAmount(companies.filter(r => r.agencyId === featuredCompany[0]))} /><small>Pagamentos da empresa · institucional + legal</small><footer>Universo separado do Tesouro <ArrowRight size={15} /></footer></button>}</div>
    <div className={styles.note}><CircleHelp size={18} /><p><strong>Estas bases detalham o dinheiro; não acrescentam outro gasto ao comparativo.</strong> Bruto da nota, líquido pago, comissão da agência e valor do veículo não devem ser somados entre si. As empresas estaduais ficam no universo empresarial.</p></div>
    <div className={styles.compareFilters}><label>Base<select value={ledger} onChange={e => { const nextLedger = e.target.value as PublicityOptions["ledger"]; onChange({ ledger: nextLedger, agency: "", group: nextLedger === "companies" ? "supplier" : "vehicle" }); }}><option value="invoices">Notas de agências e veículos</option><option value="companies">Pagamentos · empresas estaduais</option></select></label>
      <label>Órgão / empresa<select value={agency} onChange={e => onChange({ ...options, agency: e.target.value })}><option value="">Todos desta base</option>{(ledger === "invoices" ? invoiceAgencies.map(name => [name, name]) : companyAgencies).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Agrupar por<select value={group} onChange={e => onChange({ ...options, group: e.target.value as PublicityOptions["group"] })}><option value="vehicle">Veículo</option><option value="medium">Meio</option><option value="supplier">Agência / fornecedor</option>{ledger === "invoices" && <option value="campaign">Campanha</option>}</select></label></div>
    <section className={styles.panel}><div className={styles.chartTitle}><div><h3>Os maiores valores no recorte</h3><p>{ledger === "invoices" ? "Bruto das notas com pagamento registrado" : "Pagamentos registrados na fonte empresarial"} · {rank ? `${n.format(rank.totalGroups)} grupos identificados` : "Carregando agrupamento…"}</p></div><Layers3 size={22} /></div>
      {rankError && <div role="alert"><p>{rankError}</p><button className={styles.textButton} onClick={() => setRankAttempt(value => value + 1)}>Tentar novamente <ArrowRight size={15} /></button></div>}<div className={styles.horizontalRanks}>{rank?.rows.map((r, i) => <div key={r.name}><span>{String(i + 1).padStart(2, "0")}</span><div><strong>{r.name}</strong><i style={{ width: `${Math.max(0, r.amountCents) / Math.max(1, rank.rows[0]?.amountCents ?? 1) * 100}%` }} /></div><p>{compact(r.amountCents)}<small>{n.format(r.count)} registros</small></p></div>)}</div>
      {rank && !rank.rows.length && <p className={styles.empty}>Sem registros identificados para este recorte.</p>}</section>
    <EvidenceTable key={`${ledger}-${agency}`} data={data} slug={slug} filters={filters} ledger={ledger} agency={agency} {...evidenceControls} />
  </>;
}

function HealthView({ data, slug, filters, rows, detail, onDetailChange, evidenceControls }: { data: DashboardSnapshot; slug: string; filters: Filters; rows: MonthlyCell[];
  detail: "treasury" | "pce"; onDetailChange: (detail: "treasury" | "pce") => void; evidenceControls: EvidenceControls }) {
  const annual = data.surgery.annual.find(r => r.year === filters.year);
  const production = data.surgery.production.find(r => r.year === filters.year);
  const monthly = data.surgery.monthly.filter(r => selectedMonth(r.month, filters));
  const procedures = monthly.reduce((s, r) => s + r.procedures, 0);
  const max = Math.max(1, ...monthly.map(r => r.procedures));
  const pce = data.surgery.pceAnnual.find(r => r.year === filters.year);
  const annualReference = data.surgery.annualReports?.find(report => report.year === filters.year) ?? (filters.year === 2025 ? data.surgery.rag2025 : undefined);
  const annualMonths = data.surgery.monthly.filter(row => row.month.startsWith(String(filters.year))).map(row => Number(row.month.slice(5)));
  const annualPeriod = annualMonths.length ? `${months[Math.min(...annualMonths) - 1]} a ${months[Math.max(...annualMonths) - 1]}` : "período não informado";
  const csv2025 = data.surgery.annual.find(row => row.year === 2025);
  return <><SectionTitle index="03" title="Dinheiro transferido. Atendimento registrado." text={`Repasses, produção financeira e quantidade de procedimentos respondem a perguntas diferentes. Pagamentos centrais disponíveis até ${date(data.windows[String(filters.year)]?.end ?? "")}.`} />
    <div className={styles.threeColumns}><article className={styles.statCard}><span>DESTINAÇÃO CIRÚRGICA</span><Money cents={getKnownAmount(rows)} /><small>Pagamentos com objeto cirúrgico explícito · recorte parcial</small><footer>{n.format(count(rows))} ordens com valor</footer></article>
      <article className={styles.statCard}><span>PROCEDIMENTOS NA BASE SES</span><strong className={styles.bigCount}>{monthly.length ? n.format(procedures) : "Sem dado"}</strong><small>Registros do CSV no período escolhido · não são pacientes únicos</small><footer><SourceLink href={data.surgery.sourceUrl}>Conferir a base</SourceLink></footer></article>
      <article className={styles.statCard}><span>{annualReference ? `RESULTADO ANUAL · ${filters.year}` : "PRODUÇÃO FINANCEIRA · SUS360"}</span>
        {annualReference ? <><strong className={styles.bigCount}>{n.format(annualReference.count)}</strong><small>{annualReference.label} · resultado anual independente do filtro mensal</small><footer><SourceLink href={annualReference.url}>Relatório · página {annualReference.page}</SourceLink></footer></> : <><Money cents={production?.amountCents ?? null} /><small>Acumulado do programa federal · {production ? `${production.periodStart.slice(4)}/${production.periodStart.slice(0, 4)} a ${production.periodEnd.slice(4)}/${production.periodEnd.slice(0, 4)}` : "sem período"}</small><footer>Produção informada, não pagamento do Tesouro</footer></>}</article></div>
    <div className={styles.note}><HeartPulse size={18} /><p><strong>Por que os números de cirurgias diferem?</strong> Relatórios de resultado e arquivos de procedimentos podem abranger conjuntos distintos. {data.surgery.rag2025 && csv2025 && <>Em 2025, são {n.format(data.surgery.rag2025.count)} no RAG e {n.format(csv2025.procedures)} no CSV. </>}Os universos não foram conciliados e não são somados. Também não dividimos esses pagamentos por essas quantidades para apresentar um custo por cirurgia.</p></div>
    <div className={styles.twoColumns}><section className={styles.panel}><h3>Procedimentos registrados por mês</h3><p className={styles.muted}>Contagem no CSV da SES, dentro do período escolhido.</p><div className={styles.procedureBars}>{monthly.map(r => <div key={r.month}><span>{months[Number(r.month.slice(5)) - 1]}</span><i style={{ width: `${r.procedures / max * 100}%` }} /><strong>{n.format(r.procedures)}</strong></div>)}</div><SourceLink href={data.surgery.sourceUrl}>Fonte e atualização</SourceLink></section>
      <section className={styles.panel}><h3>Especialidades no ano de {filters.year}</h3><p className={styles.muted}>Base SES · {annualPeriod}{annual?.partial ? ", período parcial" : ""}. Esta lista acumulada é independente do filtro mensal.</p><div className={styles.specialties}>{annual?.specialties.slice(0, 8).map(r => <div key={r.name}><span>{r.name}</span><strong>{n.format(r.procedures)}</strong></div>)}</div>{!annual && <p className={styles.empty}>Sem registros de especialidades neste ano.</p>}</section></div>
    <section className={styles.panel}><div className={styles.chartTitle}><div><h3>O programa PCE, sem dupla contagem</h3><p>Contrapartidas para procedimentos cirúrgicos eletivos · total anual independente do filtro mensal.</p></div><MapPinned size={22} /></div>
      {pce ? <p className={styles.reading}><strong>{formatBRL(pce.amountCents)}</strong> em {pce.transactions} parcelas para {pce.municipalities} municípios no ano de {filters.year}. {data.uf === "GO" && filters.year === 2025 && "As 17 parcelas conciliam com duas ordens de pagamento já incluídas no recorte central. Elas aparecem como detalhamento, sem aumentar o total."}</p> : <p className={styles.reading}>A consulta ao PCE não retornou pagamentos em {filters.year}. Isso não significa que {data.name} deixou de pagar por cirurgias: há outros programas e contratos na rede.</p>}
      {production && <p className={styles.muted}>O SUS360 informa {formatBRL(production.amountCents)} de produção financeira no período {production.periodStart.slice(4)}/{production.periodStart.slice(0, 4)} a {production.periodEnd.slice(4)}/{production.periodEnd.slice(0, 4)}. Essa medida fica fora da soma de pagamentos. <SourceLink href={production.sourceUrl}>Consultar SUS360</SourceLink></p>}</section>
    <div className={styles.segmented}><button aria-pressed={detail === "treasury"} onClick={() => onDetailChange("treasury")}>Ordens de pagamento</button><button aria-pressed={detail === "pce"} onClick={() => onDetailChange("pce")}>Parcelas PCE · detalhe</button></div>
    <EvidenceTable data={data} slug={slug} filters={filters} ledger={detail} category="elective-surgeries" {...evidenceControls} />
  </>;
}

function BudgetView({ data, year, options, onChange }: { data: DashboardSnapshot; year: number; options: BudgetOptions; onChange: (options: BudgetOptions) => void }) {
  const report = data.fiscal.find(r => r.year === year);
  const [all, setAll] = useState(false);
  if (!report) return <section className={styles.panel}><h3>Orçamento por área</h3><p className={styles.empty}>Ainda não há relatório fiscal integrado para {year}. Escolha outro ano para consultar as funções orçamentárias.</p></section>;
  const measure = options.measure;
  const left = report.functions.some(row => row.code === options.left) ? options.left : report.functions[0]?.code ?? "";
  const right = report.functions.some(row => row.code === options.right) ? options.right : report.functions[1]?.code ?? "";
  const label = { settledCents: "Liquidado", committedCents: "Empenhado", updatedBudgetCents: "Dotação atualizada" }[measure];
  const a = report.functions.find(r => r.code === left), b = report.functions.find(r => r.code === right);
  const ranked = [...report.functions].filter(r => r[measure] !== null).sort((a, b) => (b[measure] ?? 0) - (a[measure] ?? 0));
  const total = report.totals[measure], max = Math.max(1, ranked[0]?.[measure] ?? 1);
  const value = (row: FiscalFunction | undefined) => row?.[measure] ?? null;
  const comparativeRatio = left === right ? null : getComparisonRatio(value(a), value(b));
  const reconciled = Number.isSafeInteger(total) && ranked.reduce((sum, row) => sum + (row[measure] ?? 0), 0) === total;
  return <><SectionTitle index="04" title="Compare as áreas do orçamento" text="Uma visão fiscal consolidada, além dos recortes de publicidade e cirurgias." />
    <div className={styles.note}><Landmark size={18} /><p><strong>Período oficial: {date(report.periodStart)} a {date(report.periodEnd)}.</strong> {label} por função, sem despesas intraorçamentárias. O RREO não publica pagamento por função nesta base; por isso esta visão oferece liquidado, empenhado e dotação, com os nomes corretos.</p></div>
    <div className={styles.compareFilters}><label>Medida<select value={measure} onChange={e => onChange({ left, right, measure: e.target.value as BudgetMeasure })}><option value="settledCents">Liquidado · obrigação reconhecida</option><option value="committedCents">Empenhado · compromisso assumido</option><option value="updatedBudgetCents">Dotação atualizada · autorização</option></select></label>
      <label>Área A<select value={left} onChange={e => onChange({ left: e.target.value, right, measure })}>{report.functions.map(r => <option key={r.code} value={r.code} disabled={r[measure] === null}>{r.name}{r[measure] === null ? " · sem dado nesta medida" : ""}</option>)}</select></label>
      <label>Área B<select value={right} onChange={e => onChange({ left, right: e.target.value, measure })}>{report.functions.map(r => <option key={r.code} value={r.code} disabled={r[measure] === null}>{r.name}{r[measure] === null ? " · sem dado nesta medida" : ""}</option>)}</select></label></div>
    <div className={styles.comparison}><article className={`${styles.compareCard} ${styles.adCard}`}><div className={styles.metricLabel}>{a?.name.toUpperCase()}</div><Money cents={value(a)} large /><p>{value(a) === null ? "Sem dado nesta medida" : formatBRL(value(a)!)}</p><footer>{label} · {year}</footer></article>
      <article className={`${styles.compareCard} ${styles.healthCard}`}><div className={styles.metricLabel}>{b?.name.toUpperCase()}</div><Money cents={value(b)} large /><p>{value(b) === null ? "Sem dado nesta medida" : formatBRL(value(b)!)}</p><footer>{label} · {year}</footer></article></div>
    <div className={styles.comparisonReading}><div><span>PROPORÇÃO A / B</span><strong>{comparativeRatio === null ? "—" : `${ratio(comparativeRatio)}×`}</strong></div><p>{left === right ? "Selecione duas áreas diferentes para comparar." : "Mesma classificação orçamentária, mesma etapa financeira, mesmo período e mesma fonte. Saúde inclui toda a função orçamentária; não representa apenas cirurgias. A função Comunicações também não equivale à publicidade de todos os órgãos."}</p></div>
    <section className={styles.panel}><div className={styles.chartTitle}><div><h3>O orçamento em proporção</h3><p>{label}: {formatBRL(total)} · {ranked.length} funções com valor informado</p></div>{reconciled && <span className={styles.verified}><Check size={15} />Soma conciliada</span>}</div>
      <div className={styles.horizontalRanks}>{ranked.slice(0, all ? ranked.length : 10).map((r, i) => <div key={r.code}><span>{String(i + 1).padStart(2, "0")}</span><div><strong>{r.name}</strong><i style={{ width: `${Math.max(0, r[measure]!) / max * 100}%` }} /></div><p>{compact(r[measure]!)}<small>{total > 0 ? percent(r[measure]! / total) : "—"} do total</small></p></div>)}</div>
      <button className={styles.textButton} onClick={() => setAll(!all)}>{all ? "Mostrar as 10 maiores" : `Ver todas as ${ranked.length} funções`}<ArrowRight size={15} /></button>
      <div className={styles.sourceFooter}><SourceLink href={report.functionSource.url}>RREO · funções</SourceLink><SourceLink href={report.balanceSource.url}>RREO · totais</SourceLink></div></section>
  </>;
}

function SourcesView({ data, slug }: { data: DashboardSnapshot; slug: string }) {
  return <section id="fontes" className={styles.sources}><SectionTitle index="05" title="Você consegue conferir cada número" text="Cobertura, estágio financeiro, origem e data de coleta acompanham a análise." />
    <div className={styles.coverageSummary}><ShieldCheck size={28} /><div><h3>Contas de {data.name} integradas. Cobertura temática em expansão.</h3><p>A base estadual foi percorrida em todos os meses disponíveis do recorte. Isso não certifica que todo gasto publicitário ou todo custo cirúrgico esteja discriminado. Órgãos sem valor identificado permanecem como lacuna, sem virar zero.</p></div></div>
    <div className={styles.coverageGrid}>{data.coverage.map(item => <article key={item.id}><header><h3>{item.name}</h3><span data-status={item.status}>{item.status === "integrated" ? "Base integrada" : item.status === "partial" ? "Recorte identificado" : "Fonte mapeada"}</span></header><p>{item.detail}</p><SourceLink href={item.sourceUrl}>Portal oficial</SourceLink></article>)}</div>
    <section className={styles.panel}><h3>Critérios que protegem a comparação</h3><div className={styles.methodGrid}>
      <div><span>FINANCEIRO</span><h4>Pago, liquidado e contratado têm significados próprios.</h4><p>O comparativo temático soma o valor das ordens de pagamento, inclusive recolhimentos fiscais identificados. Não é o líquido recebido pelos veículos. A visão por função usa RREO; produção SUS fica separada.</p></div>
      <div><span>CONTAGEM</span><h4>Um pagamento não vira três despesas.</h4><p>Notas, comissão e veículo são detalhes da cadeia. PCE concilia com o pagamento central e não é somado novamente. Empresas ficam em universo próprio.</p></div>
      <div><span>CLASSIFICAÇÃO</span><h4>O objeto importa mais que uma palavra.</h4><p>{data.quality.surgeryExcluded} registros inicialmente ligados a cirurgias foram retirados do recorte por tratarem de transplantes, custeio geral ou múltiplos objetos. {data.quality.classifiedCommitments} empenhos têm revisão documental de publicidade.</p></div>
      <div><span>QUALIDADE</span><h4>Ausência de informação continua visível.</h4><p>Há {data.quality.invoiceFlags} notas com observações de qualidade no recorte. Líquidos inconsistentes ficam fora da soma líquida. Valores brutos e documento original permanecem conferíveis.</p></div>
    </div></section>
    <section className={styles.panel}><div className={styles.chartTitle}><div><h3>Catálogo das fontes desta versão</h3><p>Coleta {date(data.collectedAt)} · {data.sources.length} referências</p><p>Pagamentos centrais: {data.years.map(year => `${year}, até ${date(data.windows[String(year)]?.end ?? "")}`).join(" · ")}</p></div><a className={styles.download} href={`/api/contas-do-estado/${slug}?format=manifest&v=${data.version}`} download={`politica007-${slug}-metadados.json`}><ArrowDownToLine size={16} />Metadados JSON</a></div>
      <div className={styles.sourceList}>{data.sources.map(source => <details key={source.id}><summary><span>{source.label}</span><span>{source.kind}</span></summary><p>{source.notes}</p><div className={styles.sourceFooter}><SourceLink href={source.url}>Abrir fonte</SourceLink>{source.downloadUrl && <SourceLink href={source.downloadUrl}>Arquivo / API original</SourceLink>}</div><small>Coleta: {date(source.retrievedAt)}{source.publishedAt ? ` · Atualização informada: ${date(source.publishedAt)}` : ""}</small>{source.sha256 && <code>SHA-256: {source.sha256}</code>}</details>)}</div></section>
    <div className={styles.note}><CircleHelp size={18} /><p>Diferenças entre despesas servem para examinar prioridades e fazer perguntas. Isoladamente, não comprovam irregularidade nem permitem atribuir o resultado de um serviço a uma única rubrica.</p></div>
  </section>;
}
