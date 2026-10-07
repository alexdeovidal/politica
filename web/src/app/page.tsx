import { Suspense } from "react";
import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { TopSuppliers } from "@/components/top-suppliers";
import { PageHeader } from "@/components/shell/shell-context";
import { YearSelect } from "@/components/ui/year-select";
import { getHomeStats } from "@/lib/stats";
import { getCandidacyYears, getExpenseYears } from "@/lib/queries";
import { formatBRL } from "@/lib/format";
import { ContributionCard } from "@/components/contribution-card";
import { getTseUpdateStatus } from "@/lib/tse-update-status";
import { TseUpdateStatus } from "@/components/tse-update-status";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const requestedYear = typeof sp.ano === "string" ? Number(sp.ano) : NaN;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        group="Politica007"
        current="Visão geral"
        actions={
          <Suspense fallback={<div className="h-9 w-40 animate-pulse rounded bg-[var(--hover)]" aria-hidden="true" />}>
            <HomeYearSelect requestedYear={requestedYear} />
          </Suspense>
        }
      />

      <Link href="/apuracao" className="live-home-link"><span className="live-home-link__dot"/><span><strong>Apuração das Eleições 2026</strong><small>Resultados oficiais do TSE · Estados, cidades e modo TV</small></span><span>Acompanhar →</span></Link>
      <div className="platform-toolbar"><Link href="/explorar" className="btn">Minha cidade e candidaturas</Link><Link href="/grafo" className="btn">Rede de pessoas e empresas</Link><Link href="/emendas" className="btn">Destino dos recursos públicos</Link><Link href="/comparar" className="btn">Comparar candidaturas</Link></div>
      <section className="portal-hero animate-in" aria-labelledby="portal-title">
        <div className="portal-hero__content">
          <div className="portal-hero__eyebrow">
            <span className="portal-hero__status" aria-hidden="true" />
            Plataforma independente · consulta de dados públicos
          </div>
          <h1 id="portal-title">Dados eleitorais organizados para consulta cidadã.</h1>
          <p>
            Pesquise candidatos, empresas e pessoas físicas por nome, CPF ou CNPJ. Consulte quem doou,
            recebeu ou pagou recursos nas prestações de contas eleitorais.
            Os registros indicam suas fontes públicas para que você possa conferi-los.
          </p>
          <div className="portal-hero__search">
            <SearchBox />
          </div>
          <div className="portal-hero__disclaimer">
            Portal independente. Não é um serviço oficial do TSE ou do Governo.
          </div>
        </div>
        <div className="portal-hero__visual" aria-hidden="true">
          <div className="portal-hero__visual-card">
            <div className="portal-hero__visual-heading">
              <span className="portal-hero__visual-symbol">P</span>
              <span>CONSULTA DE DADOS</span>
            </div>
            <div className="portal-hero__visual-row"><span>Candidaturas</span><i /></div>
            <div className="portal-hero__visual-row"><span>Contas eleitorais</span><i /></div>
            <div className="portal-hero__visual-row"><span>Fontes identificadas</span><i /></div>
            <div className="portal-hero__visual-foot">PESQUISA POR CPF OU CNPJ</div>
          </div>
        </div>
      </section>

      <Suspense fallback={<HomeMetricsFallback />}>
        <HomeMetrics requestedYear={requestedYear} />
      </Suspense>

      <ContributionCard />

      <Suspense fallback={<HomeSuppliersFallback />}>
        <HomeTopSuppliers requestedYear={requestedYear} />
      </Suspense>

      <div className="card animate-in max-w-2xl" style={{ animationDelay: "220ms" }}>
        <div className="label mb-3">indício não é prova</div>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
          O Politica007 reúne dados que já são públicos por lei (registro de candidatura do TSE,
          prestação de contas eleitorais, redes sociais declaradas) e os organiza por pessoa. Nada
          aqui é acusação — é o dado bruto oficial, com a fonte exposta em cada campo, para que
          qualquer um confira e vá além se quiser apurar.
        </p>
      </div>
    </div>
  );
}

function HomeMetricsFallback() {
  return <section className="flex flex-col gap-4" aria-live="polite">
    <div className="kpis kpis--home" aria-hidden="true">
      {Array.from({length:5},(_,index)=><div key={index} className="kpi"><div className="kpi__label">Indicador público</div><div className="kpi__value">…</div></div>)}
    </div>
    <p className="text-xs text-[var(--muted-2)]">Preparando os indicadores públicos…</p>
  </section>;
}

async function HomeYearSelect({requestedYear}:{requestedYear:number}) {
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  const expenseYears=getExpenseYears();
  const year=Number.isInteger(requestedYear)&&expenseYears.includes(requestedYear)?requestedYear:undefined;
  return <YearSelect basePath="/" years={expenseYears} value={year} allLabel="todos os anos"/>;
}

async function HomeMetrics({requestedYear}:{requestedYear:number}) {
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  const expenseYears=getExpenseYears(),candidacyYears=getCandidacyYears();
  const year=Number.isInteger(requestedYear)&&expenseYears.includes(requestedYear)?requestedYear:undefined;
  const stats=getHomeStats(year),tseUpdateStatus=getTseUpdateStatus();
  const heroStats=[
    {label:"pessoas",value:stats.people.toLocaleString("pt-BR")},
    {label:"candidaturas",value:stats.candidacies.toLocaleString("pt-BR")},
    {label:"doações recebidas",value:formatBRL(stats.donationsTotalCents),tone:"green" as const},
    {label:"despesas contratadas",value:formatBRL(stats.expensesTotalCents)},
    {label:year?"eleição":"período coberto",value:stats.years},
  ];
  return <section className="animate-in flex flex-col gap-4" style={{animationDelay:"80ms"}}>
    <div className="kpis kpis--home">{heroStats.map(stat=><div key={stat.label} className="kpi"><div className="kpi__label">{stat.label}</div><div className={`kpi__value${stat.tone==="green"?" kpi__value--green":""}`}>{stat.value}</div></div>)}</div>
    <TseUpdateStatus status={tseUpdateStatus}/>
    <div className="flex flex-col gap-1 text-[10px] leading-relaxed text-[var(--muted-2)]">
      <p>Fontes oficiais de candidaturas TSE:{" "}{(year?[year]:candidacyYears).map((sourceYear,index)=><span key={`candidate-${sourceYear}`}>{index?", ":""}<a className="source-link source-link--inline" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-${sourceYear}`} target="_blank" rel="noopener noreferrer">{sourceYear}</a></span>)}</p>
      <p>Fontes oficiais de prestação de contas TSE:{" "}{(year?[year]:expenseYears).map((sourceYear,index)=><span key={`finance-${sourceYear}`}>{index?", ":""}<a className="source-link source-link--inline" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-${sourceYear}`} target="_blank" rel="noopener noreferrer">{sourceYear}</a></span>)}</p>
    </div>
  </section>;
}

async function HomeTopSuppliers({requestedYear}:{requestedYear:number}) {
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  const years=getExpenseYears();
  const initialYear=Number.isInteger(requestedYear)&&years.includes(requestedYear)?requestedYear:undefined;
  return <div className="animate-in" style={{animationDelay:"150ms"}}><TopSuppliers years={years} initialYear={initialYear}/></div>;
}

function HomeSuppliersFallback() {
  return <section className="card" aria-live="polite"><div className="label">prestação de contas eleitorais</div><h2 className="mt-2 text-[20px] font-medium tracking-tight">Empresas com maiores contratações em campanhas</h2><p className="mt-5 text-sm text-[var(--muted)]">Preparando o ranking de fornecedores…</p></section>;
}
