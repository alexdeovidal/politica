import { PageHeader } from "@/components/shell/shell-context";
import { pageMetadata } from "@/lib/seo-metadata";
import CitySelector from "./city-selector";
export const metadata = pageMetadata("Contas dos municípios | Política007",
  "Escolha um estado e um município para acompanhar receitas, despesas e contratos em fontes oficiais.", "/contas-do-municipio");
export default function MunicipalIndex() {
  return <div className="flex flex-col gap-6">
    <PageHeader group="Transparência" current="Contas do Município" />
    <header className="card p-6 sm:p-9">
      <h1 className="text-3xl font-semibold sm:text-5xl">Contas dos municípios</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">Escolha o estado e a cidade. A cobertura cresce município por município. A ausência de um painel ainda não significa ausência de dados públicos.</p>
    </header>
    <CitySelector />
  </div>;
}
