import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata, jsonLd } from "@/lib/seo-metadata";
import { getStateBySlug, activeStates } from "@/lib/state-accounts/registry";
import { getStateDashboard } from "@/lib/state-accounts/data";
import { StateDashboard } from "./state-dashboard";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return activeStates().map(state => ({ estado: state.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ estado: string }> }) {
  const state = getStateBySlug((await params).estado);
  if (!state) notFound();
  return pageMetadata(`Contas de ${state.name} · Publicidade e cirurgias | Política007`,
    `Compare despesas de ${state.name}, consulte pagamentos de publicidade e repasses identificados para cirurgias eletivas, com fontes oficiais e cobertura explícita.`,
    `/contas-do-estado/${state.slug}`);
}
export default async function StateAccounts({ params }: { params: Promise<{ estado: string }> }) {
  const state = getStateBySlug((await params).estado);
  if (!state) notFound();
  const data = getStateDashboard(state.slug);
  return <div className="flex flex-col gap-5">
    <PageHeader group="Contas do Estado" current={state.name} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@type": "Dataset",
      name: `Contas de ${state.name} — recortes de despesa pública`, description: "Dados derivados de fontes oficiais, com classificação financeira e cobertura documentadas.",
      url: `https://politica007.com.br/contas-do-estado/${state.slug}`, creator: { "@type": "Organization", name: "Política007" },
      spatialCoverage: { "@type": "Place", name: `${state.name}, Brasil` }, dateModified: data.collectedAt,
      isBasedOn: data.sources.slice(0, 20).map(source => source.url), inLanguage: "pt-BR" }) }} />
    <StateDashboard data={data} slug={state.slug} />
  </div>;
}
