import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Minus, MapPin, ShieldCheck } from "lucide-react";
import { TrajectoryReportPrintButton } from "@/components/trajectory-report-print-button";
import { getPersonHeader, getPersonVoteResults, type PersonVoteResult } from "@/lib/queries";
import { runCachedDatabaseWorker } from "@/lib/database-worker";
import styles from "./trajectory-report.module.css";

export const dynamic = "force-dynamic";

type MunicipalityBreakdown = { state: string; municipality: string; municipalityCode: string; votes: number; sections: number };
type StateBreakdown = { state: string; votes: number };
type ElectionBreakdown = {
  historyId: number;
  year: number;
  round: number;
  totalVotes: number;
  sectionCount: number;
  municipalities: MunicipalityBreakdown[];
  states: StateBreakdown[];
};
type ReportWorkerResult = { elections: ElectionBreakdown[]; error?: string };

type ReportElection = { result: PersonVoteResult; detail: ElectionBreakdown | null };
type CityTrajectory = {
  key: string;
  state: string;
  municipality: string;
  municipalityCode: string;
  votesByElection: number[];
};

function formatNumber(value: number) {
  return value.toLocaleString("pt-BR");
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return "0,0%";
  return `${(value / total * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function signedNumber(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatNumber(Math.abs(value))}`;
}

function changeLabel(current: number, previous: number) {
  if (previous <= 0) return null;
  const change = current - previous;
  const percent = ((change / previous) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return { change, percent: `${percent}%` };
}

function electionRows(results: PersonVoteResult[], details: ElectionBreakdown[]): ReportElection[] {
  const detailById = new Map(details.map((detail) => [detail.historyId, detail]));
  const byYear = new Map<number, PersonVoteResult>();
  for (const result of results) {
    if (result.year < 2012 || result.sectionCount <= 0) continue;
    const current = byYear.get(result.year);
    if (!current || result.round > current.round) byYear.set(result.year, result);
  }
  return [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .map((result) => ({ result, detail: detailById.get(result.historyId) ?? null }));
}

function cityKey(city: MunicipalityBreakdown) {
  const identity = city.municipalityCode || city.municipality.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  return `${city.state.trim().toLocaleUpperCase("pt-BR")}|${identity}`;
}

function cityTrajectories(elections: ReportElection[]): CityTrajectory[] {
  const cities = new Map<string, CityTrajectory>();
  elections.forEach(({ detail }, electionIndex) => {
    if (!detail) return;
    for (const city of detail.municipalities) {
      const key = cityKey(city);
      const trajectory = cities.get(key) ?? {
        key,
        state: city.state,
        municipality: city.municipality,
        municipalityCode: city.municipalityCode,
        votesByElection: elections.map(() => 0),
      };
      trajectory.votesByElection[electionIndex] += city.votes;
      cities.set(key, trajectory);
    }
  });

  return [...cities.values()].sort((a, b) => {
    const latestDifference = (b.votesByElection.at(-1) ?? 0) - (a.votesByElection.at(-1) ?? 0);
    if (latestDifference !== 0) return latestDifference;
    const totalDifference = b.votesByElection.reduce((sum, votes) => sum + votes, 0) - a.votesByElection.reduce((sum, votes) => sum + votes, 0);
    return totalDifference || a.municipality.localeCompare(b.municipality, "pt-BR");
  });
}

function signedPercent(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  const percent = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${prefix}${percent}%`;
}

function cityVariation(current: number, previous: number, currentDataAvailable: boolean, previousDataAvailable: boolean, isFirstElection: boolean) {
  if (isFirstElection) return { label: "base inicial", tone: "neutral" as const, amount: "" };
  if (!currentDataAvailable || !previousDataAvailable) return { label: "sem dados comparáveis", tone: "neutral" as const, amount: "" };
  if (previous === 0 && current === 0) return { label: "sem votos nos dois anos", tone: "neutral" as const, amount: "" };
  if (previous === 0) return { label: "percentual não calculável", tone: "neutral" as const, amount: `${signedNumber(current)} votos · base anterior zero` };

  const change = current - previous;
  return {
    label: signedPercent(change / previous * 100),
    tone: change > 0 ? "up" as const : change < 0 ? "down" as const : "neutral" as const,
    amount: `${signedNumber(change)} votos`,
  };
}

function PrintBar({ votes, max }: { votes: number; max: number }) {
  return (
    <div className={styles.barTrack} aria-label={`${formatNumber(votes)} votos`}>
      <span style={{ width: `${max > 0 ? Math.max(1, votes / max * 100) : 0}%` }} />
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/politico/[id]/relatorio-trajetoria">): Promise<Metadata> {
  const { id } = await params;
  const header = getPersonHeader(Number(id));
  const name = header?.person.canonicalName || "candidato";
  return {
    title: `Relatório de trajetória eleitoral — ${name} | Politica007`,
    description: `Relatório completo de votos e distribuição territorial de ${name}.`,
  };
}

export default async function ElectoralTrajectoryReportPage({ params }: PageProps<"/politico/[id]/relatorio-trajetoria">) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId < 1) notFound();

  const header = getPersonHeader(personId);
  if (!header) notFound();
  const candidateName = header.person.canonicalName || "Nome não informado";
  const candidacies = getPersonVoteResults(personId);
  const hasLocalResults = candidacies.some((result) => result.year >= 2012 && result.sectionCount > 0);
  let reportError = false;
  let details: ElectionBreakdown[] = [];

  if (hasLocalResults) {
    try {
      const workerResult = await runCachedDatabaseWorker<ReportWorkerResult>(
        `derived:person-vote-trajectory-report:v1:${personId}`,
        "person-vote-trajectory-report-worker.cjs",
        { personId },
        "complete candidate vote trajectory report",
        { priority: 2, lane: "bulk" },
      );
      if (workerResult.error) throw new Error(workerResult.error);
      details = workerResult.elections;
    } catch (error) {
      console.error("Unable to load complete candidate vote trajectory report:", error);
      reportError = true;
    }
  }

  const elections = electionRows(candidacies, details);
  const municipalityTrajectories = cityTrajectories(elections);
  const first = elections[0] ?? null;
  const latest = elections.at(-1) ?? null;
  const firstDetail = first?.detail;
  const latestDetail = latest?.detail;
  const firstMunicipalityCount = firstDetail?.municipalities.filter((item) => item.municipality !== "Município não informado").length ?? 0;
  const latestMunicipalityCount = latestDetail?.municipalities.filter((item) => item.municipality !== "Município não informado").length ?? 0;
  const firstStateCount = firstDetail?.states.filter((item) => item.state !== "UF não informada").length ?? 0;
  const latestStateCount = latestDetail?.states.filter((item) => item.state !== "UF não informada").length ?? 0;
  const maxVotes = Math.max(1, ...elections.map(({ result }) => result.totalVotes));
  const overallChange = first && latest ? changeLabel(latest.result.totalVotes, first.result.totalVotes) : null;
  const yearRange = first && latest ? `${first.result.year}-${latest.result.year}` : "sem-período";
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return (
    <main className={`${styles.report} trajectory-report`}>
      <div className={styles.toolbar + " trajectory-report__toolbar"}>
        <Link className={styles.backLink} href={`/politico/${personId}#trajetoria-eleitoral`}>
          <ArrowLeft size={15} aria-hidden="true" /> Voltar à ficha
        </Link>
        {elections.length > 0 && !reportError ? (
          <TrajectoryReportPrintButton className={styles.printButton} candidateName={candidateName} yearRange={yearRange} />
        ) : null}
      </div>

      {reportError ? (
        <section className={styles.emptyState} role="alert">
          <h1>Não foi possível montar o relatório completo</h1>
          <p>O acervo local não respondeu a esta consulta. Tente novamente em instantes ou volte à ficha do candidato.</p>
          <Link href={`/politico/${personId}#trajetoria-eleitoral`}>Voltar à ficha</Link>
        </section>
      ) : elections.length === 0 ? (
        <section className={styles.emptyState}>
          <h1>Sem dados suficientes para este relatório</h1>
          <p>Não há resultados por seção no acervo local para gerar a distribuição detalhada por município e estado.</p>
          <Link href={`/politico/${personId}#trajetoria-eleitoral`}>Voltar à ficha</Link>
        </section>
      ) : (
        <>
          <header className={styles.cover}>
            <div className={styles.brandLine}>
              <div className={styles.brandMark}>P</div>
              <div><strong>POLITICA007</strong><span>RADAR DE DADOS PÚBLICOS</span></div>
              <span className={styles.coverDate}>GERADO EM {generatedAt}</span>
            </div>
            <div className={styles.coverBody}>
              <p className={styles.eyebrow}>RELATÓRIO ELEITORAL · {yearRange.replace("-", "–")}</p>
              <h1>Trajetória eleitoral</h1>
              <p className={styles.candidate}>{candidateName}</p>
              {header.latestCandidacy ? (
                <p className={styles.latestRole}>
                  Última candidatura identificada: {header.latestCandidacy.office || "cargo não informado"} · {header.latestCandidacy.partyAbbr || "partido não informado"}/{header.latestCandidacy.state || "UF não informada"} · {header.latestCandidacy.year}
                </p>
              ) : null}

              <div className={styles.heroMetrics}>
                <article><span>VOTOS NA PRIMEIRA ELEIÇÃO</span><strong>{formatNumber(first?.result.totalVotes ?? 0)}</strong><small>{first?.result.year ?? "—"} · {first?.result.office || "cargo n/i"}</small></article>
                <article><span>VOTOS NA MAIS RECENTE</span><strong>{formatNumber(latest?.result.totalVotes ?? 0)}</strong><small>{latest?.result.year ?? "—"} · {latest?.result.office || "cargo n/i"}</small></article>
                <article className={overallChange && overallChange.change < 0 ? styles.negativeMetric : styles.positiveMetric}>
                  <span>VARIAÇÃO NO PERÍODO</span>
                  <strong>{overallChange ? `${signedNumber(overallChange.change)} votos` : "—"}</strong>
                  <small>{overallChange ? `${overallChange.percent} em relação à primeira eleição` : "É necessário haver mais de uma eleição"}</small>
                </article>
              </div>

              {elections.length > 1 ? (
                <section className={styles.chart} aria-label="Comparativo de votos por eleição">
                  <div className={styles.sectionHeading}><span>EVOLUÇÃO DA VOTAÇÃO NOMINAL</span><small>escala comparável entre eleições</small></div>
                  {elections.map(({ result }) => (
                    <div className={styles.chartRow} key={result.historyId}>
                      <span>{result.year}</span><PrintBar votes={result.totalVotes} max={maxVotes} />
                      <strong>{formatNumber(result.totalVotes)}</strong>
                    </div>
                  ))}
                </section>
              ) : null}
            </div>
            <div className={styles.coverFooter}>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Documento baseado em registros públicos eleitorais integrados ao acervo local do Politica007.</span>
            </div>
          </header>

          <section className={styles.summaryPage}>
            <div className={styles.pageEyebrow}>01 · SÍNTESE DA TRAJETÓRIA</div>
            <h2>Visão comparativa</h2>
            <p className={styles.lead}>Resultados por eleição, mantendo cada cargo e abrangência identificados para que as diferenças de contexto fiquem claras.</p>
            <div className={styles.kpiGrid}>
              <article><span>ELEIÇÕES COM DADOS</span><strong>{formatNumber(elections.length)}</strong></article>
              <article><span>SEÇÕES NO PERÍODO</span><strong>{formatNumber(elections.reduce((total, item) => total + item.result.sectionCount, 0))}</strong></article>
              <article><span>MUNICÍPIOS · PRIMEIRA → ÚLTIMA</span><strong>{formatNumber(firstMunicipalityCount)} → {formatNumber(latestMunicipalityCount)}</strong></article>
              <article><span>UFs · PRIMEIRA → ÚLTIMA</span><strong>{formatNumber(firstStateCount)} → {formatNumber(latestStateCount)}</strong></article>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Ano / turno</th><th>Cargo e candidatura</th><th>Partido</th><th className={styles.number}>Votos nominais</th><th className={styles.number}>Seções</th><th className={styles.number}>Variação</th></tr></thead>
                <tbody>{elections.map(({ result }, index) => {
                  const prior = index > 0 ? elections[index - 1]?.result : null;
                  const change = prior ? changeLabel(result.totalVotes, prior.totalVotes) : null;
                  const ChangeIcon = change ? change.change > 0 ? ArrowUpRight : change.change < 0 ? ArrowDownRight : Minus : null;
                  return (
                    <tr key={result.historyId}>
                      <th>{result.year}<small>{result.round}º turno</small></th>
                      <td>{result.office || "Cargo não informado"}<small>{result.municipality ? `${result.municipality}/${result.state || "—"}` : result.electoralUnit || result.state || "abrangência n/i"}</small></td>
                      <td>{result.partyAbbr || "—"}</td>
                      <td className={styles.number}>{formatNumber(result.totalVotes)}</td>
                      <td className={styles.number}>{formatNumber(result.sectionCount)}</td>
                      <td className={styles.number}>{change && ChangeIcon ? <span className={change.change < 0 ? styles.down : styles.up}><ChangeIcon size={12} aria-hidden="true" /> {signedNumber(change.change)} ({change.percent})</span> : "—"}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div className={styles.methodBox}>
              <strong>Como interpretar</strong>
              <p>A variação compara totais brutos de votos nominais, mesmo quando o candidato disputou cargos ou territórios diferentes. Ela não mede, sozinha, crescimento ou perda de apoio, nem substitui o percentual oficial sobre votos válidos. Percentuais nas tabelas territoriais indicam a parcela dos votos nominais do candidato naquele recorte.</p>
            </div>
          </section>

          <section className={`${styles.summaryPage} ${styles.cityEvolutionPage}`}>
            <div className={styles.pageEyebrow}>02 · COMPARAÇÃO TERRITORIAL</div>
            <h2>Evolução por município</h2>
            <p className={styles.lead}>Compare os votos nominais registrados em cada cidade ao longo das eleições. Em cada ano, a variação percentual é calculada em relação à eleição anterior da trajetória.</p>
            {municipalityTrajectories.length ? (
              <>
                <div className={styles.cityEvolutionSummary}>
                  <strong>{formatNumber(municipalityTrajectories.length)} municípios na trajetória</strong>
                  <span>Ordenados pela votação mais recente; cada coluna mostra votos e variação frente ao ano anterior.</span>
                </div>
                <div className={`${styles.tableWrap} ${styles.cityEvolutionTableWrap}`}>
                  <table className={`${styles.table} ${styles.cityEvolutionTable}`}>
                    <thead>
                      <tr>
                        <th>Município / UF</th>
                        {elections.map(({ result }, index) => (
                          <th className={styles.number} key={result.historyId}>
                            {result.year}
                            <small>{result.office || "Cargo não informado"}{index > 0 ? ` · var. vs. ${elections[index - 1]?.result.year}` : " · base"}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {municipalityTrajectories.map((city) => (
                        <tr key={city.key}>
                          <th>{city.municipality}<small>{city.state}{city.municipalityCode ? ` · código ${city.municipalityCode}` : ""}</small></th>
                          {elections.map(({ result, detail }, index) => {
                            const previousDetail = index > 0 ? elections[index - 1]?.detail : null;
                            const votes = city.votesByElection[index] ?? 0;
                            const previousVotes = city.votesByElection[index - 1] ?? 0;
                            const variation = cityVariation(votes, previousVotes, detail !== null, previousDetail !== null, index === 0);
                            const variationClass = variation.tone === "up" ? styles.cityIncrease : variation.tone === "down" ? styles.cityDecrease : styles.cityNoChange;
                            return (
                              <td className={styles.cityEvolutionCell} key={result.historyId}>
                                {detail ? <strong>{formatNumber(votes)}</strong> : <strong className={styles.cityUnavailable}>—</strong>}
                                <span className={variationClass}>{detail ? variation.label : "dados indisponíveis"}</span>
                                {variation.amount ? <small className={styles.cityChangeAmount}>{variation.amount}</small> : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.methodBox}>
                  <strong>Como interpretar a comparação</strong>
                  <p>A variação usa votos nominais por município e compara anos consecutivos da trajetória, mesmo quando cargo ou abrangência mudam. Ela descreve a diferença observada, mas não mede sozinha crescimento ou perda de apoio. Com dados disponíveis para a eleição, uma cidade sem linha de votos é exibida com zero registro nominal. Quando a base anterior é zero, mostramos a quantidade de votos e indicamos que a porcentagem não pode ser calculada; quando faltam dados da eleição, a comparação fica indisponível.</p>
                </div>
              </>
            ) : <p className={styles.noRows}>Não há distribuição municipal suficiente para comparar as eleições desta trajetória.</p>}
          </section>

          {elections.map(({ result, detail }, index) => {
            const prior = index > 0 ? elections[index - 1]?.result : null;
            const change = prior ? changeLabel(result.totalVotes, prior.totalVotes) : null;
            const scope = result.municipality
              ? `${result.municipality}/${result.state || "UF não informada"}`
              : result.state || result.electoralUnit || "Abrangência não informada";
            return (
              <section className={styles.electionPage} key={result.historyId}>
                <div className={styles.pageEyebrow}>{String(index + 3).padStart(2, "0")} · DETALHAMENTO POR ELEIÇÃO</div>
                <div className={styles.electionTitleRow}>
                  <div><h2>{result.year}</h2><p>{result.round}º turno · {result.office || "Cargo não informado"}</p></div>
                  <div className={styles.electionVotes}><strong>{formatNumber(detail?.totalVotes ?? result.totalVotes)}</strong><span>votos nominais</span></div>
                </div>
                <div className={styles.electionMeta}>
                  <span>ABRANGÊNCIA REGISTRADA<strong>{scope}</strong></span>
                  <span>PARTIDO<strong>{result.partyAbbr || "Não informado"}</strong></span>
                  <span>SEÇÕES COM REGISTRO<strong>{formatNumber(detail?.sectionCount ?? result.sectionCount)}</strong></span>
                  {change ? <span>VARIAÇÃO VS. {prior?.year}<strong className={change.change < 0 ? styles.downText : styles.upText}>{signedNumber(change.change)} · {change.percent}</strong></span> : null}
                </div>

                <div className={styles.detailGrid}>
                  <section>
                    <div className={styles.tableHeading}><span>01</span><div><h3>Votos por estado</h3><p>Distribuição dos votos nominais por UF.</p></div></div>
                    {detail?.states.length ? (
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead><tr><th>UF</th><th className={styles.number}>Votos</th><th className={styles.number}>% do total</th></tr></thead>
                          <tbody>{detail.states.map((state) => <tr key={state.state}><th>{state.state}</th><td className={styles.number}>{formatNumber(state.votes)}</td><td className={styles.number}>{formatPercent(state.votes, detail.totalVotes)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    ) : <p className={styles.noRows}>Sem distribuição estadual nos boletins disponíveis.</p>}
                  </section>

                  <section className={styles.municipalitySection}>
                    <div className={styles.tableHeading}><span>02</span><div><h3>Votos por município</h3><p>{formatNumber(detail?.municipalities.length ?? 0)} localidades · ordenadas por votos nominais.</p></div></div>
                    {detail?.municipalities.length ? (
                      <div className={styles.tableWrap}>
                        <table className={`${styles.table} ${styles.municipalityTable}`}>
                          <thead><tr><th>Município / UF</th><th className={styles.number}>Votos</th><th className={styles.number}>% do total</th><th className={styles.number}>Seções</th></tr></thead>
                          <tbody>{detail.municipalities.map((city) => <tr key={`${city.state}:${city.municipalityCode || city.municipality}`}><th>{city.municipality}<small>{city.state}{city.municipalityCode && city.municipality !== city.municipalityCode ? ` · código ${city.municipalityCode}` : ""}</small></th><td className={styles.number}>{formatNumber(city.votes)}</td><td className={styles.number}>{formatPercent(city.votes, detail.totalVotes)}</td><td className={styles.number}>{formatNumber(city.sections)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    ) : <p className={styles.noRows}>Os boletins desta eleição não discriminam municípios.</p>}
                    <p className={styles.tableNote}>Percentual calculado sobre os votos nominais do candidato nesta eleição; não corresponde à proporção sobre votos válidos. Seções são registros agregados dos boletins oficiais.</p>
                  </section>
                </div>

                <div className={styles.sourceLine}>
                  <MapPin size={13} aria-hidden="true" />
                  <span>Fonte dos dados: boletins de urna do Tribunal Superior Eleitoral (TSE) integrados ao banco local do Politica007.</span>
                  <a href={`https://dadosabertos.tse.jus.br/dataset/resultados-${result.year}`} target="_blank" rel="noreferrer">Conferir arquivos oficiais de {result.year}</a>
                </div>
              </section>
            );
          })}

          <footer className={styles.reportFooter}>
            <strong>POLITICA007</strong>
            <span>Relatório de dados públicos eleitorais · gerado em {generatedAt}</span>
            <p>O Politica007 é uma plataforma independente. Os resultados são reproduzidos a partir de bases públicas; confira as fontes oficiais do TSE antes de citar os números. Uma diferença entre eleições pode refletir mudança de cargo, território, concorrência e contexto eleitoral.</p>
          </footer>
        </>
      )}
    </main>
  );
}
