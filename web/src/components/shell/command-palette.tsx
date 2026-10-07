"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/queries";
import { formatCpfCnpj } from "@/lib/format";
import { SearchAvatar } from "@/components/search-avatar";
import { useShell } from "./shell-context";

const SHORTCUTS = [
  { href: "/", label: "Visão geral" },
  { href: "/news", label: "Notícias" },
  { href: "/explorar", label: "Minha cidade e candidaturas" },
  { href: "/grafo", label: "Relações entre pessoas e empresas" },
  { href: "/conexoes", label: "Como se conectam?" },
  { href: "/comparar", label: "Comparar candidaturas" },
  { href: "/fontes", label: "Fontes e atualização" },
  { href: "/acompanhar", label: "Minhas consultas" },
  { href: "/sinais/doacao-circular", label: "Ciclos de recursos eleitorais" },
  { href: "/sinais/socio-fornecedor", label: "Sócios de fornecedores" },
  { href: "/sinais/analise-ia", label: "Sinais · Análise de IA" },
  { href: "/sinais/discurso", label: "Atividade em redes sociais" },
];

export function useCommandPaletteShortcut() {
  const { paletteOpen, setPaletteOpen } = useShell();
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, setPaletteOpen]);
}

export function CommandPalette() {
  const { aiReviewEnabled, setPaletteOpen } = useShell();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPaletteOpen(false);
      if(e.key==='Tab'){
        const controls=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input,button:not([disabled]),a[href]')??[]);
        const first=controls[0],last=controls.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {document.removeEventListener("keydown", onKeyDown);document.body.style.overflow=previousOverflow;previousFocus?.focus();};
  }, [setPaletteOpen]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const trimmed = q.trim();
  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => {if(!r.ok)throw new Error('consulta indisponível');return r.json();})
        .then((d: { results: SearchResult[] }) => {if(!controller.signal.aborted){setResults(d.results);setSearchError("");}})
        .catch(() => {if(!controller.signal.aborted){setResults([]);setSearchError("Não foi possível consultar agora. Tente novamente.");}})
        .finally(() => {if(!controller.signal.aborted){setLoading(false);setSearchedQuery(trimmed);}});
    // Avoid piling synchronous SQLite searches onto the server while someone is still typing.
    }, 280);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [trimmed]);

  const shownResults = trimmed.length < 2 ? [] : results;

  const go = (href: string) => {
    setPaletteOpen(false);
    window.location.assign(href);
  };

  const shortcuts = SHORTCUTS.filter(
    (s) =>
      (aiReviewEnabled || s.href !== "/sinais/analise-ia") &&
      s.label.toLowerCase().includes(trimmed.toLowerCase())
  );

  return (
    <div className="palette__backdrop" onClick={() => setPaletteOpen(false)}>
      <div ref={dialogRef} className="palette" role="dialog" aria-modal="true" aria-label="Pesquisar dados públicos" onClick={(e) => e.stopPropagation()}>
        <div className="palette__input">
          <span className="mono" style={{ color: "var(--muted-2)" }}>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {setQ(e.target.value);setSearchedQuery("");}}
            placeholder="Nome, CPF ou CNPJ"
            aria-label="Pesquisar candidatos, empresas ou pessoas físicas por nome ou documento"
          />
          <button type="button" className="btn btn--icon" aria-label="Fechar pesquisa" title="Fechar pesquisa (Esc)" onClick={()=>setPaletteOpen(false)}>×</button>
        </div>
        <div className="palette__guide">
          <strong>Pesquise candidatos, empresas ou pessoas físicas.</strong>
          <span>Encontre também quem doou ou recebeu pagamentos nas prestações de contas eleitorais.</span>
        </div>
        <div className="palette__list">
          {trimmed.length < 2 ? (
            shortcuts.map((s) => (
              <button key={s.href} type="button" className="palette__row" onClick={() => go(s.href)}>
                {s.label}
                <span className="palette__group">ir para</span>
              </button>
            ))
          ) : loading || searchedQuery!==trimmed ? (
            <div className="palette__empty">Buscando…</div>
          ) : searchError ? (
            <div className="palette__empty" role="status">{searchError}</div>
          ) : shownResults.length === 0 && shortcuts.length === 0 ? (
            <div className="palette__empty">Nada encontrado nos registros públicos pesquisados.</div>
          ) : (
            <>
              {shortcuts.map((s) => (
                <button key={s.href} type="button" className="palette__row" onClick={() => go(s.href)}>
                  {s.label}
                  <span className="palette__group">ir para</span>
                </button>
              ))}
              {shownResults.map((r) =>
                r.kind === "candidato" ? (
                  <button
                    key={`c-${r.personId}`}
                    type="button"
                    className="palette__row"
                    onClick={() => go(`/politico/${r.personId}`)}
                  >
                    <SearchAvatar photoUrl={r.photoUrl} name={r.canonicalName} />
                    <span className="num" style={{ color: "var(--muted-2)", fontSize: 11 }}>
                      {r.cpf ? formatCpfCnpj(r.cpf) : "—"}
                    </span>
                    {r.canonicalName}
                    <span className="palette__group">
                      {r.latestOffice ?? "candidato"} {r.latestYear}
                    </span>
                  </button>
                ) : r.kind === "empresa" ? (
                  <button
                    key={`e-${r.cnpj}`}
                    type="button"
                    className="palette__row"
                    onClick={() => go(`/cnpj/${r.cnpj}`)}
                  >
                    <SearchAvatar photoUrl={null} name={r.canonicalName} />
                    <span className="num" style={{ color: "var(--muted-2)", fontSize: 11 }}>
                      {formatCpfCnpj(r.cnpj)}
                    </span>
                    {r.canonicalName}
                    <span className="palette__group">empresa</span>
                  </button>
                ) : r.kind === "socio" ? (
                  <button key={`s-${r.partnerId}`} type="button" className="palette__row" onClick={()=>go(`/socios/${r.partnerId}`)}><SearchAvatar photoUrl={null} name={r.canonicalName}/>{r.canonicalName}<span className="palette__group">Sócio · {r.companyName}</span></button>
                ) : (
                  <button
                    key={`p-${r.cpf}`}
                    type="button"
                    className="palette__row"
                    onClick={() => go(`/cpf/${r.cpf}`)}
                  >
                    <SearchAvatar photoUrl={null} name={r.canonicalName} />
                    <span className="num" style={{ color: "var(--muted-2)", fontSize: 11 }}>
                      {formatCpfCnpj(r.cpf)}
                    </span>
                    {r.canonicalName}
                    <span className="palette__group">pessoa física</span>
                  </button>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
