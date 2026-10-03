"use client";

import { useState } from "react";
import type { Provenance } from "@/lib/queries";
import { Modal } from "./ui/modal";
import { useShell } from "./shell/shell-context";

function formatDate(iso: string): string {
  try {
    return (
      new Date(iso).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    );
  } catch {
    return iso;
  }
}

function officialSourceUrl(provenance: Provenance): string {
  try {
    const sourceUrl = new URL(provenance.url);
    const path = sourceUrl.pathname.toLowerCase();
    const year = path.match(/20\d{2}/)?.[0];
    const isTse = /(^|\.)tse\.jus\.br$/.test(sourceUrl.hostname);
    if (isTse && /prestacao_contas|prestacao_de_contas/.test(path)) {
      return `https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-${year ?? "2026"}`;
    }
    if (isTse && /consulta_cand|bem_candidato|rede_social_candidato/.test(path)) {
      return `https://dadosabertos.tse.jus.br/pt_BR/dataset/candidatos-${year ?? "2026"}`;
    }
    if (isTse && /processual/.test(path)) {
      return `https://dadosabertos.tse.jus.br/pt_BR/dataset/processual-${year ?? "2026"}`;
    }
    if (isTse && /votacao_secao|resultados|resultado_eleitoral/.test(path)) {
      return `https://dadosabertos.tse.jus.br/pt_BR/dataset/resultados-${year ?? "2026"}`;
    }
    if (isTse && /cdn\.tse\.jus\.br/.test(sourceUrl.hostname)) {
      return "https://dadosabertos.tse.jus.br/pt_BR";
    }
    return provenance.url;
  } catch {
    return provenance.url;
  }
}

function sourceLabel(provenance: Provenance): string {
  return /TSE|Tribunal Superior Eleitoral/i.test(`${provenance.agency} ${provenance.sourceName}`)
    ? "Fonte oficial TSE"
    : "Fonte oficial";
}

function SourceLink({ provenance, inline = false }: { provenance: Provenance; inline?: boolean }) {
  const url = officialSourceUrl(provenance);
  return (
    <a
      className={`source-link${inline ? " source-link--inline" : ""}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir fonte oficial: ${provenance.agency} · ${provenance.sourceName}`}
      aria-label={`Abrir fonte oficial: ${provenance.agency} · ${provenance.sourceName}`}
    >
      {sourceLabel(provenance)}
    </a>
  );
}

export function SourceZone({
  provenance, children, inline = false, as, className,
}: {
  provenance: Provenance | null;
  children: React.ReactNode;
  inline?: boolean;
  /** "tr" wraps a table row; globals.css skips position/transform for it (breaks table layout). */
  as?: "div" | "span" | "tr";
  className?: string;
}) {
  const { analysisMode } = useShell();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  if (!provenance) {
    if (!as) return <>{children}</>;
    const PlainTag = as;
    return <PlainTag className={className}>{children}</PlainTag>;
  }

  const Tag = as ?? (inline ? "span" : "div");
  const wrapperClass = analysisMode
    ? `source-zone${hover ? " source-zone--hover" : ""}${className ? ` ${className}` : ""}`
    : className;
  return (
    <>
      <Tag
        className={wrapperClass}
        onMouseEnter={analysisMode ? () => setHover(true) : undefined}
        onMouseLeave={analysisMode ? () => setHover(false) : undefined}
        onClickCapture={analysisMode ? (e: React.MouseEvent) => {
          if ((e.target as HTMLElement).closest("a, button, [role='button']")) return;
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        } : undefined}
      >
        {children}
        {as === "tr" ? <td className="source-link-cell"><SourceLink provenance={provenance} /></td> : (
          <SourceLink provenance={provenance} inline={inline} />
        )}
      </Tag>
      {/* Sibling, not child: nested, onClickCapture would swallow the modal's close click. */}
      {open ? <ProvenanceModal provenance={provenance} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function ProvenanceModal({ provenance, onClose }: { provenance: Provenance; onClose: () => void }) {
  return (
    <Modal title="proveniência" onClose={onClose}>
      <dl className="seal__body">
        <Row label="fonte" value={provenance.sourceName} />
        <Row label="órgão" value={provenance.agency} />
        <Row
          label="url"
          value={
            <a href={provenance.url} target="_blank" rel="noreferrer">
              {provenance.url}
            </a>
          }
        />
        <Row label="coletado em" value={formatDate(provenance.accessedAt)} />
        <Row label="sha256" value={provenance.sha256} />
        <Row label="parser" value={`${provenance.parserName} v${provenance.parserVersion}`} />
        {provenance.legalBasis ? <Row label="base legal" value={provenance.legalBasis} /> : null}
      </dl>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
