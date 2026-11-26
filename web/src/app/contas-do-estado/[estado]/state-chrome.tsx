import Link from "next/link";
import { ArrowRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import styles from "./state-dashboard.module.css";

export function StateHero({ name, uf, description, collected, title = "O dinheiro público.", subtitle = "As escolhas em perspectiva." }: {
  name: string; uf: string; description: string; collected?: string; title?: string; subtitle?: string;
}) {
  const date = collected?.slice(0, 10).split("-").reverse().join("/");
  return <header className={styles.hero}>
    <div className={styles.heroCopy}>
      <div className={styles.eyebrow}><span className={styles.liveDot} /> CONTAS DO ESTADO <span>/</span> {name.toLocaleUpperCase("pt-BR")}</div>
      <h1>{title}<br /><span>{subtitle}</span></h1>
      <p>{description}</p>
      <div className={styles.heroMeta}><span><ShieldCheck size={14} aria-hidden /> Fontes oficiais identificadas</span>{date && <span>Coleta: {date}</span>}</div>
    </div>
    <Link href="/contas-do-estado" prefetch={false} className={styles.stateCard} aria-label={`${name}, ver cobertura dos estados`}>
      <span>ESTADO EM FOCO</span><strong>{uf}</strong><div>{name} <ArrowUpRight size={20} aria-hidden /></div><small>Uma estrutura para as 27 UFs</small>
    </Link>
  </header>;
}

export function StateFooter() {
  return <footer className={styles.pageFooter}><span>POLÍTICA007 <i /> DADOS PÚBLICOS, CONTEXTO VISÍVEL.</span>
    <Link href="/contas-do-estado" prefetch={false}>Cobertura dos estados <ArrowRight size={14} aria-hidden /></Link>
  </footer>;
}
