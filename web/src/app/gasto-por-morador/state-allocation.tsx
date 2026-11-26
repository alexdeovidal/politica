import { Landmark } from "lucide-react";
import { ageSource, cityCostHref, cityFor, number, reais, stateAllocation, stateFor } from "@/lib/per-capita";
import Link from "next/link";

export function StateAllocation({ code, standalone = false }: { code: string; standalone?: boolean }) {
  const city=cityFor(code), state=city ? stateFor(city.uf) : undefined;
  const estimate=state ? stateAllocation(code,state) : null;
  if(!city || !state || !estimate) return null;
  return <section id={standalone ? "parcela-estadual" : undefined} className="card min-w-0 scroll-mt-24 p-5 sm:p-7">
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"><Landmark size={16} aria-hidden /> Rateio do governo estadual · 2025</p>
    <h2 className="mt-2 text-xl font-semibold">Parcela estadual estimada para {city.name}</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Dividimos a despesa liquidada de {state.name} pela população estadual e aplicamos essa média à população de {city.name}. <strong>Não é o gasto que o governo registrou na cidade.</strong> Sem dados estaduais de custo por idade, a média por pessoa é igual nas três faixas.</p>
    <dl className="my-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-[var(--border-1)] p-3"><dt className="text-xs text-[var(--muted)]">Por morador, no ano</dt><dd className="break-words text-xl font-semibold">{reais(estimate.annualPer)}</dd></div>
      <div className="rounded-lg border border-[var(--border-1)] p-3"><dt className="text-xs text-[var(--muted)]">Por morador, média mensal</dt><dd className="break-words text-xl font-semibold">{reais(estimate.monthlyPer)}</dd></div>
    </dl>
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Rateio estadual por idade em ${city.name}`}>
      <table className="w-full text-sm">
        <thead><tr><th scope="col" className="p-2 text-left">Faixa etária</th><th scope="col" className="p-2 text-right">Moradores</th><th scope="col" className="p-2 text-right">Ano</th><th scope="col" className="p-2 text-right">Média mensal</th></tr></thead>
        <tbody>{estimate.groups.map(g=><tr key={g.label} className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left font-medium">{g.label}</th><td className="p-2 text-right">{number.format(g.count)}</td><td className="whitespace-nowrap p-2 text-right">{reais(g.annual)}</td><td className="whitespace-nowrap p-2 text-right">{reais(g.monthly)}</td></tr>)}</tbody>
        <tfoot><tr className="border-t border-[var(--border-2)] font-semibold"><th scope="row" className="p-2 text-left">{estimate.groups.length ? "Total · soma das faixas" : "Total estimado"}</th><td className="p-2 text-right">{number.format(estimate.population)}</td><td className="whitespace-nowrap p-2 text-right">{reais(estimate.annual)}</td><td className="whitespace-nowrap p-2 text-right">{reais(estimate.monthly)}</td></tr></tfoot>
      </table>
    </div>
    <p className="mt-3 text-xs text-[var(--muted)]">{estimate.groups.length ? "Faixas estimadas aplicando a distribuição do Censo 2022 à população IBGE de 2025. " : "Sem distribuição municipal por idade na base censitária usada. Não estimamos as faixas. "}Média mensal = anual ÷ 12; os centavos são ajustados para a soma das faixas fechar com o total. Não some com a despesa da prefeitura: pode haver transferências entre governos.</p>
    <div className="mt-3 flex flex-wrap gap-3 text-sm"><a href={state.source} className="source-link">Tesouro · despesa estadual</a><a href={ageSource} className="source-link">IBGE · idade no Censo 2022</a>{!standalone && <Link className="source-link" href={cityCostHref(code)} prefetch={false}>Abrir ficha e comparar</Link>}</div>
  </section>;
}
