"use client";

import { useState } from "react";
import { inputCents, schoolScenario } from "@/lib/school-scenario";

const brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const amount=(cents:number)=>brl.format(cents/100);
const count=new Intl.NumberFormat("pt-BR");
const caldasPrices=[
 {name:"Escola Aero Isa",cents:77770,url:"https://www.melhorescola.com.br/escola/escola-aero-isa"},
 {name:"Centro Educacional Infantil Crescer",cents:90000,url:"https://www.melhorescola.com.br/escola/centro-educacional-infantil-crescer"},
];
const caldasMean=Math.round(caldasPrices.reduce((sum,row)=>sum+row.cents,0)/caldasPrices.length);
const stages=["Creche","Pré-escola","Ensino Fundamental I","Ensino Fundamental II","Ensino Médio","Outra etapa"];

export function PrivateSchoolSimulator({entities}:{entities:{code:string;name:string;count:number}[]}) {
 const [code,setCode]=useState(entities[0].code), [stage,setStage]=useState("");
 const [seats,setSeats]=useState(""), [monthly,setMonthly]=useState("");
 const [payments,setPayments]=useState("12"), [avoidable,setAvoidable]=useState(""), [extras,setExtras]=useState("");
 const entity=entities.find(x=>x.code===code);
 const n=/^\d{1,7}$/.test(seats.trim())?Number(seats):0, tuition=inputCents(monthly), avoid=inputCents(avoidable), additional=inputCents(extras);
 const estimate=stage && tuition!==null && avoid!==null && additional!==null ? schoolScenario({tuition,installments:Number(payments),seats:n,avoidable:avoid,extras:additional}) : null;
 const clear=()=>{setMonthly("");setAvoidable("");setExtras("");setSeats("");};
 return <section id="simulador" className="card min-w-0 scroll-mt-24 p-5 sm:p-7">
   <h2 className="text-xl font-semibold">O governo economizaria pagando escola particular?</h2>
   <p className="mt-2 text-sm text-[var(--muted)]">Compare a despesa pública que deixaria de existir com o custo de contratar vagas particulares para a <strong>mesma etapa e o mesmo grupo de alunos</strong>. O saldo é uma simulação, não uma economia comprovada ou uma proposta de contratação.</p>
   <div className="mt-4 rounded-xl border border-[var(--border-1)] bg-[var(--bg)] p-4 text-sm">
     <h3 className="font-semibold">Amostra particular · Caldas Novas</h3>
     <p className="mt-1 text-[var(--muted)]">Dois anúncios de entrada sem bolsa para Ensino Fundamental I, consultados em 26/11/2026. Não confirmados para 2025 e não representam a média da cidade.</p>
     <ul className="my-2 grid gap-1">{caldasPrices.map(r=><li key={r.name}><a className="source-link" href={r.url}>{r.name}</a> · {amount(r.cents)}/mês</li>)}</ul>
     <p><strong>{amount(caldasMean)}/mês</strong> na amostra · {amount(caldasMean*12)} em 12 parcelas.</p>
     <button className="btn mt-3" type="button" onClick={()=>{clear();setCode("5204508");setStage("Ensino Fundamental I");setMonthly((caldasMean/100).toFixed(2).replace(".",","));setPayments("12");}}>Usar preço da amostra de Caldas</button>
   </div>
   <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
     <label className="grid content-start gap-1 text-sm font-medium">Rede de referência
       <select className="input" value={code} onChange={e=>{setCode(e.target.value);setStage("");clear();}}>
         {entities.map(r=><option value={r.code} key={r.code}>{r.name}</option>)}<option value="custom">Outra rede · entrada manual</option>
       </select>{entity && <span className="text-xs font-normal text-[var(--muted)]">{count.format(entity.count)} matrículas somando todas as etapas; informe abaixo só a etapa selecionada.</span>}
     </label>
     <label className="grid content-start gap-1 text-sm font-medium">Etapa do ensino<select className="input" value={stage} onChange={e=>{setStage(e.target.value);clear();}}><option value="">Selecione</option>{stages.map(s=><option key={s}>{s}</option>)}</select></label>
     <label className="grid content-start gap-1 text-sm font-medium">Alunos atendidos na etapa<input className="input" inputMode="numeric" maxLength={7} value={seats} onChange={e=>setSeats(e.target.value)} placeholder="Ex.: 100" /></label>
     <label className="grid content-start gap-1 text-sm font-medium">Mensalidade por aluno (R$)<input className="input" inputMode="decimal" maxLength={16} value={monthly} onChange={e=>setMonthly(e.target.value)} placeholder="Ex.: 850,00" /></label>
     <label className="grid content-start gap-1 text-sm font-medium">Parcelas por ano<select className="input" value={payments} onChange={e=>setPayments(e.target.value)}>{[10,11,12].map(n=><option key={n}>{n}</option>)}</select></label>
     <label className="grid content-start gap-1 text-sm font-medium">Despesa pública anual que seria evitada (R$)<input className="input" inputMode="decimal" maxLength={19} value={avoidable} onChange={e=>setAvoidable(e.target.value)} placeholder="Ex.: 1.200.000,00" /><span className="text-xs font-normal text-[var(--muted)]">Não inclua salários, prédios ou serviços que continuariam sendo pagos.</span></label>
     <label className="grid content-start gap-1 text-sm font-medium">Custos extras anuais (R$)<input className="input" inputMode="decimal" maxLength={19} value={extras} onChange={e=>setExtras(e.target.value)} placeholder="Ex.: 50.000,00" /><span className="text-xs font-normal text-[var(--muted)]">Transporte, alimentação, apoio, administração etc. Informe 0 só se não houver extras.</span></label>
   </div>
   <div aria-live="polite" className="rounded-xl border border-[var(--border-1)] bg-[var(--bg)] p-4 text-sm">
     {estimate ? <>
       <p>Mensalidades anuais: <strong>{amount(estimate.tuitionAnnual)}</strong> · Custo total com extras: <strong>{amount(estimate.privateAnnual)}</strong></p>
       <p className="mt-2"><strong className="text-lg">{estimate.balance>0?"Economia estimada neste cenário":estimate.balance<0?"Gasto adicional estimado neste cenário":"Mesmo custo no cenário"}</strong></p>
       <p className="mt-1 break-words"><strong>{amount(Math.abs(estimate.balance))} por ano</strong> · {amount(Math.abs(estimate.balance)/12)} por mês, em média · {amount(Math.abs(estimate.balance)/n)} por aluno ao ano</p>
     </> : <p>Informe a etapa, a quantidade de alunos, a mensalidade, a despesa que seria evitada e os custos extras para calcular a diferença.</p>}
   </div>
   <p className="mt-3 text-xs text-[var(--muted)]">Compare valores do mesmo ano e serviços equivalentes. O orçamento total de educação inclui outras etapas e despesas que podem continuar mesmo com a contratação de vagas.</p>
 </section>;
}
