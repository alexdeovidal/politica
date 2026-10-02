"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_COLOR, NODE_KIND_LABEL, type GraphNodeData } from "./types";

export function EntityNode({ data, selected }: NodeProps & { data: GraphNodeData }) {
  const color = NODE_COLOR[data.kind];
  const d = data.radius * 2;
  const big = data.kind === "politician" || data.kind === "self";
  const ringColor = data.circular ? "var(--red)" : color.stroke;
  const showPhoto = big && !data.loading && !data.circular && !data.sanctioned && data.photoUrl != null;
  const initials = getEntityInitials(data.label);

  return (
    <div className="flex w-[132px] flex-col items-center gap-1.5" title={data.label}>
      <Handle type="source" position={Position.Top} id="s" style={handleStyle} />
      <Handle type="target" position={Position.Top} id="t" style={handleStyle} />

      <div
        className="relative flex items-center justify-center overflow-hidden rounded-full transition-shadow"
        style={{
          width: d,
          height: d,
          background: color.fill,
          border: `${selected ? 3 : data.circular ? 2.6 : big ? 2.5 : 1.6}px solid ${ringColor}`,
          boxShadow: data.circular
            ? "0 0 0 3px var(--red-tint), 0 4px 18px rgba(0,0,0,.5)"
            : selected
              ? `0 0 0 3px ${color.stroke}33, 0 4px 18px rgba(0,0,0,.5)`
              : "0 2px 10px rgba(0,0,0,.4)",
        }}
      >
        {showPhoto ? (
          <NodePhoto url={data.photoUrl!} fallback={initials} color={color.text} />
        ) : data.loading ? (
          <span
            className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
            style={{ borderTopColor: color.stroke }}
          />
        ) : data.circular ? (
          <span className="text-[13px]" style={{ color: "var(--red)" }}>↻</span>
        ) : data.sanctioned ? (
          <span className="text-[13px]">⚠</span>
        ) : (
          <span
            aria-hidden="true"
            className="select-none font-mono font-bold leading-none tracking-[-0.08em]"
            style={{
              color: color.text,
              fontSize: Math.max(9, Math.min(15, d * 0.34)),
            }}
          >
            {initials}
          </span>
        )}
      </div>

      <div
        className={`graph-entity-label max-w-[132px] truncate rounded-sm px-1.5 py-0.5 text-center font-mono text-[9.5px]${
          data.compact ? " graph-entity-label--compact" : ""
        }`}
        style={{ color: data.circular ? "var(--red)" : color.text }}
      >
        {data.label}
      </div>
      {!data.compact ? (
        <div className="font-mono text-[7.5px] tracking-[0.1em] text-[var(--muted-2)] uppercase">
          {data.circular ? "doação circular" : NODE_KIND_LABEL[data.kind]}
        </div>
      ) : null}
    </div>
  );
}

const INITIALS_IGNORED_WORDS = new Set([
  "a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "em", "para", "por",
  "ltda", "me", "epp", "sa", "s/a", "s.a.", "cia", "companhia",
]);

function getEntityInitials(label: string): string {
  const normalized = label.trim().replace(/\s+/g, " ");
  if (!normalized) return "?";
  if (/^sem nome$/i.test(normalized)) return "SN";

  const words = normalized
    .split(" ")
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) =>
      word &&
      !/^\p{N}+$/u.test(word) &&
      !INITIALS_IGNORED_WORDS.has(word.toLocaleLowerCase("pt-BR"))
    );
  const usefulWords = words.length > 0 ? words : normalized.split(" ");
  if (usefulWords.length === 1) return Array.from(usefulWords[0]).slice(0, 2).join("").toLocaleUpperCase("pt-BR");
  return usefulWords.slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase("pt-BR");
}

// TSE CDN URL is undocumented and can 404; show the entity initials if it does.
function NodePhoto({ url, fallback, color }: { url: string; fallback: string; color: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className="select-none font-mono font-bold leading-none tracking-[-0.08em]"
        style={{ color, fontSize: 15 }}
      >
        {fallback}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external TSE CDN, not a Next-optimizable local asset
    <img src={url} alt="" className="absolute inset-0 size-full object-cover" onError={() => setFailed(true)} />
  );
}

const handleStyle = { opacity: 0, pointerEvents: "none" as const };
