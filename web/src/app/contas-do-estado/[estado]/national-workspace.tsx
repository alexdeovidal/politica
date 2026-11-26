"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, FileCheck2, Files, HeartPulse, Landmark, ListFilter } from "lucide-react";
import type { FiscalSnapshot } from "@/lib/state-accounts/dashboard-model";
import { BudgetView, type BudgetOptions } from "./state-dashboard";
import { StateFooter } from "./state-chrome";
import styles from "./state-dashboard.module.css";

const tabs = [
  { id: "orcamento", label: "Orçamento por área", Icon: Landmark },
  { id: "producao-hospitalar", label: "Produção cirúrgica no SUS", Icon: HeartPulse },
  { id: "fontes", label: "Fontes e cobertura", Icon: FileCheck2 },
] as const;
type View = typeof tabs[number]["id"];
const serverView = () => "orcamento" as const;
function getView(): View {
  const hash = window.location.hash.slice(1);
  return hash === "producao-hospitalar" || hash === "fontes" ? hash : "orcamento";
}
function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}

export function NationalWorkspace({ hero, fiscal, tables, production, sources }: {
  hero: ReactNode; fiscal: FiscalSnapshot[]; tables: ReactNode; production: ReactNode; sources: ReactNode;
}) {
  const active: View = useSyncExternalStore<View>(subscribe, getView, serverView);
  const [budget, setBudget] = useState<BudgetOptions>({ left: "12", right: "10", measure: "settledCents" });
  function changeView(next: View) {
    if (next === active) return;
    window.history.pushState(null, "", next === "orcamento" ? window.location.pathname + window.location.search : "#" + next);
    window.dispatchEvent(new Event("hashchange"));
  }

  return <div className={styles.dashboard}>
    {hero}
    <div className={styles.auditStrip}>
      <span><Files size={16} aria-hidden /><strong>{fiscal.length}</strong> {fiscal.length === 1 ? "exercício fiscal" : "exercícios fiscais"} no Siconfi</span>
      <span><HeartPulse size={16} aria-hidden /> Base de produção SIH/SUS separada</span>
      <button type="button" onClick={() => changeView("fontes")}>Entenda a cobertura <ArrowRight size={14} aria-hidden /></button>
    </div>
    <nav className={styles.tabs} aria-label="Visões das contas estaduais">
      {tabs.map(({ id, label, Icon }) => <button type="button" key={id} className={active === id ? styles.activeTab : ""}
        aria-pressed={active === id} aria-controls={id} onClick={() => changeView(id)}><Icon size={17} aria-hidden />{label}</button>)}
    </nav>
    <section id="orcamento" hidden={active !== "orcamento"} className={styles.nationalBody}>
      <div className={styles.auditStrip}><span><ListFilter size={16} aria-hidden /> Escolha o exercício, a etapa financeira e as áreas para comparar.</span></div>
      <BudgetView data={{ fiscal }} year={fiscal[0].year} options={budget} onChange={setBudget} national />
      {tables}
    </section>
    <section id="producao-hospitalar" hidden={active !== "producao-hospitalar"} className={styles.nationalBody}>{production}</section>
    <section id="fontes" hidden={active !== "fontes"} className={styles.nationalBody}>{sources}</section>
    <StateFooter />
  </div>;
}
