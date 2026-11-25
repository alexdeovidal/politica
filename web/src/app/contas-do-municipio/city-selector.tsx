"use client";
import { useState } from "react";
import Link from "next/link";
import { municipalHref, type Municipality } from "@/lib/municipal-registry";

type City = Omit<Municipality,"pncpOrg"> & {ready:boolean;hasContractsSource:boolean};
export default function CitySelector({cities}: {cities:readonly City[]}) {
  const states = [...new Map(cities.map(city => [city.uf, city.state]))]
    .sort((a,b) => a[1].localeCompare(b[1], "pt-BR"));
  const [uf, setUf] = useState(states.some(([id]) => id==="GO") ? "GO" : "");
  const [code, setCode] = useState("");
  const available = cities.filter(city => city.uf === uf)
    .sort((a,b) => a.name.localeCompare(b.name,"pt-BR"));
  const selected = available.find(city => city.code === code);
  const ready = (uf ? available : cities).filter(city=>city.ready);
  const link = (city:City) => municipalHref({...city,pncpOrg:null});
  return <>
    <div className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
      <label className="grid gap-2 font-medium">Estado<select className="rounded border border-[var(--border-2)] bg-[var(--surface)] p-3" value={uf} onChange={e => {setUf(e.target.value);setCode("");}}>
        <option value="">Selecione o estado</option>{states.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label className="grid gap-2 font-medium">Cidade<select className="rounded border border-[var(--border-2)] bg-[var(--surface)] p-3" disabled={!uf} value={code} onChange={e => setCode(e.target.value)}>
        <option value="">Selecione a cidade</option>{available.map(city => <option key={city.code} value={city.code}>{city.name}{city.ready ? "" : " · em validação"}</option>)}
      </select></label>
      {selected?.ready ? <Link className="btn" href={link(selected)} prefetch={false}>Abrir contas de {selected.name}</Link> : selected ? <p className="text-sm text-[var(--muted)]">Ainda sem painel fiscal validado.</p> :
        <p className="text-sm text-[var(--muted)]">Escolha uma cidade para abrir o painel.</p>}
    </div>
    <section aria-labelledby="municipios-publicados">
      <h2 id="municipios-publicados" className="mb-3 text-xl font-semibold">Municípios publicados</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ready.slice(0,24).map(city => <li key={city.code} className="card p-5">
          <Link href={link(city)} prefetch={false} className="font-semibold underline">{city.name} · {city.uf}</Link>
          <p className="mt-2 text-sm text-[var(--muted)]">{city.hasContractsSource ? "Execução orçamentária e consulta de contratos, com as fontes." : "Execução orçamentária do Tesouro; consulta de contratos em validação."}</p>
        </li>)}
      </ul>
      {ready.length===0 && <p className="text-sm text-[var(--muted)]">Nenhum painel publicado para esta seleção.</p>}
      {ready.length>24 && <p className="mt-3 text-sm text-[var(--muted)]">Mostrando 24 painéis. Use o seletor acima para acessar os demais.</p>}
    </section>
  </>;
}
