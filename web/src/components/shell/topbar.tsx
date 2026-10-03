"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useShell } from "./shell-context";
import { CommandPalette, useCommandPaletteShortcut } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { BrandLockup } from "@/components/brand/brand-lockup";

export function Topbar() {
  const { header, analysisMode, setAnalysisMode, mobileNavOpen, setMobileNavOpen } = useShell();
  const pathname = usePathname();
  useCommandPaletteShortcut();

  const analysisAvailable = !pathname.startsWith("/grafo");
  useEffect(() => {
    if (!analysisAvailable && analysisMode) setAnalysisMode(false);
  }, [analysisAvailable, analysisMode, setAnalysisMode]);

  return (
    <div className="navbar-wrap">
      <div
        className="navbar-blur"
        aria-hidden
        style={{ backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      />
      <div className="navbar">
        <button
          type="button"
          className="btn btn--icon mobile-nav-toggle"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-label={mobileNavOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          data-mobile-nav-trigger
        >
          {mobileNavOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <BrandLockup className="brand-lockup--topbar" />
        <span className="crumb">{header.group}</span>
        {header.current ? (
          <>
            <span className="crumb crumb__sep">/</span>
            <span className="crumb__current">{header.current}</span>
          </>
        ) : null}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flex: "none" }}>
          {header.actions}
          {analysisAvailable ? (
            <button
              type="button"
              className={`btn${analysisMode ? " btn--fonte-active" : ""}`}
              onClick={() => setAnalysisMode(!analysisMode)}
              title="Modo análise: passe o mouse sobre um dado para destacá-lo, clique para ver a fonte"
              aria-label="Modo análise: mostrar fontes dos dados"
              aria-pressed={analysisMode}
            >
              <span aria-hidden="true">◎</span>
              <span className="btn-source-label">fonte</span>
            </button>
          ) : null}
          <ThemeToggle />
        </span>
        <CommandPaletteMount />
      </div>
    </div>
  );
}

function CommandPaletteMount() {
  const { paletteOpen } = useShell();
  return paletteOpen ? <CommandPalette /> : null;
}
