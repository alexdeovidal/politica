import { Landmark } from "lucide-react";
import { federalFiscal, fiscalPilot, number, reais } from "@/lib/per-capita";
export function FederalSummary(){
 const {population,totalCents,functions,source}=federalFiscal;
 return <section id="uniao" className="card min-w-0 scroll-mt-24 p-5 sm:p-7">
  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"><Landmark size={16} aria-hidden /> Governo Federal · 2025</p>
  <h2 className="mt-2 text-2xl font-semibold">Quanto a União liquidou por morador</h2>
  <p className="my-2 text-sm text-[var(--muted)]">Orçamento federal dividido pelos {number.format(population)} habitantes estimados pelo IBGE. O total inclui todas as funções orçamentárias, inclusive Encargos Especiais. Não é um pagamento a cada pessoa nem uma medida exclusiva do custo dos serviços públicos.</p>
  <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Despesa federal por morador no ano e no mês">
    <table className="w-full text-sm"><thead><tr><th className="p-2 text-left" scope="col">Área</th><th className="p-2 text-right" scope="col">Total liquidado</th><th className="p-2 text-right" scope="col">Por morador no ano</th><th className="p-2 text-right" scope="col">Por morador no mês, em média</th></tr></thead>
    <tbody>{[["Todas as funções",totalCents],["Saúde",functions.Saúde],["Educação",functions.Educação]].map(([key,v])=>{const cents=Number(v);return <tr key={key} className="border-t border-[var(--border-1)]"><th className="p-2 text-left" scope="row">{key}</th><td className="whitespace-nowrap p-2 text-right">{reais(cents)}</td><td className="whitespace-nowrap p-2 text-right">{reais(cents/population)}</td><td className="whitespace-nowrap p-2 text-right">{reais(cents/population/12)}</td></tr>;})}</tbody></table>
  </div>
  <p className="my-2 text-xs text-[var(--muted)]">A média mensal é um duodécimo da despesa anual. Transferências entre governos podem aparecer em mais de uma esfera; não some União, estados e municípios.</p>
  <div className="flex flex-wrap gap-3 text-sm"><a className="source-link" href={source}>Tesouro · RREO da União, Anexo 02</a><a className="source-link" href={fiscalPilot.populationUrl}>IBGE · população de 2025</a></div>
 </section>;
}
