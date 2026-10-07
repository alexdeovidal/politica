"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  Building2,
  CircleDollarSign,
  FileText,
  GitCompareArrows,
  HandCoins,
  Home,
  Info,
  MessageSquareText,
  MapPinned,
  Network,
  Newspaper,
  ReceiptText,
  Radio,
  Search,
  type LucideIcon,
  X,
} from "lucide-react";
import type { SidebarCounts } from "@/lib/stats";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useShell } from "./shell-context";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  action?: "search";
  count?: number;
  alert?: boolean;
};

export function Sidebar({ counts }: { counts?: SidebarCounts }) {
  const pathname = usePathname();
  const { aiReviewEnabled, setPaletteOpen, mobileNavOpen, setMobileNavOpen } = useShell();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [openInfo, setOpenInfo] = useState<string | null>(null);

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

  const closeMobileNav = () => {
    setOpenInfo(null);
    setMobileNavOpen(false);
  };

  const top: NavLink[] = [
    { href: "/", label: "Visão geral", icon: Home, description: "Resumo do portal, dados disponíveis, atualização das fontes e acesso à pesquisa completa." },
    { href: "/news", label: "Notícias", icon: Newspaper, description: "Até cinco matérias automáticas por dia, com base nos dados públicos e nos candidatos mais consultados no portal." },
    { href: "/apuracao", label: "Apuração ao vivo · 2026", icon: Radio, description: "Acompanhe os resultados oficiais do TSE por estado, cidade, zona eleitoral e cargo, com atualização automática e modo de apresentação para TV." },
    { href: "/votos", label: "Raio-X Votos", icon: MapPinned, description: "Pesquise votos por eleição, turno, cargo, estado, município, zona, local e seção; compare candidaturas e veja sua evolução." },
    { href: "#pesquisar", label: "Pesquisar dados públicos", icon: Search, action: "search", description: "Pesquise candidatos, empresas e pessoas físicas por nome, CPF ou CNPJ, incluindo doadores e fornecedores de campanhas." },
    { href: "/grafo", label: "Relações entre pessoas e empresas", icon: Network, description: "Explore relações encontradas nos registros públicos, como doações, despesas contratadas e vínculos empresariais." },
    { href: "/ranking", label: "Patrimônio declarado", icon: FileText, description: "Consulte bens declarados por candidatos nas eleições disponíveis na base." },
    { href: "/emendas", label: "Emendas parlamentares", icon: HandCoins, description: "Consulte emendas atribuídas a parlamentares e os valores registrados nas fontes públicas." },
  ];
  const ferramentas: NavLink[] = [
    {href:"/conexoes",label:"Como se conectam?",icon:Network,description:"Encontre um caminho entre duas pessoas ou empresas e confira os registros que compõem as relações."},
    {href:"/redes",label:"Publicações e temas",icon:MessageSquareText,description:"Pesquise textos públicos coletados, com data, tema e acesso ao contexto original."},
    {href:"/ficha-publica",label:"Minha ficha pública",icon:FileText,description:"Solicite correção com evidência ou publique esclarecimento a partir de um domínio declarado ao TSE."},
    {href:"/explorar",label:"Minha cidade e candidaturas",icon:Search,description:"Encontre candidaturas por estado, município, cargo e eleição."},
    {href:"/acompanhar",label:"Minhas consultas",icon:Home,description:"Guarde perfis, consultas e comparações neste navegador para voltar depois."},
    {href:"/fontes",label:"Fontes e atualização",icon:Info,description:"Veja a coleta de cada fonte e a cobertura disponível."},
    { href: "/comparar", label: "Comparar candidaturas", icon: GitCompareArrows, description: "Compare até três candidaturas, incluindo votos, bens declarados, doações e despesas registradas." },
  ];
  const sinais: NavLink[] = [
    { href: "/sinais/doacao-circular", label: "Ciclos de recursos eleitorais", icon: CircleDollarSign, description: "Mostra ciclos entre doações e despesas contratadas identificados entre candidaturas e pessoas ou organizações. É um sinal para consulta, não prova de irregularidade.", count: counts?.circularDonations, alert: true },
    { href: "/sinais/despesa-desproporcional", label: "Despesas fora do padrão", icon: ReceiptText, description: "Aponta despesas com valores atípicos para a categoria informada. Cada caso precisa ser conferido na fonte oficial.", count: counts?.disproportionateExpense },
    { href: "/sinais/socio-fornecedor", label: "Sócios de fornecedores", icon: Building2, description: "Relaciona fornecedores de campanhas a informações públicas de quadro societário. Coincidências de nome podem exigir verificação.", count: counts?.supplierPartner },
    ...(aiReviewEnabled ? [{ href: "/sinais/analise-ia", label: "Análise automatizada de sinais", icon: BrainCircuit, description: "Apresenta uma leitura automatizada de sinais já encontrados nos dados. Não constitui conclusão nem acusação.", count: counts?.aiReview }] : []),
    { href: "/sinais/discurso", label: "Atividade em redes sociais", icon: MessageSquareText, description: "Consulte publicações públicas associadas a candidatos e aos temas acompanhados pelo portal.", count: counts?.discourse, alert: true },
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
              aria-label="Pesquisar candidatos, empresas e pessoas físicas"
              title="Pesquisar dados públicos (Ctrl K)"
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
          <NavGroup title="Consultar dados" links={top} pathname={pathname} onNavigate={closeMobileNav} onSearch={() => setPaletteOpen(true)} openInfo={openInfo} setOpenInfo={setOpenInfo} />
          <NavGroup title="Ferramentas" links={ferramentas} pathname={pathname} onNavigate={closeMobileNav} onSearch={() => setPaletteOpen(true)} openInfo={openInfo} setOpenInfo={setOpenInfo} />
          <NavGroup title="Sinais para conferir" links={sinais} pathname={pathname} onNavigate={closeMobileNav} onSearch={() => setPaletteOpen(true)} openInfo={openInfo} setOpenInfo={setOpenInfo} />
        </nav>
        <div className="app-sidebar__footer">
          <span className="app-sidebar__footer-dot" aria-hidden="true" />
          <span>PLATAFORMA INDEPENDENTE · DADOS PÚBLICOS</span>
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
  onSearch,
  openInfo,
  setOpenInfo,
}: {
  title: string;
  links: NavLink[];
  pathname: string;
  onNavigate: () => void;
  onSearch: () => void;
  openInfo: string | null;
  setOpenInfo: (key: string | null) => void;
}) {
  return (
    <div className="app-sidebar__group">
      <div className="app-sidebar__section-label">{title}</div>
      <div className="navmenu__items">
        {links.map((l) => {
          const infoId = `nav-info-${l.href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
          const infoIsOpen = openInfo === l.href;
          return (
            <div key={l.href} className={`navitem-entry${infoIsOpen ? " is-info-open" : ""}`}>
              <div className="navitem-entry__row">
                <Link
                  href={l.href}
                  prefetch={false}
                  className={`navitem${pathname === l.href || (l.href !== "/" && pathname.startsWith(`${l.href}/`)) ? " is-active" : ""}`}
                  onClick={(event) => {
                    onNavigate();
                    if (l.action === "search") {
                      event.preventDefault();
                      onSearch();
                    }
                  }}
                >
                  <l.icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span className="navitem__label">{l.label}</span>
                  {l.count != null ? (
                    <span className={`navitem__count${l.alert && l.count > 0 ? " navitem__count--alert" : ""}`}>
                      {l.count.toLocaleString("pt-BR")}
                    </span>
                  ) : null}
                </Link>
                <button
                  type="button"
                  className="navitem__info"
                  aria-label={`O que significa: ${l.label}`}
                  aria-expanded={infoIsOpen}
                  aria-controls={infoId}
                  aria-describedby={infoIsOpen ? infoId : undefined}
                  title={`Sobre: ${l.label}`}
                  onClick={() => setOpenInfo(infoIsOpen ? null : l.href)}
                >
                  <Info size={15} aria-hidden="true" />
                </button>
              </div>
              {infoIsOpen ? (
                <div id={infoId} className="navitem__info-popover" role="tooltip">
                  <strong>{l.label}</strong>
                  <span>{l.description}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
