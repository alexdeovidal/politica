import Link from "next/link";
import { companyPartners, personCompanies, type PartnerRecord } from "@/lib/platform/relations";

export function RelationList({ rows, direction="partner" }: { rows: PartnerRecord[]; direction?: "partner" | "company" }) {
  return <div className="platform-relations">{rows.map(row=><article className="card" key={row.id}>
    <Link className="link-primary text-base font-medium" href={direction==="company" ? `/cnpj/${row.cnpj}` : row.href}>{direction==="company" ? row.companyName : row.partnerName}</Link>
    <p className="mt-2 text-sm">{row.role ?? "Qualificação não informada"}{row.entryDate ? ` · ingresso em ${row.entryDate}` : ""}</p>
    <p className="mt-2 text-xs text-[var(--muted)]">{row.confidence==="possivel" ? "Possível correspondência: nome e dígitos públicos do CPF coincidem; identidade não confirmada." : row.confidence==="documento" ? "Correspondência por documento público." : "Identidade ainda não associada. Explore os registros deste sócio."}</p>
    <details className="mt-3 text-xs"><summary>Critério, período e fonte</summary><p className="mt-2">{row.confidence==="possivel" ? "Uma única pessoa na base corresponde ao nome normalizado e aos dígitos publicados. A máscara não comprova identidade." : "O vínculo societário é o registro do quadro de sócios e administradores coletado."} Data de entrada não informa data de saída; não comprova participação durante todas as eleições.</p><p>Coleta: {new Date(row.collectedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} (Brasília).</p><a className="source-link" data-source-date={row.collectedAt} data-source-url={row.sourceUrl} href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Receita Federal · dados obtidos via BrasilAPI</a><a className="source-link" href="https://www.gov.br/pt-br/servicos/consultar-cadastro-nacional-de-pessoas-juridicas" target="_blank" rel="noopener noreferrer">Consulta oficial da Receita</a></details>
    <div className="mt-3 flex flex-wrap gap-3"><Link href={`/socios/${row.id}`} className="btn">Explorar relações</Link>{row.personCpf && <Link className="btn" href={`/grafo?add=${row.personCpf},${row.cnpj}&rede=1`}>Ver no grafo</Link>}{row.confidence==="documento" && row.href.startsWith("/cnpj/") && <Link className="btn" href={`/grafo?add=${row.href.split("/").pop()},${row.cnpj}&rede=1`}>Ver no grafo</Link>}</div>
  </article>)}</div>;
}

export function CompanyRelations({ cnpj }: { cnpj: string }) {
  const rows=companyPartners(cnpj);
  if (!rows.length) return <p className="text-sm text-[var(--muted)]">Quadro societário ainda não disponível nesta coleta. Consulte a cobertura das fontes.</p>;
  return <RelationList rows={rows}/>;
}

export async function PersonCompanies({ personId }: {personId:number}) {
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  const rows=personCompanies(personId);
  return <section id="empresas-relacionadas" data-toc-title="Empresas e participações" className="py-7"><h2 className="section-title mb-3">Empresas e participações encontradas</h2><p className="mb-4 text-sm text-[var(--muted)]">Vínculos societários nas empresas consultadas. A cobertura e o critério de identidade acompanham cada registro.</p>{rows.length ? <RelationList rows={rows} direction="company"/> : <p className="text-sm">Nenhuma correspondência encontrada no quadro societário coletado. Isso não equivale à ausência de participações empresariais.</p>}</section>;
}
