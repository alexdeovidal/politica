import { notFound, redirect } from "next/navigation";
import { candidatePersonId, getEntityProfile, getExpenseYears } from "@/lib/queries";
import { EntityProfileView } from "@/components/entity-profile-view";
import { digitsOnly } from "@/lib/normalize";
import { pageMetadata } from "@/lib/seo-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}:PageProps<"/cpf/[cpf]">){
  const digits=digitsOnly((await params).cpf);if(digits.length!==11)notFound();
  const personId=candidatePersonId(digits);if(personId!==null)redirect(`/politico/${personId}`);
  return pageMetadata("Pessoa física — registros públicos · Politica007","Consulte registros públicos de doações e despesas eleitorais associados a esta pessoa, com as respectivas fontes para conferência.",`/cpf/${digits}`);
}

export default async function CpfPage({ params, searchParams }: PageProps<"/cpf/[cpf]">) {
  const { cpf } = await params;
  const digits = digitsOnly(cpf);
  if (digits.length !== 11) notFound();

  const personId = candidatePersonId(digits);
  if (personId !== null) redirect(`/politico/${personId}`);

  const sp = await searchParams;
  const anoParam = typeof sp.ano === "string" ? Number(sp.ano) : NaN;
  const years = getExpenseYears();
  const year = Number.isInteger(anoParam) && years.includes(anoParam) ? anoParam : undefined;

  const profile = getEntityProfile(digits, { year });
  if (!profile) notFound();

  return <EntityProfileView profile={profile} years={years} year={year} />;
}
