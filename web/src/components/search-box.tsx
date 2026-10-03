"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { SearchResult } from "@/lib/queries";
import { formatCpfCnpj } from "@/lib/format";
import { SearchAvatar } from "./search-avatar";

export function SearchBox() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { results: SearchResult[] }) => setResults(data.results ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmed]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function navigate(result: SearchResult) {
    setOpen(false);
    if (result.kind === "candidato") router.push(`/politico/${result.personId}`);
    else router.push(`/cpf/${result.cpf}`);
  }

  function submitFirstResult() {
    if (results[0]) navigate(results[0]);
  }

  const hasResults = results.length > 0;

  return (
    <div ref={rootRef} className="home-search">
      <label htmlFor="home-person-search" className="home-search__label">
        Pesquise uma pessoa, candidatura ou CPF
      </label>
      <div className="home-search__control">
        <Search className="home-search__icon" size={21} strokeWidth={2.2} aria-hidden="true" />
        <input
          id="home-person-search"
          ref={inputRef}
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (next.trim().length < 2) {
              setResults([]);
              setLoading(false);
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitFirstResult();
            }
          }}
          placeholder="NOME DO SEU CANDIDATO"
          autoComplete="off"
          role="combobox"
          aria-controls="home-search-results"
          aria-expanded={open && trimmed.length >= 2}
          aria-autocomplete="list"
          aria-haspopup="listbox"
        />
        <kbd className="home-search__shortcut">Ctrl K</kbd>
      </div>
      {open && trimmed.length >= 2 ? (
        <div id="home-search-results" className="home-search__results" role="listbox" aria-label="Resultados da pesquisa">
          {loading ? (
            <div className="home-search__empty" role="status">Buscando em todos os registros…</div>
          ) : !hasResults ? (
            <div className="home-search__empty">Nenhuma pessoa encontrada.</div>
          ) : (
            results.map((result) => {
              const key = result.kind === "candidato" ? `candidate-${result.personId}` : `person-${result.cpf}`;
              const subtitle = result.kind === "candidato"
                ? [result.latestOffice, result.latestPartyAbbr, result.latestState, result.latestYear].filter(Boolean).join(" · ")
                : "Pessoa física · doador ou fornecedor";
              const identifier = result.cpf ? formatCpfCnpj(result.cpf) : null;

              return (
                <button
                  key={key}
                  type="button"
                  className="home-search__result"
                  role="option"
                  aria-selected="false"
                  onClick={() => navigate(result)}
                >
                  <SearchAvatar
                    photoUrl={result.kind === "candidato" ? result.photoUrl : null}
                    name={result.canonicalName}
                  />
                  <span className="home-search__result-copy">
                    <span className="home-search__result-name">{result.canonicalName}</span>
                    <span className="home-search__result-detail">{subtitle}{identifier ? ` · ${identifier}` : ""}</span>
                  </span>
                  <span className="home-search__result-kind">{result.kind === "candidato" ? "candidatura" : "pessoa"}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
