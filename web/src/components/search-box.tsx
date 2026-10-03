"use client";

import { Search } from "lucide-react";
import { useShell } from "./shell/shell-context";

export function SearchBox() {
  const { setPaletteOpen } = useShell();

  return (
    <div className="home-search">
      <div className="home-search__label">
        Pesquise candidatos, empresas ou pessoas físicas
      </div>
      <button
        type="button"
        className="home-search__control"
        onClick={() => setPaletteOpen(true)}
        aria-label="Abrir pesquisa de candidatos, empresas ou pessoas físicas"
      >
        <Search className="home-search__icon" size={21} strokeWidth={2.2} aria-hidden="true" />
        <span className="home-search__prompt">Nome, CPF ou CNPJ</span>
        <kbd className="home-search__shortcut">Ctrl K</kbd>
      </button>
      <p className="home-search__hint">
        Encontre também quem doou ou recebeu pagamentos nas prestações de contas eleitorais.
      </p>
    </div>
  );
}
