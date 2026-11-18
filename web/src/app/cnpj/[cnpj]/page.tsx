import { shareMetadata } from "@/lib/platform/share";
import { notFound, redirect } from "next/navigation";
import { candidatePersonId, getEntityProfile, getExpenseYears } from "@/lib/queries";
import { EntityProfileView } from "@/components/entity-profile-view";
import { digitsOnly } from "@/lib/normalize";
import { cache } from "react";

export const dynamic = "force-dynamic";

const getCachedEntityProfile = cache((digits: string, year?: number) => getEntityProfile(digits, { year }));

export async function generateMetadata({params,searchParams}:PageProps<"/cnpj/[cnpj]">){
  const {cnpj}=await params;const digits=digitsOnly(cnpj);if(digits.length!==14)notFound();
  const personId=candidatePersonId(digits);if(personId!==null)redirect(`/politico/${personId}`);
  const sp=await searchParams;const profile=getCachedEntityProfile(digits,undefined);
  const name=profile?.displayName||"Empresa";
  return shareMetadata(name,`/cnpj/${digits}`,`Consulte os registros públicos, relações empresariais e participações em contas de campanha associados a ${name}.`,typeof sp.ano==="string"&&/^20\d{2}$/.test(sp.ano)?{ano:sp.ano}:{});
}

export default async function CnpjPage({ params, searchParams }: PageProps<"/cnpj/[cnpj]">) {
  const { cnpj } = await params;
  const digits = digitsOnly(cnpj);
  if (digits.length !== 14) notFound();

  const personId = candidatePersonId(digits);
  if (personId !== null) redirect(`/politico/${personId}`);

  const sp = await searchParams;
  const anoParam = typeof sp.ano === "string" ? Number(sp.ano) : NaN;
  const years = getExpenseYears();
  const year = Number.isInteger(anoParam) && years.includes(anoParam) ? anoParam : undefined;

  const profile = getCachedEntityProfile(digits, year);
  if (!profile) notFound();

  return <EntityProfileView profile={profile} years={years} year={year} />;
}
