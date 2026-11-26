import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata, jsonLd } from "@/lib/seo-metadata";
import { publishedStates } from "@/lib/state-accounts/registry";
import { getStateDashboard } from "@/lib/state-accounts/data";
import { getNationalFiscal } from "@/lib/state-accounts/national-fiscal";
import { getSihProduction } from "@/lib/state-accounts/national-sih";
import { NationalFiscalPanel } from "./national-fiscal-panel";
import { PilotCard } from "../../gasto-por-morador/pilot-card";
import { StateDashboard } from "./state-dashboard";

// Load the validated snapshots from the persistent volume when serving the page.
export const revalidate = 60;
export const dynamicParams = false;
export function generateStaticParams() { return publishedStates().map(state => ({ estado: state.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ estado: string }> }) {
  const { estado } = await params;
  const state = publishedStates().find(s => s.slug === estado);
  if (!state) notFound();
  if (!state.active) return pageMetadata("Orçamento de " + state.name + " · Siconfi | Política007",
    "Confira execução por função no Siconfi e a produção cirúrgica hospitalar do SUS, com períodos e fontes oficiais.",
    "/contas-do-estado/" + state.slug);
  return pageMetadata(`Contas de ${state.name} · Publicidade e cirurgias | Política007`,
    `Compare despesas de ${state.name}, consulte pagamentos de publicidade e repasses identificados para cirurgias eletivas, com fontes oficiais e cobertura explícita.`,
    `/contas-do-estado/${state.slug}`);
}
export default async function StateAccounts({ params }: { params: Promise<{ estado: string }> }) {
  const { estado } = await params;
  const state = publishedStates().find(s => s.slug === estado);
  if (!state) notFound();
  if (!state.active) {
    const fiscal = getNationalFiscal(state.slug);
    if (!fiscal) notFound();
    return <><PageHeader group="Contas do Estado" current={state.name} /><PilotCard code={String(state.ibgeCode)} /><NationalFiscalPanel data={fiscal} slug={state.slug} sih={getSihProduction(state.uf)} /></>;
  }
  const audited = getStateDashboard(state.slug);
  const fresh = getNationalFiscal(state.slug);
  // Refresh budget data without reclassifying payments or relabeling the thematic collection date.
  const fiscal = new Map(audited.fiscal.map(report => [report.year, report]));
  for (const report of fresh?.snapshots ?? []) {
    if ((fiscal.get(report.year)?.period ?? 0) <= report.period) fiscal.set(report.year, report);
  }
  const data = { ...audited, fiscal: [...fiscal.values()] };
  return <div className="flex flex-col gap-5">
    <PageHeader group="Contas do Estado" current={state.name} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@type": "Dataset",
      name: `Contas de ${state.name} — recortes de despesa pública`, description: "Dados derivados de fontes oficiais, com classificação financeira e cobertura documentadas.",
      url: `https://politica007.com.br/contas-do-estado/${state.slug}`, creator: { "@type": "Organization", name: "Política007" },
      spatialCoverage: { "@type": "Place", name: `${state.name}, Brasil` }, dateModified: data.collectedAt,
      isBasedOn: data.sources.slice(0, 20).map(source => source.url), inLanguage: "pt-BR" }) }} />
    {state.uf === "GO" && <a className="source-link w-fit" href="#gasto-por-morador">Ver saúde e educação por morador · piloto 2025</a>}
    <StateDashboard data={data} slug={state.slug} />
    <PilotCard code={String(state.ibgeCode)} />
  </div>;
}
