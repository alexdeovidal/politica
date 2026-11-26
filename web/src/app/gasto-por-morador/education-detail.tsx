import { GraduationCap } from "lucide-react";
import { number, reais, type Entity } from "@/lib/per-capita";

const stages = ["Creche", "Pré-escola", "Educação Infantil", "Ensino Fundamental", "Ensino Médio", "Ensino Profissional", "Ensino Superior",
  "Educação de Jovens e Adultos", "Educação Especial", "Educação Básica"];
const enrollment = {
  "52": { middle: 228179, secondary: 200837, adult: 33368, filter: "&dependency=Estadual" },
  "5204508": { middle: 720, secondary: 0, adult: 366, filter: "&dependency=Municipal&municipality=5204508" },
};
const indicators = [
  { label: "Fundamental · anos finais", key: "middle", id: "ED_BASICA_FUND_AF_MATRICULAS" },
  { label: "Ensino médio", key: "secondary", id: "ED_BASICA_MEDIO_MATRICULAS" },
  { label: "Educação de Jovens e Adultos", key: "adult", id: "ED_BASICA_EJA_MATRICULAS" },
] as const;
const goMde = {
  source: "https://transparencia.go.gov.br/wp-content/uploads/sites/2/2026/01/CONSOLIDADO-RREO-6o-BIM.-2025-ASSINADO.pdf#page=28",
  daycareCents: 1726359120,
  preschoolCents: 0,
};
// SIOPE/FNDE product 73, 2025/6, municipal code 520450, subfunction 365,
// VAL_DESP_LIQU for NUM_ORDE 11 (creche), 12 (pré-escola) and 13 (total).
const caldasSiope = {
  source: "https://www.fnde.gov.br/plataforma-antonieta-de-barros/dados/produtos-de-dados/visualizar/73",
  daycareCents: 736484800,
  preschoolCents: 3875072091,
  totalCents: 4611556891,
};

export function EducationDetail({ entity }: { entity: Entity }) {
  const row = (name: string) => entity.educationSubfunctions?.[name];
  const school = enrollment[entity.code as keyof typeof enrollment];
  return <details className="my-4 rounded-xl border border-[var(--border-1)] bg-[var(--bg)] p-4">
    <summary className="cursor-pointer text-sm font-semibold"><span className="inline-flex items-center gap-2"><GraduationCap size={17} aria-hidden /> Despesas de educação por etapa e subfunção</span></summary>
    <p className="my-3 text-sm text-[var(--muted)]">Valores liquidados no exercício de 2025. O RREO Anexo 02 abre as subfunções, mas informa Educação Infantil em conjunto. As linhas exibidas não esgotam todas as despesas da função Educação.</p>
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Subfunções da educação em ${entity.name}`}>
      <table className="w-full text-sm">
        <thead><tr><th scope="col" className="p-2 text-left">Etapa ou subfunção</th><th scope="col" className="p-2 text-right">Anexo 02 · liquidado</th></tr></thead>
        <tbody>{stages.map(name => <tr key={name} className="border-t border-[var(--border-1)]">
          <th scope="row" className="p-2 text-left font-medium">{name}</th>
          <td className="p-2 text-right tabular-nums">{row(name) === undefined ? (name === "Creche" || name === "Pré-escola" ? "Não separado" : "Não informado") : reais(row(name)!)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {entity.code === "52" ? <div className="mt-3 rounded-lg border border-[var(--border-1)] p-3 text-sm">
      <strong>Creche e pré-escola · recorte separado do Anexo 08</strong>
      <p className="mt-1">Creche: <strong>{reais(goMde.daycareCents)}</strong> · Pré-escola: <strong>{reais(goMde.preschoolCents)}</strong>, liquidado no recorte de ações típicas de manutenção e desenvolvimento do ensino, custeadas por impostos e Fundeb.</p>
      <p className="mt-1 text-[var(--muted)]">O zero é reportado nesse recorte. Não some esses valores aos do Anexo 02: são demonstrativos com classificações diferentes.</p>
      <a className="source-link mt-2" href={goMde.source}>Goiás · RREO Anexo 08, quadro de MDE de 2025</a>
    </div> : entity.code === "5204508" ? <div className="mt-3 rounded-lg border border-[var(--border-1)] p-3 text-sm">
      <strong>Creche e pré-escola · demonstrativo do SIOPE/FNDE</strong>
      <dl className="my-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div><dt>Creche</dt><dd className="font-semibold tabular-nums">{reais(caldasSiope.daycareCents)}</dd></div>
        <div><dt>Pré-escola</dt><dd className="font-semibold tabular-nums">{reais(caldasSiope.preschoolCents)}</dd></div>
        <div><dt>Total no SIOPE</dt><dd className="font-semibold tabular-nums">{reais(caldasSiope.totalCents)}</dd></div>
      </dl>
      <p className="mt-1 text-[var(--muted)]">Despesas liquidadas, acumuladas até o 6º bimestre de 2025. Esse detalhamento é do Demonstrativo da Função Educação do SIOPE, não do Anexo 08. O total difere do valor registrado no RREO Anexo 02 do Tesouro. A diferença não foi conciliada: não some os demonstrativos nem use este detalhamento como divisão do total do RREO.</p>
      <a className="source-link mt-2" href={caldasSiope.source}>FNDE · Despesa com Função Educação (SIOPE)</a>
    </div> : null}
    {school && <div className="mt-3 rounded-lg border border-[var(--border-1)] p-3 text-sm">
      <strong>Matrículas da rede · Censo Escolar 2025</strong>
      <ul className="my-2 grid gap-1">{indicators.map(item => <li key={item.key}>
        <a className="source-link" href={`https://pee.goias.gov.br/diagnostico/base-dados/?indicator=${item.id}${school.filter}`}>{item.label}</a> · {number.format(school[item.key])} matrículas
      </li>)}
      {entity.code === "5204508" && <li>
        <a className="source-link" href="https://primeirainfanciaemdados.org.br/municipios/caldas-novas-go/">Infantil · tabulação do Censo Escolar</a> · 1.930 em creche e 1.989 em pré-escola na rede municipal
      </li>}</ul>
      <p className="text-[var(--muted)]">São matrículas da rede mantenedora, não todas as matrículas no território. O detalhamento infantil de Caldas Novas foi tabulado pelo Datapedia a partir dos microdados do Inep. Anos finais são só parte do fundamental; não divida a despesa de todo o fundamental por esse número.</p>
    </div>}
  </details>;
}
