import { ArrowDownRight, ArrowUpRight, MapPin, Minus, TrendingUp } from "lucide-react";
import type { PersonVoteResult } from "@/lib/queries";

export type PersonVoteElectionGeography = {
  historyId: number;
  year: number;
  round: number;
  totalVotes: number;
  sectionCount: number;
  municipalityCount: number;
  stateCount: number;
  topMunicipalities: Array<{ state: string; municipality: string; municipalityCode: string; votes: number }>;
  topStates: Array<{ state: string; votes: number }>;
};

export type PersonVoteCityComparison = {
  state: string;
  municipality: string;
  votesByYear: Record<number, number>;
};

function formatNumber(value: number) {
  return value.toLocaleString("pt-BR");
}

function formatSigned(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatNumber(Math.abs(value))}`;
}

function percentageChange(current: number, previous: number) {
  return previous > 0 ? `${((current - previous) / previous * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%` : null;
}

function formatPercentOfCandidate(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${(value / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

function finalElectionRows(results: PersonVoteResult[], geographies: PersonVoteElectionGeography[]) {
  const geographyById = new Map(geographies.map((item) => [item.historyId, item]));
  const byYear = new Map<number, PersonVoteResult>();

  for (const result of results) {
    if (result.year < 2012 || result.sectionCount <= 0) continue;
    const current = byYear.get(result.year);
    if (!current || result.round > current.round) byYear.set(result.year, result);
  }

  return [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .map((result) => ({ result, geography: geographyById.get(result.historyId) ?? null }));
}

function ElectionBar({ votes, maximum }: { votes: number; maximum: number }) {
  const width = maximum > 0 ? Math.max(votes > 0 ? 1 : 0, votes / maximum * 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden="true">
      <div className="h-full rounded-full bg-[var(--accent-2)]" style={{ width: `${width}%` }} />
    </div>
  );
}

function VoteChange({ current, previous }: { current: number; previous: number }) {
  const delta = current - previous;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const tone = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-[var(--muted)]";
  const relative = percentageChange(current, previous);

  return (
    <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {formatSigned(delta)} votos{relative ? ` (${relative})` : ""}
    </span>
  );
}

export function PersonVoteTrajectory({
  results,
  geographies,
  cityComparison,
}: {
  results: PersonVoteResult[];
  geographies: PersonVoteElectionGeography[];
  cityComparison: PersonVoteCityComparison[];
}) {
  const elections = finalElectionRows(results, geographies);
  const latest = elections.at(-1) ?? null;
  const previous = elections.at(-2) ?? null;
  const awaiting2026 = results.some((result) => result.year === 2026 && result.sectionCount === 0);
  const maximumVotes = Math.max(1, ...elections.map(({ result }) => result.totalVotes));
  const years = elections.map(({ result }) => result.year);

  return (
    <section id="trajetoria-eleitoral" data-toc-title="trajetória eleitoral" className="animate-in py-7">
      <div className="section-title mb-2">trajetória eleitoral</div>
      <p className="mb-4 max-w-4xl text-[12px] leading-relaxed text-[var(--muted)]">
        Acompanhe os votos nominais do candidato de 2012 a 2026, as cidades e os estados onde recebeu votos. A sequência inclui cargos diferentes para mostrar os números de cada eleição.
      </p>

      {elections.length === 0 ? (
        <div className="card space-y-2 text-sm leading-relaxed text-[var(--muted)]">
          <p>Ainda não há resultados por seção no acervo local para este perfil. Sem esses registros do TSE, não é possível calcular a evolução dos votos ou a distribuição por cidade e estado.</p>
          {awaiting2026 ? <p>A candidatura de 2026 já aparece no cadastro, mas os votos por seção desse pleito ainda não estão no acervo local.</p> : null}
        </div>
      ) : (
        <div className="space-y-4">
          {awaiting2026 ? <p className="card text-xs leading-relaxed text-[var(--muted)]">A candidatura de 2026 já aparece no cadastro, mas os votos por seção desse pleito ainda não estão no acervo local. A análise inclui os resultados disponíveis e será atualizada quando os dados oficiais forem integrados.</p> : null}
          {latest && previous ? (
            <div className="card flex items-start gap-3">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden="true" />
              <div className="space-y-2 text-sm leading-relaxed">
                <p>
                  De {previous.result.year} para {latest.result.year}, os votos nominais {latest.result.totalVotes > previous.result.totalVotes ? "aumentaram" : latest.result.totalVotes < previous.result.totalVotes ? "diminuíram" : "permaneceram iguais"}: <VoteChange current={latest.result.totalVotes} previous={previous.result.totalVotes} />.
                </p>
                <p className="text-xs text-[var(--muted)]">
                  As candidaturas foram para {previous.result.office || "cargo não informado"} ({previous.result.state || previous.result.municipality || "abrangência não informada"}) e {latest.result.office || "cargo não informado"} ({latest.result.state || latest.result.municipality || "abrangência não informada"}). A diferença é do total bruto de votos nominais, não do percentual de votos válidos.
                </p>
                {latest.geography && previous.geography ? (
                  <p className="text-xs text-[var(--muted)]">
                    Presença territorial: {formatNumber(previous.geography.municipalityCount)} → {formatNumber(latest.geography.municipalityCount)} municípios e {formatNumber(previous.geography.stateCount)} → {formatNumber(latest.geography.stateCount)} UFs com votos registrados.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="card text-sm leading-relaxed text-[var(--muted)]">
              Há apenas uma eleição com votos por seção disponível neste perfil; ela servirá como base quando outro resultado oficial for integrado.
            </div>
          )}

          <div className="card space-y-4">
            <div>
              <h3 className="text-sm font-medium text-[var(--fg-1)]">Votos por eleição</h3>
              <p className="mt-1 text-[10px] text-[var(--muted)]">Cada barra usa a mesma escala. O turno final publicado para cada ano é exibido.</p>
            </div>
            {elections.slice().reverse().map(({ result, geography }, reverseIndex) => {
              const chronologicalIndex = elections.length - reverseIndex - 1;
              const prior = chronologicalIndex > 0 ? elections[chronologicalIndex - 1] : null;
              const scope = result.municipality
                ? `${result.municipality}${result.state ? `/${result.state}` : ""}`
                : result.state || result.electoralUnit || "abrangência não informada";

              return (
                <article key={result.historyId} className="border-t border-[var(--border-1)] pt-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <strong className="font-mono text-sm text-[var(--fg-1)]">{result.year}</strong>
                        <span className="text-xs text-[var(--muted)]">{result.round}º turno · {result.office || "cargo não informado"}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">Candidatura registrada em {scope} · {formatNumber(result.sectionCount)} seções</p>
                    </div>
                    <div className="text-right">
                      <strong className="font-mono text-base text-[var(--fg-1)]">{formatNumber(result.totalVotes)}</strong>
                      <span className="ml-1 text-[10px] text-[var(--muted)]">votos</span>
                      {prior ? <div className="mt-1 text-[10px]"><VoteChange current={result.totalVotes} previous={prior.result.totalVotes} /><span className="ml-1 text-[var(--muted)]">vs. {prior.result.year}</span></div> : null}
                    </div>
                  </div>
                  <div className="mt-3"><ElectionBar votes={result.totalVotes} maximum={maximumVotes} /></div>

                  {geography ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--fg-1)]"><MapPin size={13} aria-hidden="true" />{formatNumber(geography.municipalityCount)} municípios com votos</div>
                        {geography.topMunicipalities.length ? (
                          <ul className="mt-2 space-y-1.5 text-[10px] text-[var(--muted)]">
                            {geography.topMunicipalities.map((city) => (
                              <li key={`${city.state}:${city.municipalityCode || city.municipality}`} className="flex justify-between gap-2">
                                <span className="truncate">{city.municipality}/{city.state}</span>
                                <span className="shrink-0 font-mono">{formatNumber(city.votes)} · {formatPercentOfCandidate(city.votes, geography.totalVotes)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-2 text-[10px] text-[var(--muted)]">Municípios não discriminados neste arquivo.</p>}
                        <p className="mt-2 text-[9px] text-[var(--muted-2)]">Percentual dos votos desta candidatura, não dos votos válidos.</p>
                      </div>
                      <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] p-3">
                        <div className="text-[10px] font-medium text-[var(--fg-1)]">{formatNumber(geography.stateCount)} UFs com votos</div>
                        {geography.topStates.length ? (
                          <ul className="mt-2 space-y-1.5 text-[10px] text-[var(--muted)]">
                            {geography.topStates.map((state) => (
                              <li key={state.state} className="flex justify-between gap-2">
                                <span>{state.state}</span>
                                <span className="font-mono">{formatNumber(state.votes)} · {formatPercentOfCandidate(state.votes, geography.totalVotes)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-2 text-[10px] text-[var(--muted)]">UF não informada no arquivo.</p>}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-[10px] text-[var(--muted)]">A distribuição por cidade e estado não foi carregada para esta eleição.</p>
                  )}

                  <a className="mt-3 inline-block text-[10px] text-[var(--accent-2)] hover:underline" href={`https://dadosabertos.tse.jus.br/dataset/resultados-${result.year}`} target="_blank" rel="noreferrer">
                    Conferir fonte oficial do TSE · {result.year} ↗
                  </a>
                </article>
              );
            })}
          </div>

          {cityComparison.length > 0 && years.length > 1 ? (
            <details className="card group !p-0">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--fg-1)] [&::-webkit-details-marker]:hidden">
                Comparar os mesmos municípios entre eleições
              </summary>
              <div className="overflow-x-auto border-t border-[var(--border-1)]">
                <table className="w-full min-w-[680px] text-left text-[10px]">
                  <thead className="text-[var(--muted)]"><tr>
                    <th className="px-4 py-3 font-medium">Município/UF</th>
                    {years.map((year) => <th key={year} className="px-3 py-3 text-right font-medium">{year}</th>)}
                  </tr></thead>
                  <tbody>{cityComparison.map((city) => (
                    <tr key={`${city.state}:${city.municipality}`} className="border-t border-[var(--border-1)]">
                      <th className="whitespace-nowrap px-4 py-3 font-medium text-[var(--fg-1)]">{city.municipality}/{city.state}</th>
                      {years.map((year) => <td key={year} className="px-3 py-3 text-right font-mono text-[var(--fg-2)]">{city.votesByYear[year] ? formatNumber(city.votesByYear[year]) : "—"}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="px-4 py-3 text-[10px] text-[var(--muted)]">Exibe os municípios com maior votação acumulada no histórico. O traço significa que não há votos registrados para aquele município e ano.</p>
            </details>
          ) : null}

          <p className="max-w-4xl text-[10px] leading-relaxed text-[var(--muted-2)]">
            A variação entre eleições compara o total de votos nominais mesmo quando cargo e alcance mudam; ela não mede, sozinha, crescimento de apoio ou percentual de votos válidos. Os totais e a distribuição territorial vêm dos boletins por seção integrados ao banco local. Nas eleições com segundo turno, é mostrado o último turno com dados disponíveis.
          </p>
        </div>
      )}
    </section>
  );
}
