import Link from "next/link";
import { ArrowUpRight, FileCheck2, Landmark, MapPinned } from "lucide-react";
import { PageHeader } from "@/components/shell/shell-context";
import { BrazilStateMap } from "@/components/geography/brazil-state-map";
import { pageMetadata } from "@/lib/seo-metadata";
import { STATES, publishedStates } from "@/lib/state-accounts/registry";
import styles from "./[estado]/state-dashboard.module.css";
import hub from "./state-directory.module.css";

export const metadata = pageMetadata(
  "Contas dos estados · despesas públicas com fontes | Politica007",
  "Consulte a execução orçamentária por UF no Siconfi, com períodos e fontes oficiais. Goiás também tem dados de publicidade e repasses cirúrgicos.",
  "/contas-do-estado",
);

const destination = (slug: string) => `/contas-do-estado/${slug}`;

export default function StateAccountsHub() {
  const available = publishedStates();
  const states = [...STATES].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const published = new Set(available.map(item => item.uf));
  const entries = new Map(states.map(state => {
    const ready = published.has(state.uf);
    return [state.uf, { href: ready ? destination(state.slug) : undefined, label: `${state.name} · ${ready ? "painel publicado" : "ainda sem painel"}`, ready }];
  }));
  return <div className={styles.dashboard}>
    <PageHeader group="Transparência" current="Contas do Estado" />
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}><span className={styles.liveDot} /> TRANSPARÊNCIA <span>/</span> BRASIL</div>
        <h1>Contas dos estados.<br /><span>Explore o orçamento do Brasil.</span></h1>
        <p>Escolha um estado ou o Distrito Federal para comparar áreas do orçamento e abrir os documentos oficiais que sustentam cada valor.</p>
        <div className={styles.heroMeta}><span><Landmark size={16} aria-hidden />{available.length} de {STATES.length} UFs com painel publicado</span></div>
      </div>
      <div className={styles.stateCard}><span>COBERTURA NACIONAL</span><strong>{available.length}</strong><div>UFs publicadas</div><small>26 estados e Distrito Federal</small></div>
    </header>

    <div className={hub.explorer}>
      <section className={styles.panel} aria-labelledby="mapa-estadual">
        <header className={styles.sectionTitle}><span><MapPinned size={18} aria-hidden /></span><div>
          <h2 id="mapa-estadual">Explore pelo mapa</h2><p>Toque ou clique em uma UF para abrir o painel. Malha do IBGE.</p>
        </div></header>
        <div className={hub.map}><BrazilStateMap entries={entries} /></div>
      </section>

      <section className={styles.panel} aria-labelledby="lista-ufs">
        <header className={styles.sectionTitle}><span>27</span><div><h2 id="lista-ufs">Escolha uma UF</h2><p>Abra as contas de uma unidade da Federação.</p></div></header>
        <ul className={hub.list}>
          {states.map(state => <li key={state.uf}>
            {published.has(state.uf) ? <Link prefetch={false} href={destination(state.slug)} className={hub.state}>
              <span className={hub.code}>{state.uf}</span><span><strong>{state.name}</strong><small>{state.active ? "Fiscal e temático" : "Fiscal e produção SUS"}</small></span><ArrowUpRight size={15} aria-hidden />
            </Link> : <div className={hub.state}><span className={hub.code}>{state.uf}</span><span><strong>{state.name}</strong><small>Ainda sem painel</small></span></div>}
          </li>)}
        </ul>
      </section>
    </div>

    <div className={styles.note}><FileCheck2 size={19} aria-hidden />
      <p><strong>Compare a mesma medida, fonte e período.</strong> Produção do SUS não é pagamento do Tesouro. Os recortes de publicidade e repasses de Goiás são integrações específicas e não representam cobertura igual em todas as UFs.</p>
    </div>
  </div>;
}
