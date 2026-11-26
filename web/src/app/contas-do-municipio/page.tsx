import Link from "next/link";
import Form from "next/form";
import { ArrowRight, ChartNoAxesCombined, Check, Landmark, MapPinned, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/shell-context";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { pageMetadata } from "@/lib/seo-metadata";
import { allMunicipalities, municipalPublishedCodes } from "@/lib/municipal-catalog-server";
import { directoryHref, directoryPath, directoryQuery, municipalDirectory } from "@/lib/municipal-directory";
import { municipalHref } from "@/lib/municipal-registry";
import { STATES } from "@/lib/state-accounts/registry";
import map from "../../../public/maps/live-2026/br.json";
import dashboard from "./caldas-novas/painel.module.css";
import styles from "./directory.module.css";

export const metadata = pageMetadata("Contas dos municípios | Política007",
  "Escolha um estado e um município para acompanhar receitas, despesas e contratos em fontes oficiais.", directoryPath);
export const dynamic = "force-dynamic";

const count = new Intl.NumberFormat("pt-BR");
const district = "/contas-do-estado/distrito-federal";
const stateNames = new Map<string, string>(STATES.map(state => [state.uf, state.name]));
const stateCodes = STATES.map(state => state.uf).filter(uf => uf !== "DF");
const format = (value: number) => count.format(value);

export default async function MunicipalIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cities = allMunicipalities();
  const published = municipalPublishedCodes();
  const { uf, q, includePending, page: requestedPage } = directoryQuery(await searchParams, stateCodes);
  const { states, state, page, pages, first, last, total, rows } = municipalDirectory(cities, published, { uf, q, includePending, page: requestedPage });
  const ready = states.reduce((sum, item) => sum + item.ready, 0);
  const byUf = new Map(states.map(item => [item.uf, item]));
  return <div className={`${dashboard.dashboard} ${styles.directory}`}>
    <PageHeader group="Transparência" current="Contas do Município" />
    <header className={dashboard.hero}>
      <div>
        <span className={dashboard.eyebrow}><Landmark size={16} aria-hidden /> Finanças municipais · Brasil</span>
        <h1>Contas dos municípios</h1>
        <p>Explore o orçamento da sua cidade: quanto arrecadou, onde gastou e quais contratos já estão disponíveis para consulta.</p>
      </div>
      <div className={styles.coverage}>
        <ChartNoAxesCombined size={19} aria-hidden />
        <strong data-published={ready} data-municipalities={cities.length}>{format(ready)} de {format(cities.length)}</strong>
        <span>municípios com painel publicado</span>
      </div>
    </header>

    <div className={styles.explorer}>
      <section className={styles.mapCard} aria-labelledby="mapa-brasil">
        <div className={dashboard.sectionHead}>
          <div><h2 id="mapa-brasil">Explore pelo mapa</h2><p>Toque ou clique em um estado para listar suas cidades.</p></div>
        </div>
        <svg className={styles.brazil} viewBox="-76 -8 44 45" role="group" aria-label="Mapa interativo dos estados do Brasil">
          {[...map.shapes].sort((a, b) => Number(a.code === "df") - Number(b.code === "df")).map(shape => {
            const id = shape.code.toUpperCase();
            const active = id === uf;
            const tally = byUf.get(id);
            const label = `${stateNames.get(id) ?? id}${tally ? ` · ${format(tally.ready)} de ${format(tally.total)} publicados` : " · painel próprio"}`;
            return <a key={id} href={id === "DF" ? district : directoryHref(id)} className={styles.territory}
              aria-label={label} aria-current={active ? "true" : undefined} data-active={active || undefined} data-ready={Boolean(tally?.ready) || undefined}>
              <title>{label}</title>
              <path d={shape.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
              {id === "DF" ? <circle cx={shape.point[0]} cy={shape.point[1]} r=".5" vectorEffect="non-scaling-stroke" /> :
                !["AL", "ES", "PB", "RJ", "RN", "SE"].includes(id) && <text x={shape.point[0]} y={shape.point[1]} aria-hidden="true">{id}</text>}
            </a>;
          })}
        </svg>
        <p className={styles.mapLegend}><span aria-hidden="true" /> Estado com painel publicado <span aria-hidden="true" /> Estado selecionado</p>
        <p className={styles.muted}>Malha territorial do IBGE.</p>
      </section>

      <section className={styles.searchCard} aria-labelledby="localidade" id="localidade">
        <h2 id="localidade">Encontre sua cidade</h2>
        <Form action={directoryPath} className={styles.searchForm} key={uf || "brasil"}>
          <label htmlFor="municipal-uf">1. Selecione o estado</label>
          <div className={styles.inputRow}>
            <select id="municipal-uf" name="uf" className="input" required defaultValue={uf}>
              <option value="">Selecione o estado</option>
              {states.map(item => <option key={item.uf} value={item.uf}>{item.name} ({item.uf})</option>)}
            </select>
            <button type="submit" className="btn">Listar cidades <ArrowRight size={15} aria-hidden /></button>
          </div>
        </Form>
        <Form action={directoryPath} className={styles.searchForm} key={`cidade-${uf}-${q}-${includePending}`}>
          <label htmlFor="municipal-search">2. Busque pelo nome da cidade</label>
          <p className={styles.muted}>{state ? `Busque em ${state.name} por nome ou código IBGE.` : "Selecione primeiro um estado no mapa ou na lista."}</p>
          <input type="hidden" name="uf" value={uf} />
          <div className={styles.inputRow}>
            <input id="municipal-search" name="q" className="input" type="search" defaultValue={q} maxLength={80} placeholder={state ? "Nome ou código IBGE" : "Escolha o estado primeiro"} disabled={!state} />
            <button type="submit" className="btn btn--primary" disabled={!state}><Search size={16} aria-hidden /> Buscar</button>
          </div>
          {state && <div className={styles.filterRow}>
            <label htmlFor="municipal-coverage">Cobertura</label>
            <select id="municipal-coverage" name="cobertura" className="input" defaultValue={includePending ? "todas" : ""}>
              <option value="">Com painel publicado</option><option value="todas">Todas as cidades</option>
            </select>
          </div>}
        </Form>
        <p className={styles.directoryNote}>
          O <Link href={district}>Distrito Federal tem painel próprio</Link>. Fernando de Noronha é distrito estadual, sem prefeitura própria.
        </p>
      </section>
    </div>

    <section id="resultados" className={styles.results} aria-labelledby="titulo-resultados">
      <div className={dashboard.sectionHead}>
        <div>
          <span className={dashboard.eyebrow}><MapPinned size={15} aria-hidden /> {state ? state.uf : "Brasil"}</span>
          <h2 id="titulo-resultados">{state ? `Municípios de ${state.name}` : "Selecione um estado para ver as cidades"}</h2>
          <p>{state ? `${format(state.ready)} de ${format(state.total)} municípios com painel publicado.` : "A lista de cidades aparece depois que você escolhe um estado."}</p>
        </div>
        {state && <Link href={directoryPath} prefetch={false} className="btn">Ver todos os estados</Link>}
      </div>
      {state && (rows.length ? <>
        <p className={styles.resultCount}>{format(first)}–{format(last)} de {format(total)} {total === 1 ? "resultado" : "resultados"}{q ? ` para “${q}”` : ""}</p>
        <ul className={styles.resultGrid}>
          {rows.map(city => {
            const available = published.has(city.code);
            return <li key={city.code}>
              {available ? <Link href={municipalHref(city)} prefetch={false} className={styles.cityCard}>
                <span className={styles.published}><Check size={14} aria-hidden /> Painel publicado</span>
                <strong>{city.name}</strong>
                <span className={styles.cityFoot}>Abrir painel <ArrowRight size={16} aria-hidden /></span>
              </Link> : <div className={styles.cityCard}>
                <span className={styles.muted}>Ainda sem painel</span><strong>{city.name}</strong>
                <span className={styles.cityFoot}>IBGE {city.code}</span>
              </div>}
            </li>;
          })}
        </ul>
        <PaginationLinks page={page} totalPages={pages} prefetch={false} ariaLabel="Paginação de municípios"
          makeHref={number => `${directoryHref(uf, q, includePending, number)}#resultados`} />
      </> : <div className={styles.empty}>
        <p>{q ? "Nenhuma cidade encontrada com essa busca e cobertura." : "Ainda não há painéis publicados neste estado."}</p>
        {q && <Link href={directoryHref(uf, "", includePending)} prefetch={false} className="source-link">Limpar busca</Link>}
        {!includePending && <Link href={directoryHref(uf, q, true)} prefetch={false} className="source-link">Ver também cidades sem painel</Link>}
      </div>)}
    </section>
  </div>;
}
