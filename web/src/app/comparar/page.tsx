import { CandidateComparison } from "@/components/candidate-comparison";
import { PageHeader } from "@/components/shell/shell-context";

export default function CompareCandidatesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl pt-8">
      <PageHeader group="Ferramentas" current="Comparar candidaturas" />
      <header className="mb-7">
        <div className="label mb-2">Ferramenta para eleitores e candidatos</div>
        <h1 className="text-[30px] leading-tight font-medium tracking-tight text-[var(--fg-1)] sm:text-[38px]">
          Compare candidaturas
        </h1>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-[var(--muted)]">
          Veja lado a lado dados de votação, bens declarados, doações e despesas de até três candidaturas.
          Pesquise pelo nome ou CPF para começar.
        </p>
      </header>
      <CandidateComparison />
    </main>
  );
}
