"use client";

import {ChevronDown, ExternalLink, MapPin, RefreshCw} from "lucide-react";
import {useEffect, useMemo, useState} from "react";
import type {ElectionSelection, LiveCandidate} from "@/lib/live-election/model";
import type {LiveSectionVote, LiveSectionVotePage} from "@/lib/live-election/sections";

type SectionResponse = LiveSectionVotePage & {error?: string};
const number = new Intl.NumberFormat("pt-BR");
function dateTime(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("pt-BR", {dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo"}).format(new Date(value)) : "aguardando boletim";
}
function query(turn: number, office: string, state: string, municipality: string, zone: string, candidateId: string, page: number) {
  const params = new URLSearchParams({turno: String(turn), cargo: office, uf: state, municipio: municipality, zona: zone, candidato: candidateId, pagina: String(page)});
  return `/api/apuracao/sections?${params}`;
}

export function LiveSectionVoteBreakdown({selection, candidate, finalized = false}: {selection: ElectionSelection; candidate: LiveCandidate; finalized?: boolean}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<{key: string; page: number; rows: LiveSectionVote[]; meta: SectionResponse} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const zoneSelected = selection.state !== "br" && Boolean(selection.municipality && selection.zone);
  const selectionKey = useMemo(() => [selection.turn, selection.office, selection.state, selection.municipality, selection.zone, candidate.id].join(":"), [selection.turn, selection.office, selection.state, selection.municipality, selection.zone, candidate.id]);
  const {turn, office, state, municipality, zone} = selection;
  const candidateId = candidate.id;
  const view = saved?.key === selectionKey ? saved : null;
  const page = view?.page || 1;
  const rows = view?.rows || [];
  const meta = view?.meta || null;

  useEffect(() => {
    if (!open || !zoneSelected) return;
    let stopped = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === "hidden") {
        if (!finalized) timer = window.setTimeout(refresh, 60000);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await fetch(query(turn, office, state, municipality, zone, candidateId, page), {signal: controller.signal, cache: "no-store"});
        const data = await response.json().catch(() => null) as SectionResponse | null;
        if (!response.ok || !data || !Array.isArray(data.rows)) throw new Error(data?.error || "Não foi possível consultar os boletins desta zona.");
        if (!stopped) {
          setSaved(current => {
            const merged = new Map((current?.key === selectionKey ? current.rows : []).map(row => [row.number, row]));
            for (const row of data.rows) merged.set(row.number, row);
            return {key: selectionKey, page, rows: [...merged.values()].sort((a, b) => a.number.localeCompare(b.number)), meta: data};
          });
        }
      } catch (failure) {
        if (!stopped && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível consultar os boletins desta zona.");
      } finally {
        if (!stopped) {
          setLoading(false);
          if (!finalized) timer = window.setTimeout(refresh, 60000);
        }
      }
    };
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [open, zoneSelected, finalized, turn, office, state, municipality, zone, candidateId, page, selectionKey]);

  const totalPages = meta?.totalPages || 0;

  return (
    <section className="mt-4 overflow-hidden rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--surface)]">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-3 text-left text-[12px] font-medium text-[var(--fg-1)] sm:px-4" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <MapPin className="h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">Votos por local e seção <small className="ml-1 font-normal text-[var(--muted-2)]">· boletins oficiais do TSE</small></span>
        {open && loading ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--muted-2)]" aria-label="Atualizando"/> : null}
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--muted-2)] transition-transform${open ? " rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? <div className="border-t border-[var(--border-1)] px-3 py-3 sm:px-4">
        {!zoneSelected ? <div className="rounded-[var(--r-sm)] border border-[var(--border-1)] bg-[var(--surface-2)] px-3 py-3 text-[11px] leading-relaxed text-[var(--muted)]">Para consultar cada urna, escolha um município e uma zona eleitoral nos filtros acima. A consulta por seção é feita sob demanda para não carregar boletins de todo o estado sem necessidade.</div> : <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--muted-2)]">
            <span>{meta ? `${number.format(meta.total)} seções nesta zona · página ${page}${totalPages ? ` de ${totalPages}` : ""}` : `Consultando seções da zona ${Number(selection.zone)}…`}</span>
            <span>{finalized ? "Resultado encerrado · última consulta" : "Verificação automática a cada 60 segundos · última consulta"} {dateTime(meta?.checkedAt)}</span>
          </div>
          {error ? <p role="alert" className="mb-3 rounded-[var(--r-sm)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-[11px] text-[var(--danger)]">{error}</p> : null}
          {rows.length ? <div className="divide-y divide-[var(--border-1)]">
            {rows.map(row => <SectionRow key={row.number} row={row} zone={zone}/>) }
          </div> : !loading && !error ? <p className="py-3 text-[11px] text-[var(--muted)]">Nenhum boletim de seção foi publicado nesta zona.</p> : null}
          {page < totalPages ? <button type="button" className="mt-3 min-h-10 w-full rounded-[var(--r-sm)] border border-[var(--border-1)] px-3 text-[11px] font-medium text-[var(--fg-2)] hover:bg-[var(--surface-2)]" disabled={loading} onClick={() => setSaved(current => ({key: selectionKey, page: (current?.key === selectionKey ? current.page : 1) + 1, rows: current?.key === selectionKey ? current.rows : [], meta: current?.key === selectionKey ? current.meta : meta!}))}>{loading ? "Carregando boletins…" : `Carregar próximas ${Math.min(10, Math.max(0, (meta?.total || 0) - rows.length))} seções`}</button> : null}
          {meta?.locationSource ? <a className="mt-3 inline-flex items-center gap-1 text-[10px] text-[var(--muted-2)] hover:text-[var(--accent-2)] hover:underline" href={meta.locationSource} target="_blank" rel="noopener noreferrer">Cadastro de locais de votação do TSE <ExternalLink className="h-3 w-3"/></a> : null}
        </>}
      </div> : null}
    </section>
  );
}

function SectionRow({row, zone}: {row: LiveSectionVote; zone: string}) {
  const status = row.status === "totalized" ? "boletim publicado" : row.status === "waiting" ? "aguardando boletim do TSE" : "boletim não validado";
  return <article className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <strong className="block break-words text-[12px] text-[var(--fg-1)]">{row.localName || `Local de votação ${row.localCode || "não identificado"}`}</strong>
      {row.address ? <span className="mt-0.5 block break-words text-[10px] text-[var(--muted-2)]">{row.address}</span> : null}
      <span className="mt-1 block font-mono text-[10px] text-[var(--muted)]">Zona {Number(zone)} · Seção {Number(row.number)}{row.mergedSections.length ? ` · agregada(s): ${row.mergedSections.map(Number).join(", ")}` : ""} · {status}</span>
      {row.buGeneratedAt ? <span className="mt-0.5 block text-[9px] text-[var(--muted-2)]">Boletim emitido em {dateTime(row.buGeneratedAt)}</span> : null}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
      <strong className={`font-mono text-[16px] ${row.votes === null ? "text-[var(--muted-2)]" : "text-[var(--accent-2)]"}`}>{row.votes === null ? "—" : number.format(row.votes)} <small className="font-sans text-[10px] font-normal">votos</small></strong>
      {row.sourceUrl ? <a className="inline-flex min-h-8 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-1)] px-2 text-[9px] text-[var(--muted)] hover:text-[var(--accent-2)]" href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Boletim TSE <ExternalLink className="h-3 w-3"/></a> : null}
    </div>
  </article>;
}
