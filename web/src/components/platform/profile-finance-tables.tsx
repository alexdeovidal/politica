"use client";

import { useEffect, useRef, useState } from "react";
import { FinanceTable } from "@/components/finance-table";

export function ProfileFinanceTables({ personId, year }: { personId: number; year?: number }) {
  const section = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={section} id="financas" data-toc-title="finanças">
      {visible ? (
        <>
          <FinanceTable title="doações recebidas" scope="candidate" id={String(personId)} dir="received" counterpartyLabel="doador" tone="green" year={year} />
          <FinanceTable title="despesas — pra onde foi o dinheiro" scope="candidate" id={String(personId)} dir="spent" counterpartyLabel="fornecedor" tone="amber" year={year} />
        </>
      ) : (
        <div className="py-7" aria-label="Finanças, carregue ao se aproximar desta seção">
          <div className="section-title">Finanças</div>
          <p className="mt-3 text-sm text-[var(--muted)]">Os registros detalhados serão consultados ao abrir esta seção.</p>
        </div>
      )}
    </div>
  );
}
