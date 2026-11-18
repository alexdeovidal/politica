import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { municipalAmendments, municipalAmendmentSignals, municipalPath } from "@/lib/municipal-accounts";

const law = "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm";
const pct = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value) + "%";
const money = (value: number | null) => value === null ? "Sem dado" : formatBRL(Math.round(value / 100));
const date = (value: string) => /^\d{4}-\d\d-\d\d/.test(value) ? value.slice(0,10).split("-").reverse().join("/") : "Sem data";
const badge = (severity: string) => severity === "review" ? "Percentual nominal acima da referência" :
  severity === "reform" ? "Acima de 25% · verificar enquadramento como reforma" : "Dados do termo ou da base a conferir";

function LegalLinks() {
  return <details className="mt-3 rounded-lg border border-[var(--border-1)] p-3 text-sm">
    <summary className="cursor-pointer font-medium">Roteiro para conferir a licitação, o contrato e os aditivos</summary>
    <ul className="my-3 list-disc space-y-2 pl-5">
      <li><a className="source-link" href={law + "#art17"}>Procedimento e fases da licitação (art. 17)</a> · confira edital, julgamento, habilitação e homologação.</li>
      <li><a className="source-link" href={law + "#art72"}>Contratação direta (arts. 72, 74 e 75)</a> · confira a justificativa, a hipótese legal e o limite vigente quando aplicável.</li>
      <li><a className="source-link" href={law + "#art92"}>Cláusulas e publicação (arts. 92 e 94)</a> · confira objeto, valor, vigência, assinatura e divulgação no PNCP.</li>
      <li><a className="source-link" href={law + "#art105"}>Vigência e prorrogação (arts. 105 a 114)</a> · confira o tipo do objeto, a previsão contratual e a justificativa.</li>
      <li><a className="source-link" href={law + "#art124"}>Alterações (arts. 124 a 136)</a> · confira a motivação, a preservação do objeto, a formalização do termo e o que pode constar por apostila.</li>
    </ul>
    <p>O roteiro é documental. A regra automática desta seção cobre a triagem percentual e a classificação publicada dos termos.</p>
  </details>;
}

export function AmendmentSignals() {
  const data = municipalAmendmentSignals();
  return <section className="mt-4 rounded-lg border border-[var(--border-1)] p-4 text-sm">
    <h3 className="font-semibold">Licitações, contratos e aditivos</h3>
    <p className="my-2 text-[var(--muted)]">A triagem acumula acréscimos e supressões separadamente. Usa o valor inicial nominal do PNCP para priorizar a conferência da base atualizada e do regime aplicável.</p>
    <p className="mb-2">{data ? `${data.checked} de ${data.total} contratos iniciais com consulta de termos no PNCP` : "Aguardando a primeira coleta de termos."}</p>
    {data?.rows.length ? <ul className="grid gap-2 sm:grid-cols-2">{data.rows.map(row => <li key={row.id} className="rounded border border-[var(--border-1)] p-3">
      <strong>{badge(row.severity)}</strong>
      <p className="my-1 line-clamp-2">{row.title}</p>
      <p className="text-[var(--muted)]">{row.supplier ?? "Fornecedor sem nome exibido"} · {row.terms} termo(s)
        {row.increasesPct != null && ` · acréscimos ${pct(row.increasesPct)}`}
        {row.decreasesPct != null && ` · supressões ${pct(row.decreasesPct)}`}</p>
      <Link prefetch={false} className="source-link" href={`${municipalPath}/${row.id.replace("/", "-")}#aditivos`}>Abrir termos e cálculo</Link>
    </li>)}</ul> : data && <p>Nenhum caso priorizado entre os contratos consultados até agora.</p>}
    <LegalLinks />
  </section>;
}

export function ContractAmendments({ id }: {id:string}) {
  const data = municipalAmendments(id);
  return <section id="aditivos" className="card scroll-mt-20 p-5">
    <h2 className="text-lg font-semibold">Aditivos e limites de alteração</h2>
    <p className="my-2 text-sm text-[var(--muted)]">Nas alterações unilaterais do art. 125 da Lei 14.133/2021, a referência é 25% do valor inicial atualizado para acréscimos e supressões. Em reforma de edifício ou equipamento, a referência de acréscimo é 50%. A de supressão permanece em 25%.</p>
    {!data ? <p className="text-sm">Aguardando consulta dos termos deste contrato no PNCP.</p> : <>
      <p className="mb-2 text-sm">Consulta de {date(data.checked)} · <a href={data.source} className="source-link">Termos na fonte oficial</a></p>
      {data.terms.length === 0 ? <p className="text-sm">O PNCP não retornou termos para este contrato na data consultada.</p> : <>
        <div className="my-3 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded border border-[var(--border-1)] p-3"><p>Base inicial nominal</p><strong>{money(data.base)}</strong></div>
          <div className="rounded border border-[var(--border-1)] p-3"><p>Acréscimos identificados</p><strong>{money(data.increases)}{data.increasesPct !== null && ` · ${pct(data.increasesPct)}`}</strong></div>
          <div className="rounded border border-[var(--border-1)] p-3"><p>Supressões identificadas</p><strong>{money(data.decreases)}{data.decreasesPct !== null && ` · ${pct(data.decreasesPct)}`}</strong></div>
        </div>
        {data.severity !== "none" && <p className="my-2 text-sm font-semibold">{badge(data.severity)}. Confira o contrato, a base atualizada e a justificativa de cada termo.</p>}
        {data.base === null && <p className="my-2 text-sm">O PNCP não forneceu valor inicial positivo para calcular os percentuais.</p>}
        {data.reform && <p className="my-2 text-sm">O objeto menciona reforma. Confira se o contrato é de reforma de edifício ou equipamento para aplicar a referência de 50%.</p>}
        {data.pending > 0 && <p className="my-2 text-sm">{data.pending} termo(s) com classificação ou valor que exige(m) revisão. Esses registros ficaram fora das somas.</p>}
        <p className="my-2 text-sm text-[var(--muted)]">A comparação usa somente alterações monetárias classificadas no PNCP como acréscimo ou supressão, com sentido indicado pelo sinal do valor. Reajustes, prorrogações, apostilas e termos mistos ficam separados. O cálculo serve para triagem e depende da conferência documental.</p>
        <ol className="my-3 grid gap-2 text-sm">{data.terms.map(term => <li key={term.seq} className="rounded border border-[var(--border-1)] p-3">
          <strong>{term.number || `Termo ${term.seq}`} · {term.name}</strong>
          <p>Assinado: {date(term.signed)} · publicado: {date(term.published)}</p>
          <p>{term.labels.length ? term.labels.join(" · ") : "Finalidade sem classificação estruturada"}{term.pending ? " · revisar documentação" : ""}</p>
          <p>Variação informada: {money(term.changed)} · valor global do termo: {money(term.global)}
            {term.days ? ` · prazo aditado: ${term.days} dias` : ""}</p>
          {term.description && <p className="mt-1 break-words">{term.description}</p>}
          {term.legal && <p className="mt-1 break-words text-[var(--muted)]">{term.legal}</p>}
        </li>)}</ol>
      </>}
    </>}
    <LegalLinks />
  </section>;
}
