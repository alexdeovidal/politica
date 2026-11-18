import Link from "next/link";
import { notFound } from "next/navigation";
import { partnerById, partnerOtherCompanies, partnerNameCandidates, partnerEstablishments } from "@/lib/platform/relations";
import { RelationList } from "@/components/platform/relations";
import { PageHeader } from "@/components/shell/shell-context";
import { cache } from "react";
import { pageMetadata } from "@/lib/seo-metadata";

export const dynamic="force-dynamic";
const getPartner=cache(partnerById);
export async function generateMetadata({params}:PageProps<"/socios/[id]">){
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)notFound();
  const row=getPartner(id);if(!row)notFound();
  return pageMetadata(`${row.partnerName} — vínculos societários · Politica007`,"Consulte registros societários e empresas relacionadas, com fontes e limites de correspondência por nome ou documento.",`/socios/${id}`);
}
export default async function PartnerPage({params}:PageProps<"/socios/[id]">){
  const {id}=await params;const partnerId=Number(id);if(!Number.isSafeInteger(partnerId)||partnerId<1)notFound();
  const row=getPartner(partnerId);if(!row)notFound();
  const establishments=partnerEstablishments(row);const rows=partnerOtherCompanies(row);const candidates=row.personId ? [] : partnerNameCandidates(row.partnerName);
  return <main className="platform-page"><PageHeader group="Rede de relações" current={row.partnerName}/><h1>{row.partnerName}</h1><p>Registros societários associados ao nome e ao documento publicado pela fonte. Coincidências de nome ou de CPF mascarado não comprovam identidade.</p>{row.personId && <Link className="btn" href={row.href}>Ver perfil relacionado · {row.confidence==="possivel" ? "possível correspondência" : "documento correspondente"}</Link>}{establishments.length>0 && <section className="card"><h2>Estabelecimentos da raiz do CNPJ publicado</h2><p>A fonte pode publicar apenas os oito dígitos da raiz. Matriz e filiais compartilham essa raiz; confira o estabelecimento.</p>{establishments.map(e=><Link key={e.cnpj} className="btn" href={`/cnpj/${e.cnpj}`}>{e.name||e.cnpj} · {e.cnpj}</Link>)}</section>}<h2>Empresas encontradas no quadro societário coletado</h2><RelationList rows={rows} direction="company"/>{candidates.length>0 && <section className="card"><h2>Pessoas com o mesmo nome</h2><p>Resultados para conferência; estes nomes não foram associados automaticamente ao sócio.</p>{candidates.map(p=><Link className="btn" key={p.id} href={`/politico/${p.id}`}>{p.name}</Link>)}</section>}<p>Para explorar sócios empresariais, abra a ficha da empresa e continue pelo quadro societário. Cada passagem mantém sua própria fonte e período.</p></main>;
}
