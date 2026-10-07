"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FinanceSummary } from "@/lib/queries";
import type { PersonFinanceInsights as PersonFinanceInsightsData } from "@/lib/platform/person-finance";
import { formatBRL } from "@/lib/format";

function endpoint(personId: number, year: number | undefined, part: "summary" | "insights") {
  const params = new URLSearchParams({ personId: String(personId), part });
  if (year) params.set("year", String(year));
  return `/api/person-finance?${params}`;
}

export function ProfileFinanceSummary({ personId, year }: { personId: number; year?: number }) {
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFinance(null);
    setFailed(false);
    fetch(endpoint(personId, year, "summary"), { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Finance summary unavailable");
        return response.json() as Promise<FinanceSummary>;
      })
      .then(setFinance)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [personId, year, retry]);

  if (failed) {
    return (
      <section className="card my-3" aria-live="polite">
        <p>O resumo financeiro não carregou.</p>
        <button className="btn mt-2" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
      </section>
    );
  }

  if (!finance) {
    return (
      <div className="kpis kpis--profile mt-2" aria-label="Carregando resumo financeiro" aria-busy="true">
        {["doações", "despesas", "pagamentos"].map((item) => (
          <div className="kpi" key={item}>
            <div className="kpi__label">{item}</div>
            <div className="kpi__value">—</div>
            <div className="kpi__sub">consultando dados</div>
          </div>
        ))}
      </div>
    );
  }

  if (finance.donationsCount === 0 && finance.expensesCount === 0) return null;

  return (
    <div className="kpis kpis--profile mt-2">
      <div className="kpi">
        <div className="kpi__label">recebido em doações {year ? `em ${year}` : "(todas as eleições)"}</div>
        <div className="kpi__value kpi__value--green">{formatBRL(finance.donationsTotalCents)}</div>
        <div className="kpi__sub">{finance.donationsCount.toLocaleString("pt-BR")} doações</div>
      </div>
      <div className="kpi">
        <div className="kpi__label">despesas contratadas</div>
        <div className="kpi__value">{formatBRL(finance.expensesTotalCents)}</div>
        <div className="kpi__sub">{finance.expensesCount.toLocaleString("pt-BR")} despesas</div>
      </div>
      <div className="kpi">
        <div className="kpi__label">pago até agora</div>
        <div className="kpi__value">{formatBRL(finance.paymentsTotalCents)}</div>
        <div className="kpi__sub">regime de caixa</div>
      </div>
    </div>
  );
}

export function FinanceInsights({ personId, year }: { personId: number; year?: number }) {
  const section = useRef<HTMLElement>(null);
  const [finance, setFinance] = useState<PersonFinanceInsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const controller = new AbortController();
    let started = false;

    const load = () => {
      if (started) return;
      started = true;
      setLoading(true);
      setFailed(false);
      fetch(endpoint(personId, year, "insights"), { signal: controller.signal, cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Finance insights unavailable");
          return response.json() as Promise<PersonFinanceInsightsData>;
        })
        .then(setFinance)
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
    } else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      }, { rootMargin: "600px 0px" });
      observer.observe(element);
      return () => {
        observer.disconnect();
        controller.abort();
      };
    }

    return () => controller.abort();
  }, [personId, year, retry]);

  const total = finance?.expensesTotalCents ?? 0;
  const top = finance?.suppliers.slice(0, 5) ?? [];
  const share = total ? top.reduce((sum, supplier) => sum + supplier.cents, 0) / total * 100 : 0;

  return (
    <section ref={section} className="py-7" id="resumo-financeiro" data-toc-title="Concentração e evolução">
      <h2 className="section-title">Concentração de fornecedores e origem dos recursos</h2>
      <p className="text-sm my-3">
        {year ? `Eleição ${year}` : "Todas as eleições coletadas"}. {finance
          ? total > 0
            ? `Os cinco maiores fornecedores concentram ${share.toFixed(1).replace(".", ",")}% das despesas contratadas.`
            : "Concentração não calculável: não há valores positivos de despesas neste recorte."
          : "Análise detalhada das despesas e doações."} Concentração não demonstra irregularidade.
      </p>
      {loading && !finance ? <p role="status">Carregando análise financeira…</p> : null}
      {failed ? (
        <div role="alert" className="card">
          <p>Não foi possível carregar a análise financeira.</p>
          <button className="btn mt-2" onClick={() => { setFinance(null); setRetry((value) => value + 1); }}>Tentar novamente</button>
        </div>
      ) : null}
      {finance ? (
        <>
          <div className="platform-grid">
            <article className="card">
              <h3>Maiores fornecedores · contratado</h3>
              {top.map((row, index) => (
                <p key={`${row.doc || row.name || "fornecedor"}-${index}`} className="my-3">
                  {row.doc
                    ? <Link className="link-primary" href={`/${row.doc.length === 14 ? "cnpj" : "cpf"}/${row.doc}`}>{row.name || row.doc}</Link>
                    : row.name || "Fornecedor sem documento"}
                  <br />{formatBRL(row.cents)} · {total ? (row.cents / total * 100).toFixed(1) : "0"}%
                </p>
              ))}
            </article>
            <article className="card">
              <h3>Origem das doações recebidas</h3>
              {finance.donationOrigins.map((row) => <p className="my-3" key={row.name}>{row.name}<br />{formatBRL(row.cents)}</p>)}
            </article>
            <article className="card">
              <h3>Despesas por eleição</h3>
              {finance.expenseYears.map((row) => (
                <p className="my-3" key={row.year}>
                  <Link href={`/politico/${personId}?ano=${row.year}`} className="link-primary">{row.year}</Link> · {formatBRL(row.cents)}<br />
                  {row.n.toLocaleString("pt-BR")} registros
                </p>
              ))}
            </article>
          </div>
          <a className="source-link" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-${year || finance.expenseYears.at(-1)?.year || 2026}`} target="_blank" rel="noopener noreferrer">
            Fonte oficial · prestações de contas do TSE
          </a>
        </>
      ) : null}
    </section>
  );
}
