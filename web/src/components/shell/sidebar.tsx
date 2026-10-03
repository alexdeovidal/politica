"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  Building2,
  CircleDollarSign,
  FileText,
  HandCoins,
  Home,
  MessageSquareText,
  Network,
  ReceiptText,
  Search,
  type LucideIcon,
  X,
} from "lucide-react";
import type { SidebarCounts } from "@/lib/stats";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useShell } from "./shell-context";

type NavLink = { href: string; label: string; icon: LucideIcon; count?: number; alert?: boolean };

export function Sidebar({ counts }: { counts: SidebarCounts }) {
  const pathname = usePathname();
  const { aiReviewEnabled, setPaletteOpen, mobileNavOpen, setMobileNavOpen } = useShell();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const focusBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflowBeforeOpen = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        document.querySelectorAll<HTMLElement>(
          "#primary-navigation a[href], #primary-navigation button:not([disabled])",
        ),
      );
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileNavOpen(false);
    };
    const desktopLayout = window.matchMedia("(min-width: 1024px)");

    window.addEventListener("keydown", handleKeyDown);
    desktopLayout.addEventListener("change", closeOnDesktop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      desktopLayout.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = bodyOverflowBeforeOpen;
      focusBeforeOpen?.focus();
    };
  }, [mobileNavOpen, setMobileNavOpen]);

  const closeMobileNav = () => setMobileNavOpen(false);

  const top: NavLink[] = [
    { href: "/", label: "Início", icon: Home },
    { href: "/grafo", label: "Grafo de correlações", icon: Network },
    { href: "/ranking", label: "Bens declarados", icon: FileText },
    { href: "/emendas", label: "Emendas parlamentares", icon: HandCoins },
  ];
  const sinais: NavLink[] = [
    { href: "/sinais/doacao-circular", label: "Doação circular", icon: CircleDollarSign, count: counts.circularDonations, alert: true },
    { href: "/sinais/despesa-desproporcional", label: "Despesa desproporcional", icon: ReceiptText, count: counts.disproportionateExpense },
    { href: "/sinais/socio-fornecedor", label: "Sócio de fornecedor", icon: Building2, count: counts.supplierPartner },
    ...(aiReviewEnabled ? [{ href: "/sinais/analise-ia", label: "Análise de IA", icon: BrainCircuit, count: counts.aiReview }] : []),
    { href: "/sinais/discurso", label: "Discurso em rede social", icon: MessageSquareText, count: counts.discourse, alert: true },
  ];

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          className="mobile-nav-backdrop"
          onClick={closeMobileNav}
          aria-label="Fechar menu de navegação"
          tabIndex={-1}
        />
      ) : null}
      <aside
        id="primary-navigation"
        className={`app-sidebar${mobileNavOpen ? " is-open" : ""}`}
        role={mobileNavOpen ? "dialog" : undefined}
        aria-label={mobileNavOpen ? "Menu de navegação" : undefined}
        aria-modal={mobileNavOpen ? true : undefined}
      >
        <div className="app-sidebar__top">
          <BrandLockup />
          <div className="app-sidebar__tools">
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => {
                closeMobileNav();
                setPaletteOpen(true);
              }}
              aria-label="Buscar"
              title="Buscar (Ctrl K)"
            >
              <Search size={16} strokeWidth={1.9} aria-hidden="true" />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="btn btn--icon app-sidebar__close"
              onClick={closeMobileNav}
              aria-label="Fechar menu de navegação"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav className="app-sidebar__nav" aria-label="navegação principal">
          <NavGroup title="Consulta" links={top} pathname={pathname} onNavigate={closeMobileNav} />
          <NavGroup title="Sinais e análises" links={sinais} pathname={pathname} onNavigate={closeMobileNav} />
        </nav>
        <div className="app-sidebar__footer">
          <span className="app-sidebar__footer-dot" aria-hidden="true" />
          <span>PLATAFORMA INDEPENDENTE</span>
        </div>
      </aside>
    </>
  );
}

function NavGroup({
  title,
  links,
  pathname,
  onNavigate,
}: {
  title: string;
  links: NavLink[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="app-sidebar__group">
      <div className="app-sidebar__section-label">{title}</div>
      <div className="navmenu__items">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`navitem${pathname === l.href ? " is-active" : ""}`}
            onClick={onNavigate}
          >
            <l.icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="navitem__label">{l.label}</span>
            {l.count != null ? (
              <span className={`navitem__count${l.alert && l.count > 0 ? " navitem__count--alert" : ""}`}>
                {l.count.toLocaleString("pt-BR")}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
