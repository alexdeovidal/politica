"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TopSupplier } from "@/lib/queries";
import { formatBRL, formatCnpj } from "@/lib/format";
import { Skeleton } from "./skeleton";

export function TopSuppliers({ years, initialYear }: { years: number[]; initialYear?: number }) {
  // Default to the latest year: the all-time ranking takes several seconds.
  const [year, setYear] = useState<string>(
    initialYear ? String(initialYear) : years[0] ? String(years[0]) : "all"
  );
  const [suppliers, setSuppliers] = useState<TopSupplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/top-suppliers?year=${year}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setSuppliers(data.suppliers ?? []);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [year]);

  const max = suppliers.length > 0 ? suppliers[0].totalCents : 1;

  return (
    <section className="card">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">prestação de contas eleitorais · despesas contratadas com fornecedores</div>
          <h2 className="mt-2 text-[20px] font-medium tracking-tight">
            Empresas com maiores contratações em campanhas
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="year-select" className="label">
            eleição
          </label>
          <select
            id="year-select"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mono rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--card-tone)] px-3 py-2 text-[12px] text-[var(--fg-1)] outline-none focus:border-[var(--border-2)]"
          >
            <option value="all">todas</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="border-b border-[var(--border-1)] py-3.5 last:border-0">
              <div className="flex items-baseline gap-3">
                <span className="w-6 flex-none font-mono text-[11px] text-[var(--muted-2)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-24 flex-none" />
              </div>
              <div className="mt-2 pl-9">
                <Skeleton className="h-[3px] w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="py-10 text-center font-mono text-[11px] text-[var(--muted-2)]">
          sem despesas contratadas para esse filtro.
        </div>
      ) : (
        <div className="flex flex-col">
          {suppliers.map((s, i) => (
            <div key={s.cnpj} className="min-w-0 border-b border-[var(--border-1)] py-3.5 last:border-0">
              <div className="flex min-w-0 items-baseline gap-2.5 sm:gap-3">
                <span className="w-6 flex-none font-mono text-[11px] text-[var(--muted-2)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/cnpj/${s.cnpj}`}
                  className="line-clamp-2 min-w-0 flex-1 break-words text-[13px] leading-snug hover:text-elo-amber hover:underline sm:truncate sm:text-[14px]"
                >
                  {s.name}
                </Link>
                <span className="flex-none whitespace-nowrap font-mono text-[12px] text-elo-amber sm:text-[13px]">
                  {formatBRL(s.totalCents)}
                </span>
              </div>
              <div className="mt-2 flex min-w-0 flex-col items-stretch gap-1.5 pl-9 sm:flex-row sm:items-center sm:gap-3">
                <div className="h-[3px] min-w-0 bg-[var(--hover)] sm:flex-1">
                  <div
                    className="h-[3px] bg-elo-amber"
                    style={{ width: `${Math.max(2, (s.totalCents / max) * 100)}%` }}
                  />
                </div>
                <span className="min-w-0 max-w-full break-words font-mono text-[9.5px] leading-relaxed text-[var(--muted-2)] sm:flex-none sm:whitespace-nowrap">
                  {formatCnpj(s.cnpj)} · {s.paymentCount.toLocaleString("pt-BR")} despesas contratadas ·{" "}
                  {s.candidacyCount.toLocaleString("pt-BR")} candidaturas
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-[var(--muted-2)]">
        Fontes oficiais das despesas contratadas: {(year === "all" ? years : [Number(year)]).map((sourceYear, index) => (
          <span key={sourceYear}>
            {index ? ", " : " "}<a className="source-link source-link--inline" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-${sourceYear}`} target="_blank" rel="noopener noreferrer">TSE {sourceYear}</a>
          </span>
        ))}
      </p>
    </section>
  );
}
