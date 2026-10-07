"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Check, Copy, Download, Heart, LoaderCircle, MapPin, Sparkles } from "lucide-react";
import { useShell } from "@/components/shell/shell-context";

type Filters = {
  year: number; round: number; officeCode: string; state: string; municipalityCode: string;
  zone: string; section: string; place: string; party: string; q: string; page: number;
};
type InitialFilters = Filters & { ids: number[] };
type OptionList = {
  years: number[]; yearsWithResults: number[]; rounds: number[]; offices: Array<{ code: string; label: string }>;
  states: string[]; municipalities: Array<{ code: string; label: string }>; zones: string[]; parties: string[];
};
type VoteResult = {
  historyId: number; personId: number; year: number; round: number; name: string; legalName: string | null; office: string;
  state: string; municipality: string | null; party: string | null; candidateNumber: string | null;
  votes: number; sections: number; municipalities: number; voteShare: number;
};
type SearchResult = { rows: VoteResult[]; total: number; page: number; pageSize: number; totalNominalVotes: number; totalSections: number };
type Detail = Omit<VoteResult, "municipalities"> & {
  round: number; officeCode: string; electoralUnit: string | null; municipalitiesCount: number;
  rank: number | null; partyRank: number | null;
  municipalityResults: Array<{ name: string; state: string; votes: number; sections: number }>;
  pollingResults: Array<{ name: string; placeNumber: string | null; municipality: string; state: string; zone: string; section: string; address: string | null; votes: number }>;
  timeline: Array<{ year: number; round: number; party: string | null; state: string; votes: number }>;
};
type Favorite = Pick<VoteResult, "historyId" | "personId" | "name" | "year" | "office" | "state" | "party">;

const FAVORITES_KEY = "politica007:election-vote-favorites:v1";
const number = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const percent = (value: number) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function apiParams(filters: Filters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (filters.year) params.set("ano", String(filters.year));
  if (filters.round) params.set("turno", String(filters.round));
  if (filters.officeCode) params.set("cargo", filters.officeCode);
  if (filters.state) params.set("uf", filters.state);
  if (filters.municipalityCode) params.set("municipio", filters.municipalityCode);
  if (filters.zone) params.set("zona", filters.zone);
  if (filters.section) params.set("secao", filters.section);
  if (filters.place) params.set("local", filters.place);
  if (filters.party) params.set("partido", filters.party);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params;
}

export function ElectionVoteExplorer({ initial }: { initial: InitialFilters }) {
  const { aiReviewEnabled } = useShell();
  const [filters, setFilters] = useState<Filters>({
    year: initial.year, round: initial.round, officeCode: initial.officeCode, state: initial.state,
    municipalityCode: initial.municipalityCode, zone: initial.zone, section: initial.section,
    place: initial.place, party: initial.party, q: initial.q, page: initial.page,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>(initial.ids);
  const [options, setOptions] = useState<OptionList>({ years: [], yearsWithResults: [], rounds: [], offices: [], states: [], municipalities: [], zones: [], parties: [] });
  const [results, setResults] = useState<SearchResult | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [copyState, setCopyState] = useState("");
  const [pageError, setPageError] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const scopeParams = useMemo(() => apiParams(filters), [filters]);
  const selectedKey = selectedIds.join(",");
  const hasSearch = Boolean(filters.state || filters.municipalityCode || filters.q.trim() || filters.place.trim());
  const currentYearHasNoArchive = options.years.includes(filters.year) && !options.yearsWithResults.includes(filters.year);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "[]") as Favorite[];
      setFavorites(Array.isArray(saved) ? saved.filter(item => Number.isSafeInteger(item.historyId) && item.historyId > 0).slice(0, 50) : []);
    } catch {
      setFavorites([]);
    }
    setFavoritesLoaded(true);
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* Browser storage can be disabled. */ }
  }, [favorites, favoritesLoaded]);

  useEffect(() => {
    const params = apiParams(filters);
    if (selectedKey) params.set("ids", selectedKey);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [filters, selectedKey]);

  useEffect(() => {
    const controller = new AbortController();
    const params = apiParams(filters, { mode: "options" });
    setOptionsLoading(true);
    fetch(`/api/election-votes?${params}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Não foi possível preparar os filtros.");
        return response.json() as Promise<OptionList>;
      })
      .then(data => {
        setOptions(data);
        setFilters(current => {
          let next = current;
          if (!data.years.includes(current.year) && data.years.length) next = { ...next, year: data.years[0], round: 1, officeCode: "", state: "", municipalityCode: "", zone: "", section: "", party: "" };
          if (data.rounds.length && !data.rounds.includes(next.round)) next = { ...next, round: data.rounds[0], municipalityCode: "", zone: "", section: "" };
          if (data.offices.length && !data.offices.some(item => item.code === next.officeCode)) {
            const vereador = data.offices.find(item => item.label.toLocaleUpperCase("pt-BR") === "VEREADOR");
            next = { ...next, officeCode: vereador?.code || data.offices[0].code, state: "", municipalityCode: "", zone: "", section: "", party: "" };
          }
          return next;
        });
      })
      .catch(() => { if (!controller.signal.aborted) setPageError("Não foi possível carregar as opções da eleição. Tente novamente em instantes."); })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [filters.year, filters.round, filters.officeCode, filters.state, filters.municipalityCode]);

  useEffect(() => {
    if (!filters.year || !filters.round || !filters.officeCode || !hasSearch) {
      setResults(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const params = apiParams(filters, { mode: "search" });
    setLoading(true);
    setPageError("");
    const timeout = window.setTimeout(() => {
      fetch(`/api/election-votes?${params}`, { signal: controller.signal })
        .then(response => {
          if (!response.ok) throw new Error("Não foi possível consultar os votos agora.");
          return response.json() as Promise<SearchResult>;
        })
        .then(setResults)
        .catch(error => { if (!controller.signal.aborted) setPageError(error instanceof Error ? error.message : "Não foi possível consultar os votos agora."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, filters.q || filters.place ? 250 : 80);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [filters, hasSearch]);

  useEffect(() => {
    if (!selectedIds.length) {
      setDetails([]);
      setDetailsLoading(false);
      setAnalysis("");
      setAnalysisError("");
      return;
    }
    const controller = new AbortController();
    const params = apiParams(filters, { mode: "details", ids: selectedKey });
    setDetailsLoading(true);
    fetch(`/api/election-votes?${params}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Não foi possível carregar a análise das candidaturas.");
        return response.json() as Promise<{ records: Detail[] }>;
      })
      .then(data => setDetails(data.records || []))
      .catch(error => { if (!controller.signal.aborted) setPageError(error instanceof Error ? error.message : "Não foi possível carregar a análise das candidaturas."); })
      .finally(() => { if (!controller.signal.aborted) setDetailsLoading(false); });
    return () => controller.abort();
  }, [filters.year, filters.round, filters.officeCode, filters.state, filters.municipalityCode, filters.zone, filters.section, filters.place, selectedKey]);

  const updateFilter = useCallback((key: keyof Filters, value: string | number) => {
    setFilters(current => {
      const next = { ...current, [key]: value, page: 1 };
      if (key === "year" || key === "round" || key === "officeCode") {
        next.state = ""; next.municipalityCode = ""; next.zone = ""; next.section = ""; next.party = "";
        setSelectedIds([]);
      } else if (key === "state") {
        next.municipalityCode = ""; next.zone = ""; next.section = "";
      } else if (key === "municipalityCode") {
        next.zone = ""; next.section = "";
      } else if (key === "zone") {
        next.section = "";
      }
      return next;
    });
  }, []);

  const toggleCompare = (row: VoteResult) => {
    setSelectedIds(current => {
      if (current.includes(row.historyId)) return current.filter(id => id !== row.historyId);
      if (current.length >= 3) { setCopyState("A comparação aceita até três candidaturas."); return current; }
      setAnalysis(""); setAnalysisError("");
      return [...current, row.historyId];
    });
  };

  const toggleFavorite = (row: VoteResult) => {
    setFavorites(current => current.some(item => item.historyId === row.historyId)
      ? current.filter(item => item.historyId !== row.historyId)
      : [{ historyId: row.historyId, personId: row.personId, name: row.name, year: filters.year, office: row.office, state: row.state, party: row.party }, ...current].slice(0, 50));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("Link copiado com os filtros e candidaturas selecionadas.");
    } catch {
      setCopyState("Não foi possível copiar automaticamente. Copie o endereço desta página.");
    }
    window.setTimeout(() => setCopyState(""), 3500);
  };

  const exportCsv = () => {
    if (!results?.rows.length) return;
    const columns = ["candidatura", "nome civil", "eleição", "turno", "cargo", "partido", "estado", "município", "votos nominais", "participação no recorte", "seções"];
    const lines = [columns, ...results.rows.map(row => [row.name, row.legalName || "", filters.year, filters.round, row.office, row.party || "", row.state, row.municipality || "", row.votes, row.voteShare.toFixed(2).replace(".", ","), row.sections])];
    const csv = `\uFEFF${lines.map(line => line.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `politica007-votos-${filters.year}-pagina-${filters.page}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const runAnalysis = async () => {
    if (!selectedIds.length) return;
    setAnalysisLoading(true); setAnalysisError(""); setAnalysis("");
    try {
      const response = await fetch("/api/election-votes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, filters }),
      });
      const data = await response.json() as { analysis?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "A análise por IA está indisponível.");
      setAnalysis(data.analysis || "");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "A análise por IA está indisponível. Os resultados continuam disponíveis.");
    } finally { setAnalysisLoading(false); }
  };

  return (
    <div className="space-y-6 pb-12">
      <section className="card space-y-5" aria-label="Filtros da consulta de votos">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label mb-1">Filtros encadeados</div>
            <h2 className="text-lg font-medium text-[var(--fg-1)]">Monte seu recorte eleitoral</h2>
          </div>
          {optionsLoading ? <span className="text-xs text-[var(--muted)]">Carregando opções…</span> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="platform-form">Eleição
            <select value={filters.year} onChange={event => updateFilter("year", Number(event.target.value))}>
              {options.years.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="platform-form">Turno
            <select value={filters.round} onChange={event => updateFilter("round", Number(event.target.value))}>
              {options.rounds.map(round => <option key={round} value={round}>{round}º turno</option>)}
            </select>
          </label>
          <label className="platform-form">Cargo
            <select value={filters.officeCode} onChange={event => updateFilter("officeCode", event.target.value)}>
              {options.offices.map(office => <option key={office.code} value={office.code}>{office.label}</option>)}
            </select>
          </label>
          <label className="platform-form">Estado
            <select value={filters.state} onChange={event => updateFilter("state", event.target.value)}>
              <option value="">Todos os estados</option>{options.states.map(state => <option key={state}>{state}</option>)}
            </select>
          </label>
          <label className="platform-form">Município
            <select value={filters.municipalityCode} disabled={!filters.state} onChange={event => updateFilter("municipalityCode", event.target.value)}>
              <option value="">Todos os municípios</option>{options.municipalities.map(city => <option key={city.code} value={city.code}>{city.label}</option>)}
            </select>
          </label>
          <label className="platform-form">Zona eleitoral
            <select value={filters.zone} disabled={!filters.municipalityCode} onChange={event => updateFilter("zone", event.target.value)}>
              <option value="">Todas as zonas</option>{options.zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label className="platform-form">Partido
            <select value={filters.party} onChange={event => updateFilter("party", event.target.value)}>
              <option value="">Todos os partidos</option>{options.parties.map(party => <option key={party}>{party}</option>)}
            </select>
          </label>
          <label className="platform-form">Candidatura
            <input value={filters.q} onChange={event => updateFilter("q", event.target.value)} placeholder="Nome ou nome de urna" autoComplete="off" />
          </label>
          <label className="platform-form lg:col-span-2">Local de votação
            <input value={filters.place} onChange={event => updateFilter("place", event.target.value)} placeholder={filters.year === 2012 || filters.year === 2014 ? "Número do local (nome e endereço não publicados)" : "Nome, número ou endereço publicado pelo TSE"} autoComplete="off" />
          </label>
          <label className="platform-form">Seção
            <input inputMode="numeric" value={filters.section} onChange={event => updateFilter("section", event.target.value)} placeholder="Número da seção" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]"><MapPin size={14} /> Bairros não são estimados; em 2012 e 2014 o TSE informa apenas o número do local, sem nome ou endereço.</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn" type="button" onClick={() => { setFilters(current => ({ ...current, state: "", municipalityCode: "", zone: "", section: "", place: "", party: "", q: "", page: 1 })); setSelectedIds([]); }}>Limpar filtros</button>
            <button className="btn" type="button" onClick={copyLink}><Copy size={15} /> Copiar consulta</button>
          </div>
        </div>
        {copyState ? <p className="text-sm text-[var(--muted)]" role="status">{copyState}</p> : null}
      </section>

      {filters.year === 2026 && options.years.includes(2026) && !options.yearsWithResults.includes(2026) ? <div className="card text-sm text-[var(--muted)]" role="status">
        <strong className="text-[var(--fg-1)]">2026 está disponível no seletor.</strong>{" "}
        Os votos por seção de 2026 ainda não fazem parte do acervo histórico do Raio-X. Para acompanhar os resultados oficiais e as versões já totalizadas, acesse a <Link className="link-primary" href="/apuracao">Apuração ao vivo de 2026</Link>.
      </div> : null}

      {favorites.length ? <section className="card space-y-3" aria-label="Candidaturas favoritas">
        <div className="flex items-center gap-2"><Heart size={16} className="text-rose-600" /><h2 className="font-medium">Favoritos salvos neste navegador</h2></div>
        <div className="flex flex-wrap gap-2">{favorites.map(item => <span key={item.historyId} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-sm">
          <Link href={`/politico/${item.personId}?ano=${item.year}`} className="link-primary">{item.name} · {item.year}</Link>
          <button type="button" className="text-[var(--muted)]" onClick={() => setFavorites(current => current.filter(favorite => favorite.historyId !== item.historyId))} aria-label={`Remover ${item.name} dos favoritos`}>×</button>
        </span>)}</div>
      </section> : null}

      <section className="space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label mb-1">Resultados do TSE organizados por seção</div>
            <h2 className="text-xl font-medium text-[var(--fg-1)]">Ranking no recorte escolhido</h2>
          </div>
          {results?.rows.length ? <button className="btn" type="button" onClick={exportCsv}><Download size={15} /> CSV desta página</button> : null}
        </div>
        {!hasSearch && !currentYearHasNoArchive ? <div className="card text-sm text-[var(--muted)]">Escolha um estado, município, nome de candidatura ou local de votação para carregar os resultados.</div> : null}
        {loading ? <div className="card flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin" /> Consultando o acervo eleitoral…</div> : null}
        {pageError ? <div className="card text-sm text-rose-700" role="alert">{pageError}</div> : null}
        {results ? <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Candidaturas encontradas" value={number(results.total)} />
            <Metric label="Votos nominais no recorte" value={number(results.totalNominalVotes)} />
            <Metric label="Seções com votos no recorte" value={number(results.totalSections)} />
          </div>
          <p className="text-xs leading-relaxed text-[var(--muted)]">A participação exibida nas linhas é sobre a soma dos votos nominais de candidaturas identificados para este recorte. Ela não substitui o percentual oficial sobre votos válidos e pode não incluir votos de legenda.</p>
          {results.rows.length ? <div className="grid gap-3 lg:grid-cols-2">
            {results.rows.map((row, index) => {
              const compared = selectedIds.includes(row.historyId);
              const favorite = favorites.some(item => item.historyId === row.historyId);
              return <article className="card space-y-3" key={row.historyId}>
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-mono text-sm text-[var(--muted)]">{(filters.page - 1) * results.pageSize + index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-medium"><Link className="link-primary" href={`/politico/${row.personId}?ano=${filters.year}`}>{row.name}</Link></h3>
                    <p className="text-sm text-[var(--muted)]">{row.legalName && row.legalName !== row.name ? `${row.legalName} · ` : ""}{row.office} · {row.party || "Partido não informado"}/{row.state}{row.municipality ? ` · ${row.municipality}` : ""}</p>
                  </div>
                  <button type="button" className={`btn btn--icon${favorite ? " text-rose-600" : ""}`} onClick={() => toggleFavorite(row)} aria-label={favorite ? `Remover ${row.name} dos favoritos` : `Salvar ${row.name} nos favoritos`} title="Salvar favorito"><Heart size={16} fill={favorite ? "currentColor" : "none"} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2 border-y border-[var(--line)] py-3 text-center">
                  <div><strong className="block text-lg">{number(row.votes)}</strong><span className="text-xs text-[var(--muted)]">votos</span></div>
                  <div><strong className="block text-lg">{percent(row.voteShare)}</strong><span className="text-xs text-[var(--muted)]">do recorte</span></div>
                  <div><strong className="block text-lg">{number(row.sections)}</strong><span className="text-xs text-[var(--muted)]">seções</span></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[var(--muted)]">{number(row.municipalities)} municípios · {filters.year} · {filters.round}º turno</span>
                  <button className={`btn${compared ? " btn--primary" : ""}`} type="button" onClick={() => toggleCompare(row)} aria-pressed={compared}>
                    {compared ? <><Check size={15} /> Na comparação</> : <><BarChart3 size={15} /> Analisar / comparar</>}
                  </button>
                </div>
              </article>;
            })}
          </div> : !loading && <div className="card text-sm text-[var(--muted)]">Nenhum voto encontrado com este recorte. Confira a eleição, o turno, o cargo e os filtros de local.</div>}
          <div className="flex items-center justify-between gap-2">
            <button className="btn" type="button" disabled={filters.page <= 1 || loading} onClick={() => updateFilter("page", filters.page - 1)}>Página anterior</button>
            <span className="text-sm text-[var(--muted)]">Página {filters.page} · {number(results.total)} candidaturas</span>
            <button className="btn" type="button" disabled={filters.page * results.pageSize >= results.total || loading} onClick={() => updateFilter("page", filters.page + 1)}>Próxima página</button>
          </div>
        </> : null}
      </section>

      {selectedIds.length ? <section className="space-y-4" aria-label="Análise e comparação">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><div className="label mb-1">Comparação e trajetória</div><h2 className="text-xl font-medium text-[var(--fg-1)]">Candidaturas selecionadas ({selectedIds.length}/3)</h2></div>
          <div className="flex flex-wrap gap-2">
            {aiReviewEnabled ? <button type="button" className="btn" onClick={runAnalysis} disabled={analysisLoading || detailsLoading}><Sparkles size={15} /> {analysisLoading ? "Analisando…" : "Análise por IA"}</button> : null}
            <button type="button" className="btn" onClick={() => setSelectedIds([])}>Limpar comparação</button>
          </div>
        </div>
        {detailsLoading ? <div className="card flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin" /> Organizando votos por território…</div> : null}
        {analysisError ? <div className="card text-sm text-[var(--muted)]" role="status">{analysisError} Os resultados e filtros continuam disponíveis.</div> : null}
        {analysis ? <article className="card space-y-2"><h3 className="font-medium">Leitura automatizada dos dados</h3><p className="whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">{analysis}</p><p className="text-xs text-[var(--muted)]">Resumo automatizado de dados públicos; confira os números e a fonte oficial do TSE antes de tirar conclusões.</p></article> : null}
        {details.map(record => <DetailPanel key={record.historyId} record={record} />)}
        {!detailsLoading && !details.length ? <div className="card text-sm text-[var(--muted)]">As candidaturas selecionadas não têm votos no recorte territorial atual. Amplie ou ajuste os filtros.</div> : null}
      </section> : null}

      <section className="card space-y-2">
        <div className="label">Fonte e cobertura</div>
        <p className="text-sm leading-relaxed text-[var(--muted)]">Os resultados por seção vêm dos arquivos oficiais do TSE integrados à base do Politica007. A disponibilidade de turno, cargo, local e seção varia conforme o conjunto publicado para cada eleição. Os dados preservam o recorte e a fonte; a apuração ao vivo de 2026 continua na página <Link className="link-primary" href="/apuracao">Apuração ao vivo</Link>.</p>
        <a className="source-link" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/resultados-${filters.year}`} target="_blank" rel="noreferrer">Abrir arquivos oficiais do TSE para {filters.year}</a>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card"><span className="block text-xs text-[var(--muted)]">{label}</span><strong className="mt-1 block text-xl font-medium">{value}</strong></div>;
}

function DetailPanel({ record }: { record: Detail }) {
  return <article className="card space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-medium">{record.name}</h3><p className="text-sm text-[var(--muted)]">{record.office} · {record.party || "Partido não informado"}/{record.state} · {record.year}, {record.round}º turno</p></div>
      <Link className="btn" href={`/politico/${record.personId}?ano=${record.year}`}>Ver ficha completa</Link>
    </header>
    <div className="grid gap-3 sm:grid-cols-4">
      <Metric label="Votos no recorte" value={number(record.votes)} />
      <Metric label="Participação nominal" value={percent(record.voteShare)} />
      <Metric label="Posição no recorte" value={record.rank ? `${number(record.rank)}º` : "—"} />
      <Metric label="Posição no partido" value={record.partyRank ? `${number(record.partyRank)}º` : "—"} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="min-w-0" aria-label="Votos por município">
        <h4 className="mb-2 font-medium">Distribuição por município</h4>
        {record.municipalityResults.length ? <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={record.municipalityResults} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" interval={0} angle={-28} textAnchor="end" height={58} tick={{ fontSize: 10 }} /><YAxis tickFormatter={value => number(Number(value))} width={54} tick={{ fontSize: 10 }} /><Tooltip formatter={value => number(Number(value))} /><Bar dataKey="votes" name="Votos" fill="var(--accent, #177e72)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="text-sm text-[var(--muted)]">Sem distribuição territorial disponível neste recorte.</p>}
      </section>
      <section className="min-w-0" aria-label="Evolução da votação">
        <h4 className="mb-2 font-medium">Evolução entre eleições</h4>
        {record.timeline.length > 1 ? <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={record.timeline} margin={{ top: 8, right: 16, left: 0, bottom: 12 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" tick={{ fontSize: 11 }} /><YAxis tickFormatter={value => number(Number(value))} width={54} tick={{ fontSize: 10 }} /><Tooltip formatter={value => number(Number(value))} labelFormatter={(year, payload) => `${year} · ${payload?.[0]?.payload?.round || 1}º turno`} /><Line type="monotone" dataKey="votes" name="Votos" stroke="var(--accent, #177e72)" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></div> : <p className="text-sm text-[var(--muted)]">A base não contém outra eleição comparável para esta candidatura.</p>}
      </section>
    </div>
    <section>
      <h4 className="mb-2 font-medium">Locais e seções com mais votos</h4>
      {record.pollingResults.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]"><th className="px-2 py-2">Município</th><th className="px-2 py-2">Local</th><th className="px-2 py-2">Zona</th><th className="px-2 py-2">Seção</th><th className="px-2 py-2 text-right">Votos</th></tr></thead><tbody>{record.pollingResults.map((row, index) => <tr className="border-b border-[var(--line)]" key={`${row.municipality}-${row.zone}-${row.section}-${index}`}><td className="px-2 py-2">{row.municipality}/{row.state}</td><td className="px-2 py-2">{row.name}{row.address ? <small className="block text-xs text-[var(--muted)]">{row.address}</small> : null}</td><td className="px-2 py-2">{row.zone}</td><td className="px-2 py-2">{row.section}</td><td className="px-2 py-2 text-right tabular-nums">{number(row.votes)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--muted)]">A fonte não detalha locais e seções para esta eleição.</p>}
    </section>
    <p className="text-xs leading-relaxed text-[var(--muted)]">A posição geral e a posição no partido usam os votos nominais identificados no recorte selecionado. Municípios e distritos podem variar entre eleições; a evolução descreve os registros associados à mesma pessoa na base.</p>
  </article>;
}
