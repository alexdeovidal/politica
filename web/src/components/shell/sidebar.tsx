"use client";

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
} from "lucide-react";
import type { SidebarCounts } from "@/lib/stats";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useShell } from "./shell-context";

type NavLink = { href: string; label: string; icon: LucideIcon; count?: number; alert?: boolean };

export function Sidebar({ counts }: { counts: SidebarCounts }) {
  const pathname = usePathname();
  const { aiReviewEnabled, setPaletteOpen } = useShell();

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
    <aside className="app-sidebar">
      <div className="app-sidebar__top">
        <BrandLockup />
        <button
          type="button"
          className="btn btn--icon"
          onClick={() => setPaletteOpen(true)}
          aria-label="Buscar"
          title="Buscar (Ctrl K)"
        >
          <Search size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>

      <nav className="app-sidebar__nav" aria-label="navegação principal">
        <NavGroup title="Consulta" links={top} pathname={pathname} />
        <NavGroup title="Sinais e análises" links={sinais} pathname={pathname} />
      </nav>
      <div className="app-sidebar__footer">
        <span className="app-sidebar__footer-dot" aria-hidden="true" />
        <span>PLATAFORMA INDEPENDENTE</span>
      </div>
    </aside>
  );
}

function NavGroup({ title, links, pathname }: { title: string; links: NavLink[]; pathname: string }) {
  return (
    <div className="app-sidebar__group">
      <div className="app-sidebar__section-label">{title}</div>
      <div className="navmenu__items">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`navitem${pathname === l.href ? " is-active" : ""}`}>
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
