import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/shell-context";
import { formatBRL } from "@/lib/format";
import { getMunicipalContract, municipalOrgs, municipalPath } from "@/lib/municipal-accounts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha de contrato · Contas de Caldas Novas | Politica007" };
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Não informado";

export default async function MunicipalContractPage({ params }: PageProps<"/contas-do-municipio/caldas-novas/[contrato]">) {
  const { contrato } = await params;
  if (!/^\d{14}-2-\d{1,12}-\d{4}$/.test(contrato)) notFound();
  const row = getMunicipalContract(contrato.replace(/-(\d{4})$/, "/$1"));
  if (row === undefined) notFound();
  const tender = row?.tender?.match(/^(\d{14})-1-(\d+)\/(\d{4})$/);
  return <div className="flex flex-col gap-6">
    <PageHeader group="Contas de Caldas Novas" current="Ficha do contrato" />
    <Link className="source-link" href={municipalPath}>Voltar aos contratos</Link>
    {row ? <>
      <header>
        <p className="mono-label">{row.kind ?? "Registro de contratação"} · {row.id}</p>
        <h1 className="mt-2 text-2xl font-semibold">{row.title}</h1>
      </header>
      <dl className="grid gap-4 sm:grid-cols-2">
        {[
          ["Valor global informado ao PNCP", row.amount_cents === null ? "Não informado" : formatBRL(row.amount_cents)],
          ["Valor pago vinculado ao contrato", "Dado não disponível"],
          ["Órgão comprador", municipalOrgs[row.org]],
          ["Unidade compradora", row.unit],
          ["Fornecedor", row.supplier],
          ["CNPJ do fornecedor", row.supplier_cnpj ? <Link key="supplier" className="source-link" href={`/cnpj/${row.supplier_cnpj}`} prefetch={false}>{row.supplier_cnpj}</Link> : null],
          ["Número do contrato ou instrumento", row.number],
          ["Processo", row.process],
          ["Assinatura", date(row.signed)],
          ["Publicação no PNCP", date(row.published)],
          ["Última coleta deste registro", date(row.collected)],
        ].map(([label, value]) => <div className="card p-4" key={String(label)}>
          <dt className="text-sm" style={{ color: "var(--muted)" }}>{label}</dt>
          <dd className="mt-1 font-medium">{value ?? "Não informado"}</dd>
        </div>)}
      </dl>
      <p className="text-sm">O valor global é o valor cadastrado no instrumento. O registro detalhado de empenho, liquidação ou pagamento fica disponível nesta ficha quando houver fonte conciliada.</p>
      <div className="flex flex-wrap gap-3">
        <a className="btn btn--primary" href={row.official_url}>Abrir documento no PNCP</a>
        {tender && <a className="btn" href={`https://pncp.gov.br/app/editais/${tender[1]}/${tender[3]}/${Number(tender[2])}`}>Abrir contratação de origem</a>}
        <a className="btn" href="https://www.caldasnovas.go.gov.br/transparencia/">Portal da Prefeitura</a>
      </div>
    </> : <p role="status">A base municipal está temporariamente indisponível. Tente novamente em instantes.</p>}
  </div>;
}
