import Link from "next/link";
import { EducationDetail } from "./education-detail";
import { ArrowRight, GraduationCap, HeartPulse, Users } from "lucide-react";
import { educationPilot, fiscalPilot, number, fiscalEntity, rankingPath, reais } from "@/lib/per-capita";

export function PilotCard({ code, listing = false }: { code: string; listing?: boolean }) {
  const entity = fiscalEntity(code), education = educationPilot[code];
  if(!entity) return null;
  const metrics = [
    { label: "Saúde por morador", value: reais(entity.functions["Saúde"] / entity.population), monthly: reais(entity.functions["Saúde"]/entity.population/12), Icon: HeartPulse },
    { label: "Educação por morador", value: reais(entity.functions["Educação"] / entity.population), monthly: reais(entity.functions["Educação"]/entity.population/12), Icon: GraduationCap },
    { label: "População estimada", value: number.format(entity.population), Icon: Users },
  ];
  return <section id={listing ? `modelo-${code}` : "gasto-por-morador"} className="card scroll-mt-24 p-5 sm:p-7">
    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{entity.scope === "city" ? "Prefeitura" : "Governo estadual"} · exercício fechado de {fiscalPilot.year}</p>
    <h2 className="mt-2 text-2xl font-semibold tracking-tight">{listing ? entity.name : "Saúde e educação por morador"}</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Despesa liquidada no ano, dividida pela população estimada do IBGE em 1º de julho de 2025. Não representa um valor entregue a cada pessoa.</p>
    <dl className="my-4 grid gap-3 sm:grid-cols-3">
      {metrics.map(({label, value, monthly, Icon})=><div key={label} className="grid gap-1.5 rounded-xl border border-[var(--border-1)] bg-[var(--bg)] p-3">
        <Icon size={17} aria-hidden /><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="break-words text-lg font-semibold">{value}{monthly&&<span className="block text-sm font-normal text-[var(--muted)]">{monthly}/mês, em média</span>}</dd>
      </div>)}
    </dl>
    <p className="mb-3 text-sm">Saúde: <strong>{reais(entity.functions["Saúde"])}</strong> · Educação: <strong>{reais(entity.functions["Educação"])}</strong> liquidados no ano. Total de todas as funções: <strong>{reais(entity.totalCents)}</strong>. Por morador: <strong>{reais(entity.totalCents/entity.population)}/ano</strong> · {reais(entity.totalCents/entity.population/12)}/mês, em média.</p>
    {education && <div className="mb-4 rounded-xl border border-[var(--border-1)] p-3 text-sm">
      <strong>{number.format(education.enrollment)} matrículas da educação básica</strong> · {education.network}, Censo Escolar 2025.
      <p className="mt-1 text-[var(--muted)]">Despesa da função Educação por matrícula: <strong>{reais(entity.functions["Educação"] / education.enrollment)}</strong>. É uma razão entre bases: a função Educação inclui despesas além do ensino básico, então não é custo por aluno.</p>
      <a className="source-link mt-1" href={education.source}>Matrículas · Censo Escolar / PEE Goiás</a>
    </div>}
    {entity.educationSubfunctions && Object.keys(entity.educationSubfunctions).length > 0 ? <EducationDetail entity={entity} /> : <p className="mb-3 text-sm text-[var(--muted)]">Detalhe por etapa da educação ainda não disponível neste recorte.</p>}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <a className="source-link" href={entity.source}>Tesouro · RREO Anexo 02</a>
      <a className="source-link" href={fiscalPilot.populationUrl}>IBGE · população de 2025</a>
      <Link className="btn" href={listing ? entity.href : rankingPath + "#ranking"} prefetch={false}>{listing ? "Abrir contas públicas" : "Ver ranking e simulador"} <ArrowRight size={15} aria-hidden /></Link>
    </div>
  </section>;
}
