"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, LoaderCircle, Scale, Search } from "lucide-react";
import type {
  ElectoralCaseAppeal,
  ElectoralCaseDecision,
  PersonElectoralCases as PersonElectoralCasesData,
  PublicElectoralCase,
} from "@/lib/queries";
import { SourceZone } from "@/components/source-zone";

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function PersonElectoralCases({
  data,
  personId,
}: {
  data: PersonElectoralCasesData;
  personId: number;
}) {
  const [cases, setCases] = useState(data.cases);
  const [total, setTotal] = useState(data.total);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const initialSearch = useRef(true);
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialSearch.current) {
      initialSearch.current = false;
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(false);
      const params = new URLSearchParams({ personId: String(personId), offset: "0" });
      if (search.trim()) params.set("q", search.trim());

      fetch(`/api/person-electoral-cases?${params}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Não foi possível pesquisar todos os processos.");
          return response.json() as Promise<PersonElectoralCasesData>;
        })
        .then((page) => {
          if (!page.available) throw new Error("A base processual está temporariamente indisponível.");
          setCases(page.cases);
          setTotal(page.total);
          setLoadError(null);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, search.trim() ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [personId, search, searchRetry]);

  function onSearch(value: string) {
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    setSearch(value);
    setCases([]);
    setTotal(0);
    setLoadingMore(false);
    setSearching(true);
    setSearchError(false);
    setLoadError(null);
  }

  async function loadMoreCases() {
    if (loadingMore || loadMoreController.current || cases.length >= total) return;
    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({ personId: String(personId), offset: String(cases.length) });
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/person-electoral-cases?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Não foi possível carregar os processos agora.");

      const page = await response.json() as PersonElectoralCasesData;
      if (!page.available) throw new Error("A base processual está temporariamente indisponível.");
      if (controller.signal.aborted) return;
      setCases((current) => [...current, ...page.cases]);
      setTotal(page.total);
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os processos agora.");
      }
    } finally {
      if (!controller.signal.aborted) {
        loadMoreController.current = null;
        setLoadingMore(false);
      }
    }
  }

  return (
    <section id="processos-eleitorais" data-toc-title="processos eleitorais" className="animate-in py-7">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="section-title">processos eleitorais</h2>
        {data.available && total > 0 ? (
          <span className="font-mono text-[10px] text-[var(--muted-2)]">
            {total.toLocaleString("pt-BR")} {search.trim() ? "resultados" : total === 1 ? "processo" : "processos"}
          </span>
        ) : null}
      </div>
      <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
        Registros públicos dos conjuntos Processual do TSE, associados pelo código oficial da candidatura.
        Cada processo, assunto e decisão aparece abaixo com seus dados e fonte. Os mais recentes aparecem primeiro;
        carregue os demais quando quiser.
      </p>

      {data.available ? (
        <label className="input mb-4 min-h-10 w-full sm:max-w-xl">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted-2)]" aria-hidden="true" />
          <span className="sr-only">Buscar em todos os processos</span>
          <input
            type="search"
            value={search}
            maxLength={120}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar em todos os processos por número, assunto, decisão…"
          />
        </label>
      ) : null}

      {!data.available ? (
        <div className="card flex flex-col items-start gap-3 p-4 sm:p-5">
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            A base processual do TSE ainda não foi carregada neste perfil.
          </p>
          <a
            href="https://consultaunificadapje.tse.jus.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn inline-flex items-center gap-2"
          >
            Consultar o PJe Eleitoral <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      ) : searching && cases.length === 0 ? (
        <div className="card flex items-center gap-2 p-4 text-[12px] text-[var(--muted)]" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Pesquisando em todos os processos…
        </div>
      ) : searchError ? (
        <div className="card flex flex-wrap items-center gap-2 p-4 text-[12px] text-[var(--danger)]" role="alert">
          Não foi possível pesquisar todos os processos.
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setSearching(true);
              setSearchRetry((current) => current + 1);
            }}
          >
            tentar novamente
          </button>
        </div>
      ) : total === 0 ? (
        <div className="card p-4 sm:p-5">
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            {search.trim()
              ? `Nenhum processo encontrado para “${search.trim()}” em toda a base associada a esta candidatura.`
              : <>Nenhum registro foi associado a esta pessoa pelo código de candidatura nos arquivos processuais
                importados do TSE. Isso não confirma que a pessoa nunca respondeu a um processo.</>}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {cases.map((item) => <CaseCard key={item.id} item={item} />)}
          </div>
          {cases.length < total ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                type="button"
                className="btn inline-flex min-h-10 items-center justify-center gap-2"
                onClick={loadMoreCases}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando processos…</>
                ) : (
                  <><ChevronDown className="h-4 w-4" aria-hidden="true" /> Ver mais processos</>
                )}
              </button>
              <p className="text-center font-mono text-[10px] text-[var(--muted-2)]" aria-live="polite">
                Exibindo {cases.length.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} {search.trim() ? "resultados" : "processos"}
              </p>
              {loadError ? <p className="text-center text-[11px] text-[var(--danger)]" role="alert">{loadError}</p> : null}
            </div>
          ) : null}
        </>
      )}

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-[var(--muted-2)]">
        O conjunto cobre a Justiça Eleitoral nos pleitos com arquivos processuais disponíveis (2018–2026).
        Processos em sigilo não aparecem. A existência de um processo não significa culpa ou condenação;
        a situação deve ser conferida nas decisões oficiais. Processos de outras áreas da Justiça não estão
        incluídos nesta base.
      </p>
    </section>
  );
}

function CaseCard({ item }: { item: PublicElectoralCase }) {
  const closedAt = dateLabel(item.closedAt);
  const court = item.courtState ? `TRE-${item.courtState}` : "Justiça Eleitoral";
  const instance = item.instance ? `${item.instance}ª instância` : null;
  const parties = item.parties.filter((party, index, all) =>
    all.findIndex((candidate) =>
      candidate.candidacyYear === party.candidacyYear && candidate.pole === party.pole &&
      candidate.type === party.type && candidate.name === party.name,
    ) === index,
  );

  return (
    <details className="group card !p-0">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--surface-2)] text-[var(--accent-2)]">
            <Scale className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12px] font-medium text-[var(--fg-1)]">
              {item.caseNumber}
            </span>
            <span className="mt-1 block truncate text-[11px] text-[var(--muted-2)]">
              {item.className ?? "Classe não informada"} · {court}{instance ? ` · ${instance}` : ""}
            </span>
          </span>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] ${
            closedAt
              ? "border-[var(--border-1)] text-[var(--muted-2)]"
              : "border-[var(--border-1)] bg-[var(--surface-2)] text-[var(--accent-2)]"
          }`}>
            {closedAt ? `encerrado ${closedAt}` : "sem baixa informada na base"}
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="block font-mono text-[10px] text-[var(--muted-2)]">base TSE</span>
            <span className="block font-mono text-[12px] text-[var(--fg-2)]">{item.electionYear}</span>
          </span>
          <span className="ml-1 text-[var(--muted-2)] transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>

        <div className="border-t border-[var(--border-1)] px-4 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <Field label="tipo" value={item.isAppeal == null ? null : item.isAppeal ? "processo recursal" : "processo originário"} />
            <Field label="assunto principal" value={item.mainSubject} />
            <Field label="código do assunto principal" value={item.mainSubjectCode} />
            <Field label="sigla da classe" value={item.classAbbr} />
            <Field label="código da classe" value={item.classCode} />
            <Field label="última decisão" value={item.lastDecisionType} />
            <Field label="autuação" value={dateLabel(item.filedAt)} />
            <Field label="última movimentação decisória" value={dateLabel(item.lastDecisionAt)} />
            <Field label="distribuição" value={dateLabel(item.distributedAt)} />
            <Field label="distribuição processual" value={item.distributionType} />
            <Field label="relator(a)" value={item.reporter} />
            <Field label="origem" value={
              [item.originState, item.originInstance ? `${item.originInstance}ª instância` : null]
                .filter(Boolean).join(" · ") || null
            } />
            <Field label="decisões registradas" value={item.decisionCount?.toLocaleString("pt-BR") ?? null} />
            <Field label="identificação da parte" value={parties.map((party) =>
              [party.pole, party.type, party.isMain == null ? null : party.isMain ? "parte principal" : "parte não principal"]
                .filter(Boolean).join(" · ")
            ).join(" / ") || null} />
          </div>

          {parties.length > 0 ? (
            <div className="mt-4 border-t border-[var(--border-1)] pt-3">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                vínculo de candidatura informado pelo TSE
              </div>
              <ul className="flex flex-col gap-1.5">
                {parties.map((party, index) => (
                  <li key={`${party.candidacyYear}-${party.pole}-${party.type}-${index}`} className="text-[11px] text-[var(--fg-2)]">
                    <span className="font-medium">{party.name ?? party.socialName ?? "Candidato(a)"}</span>
                    <span className="text-[var(--muted-2)]">
                      {` · ${party.candidacyYear}`}{party.pole ? ` · ${party.pole}` : ""}
                      {party.type ? ` · ${party.type}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.subjects.length > 0 ? (
            <RelatedList title="assuntos do processo">
              {item.subjects.map((subject, index) => (
                <li key={`${subject.code}-${index}`} className="text-[11px] leading-relaxed text-[var(--fg-2)]">
                  <SourceZone provenance={subject.provenance} inline>
                    <span>{subject.subject}{subject.code ? <span className="ml-2 font-mono text-[9px] text-[var(--muted-2)]">{subject.code}</span> : null}</span>
                  </SourceZone>
                </li>
              ))}
            </RelatedList>
          ) : null}

          {item.decisions.length > 0 ? (
            <RelatedList title={`histórico de decisões · ${item.decisions.length}`}>
              {item.decisions.map((decision, index) => <DecisionRow key={`${decision.sequence}-${decision.date}-${index}`} decision={decision} />)}
            </RelatedList>
          ) : null}

          {item.appeals.length > 0 ? (
            <RelatedList title={`recursos registrados · ${item.appeals.length}`}>
              {item.appeals.map((appeal, index) => <AppealRow key={`${appeal.id}-${index}`} appeal={appeal} />)}
            </RelatedList>
          ) : null}

          {item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn mt-4 inline-flex min-h-10 items-center gap-2"
            >
              Ver processo e documentos oficiais <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}

          <div className="mt-4 border-t border-[var(--border-1)] pt-3 text-[10px] text-[var(--muted-2)]">
            Fonte dos dados deste processo: <SourceZone provenance={item.provenance} inline>
              <span className="cursor-pointer underline decoration-dotted underline-offset-2">conjunto Processual do TSE</span>
            </SourceZone>
          </div>
        </div>
      </details>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted-2)]">{label}</div>
      <div className="break-words text-[11px] leading-relaxed text-[var(--fg-2)]">{value}</div>
    </div>
  );
}

function RelatedList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-[var(--border-1)] pt-3">
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted-2)]">{title}</div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function DecisionRow({ decision }: { decision: ElectoralCaseDecision }) {
  return (
      <li className="flex flex-col gap-0.5 text-[11px] leading-relaxed text-[var(--fg-2)] sm:flex-row sm:gap-3">
        <span className="shrink-0 font-mono text-[10px] text-[var(--muted-2)]">{dateLabel(decision.date) ?? "Data não informada"}</span>
        <SourceZone provenance={decision.provenance} inline>
          <span>{decision.type ?? "Decisão"}{decision.author ? ` · ${decision.author}` : ""}</span>
        </SourceZone>
      </li>
  );
}

function AppealRow({ appeal }: { appeal: ElectoralCaseAppeal }) {
  const status = appeal.closedAt ? `encerrado em ${dateLabel(appeal.closedAt)}` : "sem baixa informada";
  return (
      <li className="text-[11px] leading-relaxed text-[var(--fg-2)]">
        <SourceZone provenance={appeal.provenance} inline>
          <span>
            <span className="font-medium">{appeal.type ?? appeal.className ?? "Recurso"}</span>
            {appeal.filedAt ? <span className="text-[var(--muted-2)]"> · autuado em {dateLabel(appeal.filedAt)}</span> : null}
            <span className="text-[var(--muted-2)]"> · {status}</span>
            {appeal.nature ? <span className="text-[var(--muted-2)]"> · {appeal.nature}</span> : null}
            {appeal.courtState ? <span className="text-[var(--muted-2)]"> · {appeal.courtState}{appeal.instance ? ` · ${appeal.instance}ª instância` : ""}</span> : null}
            {appeal.lastDecisionType ? <span className="text-[var(--muted-2)]"> · última decisão: {appeal.lastDecisionType}</span> : null}
            {appeal.lastDecisionAt ? <span className="ml-1 font-mono text-[9px] text-[var(--muted-2)]">({dateLabel(appeal.lastDecisionAt)})</span> : null}
            {appeal.reporter ? <span className="text-[var(--muted-2)]"> · relator(a): {appeal.reporter}</span> : null}
          </span>
        </SourceZone>
      </li>
  );
}
