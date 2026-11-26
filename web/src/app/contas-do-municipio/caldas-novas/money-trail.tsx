"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CircleDollarSign, Files, Landmark, MapPinned } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { ContractGroup, FiscalSnapshot, FlowFunding, FlowRevenue } from "@/lib/municipal-accounts";
import styles from "./painel.module.css";

const steps = [
  { label: "Impostos e repasses", Icon: CircleDollarSign },
  { label: "Receita da cidade", Icon: Landmark },
  { label: "Despesas por área", Icon: MapPinned },
  { label: "Contratos", Icon: Files },
  { label: "Fornecedores", Icon: Building2 },
] as const;
type Item = { id: string; label: string; sub: string; amount?: number | null; href?: string };
const short = new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL", notation:"compact", maximumFractionDigits:1});
const count = new Intl.NumberFormat("pt-BR");

export function MoneyTrail({ report, revenue, funding, companies, path, filters, scope, resultCount, initialStep, fiscalOnly = false }: {
  report?: FiscalSnapshot; revenue?: FlowRevenue; funding: FlowFunding[]; companies: ContractGroup[];
  path: string; filters: Record<string,string>; scope:string; resultCount: number; initialStep: 0 | 1 | 4; fiscalOnly?: boolean;
}) {
  const [step, setStep] = useState<number>(initialStep);
  const [selected, setSelected] = useState("");
  const [limit, setLimit] = useState(5);
  const selectStep = (index:number) => { setStep(index); setSelected(""); setLimit(5); };
  const href = (extra:Record<string,string>, section = "buscar-contratos") => {
    const exportFilters = Object.entries({...filters,...extra}).filter(([,value]) => value);
    return `${path}?${new URLSearchParams(exportFilters)}#${section}`;
  };
  const supplierMap = new Map<string, Item & {amount:number; contracts:number}>();
  for (const row of companies) {
    if (!row.cnpj) continue;
    const current = supplierMap.get(row.cnpj);
    supplierMap.set(row.cnpj, {
      id:row.cnpj,label:current?.label ?? row.name,sub:row.cnpj,
      amount:(current?.amount ?? 0)+row.amount, contracts:(current?.contracts ?? 0)+row.count,
      href:href({cnpj:row.cnpj}),
    });
  }
  const suppliers = [...supplierMap.values()].sort((a,b)=>b.amount-a.amount);
  const items: Item[][] = [
    (revenue?.items ?? []).map(row=>({id:row.name,label:row.name,sub:row.group,amount:row.amount})).sort((a,b)=>b.amount-a.amount),
    report ? [
      {id:"receita",label:"Receita realizada",sub:"Acumulado no exercício · exceto operações intraorçamentárias",amount:report.revenue},
      ...report.origins.map(row=>({id:row.name,label:row.name,sub:"Composição da receita realizada",amount:row.amount})),
    ] : [],
    (report?.areas ?? []).map(row=>({id:row.name,label:row.name,sub:"Despesa liquidada da função",amount:row.amount})),
    funding.map(row=>({id:String(row.id),label:row.name,sub:`${count.format(row.count)} registro(s) de contrato no recorte`,href:href({fonte:String(row.id)})})),
    suppliers.map(row=>({...row,sub:`CNPJ ${row.sub} · ${count.format(row.contracts)} contrato(s) inicial(is) com valor positivo`})),
  ];
  const visible = items[step];
  const active = visible.find(row=>row.id===selected) ?? visible[0];
  const fiscalPeriod = report ? `Até o ${report.period}º bimestre de ${report.year}` : "Demonstrativo aguardando coleta";
  const revenuePeriod = revenue ? `Doze meses encerrados no ${revenue.period}º bimestre de ${revenue.year}` : "Detalhamento aguardando coleta";
  const captions = [
    `${revenuePeriod} · RREO Anexo 03. A lista exibe receitas selecionadas do demonstrativo.`,
    `${fiscalPeriod} · RREO Anexo 01.`,
    `${fiscalPeriod} · RREO Anexo 02.`,
    `${scope} · ${count.format(resultCount)} registro(s). O PNCP identifica a fonte declarada na contratação quando publicada.`,
    `${scope}. Os valores são dos contratos iniciais localizados pelo CNPJ do fornecedor.`,
  ];
  const gaps = [
    "As receitas selecionadas têm janela de 12 meses. A receita do exercício e a despesa por função usam o acumulado do ano.",
    "O total resulta do balanço oficial do município. A ligação de um imposto a uma despesa específica exige registro de execução.",
    "Esta etapa fecha o resumo contábil. Para vincular a despesa a um contrato, é preciso um empenho ou outro documento com identificador correspondente.",
    "Uma contratação pode declarar mais de uma fonte. Por isso, as contagens podem se sobrepor. Abra os contratos para conferir seus documentos.",
    "Valor contratado e valor pago são etapas diferentes. O pagamento vinculado continua pendente quando falta documento conciliado.",
  ];
  const source = step===0 ? revenue?.url : step===1 ? report?.balanceUrl : step===2 ? report?.executionUrl : undefined;

  return <div id="caminho-do-dinheiro" className={`${styles.content} scroll-mt-20`}>
    <div className={styles.sectionHead}>
      <div><h2>{fiscalOnly ? "Da receita à despesa" : "Do imposto ao fornecedor"}</h2><p>{fiscalOnly ? "Acompanhe a receita realizada e as despesas liquidadas por função, com os demonstrativos oficiais." : "Escolha uma etapa para ver os valores e abrir os documentos que sustentam cada ligação."}</p></div>
    </div>
    <nav className={fiscalOnly ? `${styles.trailSteps} ${styles.shortTrail}` : styles.trailSteps} aria-label="Etapas do percurso do dinheiro">
      {steps.map(({label,Icon},index)=> (!fiscalOnly || index === 1 || index === 2) && <button key={label} type="button" aria-current={index===step?"step":undefined}
        className={index===4 ? styles.trailBlue : undefined} onClick={()=>selectStep(index)}>
        <Icon size={18} aria-hidden /> <span>{label}</span>
        {index===2 && !fiscalOnly ? <span className={styles.trailGap} title="Vínculo contábil depende de conciliação">···</span> : index<4 && (!fiscalOnly || index === 1) && <ArrowRight size={13} aria-hidden />}
      </button>)}
    </nav>

    <div className={styles.trailContext}>
      {captions[step]}
      {step === 0 && <div className="mt-2"><a className="source-link" href="#area-azul">Ver também Área Azul · estacionamento rotativo</a></div>}
    </div>
    <div className={`${styles.fiscalLayout} ${step===4 ? styles.trailBlue : ""}`}>
      <div>
        {visible.length ? <ul className={styles.trailList}>{visible.slice(0,limit).map(row=><li key={row.id}>
          <button type="button" aria-pressed={active?.id===row.id} onClick={()=>setSelected(row.id)}>
            <span><strong>{row.label}</strong><small>{row.sub}</small></span>
            {row.amount!=null && <b>{short.format(row.amount/100)}</b>}
          </button>
        </li>)}</ul> : <p className={styles.empty}>{step===4 ? "Nenhum fornecedor com CNPJ e valor positivo neste recorte." :
          step===3 ? "Ainda não há fonte orçamentária cadastrada no PNCP para os contratos consultados deste recorte." : "Os dados dessa etapa ainda não estão disponíveis."}</p>}
        {visible.length>limit && <button type="button" className="btn mt-3" onClick={()=>setLimit(n=>n+5)}>Ver mais ({visible.length-limit})</button>}
      </div>
      <aside className={styles.insight} aria-live="polite">
        <span className={styles.eyebrow}>{steps[step].label}</span>
        {active && <><h3>{active.label}</h3>{active.amount!=null && <strong className={styles.big}>{formatBRL(active.amount)}</strong>}</>}
        <p>{gaps[step]}</p>
        <div className={styles.sourceLinks}>
          {source && <a className="source-link" href={source}>Abrir demonstrativo oficial</a>}
          {active?.href && <Link prefetch={false} className="source-link" href={active.href}>Ver contratos deste recorte</Link>}
          {step===3 && <a className="source-link" href="#buscar-contratos">Explorar todos os contratos do recorte</a>}
        </div>
        {step===3 && active ? <Link prefetch={false} className="btn mt-3" href={href({fonte: active.id, etapa:"fornecedores"},"caminho-do-dinheiro")}>Ver fornecedores desta fonte <ArrowRight size={15} /></Link> :
          fiscalOnly && step===2 ? <a href="#buscar-contratos" className="btn mt-3">Consultar cobertura de contratos <ArrowRight size={15} /></a> :
          step<4 && <button type="button" className="btn mt-3" onClick={()=>selectStep(step+1)}>{step===2?"Abrir contratos para conferência":"Próxima etapa"} <ArrowRight size={15} /></button>}
      </aside>
    </div>
    <p className="mt-4 text-xs text-[var(--muted)]">{fiscalOnly ? "Os demonstrativos fiscais não vinculam automaticamente uma despesa a um contrato ou fornecedor." : "RREO para orçamento. PNCP para a contratação, a fonte declarada e o fornecedor. A pausa entre despesa e contrato indica que esses registros ainda precisam ser conciliados."}</p>
  </div>;
}
