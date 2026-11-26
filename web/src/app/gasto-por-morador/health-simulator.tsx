"use client";
import { useState } from "react";
import { inputCents } from "@/lib/school-scenario";
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const digits=new Intl.NumberFormat("pt-BR");
const brl=(cents:number)=>money.format(cents/100);
export type HealthChoice={id:string;name:string;population:number;budget:number|null;scope:string};
export function HealthSimulator({choices}:{choices:HealthChoice[]}){
 const [id,setId]=useState(choices[0].id), [price,setPrice]=useState(""), [avoid,setAvoid]=useState(""), [extra,setExtra]=useState("");
 const local=choices.find(x=>x.id===id)??choices[0], plan=inputCents(price), avoidable=inputCents(avoid), extras=inputCents(extra);
 const candidate=plan!==null && plan>0?plan*local.population*12:null;
 const contract=candidate!==null && Number.isSafeInteger(candidate)?candidate:null;
 const gross=contract!==null && local.budget!==null?contract-local.budget:null;
 const badAvoid=avoidable!==null && local.budget!==null && avoidable>local.budget;
 const netBase=contract!==null && avoidable!==null && extras!==null && !badAvoid && local.budget!==null ? avoidable-contract-extras:null;
 const net=netBase!==null && Number.isSafeInteger(netBase)?netBase:null;
 return <section id="simulador-saude" className="card min-w-0 scroll-mt-24 p-5 sm:p-7">
   <h2 className="text-xl font-semibold">E se o governo pagasse plano de saúde para todos?</h2>
   <p className="mt-2 text-sm text-[var(--muted)]">O cálculo cobre os {digits.format(local.population)} moradores de {local.name}, mesmo quem já tem plano. O orçamento ao lado é só o de <strong>{local.scope}</strong>, não o gasto total do SUS naquele local. Uma mensalidade igual para todos representa o preço médio por pessoa no cenário, não uma cotação.</p>
   <div className="my-4 grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm font-medium">Local e governo do orçamento<select className="input" value={id} onChange={e=>{setId(e.target.value);setAvoid("");setExtra("");}}>{choices.map(c=><option key={c.id} value={c.id}>{c.name} · {c.scope}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">Mensalidade média do plano por pessoa (R$)<input className="input" inputMode="decimal" maxLength={12} placeholder="Ex.: 250,00" value={price} onChange={e=>setPrice(e.target.value)}/></label>
   </div>
   <div className="flex flex-wrap gap-2 text-sm"><span className="self-center text-[var(--muted)]">Preços ilustrativos, sem cotação:</span>{[100,250,500].map(v=><button key={v} type="button" className="btn" onClick={()=>setPrice(String(v))}>R$ {v}</button>)}</div>
   <div className="my-4 grid gap-3 sm:grid-cols-2 text-sm" aria-live="polite">
    <div className="rounded-lg border border-[var(--border-1)] p-3"><p>Saúde pública liquidada · 2025</p><strong className="text-lg">{local.budget===null?"Não informado":brl(local.budget)}</strong>{local.budget!==null && <p>{brl(local.budget/12)}/mês • {brl(local.budget/local.population/12)} por morador/mês</p>}</div>
    <div className="rounded-lg border border-[var(--border-1)] p-3"><p>Planos privados para toda a população</p><strong className="text-lg">{contract===null?"Informe uma mensalidade":brl(contract)+" por ano"}</strong>{contract!==null && <p>{brl(contract/12)}/mês, sem custos adicionais</p>}</div>
   </div>
   {gross!==null && <p className="my-3 text-sm"><strong>Comparação bruta:</strong> as mensalidades {gross===0?"igualam o orçamento informado":`ficariam ${brl(Math.abs(gross))} ${gross>0?"acima":"abaixo"} do orçamento anual informado`}. Isso não é economia líquida, pois parte da despesa pública continuaria.</p>}
   <h3 className="font-semibold">Simular economia ou gasto adicional</h3>
   <p className="mt-1 text-sm text-[var(--muted)]">Informe apenas o que deixaria de ser pago no orçamento selecionado. Não presuma o fim de vacinação, vigilância ou outros serviços que o contrato não substituiria.</p>
   <div className="my-4 grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm font-medium">Despesa pública anual que seria evitada (R$)<input className="input" inputMode="decimal" maxLength={19} value={avoid} onChange={e=>setAvoid(e.target.value)}/></label>
    <label className="grid gap-1 text-sm font-medium">Custos extras anuais do novo modelo (R$)<input className="input" inputMode="decimal" maxLength={19} value={extra} onChange={e=>setExtra(e.target.value)}/></label>
   </div>
   <div className="rounded-lg border border-[var(--border-1)] p-3 text-sm" aria-live="polite">
      {badAvoid ? <p>A despesa evitável não pode superar o orçamento usado como referência.</p>: net===null ? <p>{local.budget===null?"Ainda não há orçamento validado para estimar a diferença líquida.":"Preencha o orçamento evitável e o custo adicional para calcular o saldo."}</p> : <p><strong>{net>0?"Economia estimada":net<0?"Gasto adicional estimado":"Mesmo custo"}</strong>: {brl(Math.abs(net))} por ano · {brl(Math.abs(net)/12)}/mês, em média.</p>}
   </div>
   <p className="mt-3 text-xs text-[var(--muted)]">Um plano não equivale a todo o SUS. A contratação real depende de cobertura, idade, rede, coparticipação e condições do contrato. <a className="source-link" href="https://www.gov.br/saude/pt-br/campanhas-da-saude/2026/sus/sus">Serviços do SUS</a> · <a className="source-link" href="https://www.gov.br/ans/pt-br/publicidade-ans/contratacao-plano-de-saude">Cobertura e preços · ANS</a></p>
 </section>;
}
