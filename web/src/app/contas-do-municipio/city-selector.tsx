"use client";
import { useState } from "react";
import Link from "next/link";
import { municipalities, municipalHref } from "@/lib/municipal-registry";

export default function CitySelector() {
  const states = [...new Map(municipalities.map(city => [city.uf, city.state]))]
    .sort((a,b) => a[1].localeCompare(b[1], "pt-BR"));
  const [uf, setUf] = useState(states.length === 1 ? states[0][0] : "");
  const [code, setCode] = useState("");
  const available = municipalities.filter(city => city.uf === uf)
    .sort((a,b) => a.name.localeCompare(b.name,"pt-BR"));
  const selected = available.find(city => city.code === code);
  return <>
    <div className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
      <label className="grid gap-2 font-medium">Estado<select className="rounded border border-[var(--border-2)] bg-[var(--surface)] p-3" value={uf} onChange={e => {setUf(e.target.value);setCode("");}}>
        <option value="">Selecione o estado</option>{states.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label className="grid gap-2 font-medium">Cidade<select className="rounded border border-[var(--border-2)] bg-[var(--surface)] p-3" disabled={!uf} value={code} onChange={e => setCode(e.target.value)}>
        <option value="">Selecione a cidade</option>{available.map(city => <option key={city.code} value={city.code}>{city.name}</option>)}
      </select></label>
      {selected ? <Link className="btn" href={municipalHref(selected)} prefetch={false}>Abrir contas de {selected.name}</Link> :
        <p className="text-sm text-[var(--muted)]">Escolha uma cidade para abrir o painel.</p>}
    </div>
    <section aria-labelledby="municipios-publicados">
      <h2 id="municipios-publicados" className="mb-3 text-xl font-semibold">Municípios publicados</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {(uf ? available : municipalities).map(city => <li key={city.code} className="card p-5">
          <Link href={municipalHref(city)} prefetch={false} className="font-semibold underline">{city.name} · {city.uf}</Link>
          <p className="mt-2 text-sm text-[var(--muted)]">{city.existing ? "Painel detalhado de receitas, despesas e contratos." : "Execução orçamentária e contratos recentes publicados no PNCP, com suas fontes."}</p>
        </li>)}
      </ul>
    </section>
  </>;
}
