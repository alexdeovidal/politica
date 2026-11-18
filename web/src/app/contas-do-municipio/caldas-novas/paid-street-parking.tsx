import Link from "next/link";
import { CircleParking } from "lucide-react";
import { municipalPath } from "@/lib/municipal-accounts";
import styles from "./painel.module.css";

const service = "https://site.estacionecaldasnovas.com.br/";
const notice = "https://www.caldasnovas.go.gov.br/wp-content/uploads/2019/02/EDITAL-CONCORR%C3%8ANCIA-P%C3%9ABLICA-%C3%81REA-AZUL.2017.pdf";
const report = "https://www.caldasnovas.go.gov.br/wp-content/uploads/2021/12/AREA-AZUL-RELATORIO-FINAL.pdf";
const revenue = "https://acessoainformacao.caldasnovas.go.gov.br/cidadao/transparencia/sgreceitas";

export function PaidStreetParking() {
  return <section id="area-azul" aria-labelledby="area-azul-title" className="card scroll-mt-20 p-4 sm:p-6">
    <div className={styles.sectionHead}>
      <div>
        <h2 id="area-azul-title" className="flex items-center gap-2"><CircleParking size={21} aria-hidden /> Área Azul de Caldas Novas</h2>
        <p>Acompanhe a cobrança pelo estacionamento rotativo em vias públicas e o repasse previsto à Prefeitura.</p>
      </div>
    </div>
    <ol className="grid gap-3 md:grid-cols-3">
      <li className="rounded-lg border border-[var(--border-1)] p-4">
        <h3 className="font-semibold">1. Cobrança do motorista</h3>
        <p className="my-2 text-sm">R$ 3,95 por 60 minutos para carro e R$ 1,95 por 60 minutos para moto.</p>
        <p className="mb-3 text-xs text-[var(--muted)]">Preços públicos divulgados pelo portal do serviço, consultado em 18/11/2026.</p>
        <a className="source-link" href={service}>Abrir portal do estacionamento</a>
      </li>
      <li className="rounded-lg border border-[var(--border-1)] p-4">
        <h3 className="font-semibold">2. Operação do estacionamento</h3>
        <p className="my-2 text-sm">O portal do serviço identifica a operação como CaldasPark. O relatório da Prefeitura registra a Tecgold Sistemas Ltda. como vencedora da licitação original, vinculada ao Contrato nº 098/2019.</p>
        <p className="mb-3 text-xs text-[var(--muted)]">Instrumento vigente e arrecadação bruta mensal ainda não confirmados nas fontes consultadas.</p>
        <a className="source-link" href={report}>Abrir relatório da Prefeitura</a>
      </li>
      <li className="rounded-lg border border-[var(--border-1)] p-4">
        <h3 className="font-semibold">3. Repasse à Prefeitura</h3>
        <p className="my-2 text-sm">O edital de 2017 previa repasse mensal, com lance mínimo de 5% sobre a receita bruta da utilização do estacionamento.</p>
        <p className="mb-3 text-xs text-[var(--muted)]">Percentual efetivo vigente, valores repassados e aplicação em despesas ainda não confirmados nas fontes consultadas.</p>
        <div className={styles.sourceLinks}>
          <a className="source-link" href={notice}>Ver edital, item 14.2</a>
          <a className="source-link" href={revenue}>Consultar receitas da Prefeitura</a>
        </div>
      </li>
    </ol>
    <div className="mt-4">
      <Link className="btn" prefetch={false} href={`${municipalPath}?tema=area-azul#buscar-contratos`}>Buscar contratos sobre Área Azul no PNCP</Link>
    </div>
  </section>;
}
