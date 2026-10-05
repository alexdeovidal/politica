"use client";

import { VoteMap } from "@/components/platform/vote-map";
import { useEffect, useState } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import type { CandidateVoteSection, PersonVoteResult } from "@/lib/queries";
import { SourceZone } from "@/components/source-zone";
import { LivePersonVoteResults } from "@/components/live-person-vote-results";

type VoteSectionsResponse = {
  sections: CandidateVoteSection[];
  total: number;
  pageSize: number;
};

export function PersonVoteResults({ results }: { results: PersonVoteResult[] }) {
  if (results.length === 0) return null;

  return (
    <section id="votos-por-local" data-toc-title="votos por local" className="animate-in py-7">
      <div className="section-title mb-2">votos por local</div>
      <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
        Consulte resultados históricos por seção e a apuração de 2026 por estado, município e zona.
        Os dados são agregados e não identificam o voto de nenhuma pessoa.
      </p>
      <div className="flex flex-col gap-3">
        {results.map((result, index) => result.year === 2026
          ? <LivePersonVoteResults key={result.historyId} result={result} initiallyOpen={index === 0} />
          : <HistoricalElectionVote key={result.historyId} result={result} initiallyOpen={index === 0} />)}
      </div>
    </section>
  );
}

function HistoricalElectionVote({ result, initiallyOpen }: { result: PersonVoteResult; initiallyOpen: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sections, setSections] = useState<CandidateVoteSection[]>([]);
  const [total, setTotal] = useState(result.sectionCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(initiallyOpen);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(false);
      const params = new URLSearchParams({ historyId: String(result.historyId), page: String(page) });
      if (search.trim()) params.set("q", search.trim());

      fetch(`/api/vote-sections?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("Não foi possível carregar as seções eleitorais.");
          return response.json() as Promise<VoteSectionsResponse>;
        })
        .then((data) => {
          setSections((current) => (page === 1 ? data.sections : [...current, ...data.sections]));
          setTotal(data.total);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, search.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, page, result.historyId, retry, search]);

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    setSections([]);
  };

  return (
    <details
      className="group card !p-0"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[var(--fg-1)]">
            {result.year} · {result.office ?? "cargo não informado"}
          </span>
          <span className="mt-1 block truncate font-mono text-[10px] text-[var(--muted-2)]">
            {[result.partyAbbr, result.state, result.round ? `${result.round}º turno` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[16px] text-[var(--fg-1)]">
            {result.totalVotes.toLocaleString("pt-BR")}
          </span>
          <span className="block font-mono text-[9px] text-[var(--muted-2)]">
            {result.sectionCount.toLocaleString("pt-BR")} seções
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-2)] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="border-t border-[var(--border-1)] px-3 py-3 sm:px-4">
        <VoteMap historyId={result.historyId}/>
        <label className="input mb-3 min-h-10 w-full sm:max-w-md">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted-2)]" aria-hidden="true" />
          <span className="sr-only">Filtrar município, local ou seção</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar município, escola, zona ou seção"
          />
        </label>

        {error ? (
          <p className="flex flex-wrap items-center gap-2 px-1 py-3 text-[12px] text-[var(--danger)]">
            Não foi possível carregar os locais.
            <button type="button" className="underline" onClick={() => setRetry((current) => current + 1)}>
              tentar novamente
            </button>
          </p>
        ) : null}

        {sections.length === 0 && loading ? (
          <p className="px-1 py-4 text-[12px] text-[var(--muted)]">Carregando seções eleitorais…</p>
        ) : sections.length === 0 && !error ? (
          <p className="px-1 py-4 text-[12px] text-[var(--muted)]">
            {search.trim() ? "Nenhum local encontrado para essa busca." : "Nenhuma seção encontrada."}
          </p>
        ) : null}

        {sections.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {sections.map((section, index) => (
                <SourceZone key={`${section.zoneNumber}-${section.sectionNumber}-${index}`} provenance={section.provenance}>
                  <article className="rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--surface)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--fg-1)]">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent-2)]" aria-hidden="true" />
                          <span className="truncate">{section.municipality ?? "Município não informado"}</span>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-[var(--fg-2)]">
                          {section.pollingPlaceName ??
                            (section.pollingPlaceNumber
                              ? `Local de votação ${section.pollingPlaceNumber}`
                              : "Local não informado pelo TSE")}
                        </div>
                        {section.pollingPlaceAddress ? (
                          <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[var(--muted-2)]">
                            {section.pollingPlaceAddress}
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-mono text-[16px] text-[var(--accent-2)]">
                        {section.votes.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-[var(--muted-2)]">
                      {section.zoneNumber ? <span>zona {section.zoneNumber}</span> : null}
                      <span>seção {section.sectionNumber}</span>
                    </div>
                  </article>
                </SourceZone>
              ))}
            </div>
            {sections.length < total ? (
              <button
                type="button"
                className="btn mt-3 min-h-10 w-full justify-center sm:w-auto"
                disabled={loading}
                onClick={() => setPage((current) => current + 1)}
              >
                {loading ? "carregando…" : `mostrar mais ${Math.min(25, total - sections.length)} locais`}
              </button>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[9px] text-[var(--muted-2)]">
                {search.trim() ? `${total.toLocaleString("pt-BR")} resultados · ` : ""}TSE · resultados de {result.year}
              </span>
              <a
                href={`https://dadosabertos.tse.jus.br/dataset/resultados-${result.year}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9px] text-[var(--accent-2)] hover:underline"
              >
                consultar arquivo oficial ↗
              </a>
            </div>
          </>
        ) : null}
      </div>
    </details>
  );
}
