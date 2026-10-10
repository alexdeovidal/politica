"use client";

import {ExternalLink, MapPin, RefreshCw, Search} from "lucide-react";
import {useEffect, useMemo, useRef, useState} from "react";
import type {ElectionSelection, LiveCandidate} from "@/lib/live-election/model";
import type {LiveSectionVote, LiveSectionVotePage} from "@/lib/live-election/sections";

type SectionResponse = LiveSectionVotePage & {error?: string};
const number = new Intl.NumberFormat("pt-BR");

function dateTime(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("pt-BR", {dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo"}).format(new Date(value)) : "aguardando boletim";
}

function query(turn: number, office: string, state: string, municipality: string, zone: string, candidateId: string, page: number, sectionQuery: string, sectionFilter: string) {
  const params = new URLSearchParams({turno: String(turn), cargo: office, uf: state, municipio: municipality, zona: zone, candidato: candidateId, pagina: String(page)});
  if (sectionQuery) params.set("q", sectionQuery);
  if (sectionFilter) params.set("secao", sectionFilter);
  return `/api/apuracao/sections?${params}`;
}

export function LiveSectionVoteBreakdown({selection, candidate, sectionFilter = "", finalized = false}: {selection: ElectionSelection; candidate: LiveCandidate; sectionFilter?: string; finalized?: boolean}) {
  const previewRef = useRef<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedSectionFilter, setDebouncedSectionFilter] = useState(sectionFilter);
  const [saved, setSaved] = useState<{key: string; query: string; page: number; rows: LiveSectionVote[]; meta: SectionResponse} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const municipalitySelected = selection.state !== "br" && Boolean(selection.municipality);
  const stateSelected = selection.state !== "br" && selection.state !== "zz";
  const breakdownSelected = municipalitySelected || stateSelected || selection.state === "br" && selection.office === "1";
  const archiveQuery = selection.state === "br" || stateSelected && !municipalitySelected || Boolean(debouncedSearch && !/^(?:se[cç][aã]o\s*)?\d{1,4}$/i.test(debouncedSearch));
  const selectionKey = useMemo(() => [selection.turn, selection.office, selection.state, selection.municipality, selection.zone, candidate.id].join(":"), [selection.turn, selection.office, selection.state, selection.municipality, selection.zone, candidate.id]);
  const viewKey = `${selectionKey}:${debouncedSectionFilter}`;
  const {turn, office, state, municipality, zone} = selection;
  const candidateId = candidate.id;
  const view = saved?.key === viewKey && saved.query === debouncedSearch ? saved : null;
  const page = view?.page || 1;
  const rows = view?.rows || [];
  const meta = view?.meta || null;
  const totalPages = meta?.totalPages || 0;

  useEffect(() => {
    const target = previewRef.current;
    if (!target) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {rootMargin: "180px 0px"});
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSectionFilter(sectionFilter.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [sectionFilter]);

  useEffect(() => {
    setExpanded(false);
    setSearch("");
    setDebouncedSearch("");
  }, [selectionKey]);

  useEffect(() => {
    if (!nearViewport || !breakdownSelected) return;
    let stopped = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === "hidden") {
        if (!finalized || archiveQuery) timer = window.setTimeout(refresh, 60000);
        return;
      }
      setLoading(true);
      setError("");
      let retryIn = 60000;
      try {
        const response = await fetch(query(turn, office, state, municipality, zone, candidateId, page, debouncedSearch, debouncedSectionFilter), {signal: controller.signal, cache: "no-store"});
        const data = await response.json().catch(() => null) as SectionResponse | null;
        if (!response.ok || !data || !Array.isArray(data.rows)) throw new Error(data?.error || `Não foi possível consultar os boletins ${zone ? `da zona ${Number(zone)}` : "do município"}.`);
        if (!stopped) {
          setSaved(current => {
            const merged = new Map((current?.key === viewKey && current.query === debouncedSearch ? current.rows : []).map(row => [`${row.state || ""}:${row.municipality || ""}:${row.zone}:${row.number}`, row]));
            for (const row of data.rows) merged.set(`${row.state || ""}:${row.municipality || ""}:${row.zone}:${row.number}`, row);
            return {key: viewKey, query: debouncedSearch, page, rows: [...merged.values()], meta: data};
          });
        }
        retryIn = data.refreshSeconds > 0 ? data.refreshSeconds * 1000 : 0;
      } catch (failure) {
        if (!stopped && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : `Não foi possível consultar os boletins ${zone ? `da zona ${Number(zone)}` : "do município"}.`);
      } finally {
        if (!stopped) {
          setLoading(false);
          if ((!finalized || archiveQuery) && retryIn > 0) timer = window.setTimeout(refresh, retryIn);
        }
      }
    };
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [nearViewport, breakdownSelected, archiveQuery, finalized, turn, office, state, municipality, zone, candidateId, page, selectionKey, viewKey, debouncedSectionFilter, debouncedSearch]);

  if (!breakdownSelected) return null;

  function loadMore() {
    setExpanded(true);
    setSaved(current => {
      const sameView = current?.key === viewKey && current.query === debouncedSearch;
      const currentPage = sameView ? current.page : 1;
      const currentMeta = sameView ? current.meta : meta;
      if (!currentMeta || currentPage >= currentMeta.totalPages) return current || saved;
      return {
        key: viewKey,
        query: debouncedSearch,
        page: currentPage + 1,
        rows: sameView ? current.rows : [],
        meta: currentMeta,
      };
    });
  }

  return (
    <section ref={previewRef} className="col-span-full mt-1 min-w-0 border-t border-[var(--border-1)] pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--fg-2)]">
          <MapPin className="h-3.5 w-3.5 text-[var(--accent-2)]" aria-hidden="true" />
          Votos por local e seção
        </h4>
        <span className="text-[9px] text-[var(--muted-2)]">{meta?.ready === false ? "Integrando arquivo oficial de votação por seção" : meta ? `${number.format(meta.total)} ${meta.total === 1 ? "seção" : "seções"} ${state === "br" ? "no Brasil" : zone ? `na zona ${Number(zone)}` : municipality ? "no município" : "no estado"} · atualizado ${dateTime(meta.checkedAt)}` : "Dados oficiais do TSE"}</span>
      </div>

      <label className="mb-2 flex min-h-9 items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border-1)] bg-[var(--surface-2)] px-2.5 text-[var(--muted-2)] focus-within:border-[var(--accent-2)]">
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <input className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--fg-1)] outline-none placeholder:text-[var(--muted-2)]" type="search" maxLength={100} autoComplete="off" aria-label="Buscar escola, endereço ou seção" placeholder="Buscar escola, endereço ou seção" value={search} onChange={event => setSearch(event.target.value.slice(0, 100))} />
        {loading ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-label="Buscando seção" /> : null}
      </label>

      {error ? <p role="alert" className="mb-2 rounded-[var(--r-sm)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-2.5 py-2 text-[10px] text-[var(--danger)]">{error}</p> : null}
      {rows.length ? <div className="grid gap-2 sm:grid-cols-3" aria-live="polite">
        {(expanded ? rows : rows.slice(0, 3)).map(row => <SectionRow key={`${row.zone}:${row.number}`} row={row}/>) }
      </div> : loading ? <p className="flex items-center gap-2 py-2 text-[10px] text-[var(--muted)]"><RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true"/>Carregando os locais e as seções…</p> : error ? null : <p className="py-2 text-[10px] text-[var(--muted)]">{meta?.ready === false ? "Os dados detalhados por seção estão sendo integrados. A consulta será atualizada automaticamente." : debouncedSearch ? `Nenhuma escola, endereço ou seção encontrada para “${debouncedSearch}”.` : "Nenhum voto por seção localizado para esta candidatura."}</p>}

      {meta && page < totalPages ? <button type="button" className="mt-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-1)] px-3 text-[10px] font-medium text-[var(--fg-2)] hover:bg-[var(--surface-2)] disabled:opacity-60" disabled={loading} onClick={loadMore}>{loading ? <><RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true"/>Carregando…</> : "Ver mais"}</button> : null}
      {meta?.locationSource ? <a className="ml-3 inline-flex items-center gap-1 text-[9px] text-[var(--muted-2)] hover:text-[var(--accent-2)] hover:underline" href={meta.locationSource} target="_blank" rel="noopener noreferrer">{meta.sourceLabel || "Cadastro de locais do TSE"} <ExternalLink className="h-3 w-3"/></a> : null}
    </section>
  );
}

function SectionRow({row}: {row: LiveSectionVote}) {
  const status = row.status === "totalized" ? row.buGeneratedAt ? "boletim publicado" : "totalizado pelo TSE" : row.status === "waiting" ? "aguardando boletim do TSE" : "boletim não validado";
  return <article className="flex min-w-0 flex-col justify-between gap-2 rounded-[var(--r-sm)] border border-[var(--border-1)] bg-[var(--surface)] p-2.5">
    <div className="min-w-0">
      <strong className="block line-clamp-2 break-words text-[10px] font-medium leading-snug text-[var(--fg-1)]">{row.localName || `Local de votação ${row.localCode || "não identificado"}`}</strong>
      {row.address ? <span className="mt-1 block line-clamp-1 break-words text-[9px] text-[var(--muted-2)]">{row.address}</span> : null}
      {row.municipality && row.state ? <span className="mt-1 block text-[9px] text-[var(--muted-2)]">{row.municipality}/{row.state.toUpperCase()}</span> : null}
      <span className="mt-1 block font-mono text-[9px] text-[var(--muted)]">Zona {Number(row.zone)} · Seção {Number(row.number)} · {status}</span>
      {row.buGeneratedAt ? <span className="mt-1 block text-[8px] text-[var(--muted-2)]">Boletim de {dateTime(row.buGeneratedAt)}</span> : null}
    </div>
    <div className="flex items-center justify-between gap-2">
      <strong className={`font-mono text-[14px] ${row.votes === null ? "text-[var(--muted-2)]" : "text-[var(--accent-2)]"}`}>{row.votes === null ? "—" : number.format(row.votes)} <small className="font-sans text-[9px] font-normal">votos</small></strong>
      {row.sourceUrl ? <a className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-1)] px-2 text-[8px] text-[var(--muted)] hover:text-[var(--accent-2)]" href={row.sourceUrl} target="_blank" rel="noopener noreferrer">{row.buGeneratedAt ? "Boletim TSE" : "Fonte TSE"} <ExternalLink className="h-2.5 w-2.5"/></a> : null}
    </div>
  </article>;
}
