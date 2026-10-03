import {shareMetadata} from "@/lib/platform/share";
import { CandidateComparison } from "@/components/candidate-comparison";
import { PageHeader } from "@/components/shell/shell-context";

export async function generateMetadata({searchParams}:PageProps<"/comparar">){const p=await searchParams;const params:Record<string,string>={};if(typeof p.ids==="string")params.ids=p.ids;if(typeof p.ano==="string")params.ano=p.ano;return shareMetadata("Compare candidaturas","/comparar","Compare dados públicos no mesmo período e confira os contextos eleitorais.",params);}
export default async function CompareCandidatesPage({searchParams}:PageProps<"/comparar">) {
  const sp=await searchParams;const ids=(typeof sp.ids==="string"?sp.ids:"").split(",").map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,3);const year=typeof sp.ano==="string"&&/^20[0-9]{2}$/.test(sp.ano)?sp.ano:"";
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
      <CandidateComparison initialIds={ids} initialYear={year} initialCompatible={sp.compativeis==="1"}/>
    </main>
  );
}
