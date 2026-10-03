"use client";

import { useEffect, useState } from "react";
import {OfficialRecords} from "@/components/platform/official-records";
import {Proposals} from "@/components/platform/proposals";
import { Search, X } from "lucide-react";
import type { SearchResult, CandidateComparisonRecord } from "@/lib/queries";
import { formatBRL, formatCpf } from "@/lib/format";
import { SearchAvatar } from "@/components/search-avatar";

export function CandidateComparison({initialIds=[],initialYear="",initialCompatible=false}:{initialIds?:number[];initialYear?:string;initialCompatible?:boolean}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>(initialIds);
  const [year,setYear]=useState(initialYear);
  const [compatibleOnly,setCompatibleOnly]=useState(initialCompatible);
  useEffect(()=>{const p=new URLSearchParams(window.location.search);if(selectedIds.length)p.set("ids",selectedIds.join(","));else p.delete("ids");if(year)p.set("ano",year);else p.delete("ano");if(compatibleOnly)p.set("compativeis","1");else p.delete("compativeis");window.history.replaceState(null,"",`${window.location.pathname}?${p}`);},[selectedIds,year,compatibleOnly]);
  const [selectedNames, setSelectedNames] = useState<Record<number, string>>({});
  const [records, setRecords] = useState<CandidateComparisonRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [error, setError] = useState(false);
  const trimmed = query.trim();
  const selectedKey = selectedIds.join(",");

  useEffect(() => {
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}${year?`&ano=${year}`:""}${compatibleOnly&&records[0]?.latestCandidacy?`&cargo=${encodeURIComponent(records[0].latestCandidacy.office||"")}&uf=${encodeURIComponent(records[0].latestCandidacy.state||"")}&cidade=${encodeURIComponent(records[0].latestCandidacy.municipality||"")}`:""}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { results: SearchResult[] }) => setResults(data.results ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmed,year,compatibleOnly,records]);

  useEffect(() => {
    if (!selectedKey) return;

    const controller = new AbortController();
    const request = window.setTimeout(() => {
      setLoadingComparison(true);
      setError(false);
      fetch(`/api/compare-candidates?ids=${encodeURIComponent(selectedKey)}${year ? `&ano=${encodeURIComponent(year)}` : ""}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("Não foi possível carregar a comparação.");
          return response.json();
        })
        .then((data: { records: CandidateComparisonRecord[] }) => setRecords(data.records ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingComparison(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(request);
      controller.abort();
    };
  }, [selectedKey,year]);

  function addCandidate(candidate: Extract<SearchResult, { kind: "candidato" }>) {
    if (selectedIds.includes(candidate.personId) || selectedIds.length >= 3) return;
    setSelectedIds((current) => [...current, candidate.personId]);
    setSelectedNames((current) => ({ ...current, [candidate.personId]: candidate.canonicalName }));
    setError(false);
    setQuery("");
    setResults([]);
  }

  function removeCandidate(personId: number) {
    setSelectedIds((current) => current.filter((id) => id !== personId));
    setSelectedNames((current) => {
      const next = { ...current };
      delete next[personId];
      return next;
    });
    if (selectedIds.length === 1) {
      setError(false);
      setLoadingComparison(false);
    }
  }

  const candidateResults = results.filter(
    (result): result is Extract<SearchResult, { kind: "candidato" }> => result.kind === "candidato",
  );
  const visibleRecords = records.filter((record) => selectedIds.includes(record.personId));

  return (
    <div className="candidate-compare">
      <label className="platform-form">Eleição para comparar<select value={year} onChange={e=>setYear(e.target.value)}><option value="">Todas as eleições (totais agregados)</option>{Array.from({length:7},(_,i)=>2026-i*2).map(y=><option key={y}>{y}</option>)}</select></label>
      <label><input type="checkbox" checked={compatibleOnly} onChange={e=>setCompatibleOnly(e.target.checked)}/> Buscar candidatos do mesmo cargo, UF e município do primeiro selecionado</label>
      {year && <p>Comparação em {year}. Confira cargo, estado e município: candidaturas de contextos diferentes não representam disputa direta.</p>}
      <section className="candidate-compare__picker" aria-label="Adicionar candidatura à comparação">
        <label className="candidate-compare__label" htmlFor="compare-candidate-search">
          Adicione até três candidatos
        </label>
        <div className="candidate-compare__search">
          <Search size={19} aria-hidden="true" />
          <input
            id="compare-candidate-search"
            type="search"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              if (next.trim().length < 2) {
                setResults([]);
                setSearching(false);
              }
            }}
            placeholder="Pesquise pelo nome ou CPF"
            autoComplete="off"
            aria-describedby="compare-candidate-help"
          />
        </div>
        <p id="compare-candidate-help" className="candidate-compare__help">
          Compare dados públicos de campanhas. Selecione uma eleição para comparar o mesmo período. Sem filtro, os valores somam a base disponível.
        </p>
        {trimmed.length >= 2 ? (
          <div className="candidate-compare__results" role="listbox" aria-label="Candidatos encontrados">
            {searching ? (
              <div className="candidate-compare__empty">Buscando em todos os registros…</div>
            ) : candidateResults.length ? (
              candidateResults.map((candidate) => {
                const alreadyAdded = selectedIds.includes(candidate.personId);
                const unavailable = selectedIds.length >= 3 && !alreadyAdded;
                return (
                  <button
                    key={candidate.personId}
                    type="button"
                    className="candidate-compare__result"
                    disabled={alreadyAdded || unavailable}
                    onClick={() => addCandidate(candidate)}
                  >
                    <SearchAvatar photoUrl={candidate.photoUrl} name={candidate.canonicalName} />
                    <span className="candidate-compare__result-copy">
                      <strong>{candidate.canonicalName}</strong>
                      <small>
                        {[candidate.latestOffice, candidate.latestPartyAbbr, candidate.latestState, candidate.latestYear]
                          .filter(Boolean).join(" · ")}
                        {candidate.cpf ? ` · CPF ${formatCpf(candidate.cpf)}` : ""}
                      </small>
                    </span>
                    <span>{alreadyAdded ? "adicionado" : "adicionar"}</span>
                  </button>
                );
              })
            ) : (
              <div className="candidate-compare__empty">
                Nenhuma candidatura encontrada. Esta ferramenta compara candidaturas registradas no TSE.
              </div>
            )}
          </div>
        ) : null}
      </section>

      {selectedIds.length ? (
        <div className="candidate-compare__selected" aria-label="Candidatos selecionados">
          {selectedIds.map((id) => {
            const record = visibleRecords.find((item) => item.personId === id);
            const name = record?.name ?? selectedNames[id] ?? `Candidatura ${id}`;
            return (
              <span key={id} className="candidate-compare__chip">
                {name}
                <button type="button" onClick={() => removeCandidate(id)} aria-label={`Remover ${name}`}>
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {loadingComparison ? <p className="candidate-compare__empty">Carregando dados para comparar…</p> : null}
      {error ? <p className="candidate-compare__empty" role="alert">Não foi possível carregar os dados. Tente novamente.</p> : null}
      {visibleRecords.length>1&&<p className="card" role="status">{year&&visibleRecords.every(r=>r.latestCandidacy)&&new Set(visibleRecords.map(r=>JSON.stringify([r.latestCandidacy?.year,r.latestCandidacy?.office,r.latestCandidacy?.state,r.latestCandidacy?.municipality,r.latestCandidacy?.round]))).size===1?"As candidaturas selecionadas têm eleição, cargo, UF, município e turno compatíveis.":"Os contextos selecionados são diferentes ou incompletos. Os valores não constituem comparação de concorrentes na mesma disputa."}</p>}
      {visibleRecords.length ? (
        <section className="candidate-compare__grid" aria-label="Comparação das candidaturas">
          {visibleRecords.map((record) => (
            <article key={record.personId} className="candidate-compare__card">
              <header className="candidate-compare__person">
                <SearchAvatar photoUrl={record.photoUrl} name={record.name} />
                <div>
                  <h2>{record.name}</h2>
                  <p>
                    {record.latestCandidacy
                      ? `${record.latestCandidacy.office ?? "Cargo não informado"} · ${record.latestCandidacy.partyAbbr ?? "Sem partido informado"}/${record.latestCandidacy.state ?? "—"} · ${record.latestCandidacy.year}`
                      : "Candidatura sem dados recentes"}
                  </p>
                  <a href={`/politico/${record.personId}${year?`?ano=${year}`:""}`} className="candidate-compare__profile-link">Ver perfil completo</a>
                </div>
              </header>
              <dl className="candidate-compare__metrics">
                <div>
                  <dt>Doações recebidas · período selecionado</dt>
                  <dd>{record.donationsCount?formatBRL(record.donationsTotalCents):"Sem doações coletadas neste período"}</dd>
                </div>
                <div>
                  <dt>Fundos eleitoral e partidário recebidos</dt>
                  <dd>{record.donationsCount?formatBRL(record.electoralFundsTotalCents):"Sem dados de doações neste período"}</dd>
                </div>
                <div>
                  <dt>Despesas contratadas · período selecionado</dt>
                  <dd>{record.expensesCount?formatBRL(record.expensesTotalCents):"Sem despesas coletadas neste período"}</dd>
                </div>
                <div>
                  <dt>Despesas efetivamente pagas · período selecionado</dt><dd>{record.paymentsCount?formatBRL(record.paymentsTotalCents):"Sem pagamentos coletados neste período"}</dd></div><div>
                  <dt>Votos · eleição mais recente com dados</dt>
                  <dd>{record.latestVote
                    ? `${record.latestVote.totalVotes.toLocaleString("pt-BR")} (${record.latestVote.year})`
                    : "Sem dados de votação"}</dd>
                </div>
                <div>
                  <dt>Bens declarados · declaração mais recente</dt>
                  <dd>{record.latestAssets
                    ? `${formatBRL(record.latestAssets.totalCents)} (${record.latestAssets.year})${record.latestAssets.missingValues ? ` · soma parcial: ${record.latestAssets.missingValues} bens sem valor informado` : ""}`
                    : "Sem declaração disponível"}</dd>
                </div>
              </dl>
              <details className="my-3"><summary>Comparar propostas e atividade parlamentar</summary><Proposals personId={record.personId}/><OfficialRecords personId={record.personId}/></details><a className="source-link" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-${record.latestCandidacy?.year||year||2026}`} target="_blank" rel="noopener noreferrer">Fonte oficial desta candidatura · TSE</a>
              <p className="candidate-compare__history">
                {record.candidacyCount.toLocaleString("pt-BR")} candidatura{record.candidacyCount === 1 ? "" : "s"} na base
              </p>
            </article>
          ))}
        </section>
      ) : !selectedIds.length ? (
        <div className="candidate-compare__empty candidate-compare__empty--large">
          Pesquise e adicione duas ou três candidaturas para comparar os dados lado a lado.
        </div>
      ) : null}

      <p className="candidate-compare__notice">
        Comparação informativa baseada nos registros públicos disponíveis. Sem eleição selecionada, os totais financeiros agregam eleições distintas;
        confira os anos, detalhes e fontes oficiais no perfil de cada pessoa.
      </p>
    </div>
  );
}
