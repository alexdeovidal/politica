/* eslint-disable @next/next/no-img-element -- Candidate photos are served directly by TSE; QR images are generated locally. */
"use client";

import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import QRCode from "qrcode";
import {ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, ExternalLink, History, Info, MapPin, Maximize2, Monitor, Pause, Play, Radio, RefreshCw, Search, Share2, SlidersHorizontal, Star, WifiOff, X} from "lucide-react";
import {BrandMark} from "@/components/brand/brand-lockup";
import {ThemeToggle} from "@/components/shell/theme-toggle";
import {displayName, ELECTION_YEAR, isElectedCandidate, isLiveResultComplete, LIVE_POLL_SECONDS, matchesLiveSearch, TSE_TECHNICAL_SOURCE, type ElectionSelection, type LiveCandidate, type LiveOverview, type LiveResult, type PublicConfig} from "@/lib/live-election/model";
import {LocationPicker} from "./location-picker";
import {ElectionMap} from "./election-map";
import {LiveSectionVoteBreakdown} from "./section-vote-breakdown";
import {changeElectionSelection} from "@/lib/live-election/geography";

const integer = new Intl.NumberFormat("pt-BR"), percent = new Intl.NumberFormat("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const number = (value: number | null | undefined) => value == null ? "—" : integer.format(value);
const percentage = (value: number | null | undefined) => value == null ? "—" : `${percent.format(value)}%`;
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"}) : "Aguardando publicação";
const sameSelection = (a: ElectionSelection, b: ElectionSelection) => a.turn === b.turn && a.office === b.office && a.state === b.state && a.municipality === b.municipality && a.zone === b.zone;
function selectionParams(selection: ElectionSelection) {
  const params = new URLSearchParams({turno: String(selection.turn), cargo: selection.office, uf: selection.state});
  if (selection.municipality) params.set("municipio", selection.municipality);
  if (selection.zone) params.set("zona", selection.zone);
  return params;
}
async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const request = new AbortController(), abort = () => request.abort(), timeout = window.setTimeout(abort, 15000);
  signal.addEventListener("abort", abort, {once: true});
  try {
    const response = await fetch(url, {signal: request.signal, cache: "no-store"}), text = await response.text();
    let body: {error?: string} & T;
    try { body = JSON.parse(text); } catch { throw new Error("Não foi possível consultar os dados agora. Tentaremos novamente automaticamente."); }
    if (!response.ok || body.error) throw new Error(body.error || "A fonte está temporariamente indisponível. Tentaremos novamente automaticamente.");
    return body;
  } catch (failure) {
    if (request.signal.aborted && !signal.aborted) throw new Error("A consulta demorou além do esperado. Exibindo os últimos dados salvos e tentando novamente.");
    throw failure;
  } finally {window.clearTimeout(timeout); signal.removeEventListener("abort", abort);}
}

const LOCAL_CACHE_PREFIX = "politica007:live-election:v1:";
const CACHE_FALLBACK_MESSAGE = "A fonte oficial está indisponível. Exibindo os últimos dados salvos neste dispositivo; novas tentativas continuarão automaticamente.";
function localCacheKey(kind: "config" | "result" | "overview", parts: (string | number)[]) {
  return `${LOCAL_CACHE_PREFIX}${kind}:${parts.map(part => encodeURIComponent(String(part))).join(":")}`;
}
function validConfig(value: unknown): value is PublicConfig {
  return Boolean(value && typeof value === "object" && Array.isArray((value as PublicConfig).elections) && Array.isArray((value as PublicConfig).states) && Array.isArray((value as PublicConfig).municipalities) && Array.isArray((value as PublicConfig).exteriorMunicipalities));
}
function validResult(value: unknown): value is LiveResult {
  return Boolean(value && typeof value === "object" && typeof (value as LiveResult).checkedAt === "string" && Array.isArray((value as LiveResult).candidates) && (value as LiveResult).selection);
}
function validOverview(value: unknown): value is LiveOverview {
  return Boolean(value && typeof value === "object" && typeof (value as LiveOverview).checkedAt === "string" && Array.isArray((value as LiveOverview).territories));
}
function readLocalCache<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw) as {value?: unknown};
    if (!valid(record.value)) {window.localStorage.removeItem(key); return null;}
    return record.value;
  } catch {return null;}
}
function trimLocalCache(kind: string, limit: number) {
  try {
    const prefix = `${LOCAL_CACHE_PREFIX}${kind}:`, entries: {key: string; savedAt: number}[] = [];
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      let savedAt = 0;
      try {savedAt = Number((JSON.parse(window.localStorage.getItem(key) || "{}") as {savedAt?: number}).savedAt) || 0;} catch {}
      entries.push({key, savedAt});
    }
    entries.sort((a, b) => a.savedAt - b.savedAt);
    for (const entry of entries.slice(0, Math.max(0, entries.length - limit))) window.localStorage.removeItem(entry.key);
  } catch {}
}
function writeLocalCache<T>(kind: "config" | "result" | "overview", key: string, value: T) {
  try {window.localStorage.setItem(key, JSON.stringify({savedAt: Date.now(), value}));}
  catch {
    trimLocalCache(kind, 3);
    try {window.localStorage.setItem(key, JSON.stringify({savedAt: Date.now(), value}));} catch {return;}
  }
  trimLocalCache(kind, kind === "config" ? 6 : 8);
}
function stale<T extends {stale: boolean}>(value: T): T {return {...value, stale: true};}

export function LiveElectionDashboard({initialSelection, initialConfig, initialResult, initialOverview, initialError, initialTv, initialQuery, initialParty, initialSection, initialCountry, initialNow}: {
  initialSelection: ElectionSelection; initialConfig: PublicConfig | null; initialResult: LiveResult | null;
  initialOverview: LiveOverview | null; initialError: string | null; initialTv: boolean; initialQuery: string; initialParty: string; initialSection: string; initialCountry: string; initialNow: number;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(initialSelection), [config, setConfig] = useState(initialConfig);
  const [availableYears, setAvailableYears] = useState<number[]>([ELECTION_YEAR]);
  const [data, setData] = useState(initialResult), [overview, setOverview] = useState(initialOverview);
  const [error, setError] = useState(initialError), [overviewError, setOverviewError] = useState<string | null>(null);
  const dataRef = useRef(data), overviewRef = useRef(overview);
  useEffect(() => {dataRef.current = data;}, [data]);
  useEffect(() => {overviewRef.current = overview;}, [overview]);
  const [configError, setConfigError] = useState<string | null>(null), [loading, setLoading] = useState(!initialResult), [refreshKey, setRefreshKey] = useState(0);
  const [tv, setTv] = useState(initialTv), [filtersOpen, setFiltersOpen] = useState(false), [now, setNow] = useState(initialNow), [nextPoll, setNextPoll] = useState(initialNow + LIVE_POLL_SECONDS * 1000);
  const [query, setQuery] = useState(initialQuery), [party, setParty] = useState(initialParty), [sort, setSort] = useState("votes"), [visibleCount, setVisibleCount] = useState(30);
  const [sectionFilter, setSectionFilter] = useState(initialSection);
  const [territoryQuery, setTerritoryQuery] = useState(""), [territoryCount, setTerritoryCount] = useState(12);
  const [tvPage, setTvPage] = useState(0), [rotating, setRotating] = useState(true), [copied, setCopied] = useState(false), [shareError, setShareError] = useState<string | null>(null), [qr, setQr] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [mapCountry, setMapCountry] = useState(initialCountry);
  const [configIdentity, setConfigIdentity] = useState(`${initialSelection.turn}:${initialSelection.state}`);
  const configRef = useRef(config), configIdentityRef = useRef(configIdentity);
  useEffect(() => {configRef.current = config;}, [config]);
  useEffect(() => {configIdentityRef.current = configIdentity;}, [configIdentity]);
  const [configTick, setConfigTick] = useState(0);
  const configRequestKey = useRef(initialConfig ? `${initialSelection.turn}:${initialSelection.state}:0:0` : "");
  const mounted = useRef(false);
  const selectedResult = data && sameSelection(data.selection, selection) ? data : null;
  const officeList = useMemo(() => Array.from(new Map((config?.elections.filter(election => election.turn === selection.turn).flatMap(election => election.offices) || []).map(office => [office.code, office])).values()).filter(office => selection.state === "zz" ? office.code === "1" : office.code !== "25" && (office.code !== "8" || selection.state === "df") && (office.code !== "7" || selection.state !== "df") || office.code === "25" && selection.state === "pe" && matchesLiveSearch(config?.municipalities.find(city => city.code === selection.municipality)?.name || "", "fernando de noronha")), [config, selection.turn, selection.state, selection.municipality]);
  const selectedOffice = officeList.find(office => office.code === selection.office);
  const requiresState = selection.state === "br" && selection.office !== "1";
  const selectedCity = config?.municipalities.find(city => city.code === selection.municipality);
  const states = [{code: "br", name: "Brasil e exterior"}, ...(config?.states || [])];
  const area = selectedResult?.areaName || (selectedCity ? `${selectedCity.name}${selection.state === "zz" ? " · Exterior" : `/${selection.state.toUpperCase()}`}` : states.find(state => state.code === selection.state)?.name || "Brasil e exterior");
  const status = selectedResult?.progress || "waiting";
  const started = Boolean(selectedResult?.votingReleased);
  const resultComplete = Boolean(selectedResult && isLiveResultComplete(selectedResult));
  const statusLabel = resultComplete ? selectedResult?.completedAt ? "Votação encerrada · resultado preservado no histórico" : "Votação encerrada · seções totalizadas" : status === "final" ? "Resultado final do TSE" : status === "counted" ? "Seções totalizadas" : status === "partial" ? "Apuração em andamento" : "Aguardando apuração";
  const linkParams = selectionParams(selection);
  if (query) linkParams.set("busca", query);
  if (party) linkParams.set("partido", party);
  if (sectionFilter) linkParams.set("secao", sectionFilter);
  if (tv) linkParams.set("tv", "1");
  if (selection.state === "zz" && mapCountry) linkParams.set("pais", mapCountry);
  const shareUrl = `https://politica007.com.br/apuracao?${linkParams}`;
  const parties = useMemo(() => Array.from(new Set(selectedResult?.candidates.map(candidate => candidate.party) || [])).sort(), [selectedResult]);
  const candidates = useMemo(() => {
    const rows = (selectedResult?.candidates || []).filter(candidate => (!party || candidate.party === party) && matchesLiveSearch(`${candidate.name} ${candidate.legalName} ${candidate.number} ${candidate.party}`, query));
    return [...rows].sort((a, b) => sort === "name" || !started ? a.name.localeCompare(b.name, "pt-BR") : (b.votes || 0) - (a.votes || 0) || a.name.localeCompare(b.name, "pt-BR"));
  }, [selectedResult, party, query, sort, started]);
  const tvPages = Math.max(1, Math.ceil(candidates.length / 6));
  const safeTvPage = Math.min(tvPage, tvPages - 1);
  const displayed = tv ? candidates.slice(safeTvPage * 6, safeTvPage * 6 + 6) : candidates.slice(0, visibleCount);
  const territories = (overview?.territories || []).filter(territory => matchesLiveSearch(`${territory.name} ${territory.state}`, territoryQuery));

  useEffect(() => {
    mounted.current = true;
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const configurationTimer = window.setInterval(() => setConfigTick(value => value + 1), 600000);
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", full);
    return () => {mounted.current = false; window.clearInterval(clock); window.clearInterval(configurationTimer); document.removeEventListener("fullscreenchange", full);};
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/election-votes?mode=options", {signal: controller.signal})
      .then(response => {
        if (!response.ok) throw new Error("Não foi possível carregar os anos eleitorais.");
        return response.json() as Promise<{years?: unknown}>;
      })
      .then(data => {
        const years = Array.isArray(data.years) ? data.years.map(Number).filter(year => Number.isInteger(year) && year >= 2012 && year <= ELECTION_YEAR && year % 2 === 0) : [];
        setAvailableYears([...new Set([ELECTION_YEAR, ...years])].sort((a, b) => b - a));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => { window.history.replaceState(null, "", `/apuracao?${shareUrl.split("?")[1]}`); }, [shareUrl]); // Keep a bookmarkable, shareable view without reloading.
  useEffect(() => {
    if (!tv) return;
    let active = true;
    QRCode.toDataURL(shareUrl.replace(/([?&])tv=1(&|$)/, "$1").replace(/[?&]$/, ""), {width: 140, margin: 1, errorCorrectionLevel: "M"}).then(image => {if (active) setQr(image);}).catch(() => {if (active) setQr(null);});
    return () => {active = false;};
  }, [tv, shareUrl]);
  useEffect(() => {
    const id = `${selection.turn}:${selection.state}`;
    const key = `${id}:${refreshKey}:${configTick}`;
    if (configRequestKey.current === key) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const cacheKey = localCacheKey("config", [ELECTION_YEAR, selection.turn, selection.state]);
    const cached = readLocalCache(cacheKey, validConfig);
    if (cached && (!configRef.current || configIdentityRef.current !== id)) {
      const fallback = stale(cached); configRef.current = fallback; configIdentityRef.current = id;
      setConfigIdentity(id); setConfig(fallback); setConfigError(CACHE_FALLBACK_MESSAGE);
    }
    json<PublicConfig>(`/api/apuracao/config?turno=${selection.turn}&uf=${selection.state}`, controller.signal).then(value => {
      configRequestKey.current = key; writeLocalCache("config", cacheKey, value); configRef.current = value; configIdentityRef.current = id; setConfigIdentity(id); setConfig(value); setConfigError(null);
    }).catch(failure => {if (!controller.signal.aborted) {setConfigError(failure.message); retry = setTimeout(() => setRefreshKey(value => value + 1), 60000);}});
    return () => {controller.abort(); clearTimeout(retry);};
  }, [selection.turn, selection.state, refreshKey, configTick]);
  useEffect(() => {
    if (!tv || !rotating || tvPages < 2) return;
    const timer = window.setInterval(() => setTvPage(page => (page + 1) % tvPages), 12000);
    return () => window.clearInterval(timer);
  }, [tv, rotating, tvPages]);
  useEffect(() => {
    if (requiresState) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, running = false;
    let completed = Boolean(dataRef.current?.completedAt && sameSelection(dataRef.current.selection, selection) && isLiveResultComplete(dataRef.current));
    if (completed) {setNextPoll(0); return () => controller.abort();}
    const params = selectionParams(selection).toString();
    const resultKey = localCacheKey("result", [ELECTION_YEAR, selection.turn, selection.office, selection.state, selection.municipality, selection.zone]);
    const overviewKey = localCacheKey("overview", [ELECTION_YEAR, selection.turn, selection.state]);
    const cachedResult = readLocalCache(resultKey, validResult);
    const cachedOverview = readLocalCache(overviewKey, validOverview);
    if (cachedResult && sameSelection(cachedResult.selection, selection) && (!dataRef.current || !sameSelection(dataRef.current.selection, selection))) {
      setData(stale(cachedResult)); setError(CACHE_FALLBACK_MESSAGE); setLoading(false);
    }
    if (cachedOverview && !overviewRef.current) {
      setOverview(stale(cachedOverview)); setOverviewError(CACHE_FALLBACK_MESSAGE);
    }
    async function refresh() {
      if (controller.signal.aborted || running || completed) return;
      if (document.hidden && !tv) {timer = setTimeout(refresh, LIVE_POLL_SECONDS * 1000); return;}
      running = true; setLoading(true);
      const responses = await Promise.allSettled([
        json<LiveResult>(`/api/apuracao/results?${params}`, controller.signal),
        json<LiveOverview>(`/api/apuracao/overview?${params}`, controller.signal),
      ]);
      if (!controller.signal.aborted) {
        if (responses[0].status === "fulfilled") {
          const result = responses[0].value;
          completed = isLiveResultComplete(result);
          writeLocalCache("result", resultKey, result); setData(result); setError(null);
        } else setError(responses[0].reason.message);
        if (responses[1].status === "fulfilled") {writeLocalCache("overview", overviewKey, responses[1].value); setOverview(responses[1].value); setOverviewError(null);} else {setOverview(current => current ? stale(current) : null); setOverviewError(responses[1].reason.message);}
        setLoading(false);
        if (completed) setNextPoll(0);
        else {setNextPoll(Date.now() + LIVE_POLL_SECONDS * 1000); timer = setTimeout(refresh, LIVE_POLL_SECONDS * 1000);}
      }
      running = false;
    }
    const wake = () => {if (!completed && !document.hidden) {clearTimeout(timer); void refresh();}};
    document.addEventListener("visibilitychange", wake); window.addEventListener("online", wake);
    void refresh();
    return () => {controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake);};
  }, [selection, refreshKey, requiresState, tv]);

  function resetCandidatePages() {setTvPage(0); setVisibleCount(30);}
  function updateQuery(value: string) {setQuery(value); resetCandidatePages();}
  function updateParty(value: string) {setParty(value); resetCandidatePages();}
  function updateSort(value: string) {setSort(value); resetCandidatePages();}
  const changeSelection = useCallback((change: Partial<ElectionSelection>) => {
    setTvPage(0); setVisibleCount(30); setTerritoryQuery(""); setTerritoryCount(12); setLoading(false);
    setSelection(current => changeElectionSelection(current, change));
    if (change.municipality !== undefined || change.state && change.state !== "zz") setMapCountry("");
    setOverview(null); setParty(""); setQuery(""); setError(null);
    if (change.state !== undefined || change.municipality !== undefined) setSectionFilter("");
  }, []);
  async function toggleTv() {
    if (tv) {setTv(false); setFiltersOpen(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});}
    else {setTv(true); setFiltersOpen(false); await document.documentElement.requestFullscreen?.().catch(() => {});}
  }
  async function share() {
    setShareError(null);
    try {
      if (navigator.share) await navigator.share({title: `Apuração 2026 · ${selectedOffice?.name || "Resultados"} · ${area}`, text: "Acompanhe os resultados com dados oficiais do TSE no Politica007.", url: shareUrl.replace(/([?&])tv=1(&|$)/, "$1").replace(/[?&]$/, "")});
      else {await navigator.clipboard.writeText(shareUrl); setCopied(true); window.setTimeout(() => {if (mounted.current) setCopied(false);}, 2500);}
    } catch (failure) {if (!(failure instanceof DOMException && failure.name === "AbortError")) setShareError("Use o endereço desta página para compartilhar a consulta.");}
  }
  function downloadCsv() {
    if (!selectedResult) return;
    const cell = (value: unknown) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [["Cargo", "Abrangência", "Número", "Nome de urna", "Nome completo", "Partido", "Votos computados", "Percentual TSE", "Destinação", "Situação TSE", "Última totalização", "Fonte oficial"], ...selectedResult.candidates.map(candidate => [selectedResult.office.name, selectedResult.areaName, candidate.number, candidate.name, candidate.legalName, candidate.party, candidate.votes, candidate.percentage, candidate.destination, candidate.status, selectedResult.totalizedAt, selectedResult.sourceUrl])];
    const blob = new Blob(["\uFEFF", rows.map(row => row.map(cell).join(";")).join("\r\n")], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `politica007-apuracao-2026-${selection.state}-${selection.office}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const filters = <div className="live-filters">
    <label className="live-field"><span className="live-field-label">Eleição</span><select aria-label="Ano da eleição" value={ELECTION_YEAR} onChange={event => {const year = Number(event.target.value); if (year !== ELECTION_YEAR && availableYears.includes(year)) router.push(`/votos?ano=${year}`);}}>{availableYears.map(year => <option key={year} value={year}>{year}{year === ELECTION_YEAR ? " · apuração" : " · histórico"}</option>)}</select></label>
    <label className="live-field"><span className="live-field-label">Turno</span><select aria-label="Turno" value={selection.turn} onChange={event => changeSelection({turn: Number(event.target.value), office: "1", zone: ""})}>{Array.from(new Set(config?.elections.map(election => election.turn) || [1])).sort().map(turn => <option key={turn} value={turn}>{turn}º turno · 2026</option>)}</select></label>
    <LocationPicker label="Estado ou abrangência" value={selection.state === "br" ? "" : selection.state} options={config?.states || []} allLabel="Brasil e exterior" onChange={state => changeSelection({state: state || "br"})}/>
    <LocationPicker label={selection.state === "zz" ? "Cidade no exterior" : "Cidade"} value={selection.municipality} options={configIdentity === `${selection.turn}:${selection.state}` ? config?.municipalities || [] : []} allLabel={selection.state === "zz" ? "Todo o exterior" : selection.state === "br" ? "Selecione um estado" : "Todas as cidades"} onChange={municipality => changeSelection({municipality})} disabled={selection.state === "br" || configIdentity !== `${selection.turn}:${selection.state}`}/>
    <label className="live-field live-field--zone"><span className="live-field-label">Zona eleitoral</span><select aria-label="Zona eleitoral" disabled={!selection.municipality} value={selection.zone} onChange={event => changeSelection({zone: event.target.value})}><option value="">Todas as zonas</option>{selectedCity?.zones.map(zone => <option key={zone} value={zone}>Zona {Number(zone)}</option>)}</select></label>
    <label className="live-field live-field--section"><span className="live-field-label">Seção (opcional)</span><input aria-label="Número da seção, opcional" inputMode="numeric" pattern="[0-9]*" maxLength={4} disabled={!selection.municipality} value={sectionFilter} placeholder="Ex.: 593" onChange={event => setSectionFilter(event.target.value.replace(/\D/g, "").slice(0, 4))}/></label>
    <button className="live-button live-button--reset" type="button" onClick={() => changeSelection({state: "br", municipality: "", zone: "", office: "1"})}>Visão nacional <ArrowRight size={16}/></button>
  </div>;
  const officeTabs = <div className="live-offices" role="tablist" aria-label="Cargo em disputa">{officeList.map(office => <button key={office.code} type="button" role="tab" aria-selected={selection.office === office.code} className={selection.office === office.code ? "is-active" : ""} onClick={() => changeSelection({office: office.code})}>{office.name}</button>)}</div>;
  const candidateFilters = <div className="live-candidate-filters"><label className="live-search"><Search size={17}/><input aria-label="Pesquisar candidatura em todos os resultados" placeholder="Nome, número ou partido do candidato" value={query} onChange={event => updateQuery(event.target.value)}/>{query && <button type="button" onClick={() => updateQuery("")} aria-label="Limpar pesquisa de candidaturas"><X size={15}/></button>}</label><label className="sr-only" htmlFor="live-party">Partido</label><select id="live-party" aria-label="Partido" value={party} onChange={event => updateParty(event.target.value)}><option value="">Todos os partidos</option>{parties.map(name => <option key={name} value={name}>{name}</option>)}</select><label className="sr-only" htmlFor="live-sort">Ordenação</label><select id="live-sort" aria-label="Ordenação" value={sort} onChange={event => updateSort(event.target.value)}><option value="votes">{started ? "Mais votos" : "Ordem alfabética"}</option><option value="name">Nome · A–Z</option></select></div>;
  const unhealthy = Boolean(error || configError || (selectedResult?.stale && !resultComplete));
  const lastUpdate = selectedResult?.totalizedAt || selectedResult?.generatedAt;

  return <main className={`live-election${tv ? " live-election--tv" : ""}`} data-live-tv={tv ? "true" : "false"}>
    <div className="live-election__inner">
      <header className="live-header">
        <Link href="/" className="live-brand" aria-label="Voltar ao portal Politica007"><BrandMark/><span><strong>Politica007</strong><small>APURAÇÃO ELEITORAL</small></span></Link>
        <span className={`live-badge${started && !resultComplete ? " is-counting" : ""}`}><span/> {resultComplete ? status === "final" ? "RESULTADO FINAL" : "VOTAÇÃO ENCERRADA" : started && !unhealthy ? status === "counted" ? "SEÇÕES TOTALIZADAS" : "EM APURAÇÃO" : unhealthy ? "RECONECTANDO" : "ELEIÇÕES 2026"}</span>
        <div className="live-header__actions">
          {!tv && <><Link href="/" className="live-button live-button--portal"><ArrowLeft size={16}/>Portal</Link><ThemeToggle/></>}
          {!tv && <Link href={`/apuracao/historico?${selectionParams(selection)}`} className="live-button" aria-label="Consultar versões salvas desta apuração"><History size={16}/><span>Histórico</span></Link>}
          <button type="button" className="live-button live-button--share" onClick={share} aria-label="Compartilhar esta apuração">{copied ? <Check size={17}/> : <Share2 size={17}/>}<span>{copied ? "Link copiado" : "Compartilhar"}</span></button>
          {tv && <button type="button" className="live-button" aria-label="Filtros da apuração" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17}/><span>Filtros</span></button>}
          <button type="button" className="live-button live-button--primary" aria-label={tv ? "Sair do modo TV" : "Modo TV"} onClick={toggleTv}><Monitor size={18}/><span>{tv ? "Sair do modo TV" : "Modo TV"}</span></button>
          {tv && !fullscreen && <button type="button" className="live-button live-fullscreen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} aria-label="Ativar tela cheia"><Maximize2 size={17}/></button>}
        </div>
      </header>
      {!tv && <div className="live-intro"><div><span className="live-eyebrow"><Radio size={15}/> DADOS OFICIAIS DO TSE</span><h1>Acompanhe cada voto.</h1><p>Resultados, candidaturas e o avanço da apuração em uma só tela.</p></div><div className="live-intro__date"><span>ELEIÇÕES GERAIS</span><strong>2026 <i>·</i> {selection.turn}º turno</strong><small>{resultComplete ? selectedResult?.completedAt ? "Votação encerrada · resultado salvo no histórico" : "Votação encerrada · totalização completa do TSE" : "Atualização automática a cada 30 segundos"}</small></div></div>}
      {(!tv || filtersOpen) && <div className="live-location-tools"><section className="live-filter-panel" aria-label="Filtros da apuração">{filters}{officeTabs}{tv && candidateFilters}{tv && <div className="live-tv-filter-note">Feche os filtros para apresentar os resultados. A troca de candidatos ocorre a cada 12 segundos.</div>}</section><ElectionMap selection={selection} config={config} configReady={configIdentity === `${selection.turn}:${selection.state}`} overview={overview} country={mapCountry} onCountry={setMapCountry} onSelect={changeSelection}/>{tv && <button className="live-button live-button--primary live-map-present" type="button" onClick={() => setFiltersOpen(false)}><Monitor size={16}/>Apresentar resultados</button>}</div>}
      {(configError || shareError) && <p className="live-notice" role="status">{configError || shareError}</p>}

      <div className={`live-connection${unhealthy ? " is-unhealthy" : ""}`} role="status">
        <span>{unhealthy ? <WifiOff size={16}/> : <span className="live-status-dot"/>}{unhealthy ? selectedResult ? "Exibindo a última consulta válida. Tentando reconectar." : "Tentando conectar à fonte oficial" : statusLabel}</span>
        <div><span className="live-update-label">{started ? "Totalização TSE" : "Arquivo TSE"}: <strong>{dateTime(lastUpdate)}</strong> (Brasília)</span><button type="button" className="live-refresh" disabled={loading || resultComplete} onClick={() => setRefreshKey(value => value + 1)} aria-label={resultComplete ? selectedResult?.completedAt ? "Resultado encerrado e salvo" : "Totalização encerrada" : "Consultar atualizações agora"}>{resultComplete && selectedResult?.completedAt ? <Check size={14}/> : resultComplete ? null : <RefreshCw size={14} className={loading ? "is-spinning" : ""}/>} {loading ? "Consultando" : resultComplete ? selectedResult?.completedAt ? "Resultado salvo" : "Totalização encerrada" : `Consulta em ${Math.max(0, Math.ceil((nextPoll - now) / 1000))}s`}</button></div>
      </div>

      {tv && <div className="live-tv-heading"><div><span>{selectedOffice?.name || "Resultados"} · {selection.turn}º turno</span><h1>{area}</h1></div><div className="live-tv-progress"><strong>{percentage(selectedResult?.sections.percentage)}</strong><span>das seções totalizadas</span></div><div className="live-tv-votes"><strong>{number(selectedResult?.votes.valid)}</strong><span>votos válidos no recorte</span></div></div>}

      {requiresState ? <div className="live-empty live-empty--state"><MapPin size={36}/><h2>De qual estado você quer acompanhar?</h2><p>Escolha um estado nos filtros para consultar {selectedOffice?.name?.toLowerCase() || "este cargo"} e suas candidaturas.</p></div> : <div className="live-main-grid">
        <section className="live-candidates-panel" aria-labelledby="live-candidates-title">
          {!tv && <div className="live-section-heading"><div><span className="live-eyebrow">{selection.turn}º TURNO · {selection.zone ? `ZONA ${Number(selection.zone)}` : selection.state === "br" ? "ABRANGÊNCIA NACIONAL" : selection.municipality ? "VOTAÇÃO NA CIDADE" : "VOTAÇÃO NA ABRANGÊNCIA"}</span><h2 id="live-candidates-title">{selectedOffice?.name || "Resultados"}<span> · {area}</span></h2></div><span className="live-count">{number(selectedResult?.candidates.length)} candidaturas</span></div>}
          {tv && <h2 id="live-candidates-title" className="sr-only">Candidaturas para {selectedOffice?.name}</h2>}
          {!tv && candidateFilters}
          {error && <div className="live-notice" role="alert"><WifiOff size={18}/><p>{error}</p></div>}
          {!started && selectedResult && <div className="live-waiting"><Clock3 size={22}/><div><strong>Os votos deste recorte ainda não foram divulgados.</strong><p>As candidaturas abaixo vêm do cadastro oficial. A tela acompanha automaticamente a publicação da apuração pelo TSE.</p></div></div>}
          {selectedResult?.mathematicalDecision && <div className="live-notice"><Info size={18}/><p>O TSE indica {selectedResult.mathematicalDecision === "s" ? "definição matemática de segundo turno" : "definição matemática da eleição"}. A situação de cada candidatura segue a totalização final informada pelo TSE.</p></div>}
          {selectedResult?.noWinnersReason.length ? <div className="live-notice"><Info size={18}/><p>O TSE informa que não houve atribuição de eleitos: {selectedResult.noWinnersReason.join("; ")}.</p></div> : null}
          <div className="live-candidate-list" aria-busy={loading && !selectedResult} style={tv ? {"--live-tv-columns": displayed.length === 4 ? 2 : Math.min(3, displayed.length || 3), "--live-tv-rows": displayed.length > 0 && displayed.length <= 3 ? 1 : 2} as CSSProperties : undefined}>
            {displayed.map(candidate => <CandidateCard key={`${candidate.id}-${selection.office}`} candidate={candidate} selection={selectedResult?.selection || selection} sectionFilter={sectionFilter} rank={started ? (selectedResult?.candidates.findIndex(item => item.id === candidate.id) ?? -1) + 1 : null} tv={tv} finalized={resultComplete}/>) }
            {!selectedResult && loading && Array.from({length: tv ? 6 : 4}, (_, index) => <div className="live-candidate-skeleton" key={index}><i/><div><span/><span/></div><b/></div>)}
          </div>
          {selectedResult && !candidates.length && <div className="live-empty"><Search size={30}/><h3>Nenhuma candidatura encontrada.</h3><p>Buscamos em todas as {number(selectedResult.candidates.length)} candidaturas deste cargo e local, incluindo as que ainda não estão na tela.</p><button type="button" className="live-button" onClick={() => {updateQuery(""); updateParty("");}}>Limpar pesquisa</button></div>}
          {!tv && candidates.length > visibleCount && <button type="button" className="live-button live-load-more" onClick={() => setVisibleCount(value => value + 30)}>Ver mais candidaturas <ChevronDown size={17}/><span>{Math.min(visibleCount, candidates.length)} de {number(candidates.length)}</span></button>}
          {!tv && selectedResult && <p className="live-vote-note"><Info size={14}/><span>{selection.office === "5" ? "Cada eleitor pode votar em dois candidatos a senador. " : ""}Percentuais e destinação de votos seguem o TSE. {selection.municipality || selection.zone ? "A votação exibida é do recorte selecionado; o resultado do cargo considera sua abrangência eleitoral. " : ""}{selectedOffice?.proportional ? "A eleição proporcional também depende dos votos de legenda, quocientes e regras de distribuição de vagas." : ""}</span></p>}
        </section>

        {!tv && <aside className="live-side-panels">
          <section className="live-summary-panel" aria-labelledby="live-summary-title"><div className="live-section-heading"><h2 id="live-summary-title">Andamento da apuração</h2><span className="live-count">{selectedResult?.seats ? `${selectedResult.seats} ${selectedResult.seats === 1 ? "vaga" : "vagas"}` : "TSE"}</span></div><div className="live-progress-ring" style={{"--live-progress": `${(selectedResult?.sections.percentage || 0) * 3.6}deg`} as CSSProperties}><div><strong>{percentage(selectedResult?.sections.percentage)}</strong><span>seções totalizadas</span></div></div><p className="live-section-total"><strong>{number(selectedResult?.sections.counted)}</strong> de <strong>{number(selectedResult?.sections.total)}</strong> seções</p><div className="live-summary-rows"><Metric label="Votos válidos" value={selectedResult?.votes.valid}/><Metric label="Brancos" value={selectedResult?.votes.blank}/><Metric label="Nulos" value={selectedResult?.votes.null}/><Metric label="Total de votos" value={selectedResult?.votes.total} emphasis/></div><p className="live-summary-foot">{status === "counted" ? "Todas as seções deste recorte foram totalizadas. A situação final do cargo pode depender da finalização da eleição." : status === "final" ? "Totalização final informada pelo TSE para esta abrangência." : "Resultados parciais mudam com a chegada dos boletins de urna."}</p></section>
          <section className="live-territories-panel"><div className="live-section-heading"><h2>{selection.state === "br" ? "Apuração nos estados" : selection.state === "zz" ? "Localidades no exterior" : "Apuração nas cidades"}</h2><MapPin size={17}/></div><p>Selecione uma localidade para explorar seus votos.</p><label className="live-search"><Search size={16}/><input aria-label="Pesquisar localidade no andamento da apuração" placeholder={selection.state === "br" ? "Encontrar estado..." : "Encontrar cidade..."} value={territoryQuery} onChange={event => {setTerritoryQuery(event.target.value); setTerritoryCount(12);}}/></label>{overviewError && <p className="live-small-notice">{overview ? "Não foi possível atualizar as localidades. Exibindo a última consulta válida." : "O acompanhamento territorial ainda não está disponível neste recorte."}</p>}<div className="live-territories">{territories.slice(0, territoryCount).map(territory => <button key={territory.code} type="button" onClick={() => changeSelection({state: territory.state, municipality: territory.municipality, zone: ""})}><div><strong>{territory.name}</strong><span>{percentage(territory.percentage)}<ChevronRight size={14}/></span></div><span className="live-territory-bar"><i style={{width: `${territory.percentage}%`}}/></span><small>{number(territory.counted)} de {number(territory.sections)} seções</small></button>)}</div>{territories.length > territoryCount && <button type="button" className="live-territory-more" onClick={() => setTerritoryCount(count => count + 30)}>Ver mais localidades <ChevronDown size={15}/></button>}{overview?.sourceUrl && <a className="live-source-link" target="_blank" rel="noopener noreferrer" href={overview.sourceUrl}>Fonte deste acompanhamento <ExternalLink size={12}/></a>}</section>
        </aside>}
      </div>}

      {!tv && selectedResult && <section className="live-detail-panel"><details><summary><div><Info size={18}/><span>Todos os números deste recorte<small>Eleitorado, seções, destinação dos votos e partidos</small></span></div><ChevronDown size={18}/></summary><div className="live-detail-grid"><div><h3>Eleitorado</h3><Metric label="Eleitores aptos" value={selectedResult.voters.eligible}/><Metric label="Comparecimento" value={selectedResult.voters.attendance}/><Metric label="Comparecimento nas seções totalizadas" text={percentage(selectedResult.voters.attendancePercentage)}/><Metric label="Abstenções" value={selectedResult.voters.abstention}/><Metric label="Abstenção nas seções totalizadas" text={percentage(selectedResult.voters.abstentionPercentage)}/></div><div><h3>Seções eleitorais</h3><Metric label="Total" value={selectedResult.sections.total}/><Metric label="Totalizadas" value={selectedResult.sections.counted}/><Metric label="Não totalizadas" value={selectedResult.sections.pending}/><Metric label="Instaladas" value={selectedResult.sections.installed}/><Metric label="Apuradas" value={selectedResult.sections.tallied}/><Metric label="Não apuradas" value={selectedResult.sections.notTallied}/><Metric label="Não instaladas" value={selectedResult.sections.notInstalled}/></div><div><h3>Destinação dos votos</h3><Metric label="Nominais válidos" value={selectedResult.votes.nominal}/><Metric label="Votos de legenda" value={selectedResult.votes.party}/><Metric label="Anulados" value={selectedResult.votes.annulled}/><Metric label="Anulados sub judice" value={selectedResult.votes.subJudice}/><Metric label="Nulos técnicos" value={selectedResult.votes.technicalNull}/><Metric label="Sem candidatos votáveis" value={selectedResult.votes.withoutCandidate}/></div></div>{selectedOffice?.proportional && <div className="live-party-totals"><h3>Votação por partido</h3>{selectedResult.parties.map(item => <div key={item.number}><strong>{item.abbreviation} · {item.number}</strong><span>Nominais computados: {number(item.nominal)}</span><span>Legenda computada: {number(item.legend)}</span><small>{item.destination}</small></div>)}</div>}</details></section>}

      <footer className="live-footer">
        {tv ? <><div className="live-tv-watermark"><BrandMark/><div><strong>politica007.com.br</strong><span>Fonte: TSE · Portal independente</span></div></div><div className="live-tv-pages"><button type="button" onClick={() => setTvPage(page => (page - 1 + tvPages) % tvPages)} aria-label="Candidaturas anteriores"><ChevronLeft size={20}/></button><span>{candidates.length ? `${safeTvPage * 6 + 1}–${Math.min(safeTvPage * 6 + 6, candidates.length)} de ${number(candidates.length)} candidaturas` : "Aguardando dados"}</span><button type="button" onClick={() => setTvPage(page => (page + 1) % tvPages)} aria-label="Próximas candidaturas"><ChevronRight size={20}/></button><button type="button" aria-pressed={!rotating} onClick={() => setRotating(value => !value)} aria-label={rotating ? "Pausar rotação de candidaturas" : "Retomar rotação de candidaturas"}>{rotating ? <Pause size={17}/> : <Play size={17}/>}</button></div><div className="live-tv-qr"><span>Acompanhe<br/>no seu celular</span>{qr && <img src={qr} width={70} height={70} alt="QR Code para acompanhar esta apuração no Politica007"/>}</div></> : <><div><strong><span className="live-status-dot"/> {resultComplete ? selectedResult?.completedAt ? "Votação encerrada · versão preservada no histórico" : "Votação encerrada · totalização do TSE" : unhealthy ? "Tentando reconectar à fonte oficial" : selectedResult ? "Conectado à fonte oficial" : "Aguardando conexão com a fonte oficial"}</strong><p>{resultComplete ? selectedResult?.completedAt ? `Seções totalizadas pelo TSE; resultado guardado no banco do Politica007. Última consulta: ${dateTime(selectedResult.checkedAt)} (Brasília).` : `Todas as seções foram totalizadas pelo TSE. Última consulta: ${dateTime(selectedResult?.checkedAt)} (Brasília).` : <>Consultas automáticas a cada 30 segundos. Os arquivos do TSE são publicados conforme a totalização.<br/>Última consulta válida: {dateTime(selectedResult?.checkedAt)} (Brasília).</>}</p><p>Politica007 é um portal independente. As informações reproduzem os arquivos públicos do TSE.</p></div><div className="live-footer__actions"><button type="button" className="live-button" disabled={!selectedResult} onClick={downloadCsv}><Download size={16}/>Baixar dados CSV</button>{selectedResult?.sourceUrl && <a className="live-source-link" href={selectedResult.sourceUrl} target="_blank" rel="noopener noreferrer">Arquivo oficial deste resultado <ExternalLink size={14}/></a>}<a className="live-source-link" href={TSE_TECHNICAL_SOURCE} target="_blank" rel="noopener noreferrer">Documentação e fonte TSE <ExternalLink size={14}/></a></div></>}
      </footer>
    </div>
  </main>;
}

function Metric({label, value, text, emphasis = false}: {label: string; value?: number | null; text?: string; emphasis?: boolean}) {
  return <div className={`live-metric${emphasis ? " live-metric--emphasis" : ""}`}><span>{label}</span><strong>{text ?? number(value)}</strong></div>;
}
function CandidateCard({candidate, selection, sectionFilter, rank, tv, finalized}: {candidate: LiveCandidate; selection: ElectionSelection; sectionFilter: string; rank: number | null; tv: boolean; finalized: boolean}) {
  const [failed, setFailed] = useState(false);
  const initials = candidate.name.split(/\s+/).filter(Boolean).slice(0, 2).map(name => name[0]).join("");
  const elected = isElectedCandidate(candidate.status);
  return <article className={`live-candidate${elected ? " live-candidate--elected" : ""}`}>
    <div className="live-candidate__identity">{rank && <span className="live-candidate__rank">{String(rank).padStart(2, "0")}</span>}<div className="live-candidate__photo">{candidate.photoUrl && !failed ? <img src={candidate.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span>{initials || candidate.party.slice(0, 2)}</span>}</div><div className="live-candidate__name"><h3>{candidate.profileUrl ? <Link href={candidate.profileUrl} aria-label={`Abrir ficha completa de ${displayName(candidate.name)}`}>{displayName(candidate.name)}</Link> : displayName(candidate.name)}{elected && <span className="live-candidate__winner" aria-label="Candidato eleito" title="Eleito segundo o TSE"><Star size={14} fill="currentColor" aria-hidden="true"/> Eleito</span>}</h3><p>{candidate.party} <span>·</span> {candidate.number}</p>{candidate.status && <span className="live-candidate__status">{candidate.status}</span>}{candidate.destination && candidate.destination !== "Válido" && <span className="live-candidate__destination">{candidate.destination}</span>}</div></div>
    <div className="live-candidate__numbers"><strong>{percentage(candidate.percentage)}</strong><span>{number(candidate.votes)} <small>votos</small></span></div>
    <div className="live-candidate__bar" role="img" aria-label={candidate.percentage === null ? "Votação ainda não divulgada" : `${percentage(candidate.percentage)} conforme o TSE`}><i style={{width: `${candidate.percentage || 0}%`}}/></div>
    {!tv && (selection.state !== "zz" || selection.office === "1") && <LiveSectionVoteBreakdown selection={selection} candidate={candidate} sectionFilter={sectionFilter} finalized={finalized}/>}
    {!tv && <details className="live-candidate__details"><summary>Detalhes da candidatura <ChevronDown size={12}/></summary><div><p><strong>Nome completo:</strong> {displayName(candidate.legalName)}</p><p><strong>Partido:</strong> {candidate.partyName}</p><p><strong>Coligação ou agrupamento:</strong> {candidate.coalition}</p>{candidate.runningMates.map((mate, index) => <p key={index}><strong>{mate.role}:</strong> {displayName(mate.name)} · {mate.party}</p>)}{candidate.destination && <p><strong>Destinação dos votos:</strong> {candidate.destination}</p>}<p>Percentual de votos computados informado pelo TSE para este cargo e recorte.</p></div></details>}
  </article>;
}
