import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { supplierPoliticalLinks, type CampaignSupplierExpense } from "@/lib/municipal-accounts";

const date = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).split("-").reverse().join("/") : value;
const officialUrl = (value: string, backup: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "tse.jus.br" || url.hostname.endsWith(".tse.jus.br")) ? url.href : backup;
  } catch { return backup; }
};

function Expenses({ rows }: { rows: CampaignSupplierExpense[] }) {
  return <ul className="my-2 grid gap-2">{rows.map(row => <li key={row.id} className="rounded border border-[var(--border-1)] p-3">
    <div className="font-medium">{row.personId ? <Link prefetch={false} className="source-link" href={`/politico/${row.personId}#financas`}>
      {row.candidate ?? "Ver candidatura"}
    </Link> : row.candidate ?? "Campanha sem perfil vinculado"} · {[row.office, row.state, row.year].filter(Boolean).join(" · ")}</div>
    {row.description && <p className="mt-1 break-words">{row.description}</p>}
    <p className="my-1 text-[var(--muted)]">
      Contratado: {row.contracted === null ? "sem dado" : formatBRL(row.contracted)} ·
      {" "}Pagamento registrado: {row.paid === null ? "sem dado" : formatBRL(row.paid)}{row.day ? ` · ${date(row.day)}` : ""}
    </p>
    <a className="source-link" href={officialUrl(row.url, `https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-${row.year}`)}>Fonte · prestação de contas do TSE</a>
  </li>)}</ul>;
}

export function SupplierPoliticalInvestigation({ cnpj }: { cnpj: string }) {
  const data = supplierPoliticalLinks(cnpj);
  return <section className="mt-6 border-t border-[var(--border-1)] pt-4 text-sm" id="ligacoes-politicas">
    <h3 className="text-base font-semibold">Candidaturas, assessoria e serviços</h3>
    <p className="my-2 text-[var(--muted)]">O cruzamento usa o quadro societário coletado, candidaturas e contas de campanha do TSE e o cadastro de funcionários em atividade da Câmara dos Deputados. A folha municipal ainda não está integrada.</p>
    {!data ? <p>Aguardando cruzamento do cadastro deste fornecedor.</p> : <>
      <p className="mb-3 text-xs text-[var(--muted)]">Verificado em {date(data.checked)}. Nome igual ou documento mascarado indica possível correspondência para revisão.</p>
      {data.partners.length === 0 && <p>Nenhuma correspondência individual nas fontes consultadas.</p>}
      {data.partners.map((partner, i) => <details key={`${partner.key}-${i}`} className="my-2 rounded-lg border border-[var(--border-1)] p-3">
        <summary className="cursor-pointer font-medium">{partner.name} · possível correspondência</summary>
        {partner.candidates.length > 0 && <div className="mt-3">
          <strong>Histórico de candidaturas</strong>
          {partner.matches > partner.candidates.length && <p>Mostrando {partner.candidates.length} de {partner.matches} correspondências para conferir.</p>}
          {partner.candidates.map(candidate => <div className="my-2" key={candidate.id}>
            <Link prefetch={false} className="source-link" href={`/politico/${candidate.id}`}>Abrir perfil eleitoral</Link>
            <span> · {candidate.confidence === "masked" ? "Nome e parte do documento coincidem" : "Coincidência de nome completo"}</span>
            <ul className="my-2 space-y-1">{candidate.elections.map((election, index) => <li key={index}>
              {[election.year, election.office, election.party, election.municipality, election.state, election.result].filter(Boolean).join(" · ")}
              {" · "}<a className="source-link" href={officialUrl(election.url, `https://dadosabertos.tse.jus.br/dataset/candidatos-${election.year}`)}>TSE</a>
            </li>)}</ul>
            {candidate.expenses.length > 0 && <><strong>Serviços e despesas no perfil eleitoral possivelmente correspondente</strong><Expenses rows={candidate.expenses} /></>}
          </div>)}
        </div>}
        {partner.staff.length > 0 && <div className="mt-3">
          <strong>Nome coincidente no cadastro da Câmara dos Deputados</strong>
          <ul className="my-2 space-y-1">{partner.staff.map((row, index) => <li key={index}>{row.role}{row.unit ? ` · ${row.unit}` : ""}{row.appointed ? ` · Nomeação: ${date(row.appointed)}` : ""}</li>)}</ul>
          <p>O cadastro informa cargo e lotação. Esta fonte não foi usada para atribuir pagamentos.</p>
        </div>}
      </details>)}
      <h4 className="mt-4 font-semibold">Serviços e despesas de campanha pelo CNPJ da empresa</h4>
      {data.companyExpenses.length ? <Expenses rows={data.companyExpenses} /> : <p className="mt-1">Nenhum registro localizado para este CNPJ na base eleitoral consultada.</p>}
      <p className="mt-3 text-xs text-[var(--muted)]">Cadastro da Câmara dos Deputados: {data.chamberChecked ? date(data.chamberChecked) : "coleta pendente"}. A lista cobre pessoal em atividade na data da fonte.</p>
      <a href={data.chamberUrl} className="source-link">Fonte · Dados Abertos da Câmara dos Deputados</a>
    </>}
    <div className="mt-3 flex flex-wrap gap-4">
      <a className="source-link" href="https://acessoainformacao.caldasnovas.go.leg.br/cidadao/transparencia/folhas">Folha oficial da Câmara de Caldas Novas</a>
      <a className="source-link" href="https://acessoainformacao.caldasnovas.go.gov.br/cidadao/transparencia/sgservidores">Folha oficial da Prefeitura</a>
    </div>
  </section>;
}
