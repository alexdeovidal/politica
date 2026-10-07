"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatBRL } from "@/lib/format";
import type { TseUpdateStatus as Status } from "@/lib/tse-update-status";
import { TseUpdateStatus } from "@/components/tse-update-status";
import { YearSelect } from "@/components/ui/year-select";

type HomeSummary = {
  selectedYear: number | null;
  candidacyYears: number[];
  expenseYears: number[];
  stats: {
    people: number;
    candidacies: number;
    campaignOrgs: number;
    socialMedia: number;
    donationsTotalCents: number;
    expensesTotalCents: number;
    years: string;
  };
  tseUpdateStatus: Status;
};

function useHomeSummary(requestedYear: number) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = requestedYear > 0 ? `?ano=${requestedYear}` : "";
    setError(false);

    fetch(`/api/home-summary${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Home summary unavailable");
        return response.json() as Promise<HomeSummary>;
      })
      .then(setSummary)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });

    return () => controller.abort();
  }, [requestedYear, attempt]);

  return { summary, error, retry: () => setAttempt((value) => value + 1) };
}

function useRequestedYear() {
  const searchParams = useSearchParams();
  const year = Number(searchParams.get("ano"));
  return Number.isInteger(year) && year > 0 ? year : 0;
}

export function HomeYearSelect() {
  const requestedYear = useRequestedYear();
  const { summary } = useHomeSummary(requestedYear);
  if (!summary) return <span className="block h-8 w-36 animate-pulse rounded bg-[var(--hover)]" aria-hidden="true" />;

  const selectedYear = summary.expenseYears.includes(requestedYear) ? requestedYear : undefined;
  return <YearSelect basePath="/" years={summary.expenseYears} value={selectedYear} allLabel="todos os anos" />;
}

export function HomeMetrics() {
  const requestedYear = useRequestedYear();
  const { summary, error, retry } = useHomeSummary(requestedYear);

  if (!summary) {
    return <section className="flex flex-col gap-4" aria-live="polite" aria-busy={!error}>
      <div className="kpis kpis--home" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="kpi"><div className="kpi__label">Indicador público</div><div className="kpi__value">…</div></div>)}
      </div>
      {error ? <button type="button" className="self-start text-xs text-[var(--muted)] underline" onClick={retry}>Tentar carregar os indicadores novamente</button> : <p className="text-xs text-[var(--muted-2)]">Preparando os indicadores públicos…</p>}
    </section>;
  }

  const year = summary.selectedYear;
  const stats = summary.stats;
  const heroStats = [
    { label: "pessoas", value: stats.people.toLocaleString("pt-BR") },
    { label: "candidaturas", value: stats.candidacies.toLocaleString("pt-BR") },
    { label: "doações recebidas", value: formatBRL(stats.donationsTotalCents), tone: "green" as const },
    { label: "despesas contratadas", value: formatBRL(stats.expensesTotalCents) },
    { label: year ? "eleição" : "período coberto", value: stats.years },
  ];

  return <section className="animate-in flex flex-col gap-4" style={{ animationDelay: "80ms" }}>
    <div className="kpis kpis--home">{heroStats.map((stat) => <div key={stat.label} className="kpi"><div className="kpi__label">{stat.label}</div><div className={`kpi__value${stat.tone === "green" ? " kpi__value--green" : ""}`}>{stat.value}</div></div>)}</div>
    <TseUpdateStatus status={summary.tseUpdateStatus} />
    <div className="flex flex-col gap-1 text-[10px] leading-relaxed text-[var(--muted-2)]">
      <p>Fontes oficiais de candidaturas TSE:{" "}{(year ? [year] : summary.candidacyYears).map((sourceYear, index) => <span key={`candidate-${sourceYear}`}>{index ? ", " : ""}<a className="source-link source-link--inline" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-${sourceYear}`} target="_blank" rel="noopener noreferrer">{sourceYear}</a></span>)}</p>
      <p>Fontes oficiais de prestação de contas TSE:{" "}{(year ? [year] : summary.expenseYears).map((sourceYear, index) => <span key={`finance-${sourceYear}`}>{index ? ", " : ""}<a className="source-link source-link--inline" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-${sourceYear}`} target="_blank" rel="noopener noreferrer">{sourceYear}</a></span>)}</p>
    </div>
  </section>;
}
