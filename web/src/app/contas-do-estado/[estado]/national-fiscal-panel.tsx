import { StateHero } from "./state-chrome";
import { NationalWorkspace } from "./national-workspace";
import styles from "./state-dashboard.module.css";
import type { SihProduction } from "@/lib/state-accounts/national-sih";
import type { NationalFiscal } from "@/lib/state-accounts/national-fiscal";

const amt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number | null) => cents === null ? "Não informado" : amt.format(cents / 100);
const date = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const columns = [["updatedBudgetCents", "Dotação atualizada"], ["committedCents", "Empenhado"], ["settledCents", "Liquidado"]] as const;

export function NationalFiscalPanel({ data, slug, sih }: { data: NationalFiscal; slug: string; sih: SihProduction }) {
  const reports = [...data.snapshots].sort((a, b) => b.year - a.year);
  return <NationalWorkspace
    hero={<StateHero name={data.name} uf={data.uf} collected={data.collectedAt}
      description={`Da despesa ao documento. Compare as áreas do orçamento de ${data.name} e consulte a produção cirúrgica do SUS em uma base separada.`} />}
    fiscal={reports}
    tables={<section className={styles.nationalBody} aria-labelledby="demonstrativos-rreo">
      <header className={styles.sectionTitle}><span>02</span><div><h2 id="demonstrativos-rreo">Demonstrativos por exercício</h2><p>Valores acumulados do Siconfi, fontes oficiais e CSV.</p></div></header>
    {reports.map(report => {
      const divergent = columns.filter(([key]) => report.reconciliation[key].differenceCents !== 0 ||
        report.reconciliation[key].breakdownDifferenceCents !== 0);
      return <details key={report.year} id={"exercicio-" + report.year} className={`${styles.panel} scroll-mt-24`}>
        <summary>{report.year} · {report.period}º bimestre</summary>
        <p className="mt-1 text-sm text-[var(--muted)]">{date(report.periodStart)} a {date(report.periodEnd)} · valores acumulados</p>
        <dl className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([...columns, ["paidCents", "Pago no total"]] as const).map(([key, label]) =>
            <div key={key} className="rounded-xl border border-[var(--border-1)] p-3">
              <dt className="text-sm text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold">{money(report.totals[key])}</dd>
            </div>)}
        </dl>
        <h3 className="mb-2 text-lg font-semibold">Despesas por função</h3>
        <p className="mb-3 text-sm text-[var(--muted)]">A coluna de pagamentos existe apenas no total. Saúde não mede apenas cirurgias; Comunicações não representa toda a publicidade.</p>
        {divergent.length > 0 && <div className="mb-4 rounded-lg border border-[var(--border-2)] p-3 text-sm">
          <strong>Valores publicados que não fecham com os totais</strong>
          <p>Os valores abaixo reproduzem as linhas informadas no Anexo 02. Não foram ajustados nem somados ao Anexo 01.</p>
          <ul className="mt-2 list-inside list-disc">{divergent.map(([key, label]) => {
            const item = report.reconciliation[key];
            return <li key={key}>{label}: funções menos total do Anexo 01 = {money(item.differenceCents)}; funções menos total do Anexo 02 = {money(item.breakdownDifferenceCents)}.</li>;
          })}</ul>
        </div>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={"Tabela de despesas de " + report.year}>
          <table className={styles.nativeFiscalTable}>
            <thead><tr><th scope="col" className="p-2 text-left">Função</th>{columns.map(([key, label]) =>
              <th key={key} scope="col" className="p-2 text-right">{label}</th>)}</tr></thead>
            <tbody>{report.functions.map(row => <tr key={row.code} className="border-t border-[var(--border-1)]">
              <th scope="row" className="p-2 text-left font-medium">{row.name}</th>
              {columns.map(([key]) => <td key={key} className="whitespace-nowrap p-2 text-right tabular-nums">{money(row[key])}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-4 flex flex-wrap gap-4 text-sm underline"><a href={report.balanceSource.url}>Siconfi · Anexo 01, totais</a><a href={report.functionSource.url}>Siconfi · Anexo 02, funções</a><a href={"/api/contas-do-estado/" + slug + "?format=fiscal-csv&year=" + report.year}>Baixar CSV do exercício</a></p>
      </details>;
    })}
    </section>}
    production={<div className={styles.panel}>
      <header className={styles.sectionTitle}><span>03</span><div><h2>Produção cirúrgica hospitalar no SUS</h2><p>Atendimentos registrados, não desembolsos do Tesouro estadual.</p></div></header>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-[var(--muted)]">Registros do grupo SIGTAP 04 no SIH/SUS, por UF do atendimento. O arquivo não separa eletivas de urgências neste recorte. As quantidades não são pessoas únicas. Valores aprovados no SIH não são pagamentos do Tesouro estadual. Coleta: {date(sih.collectedAt)}.</p>
      {Object.entries(sih.sources).sort(([a], [b]) => b.localeCompare(a)).map(([year, source], index) => {
        const months = sih.months.filter(row => row.month.startsWith(year + "-"));
        const quantity = months.reduce((sum, row) => sum + row.quantity, 0);
        const approvedCents = months.reduce((sum, row) => sum + row.approvedCents, 0);
        return <details key={year} open={index === 0} className="my-3 rounded-xl border border-[var(--border-1)] p-4">
          <summary className="cursor-pointer font-semibold">{year} · {months.length} de 12 meses com dados</summary>
          {months.length > 0 && <p className="mt-3 text-sm">{quantity.toLocaleString("pt-BR")} procedimentos registrados · {money(approvedCents)} em valores aprovados</p>}
          <div className="my-3 overflow-x-auto" tabIndex={0} role="region" aria-label={"Produção hospitalar de " + year}>
            <table className={styles.nativeFiscalTable}>
              <thead><tr><th scope="col" className="p-2 text-left">Mês da base</th><th scope="col" className="p-2 text-right">Quantidade</th><th scope="col" className="p-2 text-right">Valor aprovado</th></tr></thead>
              <tbody>{months.map(row => <tr key={row.month} className="border-t border-[var(--border-1)]"><th scope="row" className="p-2 text-left font-medium">{row.month.split("-").reverse().join("/")}</th><td className="p-2 text-right">{row.quantity.toLocaleString("pt-BR")}</td><td className="whitespace-nowrap p-2 text-right">{money(row.approvedCents)}</td></tr>)}</tbody>
            </table>
          </div>
          <a className="text-sm underline" href={source.url}>Arquivo original do SIH/SUS · {year}</a>
        </details>;
      })}
    </div>}
    sources={<div className={styles.panel}>
      <header className={styles.sectionTitle}><span>05</span><div><h2>Fontes e cobertura</h2><p>Confira o que cada base permite comparar.</p></div></header>
      <p className="mt-2 text-sm text-[var(--muted)]">Nesta UF, a cobertura é fiscal e inclui produção hospitalar em uma base separada. Ainda não foram integradas as ordens de pagamento de publicidade, as notas de agência ou os desembolsos para cirurgias. Essa ausência não significa gasto zero.</p>
      <p className="mt-3 text-sm"><a className="underline" href="https://apidatalake.tesouro.gov.br/docs/siconfi/">Documentação do Tesouro Nacional</a>{" · "}<a className="underline" href="https://datasus.saude.gov.br/acesso-a-informacao/producao-hospitalar-sih-sus/">Metodologia de produção hospitalar do SUS</a></p>
    </div>}
  />;
}
