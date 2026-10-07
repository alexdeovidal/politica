import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { TopSuppliers } from "@/components/top-suppliers";
import { HomeMetrics, HomeYearSelect } from "@/components/home-overview";
import { PageHeader } from "@/components/shell/shell-context";
import { ContributionCard } from "@/components/contribution-card";

export const revalidate = 300;

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        group="Politica007"
        current="Visão geral"
        actions={<Suspense fallback={<span className="block h-8 w-36 animate-pulse rounded bg-[var(--hover)]" aria-hidden="true" />}><HomeYearSelect /></Suspense>}
      />

      <Link href="/apuracao" prefetch={false} className="live-home-link"><span className="live-home-link__dot"/><span><strong>Apuração das Eleições 2026</strong><small>Resultados oficiais do TSE · Estados, cidades e modo TV</small></span><span>Acompanhar →</span></Link>
      <div className="platform-toolbar"><Link href="/explorar" prefetch={false} className="btn">Minha cidade e candidaturas</Link><Link href="/grafo" prefetch={false} className="btn">Rede de pessoas e empresas</Link><Link href="/emendas" prefetch={false} className="btn">Destino dos recursos públicos</Link><Link href="/comparar" prefetch={false} className="btn">Comparar candidaturas</Link></div>
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

      <Suspense fallback={<section className="flex flex-col gap-4" aria-hidden="true"><div className="kpis kpis--home">{Array.from({ length: 5 }, (_, index) => <div key={index} className="kpi"><div className="kpi__label">Indicador público</div><div className="kpi__value">…</div></div>)}</div></section>}>
        <HomeMetrics />
      </Suspense>

      <ContributionCard />

      <div className="animate-in" style={{ animationDelay: "150ms" }}><Suspense fallback={<section className="card"><p className="text-sm text-[var(--muted)]">Preparando o ranking de fornecedores…</p></section>}><TopSuppliers /></Suspense></div>

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
