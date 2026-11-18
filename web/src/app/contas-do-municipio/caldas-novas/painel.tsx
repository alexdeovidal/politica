"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, Building2, ChartPie, CircleDollarSign, Files, Landmark, Network, SearchCheck } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { ContractGroup, FiscalSnapshot, FiscalValue } from "@/lib/municipal-accounts";
import styles from "./painel.module.css";

type Mode = "budget" | "network" | "map";
type Tile = { name: string; amount: number };
type Area = { top: number; left: number; width: number; height: number };
const shortMoney = (cents: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1,
}).format(cents / 100);
const number = new Intl.NumberFormat("pt-BR");
const share = (amount: number, total: number) => total > 0
  ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(amount / total) : "—";

function tiles(items: Tile[], area: Area, vertical = false): (Tile & Area)[] {
  if (items.length === 1) return [{ ...items[0], ...area }];
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  let split = 1, weight = items[0].amount;
  while (split < items.length - 1 && weight + items[split].amount / 2 < total / 2) {
    weight += items[split++].amount;
  }
  const fraction = weight / total;
  const first = vertical ? { ...area, height: area.height * fraction } : { ...area, width: area.width * fraction };
  const last = vertical
    ? { ...area, top: area.top + first.height, height: area.height - first.height }
    : { ...area, left: area.left + first.width, width: area.width - first.width };
  return [...tiles(items.slice(0, split), first, !vertical), ...tiles(items.slice(split), last, !vertical)];
}

function RankedValues({ values, total, selected, onSelect }: {
  values: FiscalValue[]; total: number; selected?: string; onSelect: (value: FiscalValue) => void;
}) {
  return <ul className={styles.ranks}>{values.map(value => <li key={value.name}>
    <button type="button" title={value.amount === null ? undefined : formatBRL(value.amount)}
      onClick={() => onSelect(value)} aria-pressed={selected === value.name}>
      <span>{value.name}</span><strong>{value.amount === null ? "Sem dado" : shortMoney(value.amount)}</strong>
      <span className={styles.bar} style={{ width: `${Math.min(100, Math.max(0, (value.amount ?? 0) * 100 / Math.max(total, 1)))}%` }} />
    </button>
  </li>)}</ul>;
}

export function MunicipalDashboard({ reports, groups, labels, path, resultCount, scope, filterParams }: {
  reports: FiscalSnapshot[]; groups: ContractGroup[]; labels: Record<string, string>;
  path: string; resultCount: number; scope: string; filterParams: Record<string, string>;
}) {
  const [mode, setMode] = useState<Mode>(reports.length ? "budget" : "network");
  const [year, setYear] = useState(reports[0]?.year);
  const [selectedValue, setSelectedValue] = useState<{ name: string; amount: number | null; group: string; total: number }>();
  const [selectedOrg, setOrg] = useState("");
  const [selectedUnit, setUnit] = useState<string>();
  const [selectedSupplier, setSupplier] = useState<ContractGroup>();
  const report = reports.find(row => row.year === year) ?? reports[0];
  const contractTotal = groups.reduce((sum, row) => sum + row.amount, 0);
  const contractCount = groups.reduce((sum, row) => sum + row.count, 0);
  const orgs = Object.keys(labels).map(org => ({
    org, name: labels[org], amount: groups.reduce((sum, row) => sum + (row.org === org ? row.amount : 0), 0),
  })).filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const activeOrg = orgs.find(row => row.org === selectedOrg) ?? orgs[0];
  const units = new Map<string, number>();
  for (const row of groups) if (row.org === activeOrg?.org) units.set(row.unit, (units.get(row.unit) ?? 0) + row.amount);
  const rankedUnits = [...units].sort((a, b) => b[1] - a[1]);
  const activeUnit = selectedUnit !== undefined && units.has(selectedUnit) ? selectedUnit : rankedUnits[0]?.[0];
  const suppliers = groups.filter(row => row.org === activeOrg?.org && row.unit === activeUnit);
  const activeSupplier = selectedSupplier && suppliers.includes(selectedSupplier) ? selectedSupplier : suppliers[0];
  const mapRows = report?.areas ?? [];
  const leading = mapRows.slice(0, 7).filter((x): x is Tile => (x.amount ?? 0) > 0);
  const tail = mapRows.slice(7).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const mapTiles = leading.length ? tiles(tail > 0 ? [...leading, { name: "Demais funções", amount: tail }] : leading,
    { top: 0, left: 0, width: 100, height: 100 }) : [];
  const fiscalDescription = report ? `Acumulado até o ${report.period}º bimestre de ${report.year} · RREO · sem operações intraorçamentárias` : "";
  const focus = selectedValue ?? (report && { name: "Despesas liquidadas", amount: report.settled, group: "Execução orçamentária", total: report.settled });
  const tabs = [
    { id: "budget", label: "Orçamento", Icon: Landmark },
    { id: "network", label: "Rede de contratos", Icon: Network },
    { id: "map", label: "Mapa de proporções", Icon: ChartPie },
  ] as const;
  const chooseValue = (group: string, total: number) => (value: FiscalValue) => setSelectedValue({ ...value, group, total });

  return <section className={styles.dashboard} aria-label="Painel de finanças municipais">
    <header className={styles.hero}>
      <div>
        <span className={styles.eyebrow}><Landmark size={16} /> Finanças municipais · Goiás</span>
        <h1>Contas de Caldas Novas</h1>
        <p>Explore quanto o município arrecadou, em quais áreas a despesa foi liquidada e quem aparece nos contratos públicos.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {resultCount > 0 && <a className="btn btn--primary" href="#sinais"><SearchCheck size={16} /> Sinais para investigar</a>}
        <a className="btn" href="#buscar-contratos"><Files size={16} /> Consultar contratos</a>
      </div>
    </header>

    {report && <div className={styles.reportBar}>
      <p>{fiscalDescription}</p>
      <label>Exercício fiscal <select className="input" value={report.year} onChange={event => {
        setYear(Number(event.target.value)); setSelectedValue(undefined);
      }}>
        {reports.map(row => <option key={row.year} value={row.year}>{row.year}</option>)}
      </select></label>
    </div>}
    <div className={styles.metrics}>
      {[
        { label: "Receitas realizadas", value: report?.revenue, Icon: CircleDollarSign, source: "Tesouro Nacional" },
        { label: "Despesas liquidadas", value: report?.settled, Icon: Landmark, source: "Tesouro Nacional" },
        { label: "Despesas pagas no exercício", value: report?.paid, Icon: ArrowDownRight, source: "Tesouro Nacional" },
        { label: "Valor dos contratos iniciais", value: contractCount ? contractTotal : undefined, Icon: Files, source: `PNCP · ${number.format(contractCount)} no recorte` },
      ].map(({ label, value, Icon, source }) => <div key={label} className={styles.metric}>
        <Icon size={18} aria-hidden /><span>{label}</span>
        <strong title={value === undefined ? undefined : formatBRL(value)}>{value === undefined ? "Sem dado" : shortMoney(value)}</strong>
        <small>{source}</small>
      </div>)}
    </div>

    <div className={styles.workspace}>
      <nav className={styles.tabs} aria-label="Visualizações municipais">
        {tabs.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={mode === id}
          onClick={() => { setMode(id); setSelectedValue(undefined); }}>
          <Icon aria-hidden size={17} /> {label}
        </button>)}
      </nav>

      {mode === "network" ? <div className={styles.content}>
        <div className={styles.sectionHead}>
          <div><h2>Quem contrata e quem fornece</h2><p>{scope} · {number.format(resultCount)} registros. A rede considera contratos iniciais com valor positivo.</p></div>
          <span className={styles.source}>Fonte · PNCP</span>
        </div>
        {activeOrg ? <div className={styles.network}>
          <div><h3><Building2 size={15} /> Órgão comprador</h3>
            <RankedValues values={orgs} total={contractTotal} selected={activeOrg.name} onSelect={value => {
              setOrg(orgs.find(row => row.name === value.name)?.org ?? ""); setUnit(undefined); setSupplier(undefined);
            }} />
          </div>
          <div><h3><ArrowRight size={15} /> Unidade compradora</h3>
            <RankedValues values={rankedUnits.map(([unit, amount]) => ({ name: unit || "Unidade não informada", amount }))}
              total={activeOrg.amount} selected={activeUnit || "Unidade não informada"}
              onSelect={value => { setUnit(value.name === "Unidade não informada" ? "" : value.name); setSupplier(undefined); }} />
          </div>
          <div><h3><ArrowRight size={15} /> Fornecedor</h3>
            <RankedValues values={suppliers.slice(0, 12).map(row => ({
              name: row.cnpj ? `${row.name} · ${row.cnpj}` : "Sem CNPJ exibido (agrupado)", amount: row.amount,
            }))} total={units.get(activeUnit ?? "") ?? 0}
              selected={activeSupplier?.cnpj ? `${activeSupplier.name} · ${activeSupplier.cnpj}` : "Sem CNPJ exibido (agrupado)"}
              onSelect={value => setSupplier(suppliers.find(row => row.cnpj ? value.name.endsWith(row.cnpj) : value.name === "Sem CNPJ exibido (agrupado)"))} />
            {suppliers.length > 12 && <small>12 maiores valores desta unidade</small>}
          </div>
          <aside className={styles.insight}>
            <span className={styles.eyebrow}>Vínculo no PNCP</span>
            <h3>{activeSupplier?.cnpj ? activeSupplier.name : "Instrumentos sem CNPJ exibido"}</h3>
            {activeSupplier && <>
              <strong className={styles.big}>{formatBRL(activeSupplier.amount)}</strong>
              <p>{number.format(activeSupplier.count)} contrato(s) inicial(is) nesta unidade. Os vínculos vêm do cadastro do próprio contrato.</p>
            </>}
            {activeSupplier?.cnpj && <Link className="btn" prefetch={false}
              href={`${path}?${new URLSearchParams({ ...filterParams, q: activeSupplier.cnpj, org: activeSupplier.org, ...(activeSupplier.unit ? { unidade: activeSupplier.unit } : {}) })}#buscar-contratos`}>
              Ver contratos do fornecedor <ArrowRight size={15} />
            </Link>}
          </aside>
        </div> : <p className={styles.empty}>Nenhum contrato inicial com valor positivo para desenhar a rede neste recorte.</p>}
      </div> : <div className={styles.content}>
        <div className={styles.sectionHead}>
          <div><h2>{mode === "map" ? "Onde a despesa foi liquidada" : "De onde vêm as receitas e onde se gasta"}</h2>
            <p>{mode === "map" ? "A área de cada bloco representa a participação no valor liquidado." : "As duas visões mostram classificações do orçamento municipal no mesmo bimestre."}</p></div>
          <span className={styles.source}>Fonte · Siconfi</span>
        </div>
        {!report ? <p className={styles.empty}>Balanço municipal aguardando a primeira coleta do Tesouro.</p> :
          <div className={styles.fiscalLayout}>
            {mode === "budget" ? <div className={styles.split}>
              <div><h3>Origens das receitas</h3><p className={styles.columnTotal}>{formatBRL(report.revenue)}</p>
                <RankedValues values={report.origins} total={report.revenue} selected={selectedValue?.name}
                  onSelect={chooseValue("Receita realizada", report.revenue)} />
              </div>
              <div><h3>Despesas por área</h3><p className={styles.columnTotal}>{formatBRL(report.settled)}</p>
                <RankedValues values={report.areas} total={report.settled} selected={selectedValue?.name}
                  onSelect={chooseValue("Despesa liquidada", report.settled)} />
              </div>
            </div> : <div className={styles.map} aria-label="Mapa proporcional das despesas liquidadas">
              {mapTiles.map(tile => <button key={tile.name} type="button" aria-pressed={selectedValue?.name === tile.name}
                aria-label={`${tile.name}, ${formatBRL(tile.amount)}`}
                title={`${tile.name} · ${formatBRL(tile.amount)}`}
                onClick={() => chooseValue("Despesa liquidada", report.settled)(tile)}
                style={{ top: `${tile.top}%`, left: `${tile.left}%`, width: `${tile.width}%`, height: `${tile.height}%` }}>
                {tile.width >= 13 && tile.height >= 10 && <span><b>{tile.name}</b><small>{share(tile.amount, report.settled)}</small></span>}
              </button>)}
            </div>}
            <aside className={styles.insight} aria-live="polite">
              <span className={styles.eyebrow}>{focus?.group}</span>
              <h3>{focus?.name}</h3>
              <strong className={styles.big}>{focus?.amount == null ? "Dado não disponível" : formatBRL(focus.amount)}</strong>
              {selectedValue && selectedValue.amount !== null && <p>{share(selectedValue.amount, selectedValue.total)} do total correspondente no demonstrativo.</p>}
              <dl className={styles.stages}>
                <div><dt>Empenhado</dt><dd>{shortMoney(report.committed)}</dd></div>
                <div><dt>Liquidado</dt><dd>{shortMoney(report.settled)}</dd></div>
                <div><dt>Pago no exercício</dt><dd>{shortMoney(report.paid)}</dd></div>
              </dl>
              <p>Totais municipais do exercício. Para seguir um fornecedor, consulte os vínculos publicados na rede do PNCP.</p>
              <div className={styles.sourceLinks}>
                <a className="source-link" href={report.balanceUrl}>Balanço original</a>
                <a className="source-link" href={report.executionUrl}>Despesas por função</a>
              </div>
            </aside>
          </div>}
      </div>}
    </div>
  </section>;
}
