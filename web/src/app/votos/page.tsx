import { PageHeader } from "@/components/shell/shell-context";
import { ElectionVoteExplorer } from "@/components/election-vote-explorer";

export default async function ElectionVotesPage({ searchParams }: PageProps<"/votos">) {
  const search = await searchParams;
  const value = (key: string) => typeof search[key] === "string" ? (search[key] as string).slice(0, 120) : "";
  const initial = {
    year: Number(value("ano")) || 2024,
    round: Number(value("turno")) || 1,
    officeCode: value("cargo") || "13",
    state: value("uf").toUpperCase(),
    municipalityCode: value("municipio"),
    zone: value("zona"),
    section: value("secao"),
    place: value("local"),
    party: value("partido"),
    q: value("q"),
    page: Math.max(1, Number(value("page")) || 1),
    ids: value("ids").split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 3),
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <PageHeader group="Consulta eleitoral" current="Raio-X Votos" />
      <header className="mb-7 max-w-4xl">
        <div className="label mb-2">Consulta pública e gratuita · resultados oficiais</div>
        <h1 className="text-[30px] leading-tight font-medium tracking-tight text-[var(--fg-1)] sm:text-[38px]">
          Raio-X Votos
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--muted)]">
          Explore votos por eleição, cargo, estado, município, zona, local e seção. Compare até três candidaturas,
          acompanhe a trajetória eleitoral e compartilhe uma consulta com os mesmos filtros.
        </p>
      </header>
      <ElectionVoteExplorer initial={initial} />
    </main>
  );
}
