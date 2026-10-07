import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { TopSuppliers } from "@/components/top-suppliers";
import { HomeMetrics, HomeYearSelect } from "@/components/home-overview";
import { PageHeader } from "@/components/shell/shell-context";
import { ContributionCard } from "@/components/contribution-card";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const parsedYear = typeof sp.ano === "string" ? Number(sp.ano) : 0;
  const requestedYear = Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : 0;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        group="Politica007"
        current="Visão geral"
        actions={<HomeYearSelect requestedYear={requestedYear} />}
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

      <HomeMetrics requestedYear={requestedYear} />

      <ContributionCard />

      <div className="animate-in" style={{ animationDelay: "150ms" }}><TopSuppliers initialYear={requestedYear || undefined} /></div>

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
