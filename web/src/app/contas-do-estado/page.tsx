import Link from "next/link";
import { ArrowUpRight, Building2, FileText, GitCompareArrows, MapPinned } from "lucide-react";
import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata } from "@/lib/seo-metadata";
import { STATES, hasFiscalCoverage, publishedStates } from "@/lib/state-accounts/registry";

export const metadata = pageMetadata(
  "Contas dos estados · despesas públicas com fontes | Politica007",
  "Consulte a execução orçamentária por UF no Siconfi, com períodos e fontes oficiais. Goiás também tem dados de publicidade e repasses cirúrgicos.",
  "/contas-do-estado",
);

export default function StateAccountsHub() {
  const available = publishedStates();
  const planned = STATES.filter(state => !state.active && !hasFiscalCoverage(state.slug));
  return <div className="flex flex-col gap-7">
    <PageHeader group="Transparência" current="Contas do Estado" />
    <header className="rounded-[20px] border border-[var(--border-1)] bg-[var(--surface)] p-6 sm:p-9">
      <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"><MapPinned size={16} aria-hidden /> Cobertura estadual</p>
      <h1 className="mb-4 text-3xl font-semibold tracking-tight sm:text-5xl">Contas dos estados</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">Compare o destino dos recursos públicos e confira os documentos que sustentam cada valor. Escolha uma unidade da Federação com integração publicada.</p>
    </header>

    <section aria-labelledby="states-available" className="flex flex-col gap-4">
      <div><h2 id="states-available" className="text-xl font-semibold">Disponível para consulta</h2><p className="mt-1 text-sm text-[var(--muted)]">O painel informa a cobertura de cada órgão e período.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {available.map(state => <Link key={state.uf} prefetch={false} href={`/contas-do-estado/${state.slug}`} className="card flex flex-col gap-5 p-6 transition-colors hover:border-[var(--border-2)]">
          <div className="flex items-center justify-between gap-4"><span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-2)] bg-[var(--bg)] text-sm font-bold">{state.uf}</span><span className="rounded-full border border-[var(--border-1)] px-3 py-1 text-xs text-[var(--muted)]">{state.active ? "Fiscal e temático" : "Fiscal e produção SUS"}</span></div>
          <div><h3 className="text-2xl font-semibold tracking-tight">{state.name}</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{state.active ? "Publicidade, repasses para cirurgias e funções orçamentárias, com documentos." : "Orçamento por área e produção cirúrgica hospitalar do SUS, em bases separadas."}</p></div>
          <span className="mt-auto flex items-center gap-2 text-sm font-semibold">Explorar {state.name}<ArrowUpRight size={17} aria-hidden /></span>
        </Link>)}
        <div className="grid gap-4 rounded-[var(--r-lg)] border border-[var(--border-1)] bg-[var(--surface)] p-6">
          <h3 className="text-base font-semibold">Leia cada comparação com contexto</h3>
          <div className="flex items-start gap-3"><GitCompareArrows size={19} aria-hidden className="mt-0.5 shrink-0 text-[var(--muted)]" /><p className="text-sm leading-relaxed text-[var(--muted)]">Compare a mesma janela temporal e a mesma etapa financeira: pago, liquidado ou contratado.</p></div>
          <div className="flex items-start gap-3"><Building2 size={19} aria-hidden className="mt-0.5 shrink-0 text-[var(--muted)]" /><p className="text-sm leading-relaxed text-[var(--muted)]">Confira quais órgãos entram no recorte. Um conjunto parcial não representa o total de gastos do estado.</p></div>
          <div className="flex items-start gap-3"><FileText size={19} aria-hidden className="mt-0.5 shrink-0 text-[var(--muted)]" /><p className="text-sm leading-relaxed text-[var(--muted)]">Cada valor mantém a origem e o período para consulta e verificação.</p></div>
        </div>
      </div>
    </section>

    {planned.length > 0 && <section aria-labelledby="states-planned" className="card p-5 sm:p-6">
      <h2 id="states-planned" className="text-xl font-semibold">Cobertura em expansão</h2>
      <p className="mb-5 mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">As demais unidades da Federação ainda não têm integração publicada neste módulo. A ausência de um painel não informa quanto um estado gastou.</p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {planned.map(state => <li key={state.uf} className="flex items-center gap-3 rounded-lg border border-[var(--border-1)] px-3 py-3">
          <span className="w-7 shrink-0 text-xs font-semibold text-[var(--muted)]">{state.uf}</span>
          <span className="min-w-0 flex-1 text-sm">{state.name}</span>
          <span className="shrink-0 text-[11px] text-[var(--muted)]">Ainda sem painel</span>
        </li>)}
      </ul>
    </section>}
  </div>;
}
