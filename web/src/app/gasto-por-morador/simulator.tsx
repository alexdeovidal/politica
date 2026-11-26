"use client";

import { useState } from "react";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const count = new Intl.NumberFormat("pt-BR");
const caldasPrices = [
  { name: "Escola Aero Isa", cents: 77770, url: "https://www.melhorescola.com.br/escola/escola-aero-isa" },
  { name: "Centro Educacional Infantil Crescer", cents: 90000, url: "https://www.melhorescola.com.br/escola/centro-educacional-infantil-crescer" },
];
const caldasMean = Math.round(caldasPrices.reduce((sum, row) => sum + row.cents, 0) / caldasPrices.length);

export function PrivateSchoolSimulator({ entities }: { entities: { code: string; name: string; count: number }[] }) {
  const [code, setCode] = useState(entities[0].code);
  const [monthly, setMonthly] = useState("");
  const [payments, setPayments] = useState("12");
  const entity = entities.find(x => x.code === code) ?? entities[0];
  const cents = /^\d{1,6}([,.]\d{1,2})?$/.test(monthly.trim()) ? Math.round(Number(monthly.trim().replace(",", ".")) * 100) : null;
  const annual = cents != null && cents > 0 ? cents * Number(payments) : null;
  return <section id="simulador" className="card scroll-mt-24 p-5 sm:p-7">
    <h2 className="text-xl font-semibold">E se essas matrículas fossem na rede particular?</h2>
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">Informe uma mensalidade de referência. Não encontrei uma média representativa de Caldas Novas para o ano letivo de 2025. Abaixo há uma amostra local, separada dos dados de 2025. O resultado é um cenário de mensalidades, não previsão de economia nem comparação de custo ou qualidade entre redes.</p>
    <div className="mt-4 rounded-xl border border-[var(--border-1)] bg-[var(--bg)] p-4 text-sm">
      <h3 className="font-semibold">Amostra particular · Caldas Novas</h3>
      <p className="mt-1 text-[var(--muted)]">Dois preços de entrada anunciados sem bolsa, do Ensino Fundamental I. Consulta em 26/11/2026. A vigência das duas mensalidades para o ano letivo de 2025 não foi confirmada. Não representa a média da cidade.</p>
      <ul className="my-2 grid gap-1">{caldasPrices.map(row => <li key={row.name}>
        <a className="source-link" href={row.url}>{row.name}</a> · {brl.format(row.cents/100)} por mês
      </li>)}</ul>
      <p><strong>{brl.format(caldasMean/100)} por mês</strong> na média simples destes dois anúncios · {brl.format(caldasMean*12/100)} em 12 parcelas.</p>
      <button className="btn mt-3" type="button" onClick={() => { setCode("5204508"); setMonthly((caldasMean/100).toFixed(2).replace(".", ",")); setPayments("12"); }}>Usar amostra de Caldas na simulação</button>
    </div>
    <div className="my-5 grid gap-3 sm:grid-cols-3">
      <label className="grid gap-2 text-sm font-medium">Rede<select className="input" value={code} onChange={event=>{setCode(event.target.value);setMonthly("");}}>
        {entities.map(row=><option value={row.code} key={row.code}>{row.name}</option>)}
      </select></label>
      <label className="grid gap-2 text-sm font-medium">Mensalidade de referência (R$)
        <input className="input" type="text" inputMode="decimal" maxLength={10} placeholder="Ex.: 850,00" value={monthly} onChange={event=>setMonthly(event.target.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">Parcelas por ano
        <select className="input" value={payments} onChange={event=>setPayments(event.target.value)}>
          {[10,11,12].map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
    <div className="rounded-xl border border-[var(--border-1)] bg-[var(--bg)] p-4 text-sm" aria-live="polite">
      <p>{count.format(entity.count)} matrículas da {entity.name.toLocaleLowerCase("pt-BR")} · Censo Escolar 2025</p>
      {annual !== null ? <p className="mt-2 break-words"><strong className="text-xl">{brl.format(annual * entity.count / 100)}</strong> no cenário anual · {brl.format(annual / 100)} por matrícula</p> :
        <p className="mt-2 text-[var(--muted)]">{monthly.trim() ? "Informe uma mensalidade positiva, com até duas casas decimais e sem separador de milhar." : "Preencha a mensalidade para calcular."}</p>}
    </div>
    <p className="mt-3 text-xs text-[var(--muted)]">A multiplicação aplica o mesmo preço a todas as matrículas escolhidas, inclusive as de outras etapas. Não inclui transporte, material, alimentação, apoio especializado ou outros custos além da mensalidade.</p>
    <p className="mt-2 text-xs text-[var(--muted)]">Para consultar preços, veja a <a className="source-link" href="https://goias.gov.br/pesquisa-de-precos-de-mensalidades-do-procon-aponta-diferenca-de-196-em-escolas-de-uma-mesma-regiao/">pesquisa do Procon Goiás para Goiânia, ano letivo 2027</a>. É uma amostra por série e turno na capital, não uma média de Goiás nem de Caldas Novas.</p>
  </section>;
}
