import { SearchBox } from "@/components/search-box";
import { TopSuppliers } from "@/components/top-suppliers";
import { PageHeader } from "@/components/shell/shell-context";
import { YearSelect } from "@/components/ui/year-select";
import { getHomeStats } from "@/lib/stats";
import { getExpenseYears } from "@/lib/queries";
import { formatBRL } from "@/lib/format";
import { ContributionCard } from "@/components/contribution-card";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const anoParam = typeof sp.ano === "string" ? Number(sp.ano) : NaN;
  const expenseYears = getExpenseYears();
  const year = Number.isInteger(anoParam) && expenseYears.includes(anoParam) ? anoParam : undefined;

  const stats = getHomeStats(year);

  const heroStats = [
    { label: "pessoas", value: stats.people.toLocaleString("pt-BR") },
    { label: "candidaturas", value: stats.candidacies.toLocaleString("pt-BR") },
    { label: "doações recebidas", value: formatBRL(stats.donationsTotalCents), tone: "green" as const },
    { label: "despesas contratadas", value: formatBRL(stats.expensesTotalCents) },
    { label: year ? "eleição" : "período coberto", value: stats.years },
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        group="POLITICA"
        current="Início"
        actions={<YearSelect basePath="/" years={expenseYears} value={year} allLabel="todos os anos" />}
      />

      <section className="portal-hero animate-in" aria-labelledby="portal-title">
        <div className="portal-hero__content">
          <div className="portal-hero__eyebrow">
            <span className="portal-hero__status" aria-hidden="true" />
            Plataforma independente · consulta de dados públicos
          </div>
          <h1 id="portal-title">Dados eleitorais organizados para consulta cidadã.</h1>
          <p>
            Pesquise candidaturas, prestações de contas e informações relacionadas por nome, CPF ou CNPJ.
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

      <section className="animate-in flex flex-col gap-4" style={{ animationDelay: "80ms" }}>
        <div className="kpis">
          {heroStats.map((s) => (
            <div key={s.label} className="kpi">
              <div className="kpi__label">{s.label}</div>
              <div className={`kpi__value${s.tone === "green" ? " kpi__value--green" : ""}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      <ContributionCard />

      <div className="animate-in" style={{ animationDelay: "150ms" }}>
        <TopSuppliers years={expenseYears} initialYear={year} />
      </div>

      <div className="card animate-in max-w-2xl" style={{ animationDelay: "220ms" }}>
        <div className="label mb-3">indício não é prova</div>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
          O POLITICA reúne dados que já são públicos por lei (registro de candidatura do TSE,
          prestação de contas eleitorais, redes sociais declaradas) e os organiza por pessoa. Nada
          aqui é acusação — é o dado bruto oficial, com a fonte exposta em cada campo, para que
          qualquer um confira e vá além se quiser apurar.
        </p>
      </div>
    </div>
  );
}
