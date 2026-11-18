import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileCheck2 } from "lucide-react";
import { PageHeader } from "@/components/shell/shell-context";
import { formatBRL } from "@/lib/format";
import { getMunicipalContract, municipalOrgs, municipalPath } from "@/lib/municipal-accounts";
import styles from "../painel.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha de contrato · Contas de Caldas Novas | Politica007" };
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Não informado";

export default async function MunicipalContractPage({ params }: PageProps<"/contas-do-municipio/caldas-novas/[contrato]">) {
  const { contrato } = await params;
  if (!/^\d{14}-2-\d{1,12}-\d{4}$/.test(contrato)) notFound();
  const row = getMunicipalContract(contrato.replace(/-(\d{4})$/, "/$1"));
  if (row === undefined) notFound();
  const tender = row?.tender?.match(/^(\d{14})-1-(\d+)\/(\d{4})$/);
  const amount = row?.amount_cents == null ? null : formatBRL(row.amount_cents);

  return <div className={styles.dashboard}>
    <PageHeader group="Contas de Caldas Novas" current="Ficha do contrato" />
    <Link className="source-link flex items-center gap-2" href={municipalPath}><ArrowLeft size={15} /> Voltar às contas de Caldas Novas</Link>
    {row ? <>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}><FileCheck2 size={16} /> {row.kind ?? "Instrumento público"} · PNCP</span>
          <h1 className={styles.contractTitle}>{municipalOrgs[row.org]}</h1>
          <p>{row.unit ?? "Unidade compradora não informada"} · publicado em {date(row.published)}</p>
          <p className="mt-2 break-all">{row.id}</p>
        </div>
        <a className="btn btn--primary" href={row.official_url}>Abrir documento oficial <ExternalLink size={15} /></a>
      </header>

      <div className={styles.contractGrid}>
        <section className={styles.insight}>
          <span className={styles.eyebrow}>Valor global no PNCP</span>
          <h2 className={styles.big}>{amount ?? "Não informado"}</h2>
          <p>{row.supplier ?? "Fornecedor sem identificação empresarial exibida"}</p>
          {row.supplier_cnpj && <Link className="source-link" href={`/cnpj/${row.supplier_cnpj}`} prefetch={false}>CNPJ {row.supplier_cnpj}</Link>}
          <p>Esse valor é o que o órgão registrou para o instrumento. A execução financeira é informada em documentos próprios.</p>
        </section>
        <section className="card p-5">
          <h2 className="text-lg font-semibold">O que o órgão informou</h2>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{row.title}</p>
          {tender && <a className="source-link mt-3 inline-flex items-center gap-2"
            href={`https://pncp.gov.br/app/editais/${tender[1]}/${tender[3]}/${Number(tender[2])}`}>
            Ver contratação de origem <ExternalLink size={13} />
          </a>}
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Da assinatura ao pagamento</h2>
        <dl className={styles.timeline}>
          <div><dt>Assinatura</dt><dd>{date(row.signed)}</dd></div>
          <div><dt>Publicação</dt><dd>{date(row.published)}</dd></div>
          <div><dt>Empenho e liquidação vinculados</dt><dd>Dado não disponível</dd></div>
          <div><dt>Pagamento vinculado</dt><dd>Dado não disponível</dd></div>
        </dl>
        <p className="mt-4 text-sm text-[var(--muted)]">O vínculo com as etapas da despesa depende de um documento conciliado para este contrato.</p>
        <a className="source-link mt-2 inline-flex items-center gap-2"
          href="https://acessoainformacao.caldasnovas.go.gov.br/cidadao/transparencia/sgdespesas">Consultar despesas na Prefeitura <ExternalLink size={13} /></a>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Identificação e fonte</h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          {[
            ["Número do contrato ou instrumento", row.number],
            ["Processo administrativo", row.process],
            ["Última coleta deste registro", date(row.collected)],
          ].map(([label, value]) => <div key={label}>
            <dt className="text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 break-words font-medium">{value ?? "Não informado"}</dd>
          </div>)}
        </dl>
      </section>
    </> : <p role="status">A base municipal está temporariamente indisponível. Tente novamente em instantes.</p>}
  </div>;
}
