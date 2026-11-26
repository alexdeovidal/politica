import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/shell-context";
import { cityFor, fiscalEntity, rankingPath } from "@/lib/per-capita";
import { municipalHref } from "@/lib/municipal-registry";
import { municipalPublishedCodes } from "@/lib/municipal-catalog-server";
import { pageMetadata } from "@/lib/seo-metadata";
import { PilotCard } from "../pilot-card";
import { StateAllocation } from "../state-allocation";
import styles from "../../contas-do-municipio/caldas-novas/painel.module.css";

type Props = { params: Promise<{ codigo: string }> };
export const revalidate=120;
export async function generateMetadata({params}:Props) {
  const {codigo}=await params, city=cityFor(codigo);
  if(!city)notFound();
  return pageMetadata(`Gasto por morador: ${city.name} · ${city.uf} | Política007`,
    "Despesa municipal e rateio estadual estimado por faixa etária, em valores anuais e médias mensais.",rankingPath+"/"+codigo);
}
export default async function CitySpending({params}: Props) {
  const {codigo}=await params, city=cityFor(codigo);
  if(!city)notFound();
  const entity=fiscalEntity(codigo), hasTownPage=municipalPublishedCodes().has(codigo);
  return <div className={styles.dashboard}>
    <PageHeader group="Gasto por morador" current={city.name} />
    <header className={styles.hero}><div><span className={styles.eyebrow}>Finanças públicas · 2025</span><h1>{city.name} · {city.uf}</h1><p>Despesa da prefeitura e estimativa da parcela estadual, apresentadas separadamente.</p></div>
      <nav className="flex flex-wrap gap-2"><Link className="btn btn--primary" href={`${rankingPath}?oe=${city.uf}&oc=${city.code}#comparar`}>Comparar município</Link>{hasTownPage && <Link className="btn" href={municipalHref(city)}>Ver contas municipais</Link>}</nav></header>
    <StateAllocation standalone code={codigo} />
    {entity ? <PilotCard code={codigo} /> : <section className="card p-5"><h2 className="text-xl font-semibold">Despesa da prefeitura</h2><p className="mt-2 text-sm text-[var(--muted)]">Demonstrativo municipal de 2025 ainda não validado nesta consulta. Não representa gasto zero.</p></section>}
  </div>;
}
