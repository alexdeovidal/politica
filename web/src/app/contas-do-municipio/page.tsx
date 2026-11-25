import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata } from "@/lib/seo-metadata";
import { allMunicipalities, municipalPublishedCodes } from "@/lib/municipal-catalog-server";
import CitySelector from "./city-selector";
export const metadata = pageMetadata("Contas dos municípios | Política007",
  "Escolha um estado e um município para acompanhar receitas, despesas e contratos em fontes oficiais.", "/contas-do-municipio");
export const dynamic = "force-dynamic";
export default function MunicipalIndex() {
  const published = municipalPublishedCodes();
  const cities = allMunicipalities().map(city=>({
    code:city.code,name:city.name,uf:city.uf,state:city.state,slug:city.slug,existing:city.existing,
    ready:published.has(city.code),hasContractsSource:Boolean(city.pncpOrg) || city.existing
  }));
  const ready=cities.filter(city=>city.ready).length;
  return <div className="flex flex-col gap-6">
    <PageHeader group="Transparência" current="Contas do Município" />
    <header className="card p-6 sm:p-9">
      <h1 className="text-3xl font-semibold sm:text-5xl">Contas dos municípios</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">Escolha o estado e a cidade. A cobertura cresce município por município. A ausência de um painel ainda não significa ausência de dados públicos.</p>
    </header>
    <p className="text-sm text-[var(--muted)]"><strong>{ready} de {cities.length} municípios com painel publicado.</strong>{" "}
      O Distrito Federal tem <a href="/contas-do-estado/distrito-federal" className="underline">painel próprio</a>; Fernando de Noronha é distrito estadual, sem prefeitura própria.</p>
    <CitySelector cities={cities} />
  </div>;
}
