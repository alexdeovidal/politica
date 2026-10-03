"use client";

import { useState } from "react";
import type { DeclaredAsset, DeclaredAssetsYearSummary } from "@/lib/queries";
import {normalizeName} from "@/lib/normalize";
import { formatBRL } from "@/lib/format";
import { Modal } from "./ui/modal";
import { SourceZone } from "./source-zone";

export function AssetsYearCards({
  byYear, assets,
}: { byYear: DeclaredAssetsYearSummary[]; assets: DeclaredAsset[] }) {
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [q,setQ]=useState("");
  const [fromYear,setFromYear]=useState(byYear[0]?.year||0);
  const [toYear,setToYear]=useState(byYear.at(-1)?.year||0);
  const start=byYear.find(y=>y.year===fromYear),end=byYear.find(y=>y.year===toYear);
  const [type,setType]=useState("");
  const yearAssets = assets.filter((a) => a.year === openYear && (!type||a.assetType===type) && normalizeName(`${a.assetType||""} ${a.description||""}`).includes(normalizeName(q)));

  return (
    <>
      {byYear.length>1&&<details className="card my-3"><summary>Comparar evolução do patrimônio declarado</summary><div className="platform-form my-3"><label>De<select value={fromYear} onChange={e=>setFromYear(Number(e.target.value))}>{byYear.map(y=><option key={y.year}>{y.year}</option>)}</select></label><label>Até<select value={toYear} onChange={e=>setToYear(Number(e.target.value))}>{byYear.map(y=><option key={y.year}>{y.year}</option>)}</select></label></div>{start&&end&&!start.missingValues&&!end.missingValues?<p>Variação nominal: {formatBRL(end.totalCents-start.totalCents)}{start.totalCents?` · ${((end.totalCents/start.totalCents-1)*100).toFixed(1).replace(".",",")}%`:" · percentual não calculado porque a base é zero"}. Valores declarados em anos diferentes, sem ajuste de inflação; isso não demonstra origem ou ganho financeiro.</p>:<p>Há valores não informados nas declarações selecionadas. Não é possível calcular uma variação completa.</p>}<a className="source-link" href={`https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-${toYear}`} target="_blank" rel="noopener noreferrer">Fonte oficial · declaração do ano final</a></details>}
      <div className="flex flex-wrap gap-2">
        {byYear.map((y) => (
          <button
            key={y.year}
            type="button"
            className="card"
            style={{ padding: "10px 14px", cursor: "pointer", textAlign: "left" }}
            onClick={() => {setOpenYear(y.year);setQ("");setType("");}}
          >
            <div className="label">{y.year}</div>
            <div className="num mt-1" style={{ fontSize: 16 }}>{y.count===(y.missingValues||0)?"Valores não informados":formatBRL(y.totalCents)}</div>
            <div className="mono mt-0.5" style={{ fontSize: 10, color: "var(--muted-2)" }}>
              {y.count.toLocaleString("pt-BR")} {y.count === 1 ? "bem" : "bens"}{y.missingValues?` · ${y.missingValues} sem valor informado; total soma os valores conhecidos`:""}
            </div>
          </button>
        ))}
      </div>

      {openYear != null ? (
        <Modal title={`bens declarados em ${openYear}`} onClose={() => setOpenYear(null)}>
          <div className="platform-form"><label>Pesquisar todos os bens desta eleição<input value={q} onChange={e=>setQ(e.target.value)}/></label><label>Tipo<select value={type} onChange={e=>setType(e.target.value)}><option value="">Todos</option>{[...new Set(assets.filter(a=>a.year===openYear).map(a=>a.assetType).filter(Boolean))].map(t=><option key={t!}>{t}</option>)}</select></label></div>
          <p className="text-sm my-3">Valores não informados são identificados individualmente; não equivalem a zero. As declarações refletem o patrimônio informado em cada eleição.</p>
          <div className="flex flex-col gap-3">
            {yearAssets.map((a) => (
              <SourceZone key={a.id} provenance={a.provenance}>
                <div className="card" style={{ padding: "10px 12px" }}>
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1">
                      {a.assetType ? (
                        <div className="text-[13px]" style={{ color: "var(--fg-2)" }}>{a.assetType}</div>
                      ) : null}
                      {a.description ? (
                        <div className="mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>{a.description}</div>
                      ) : null}
                    </div>
                    <span className="num flex-none" style={{ fontSize: 14 }}>{a.valueMissing?"Valor não informado":formatBRL(a.valueCents)}</span>
                  </div>
                  {a.sourceUpdatedAt ? (
                    <div className="mono mt-1.5" style={{ fontSize: 10, color: "var(--muted-2)" }}>
                      atualizado em {a.sourceUpdatedAt}
                    </div>
                  ) : null}
                </div>
              </SourceZone>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
