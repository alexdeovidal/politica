"use client";

import { useState } from "react";
import { Check, Copy, Heart } from "lucide-react";

const PIX_KEY = "09394478000118";

export function ContributionCard() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyPixKey() {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="contribution-card animate-in" aria-labelledby="contribution-title">
      <div className="contribution-card__message">
        <span className="contribution-card__icon" aria-hidden="true">
          <Heart size={19} />
        </span>
        <div>
          <div className="mono-label">APOIE O POLITICA</div>
          <h2 id="contribution-title">O POLITICA te ajudou?</h2>
          <p>Contribua com qualquer valor via Pix. Seu apoio ajuda a manter os dados atualizados.</p>
        </div>
      </div>

      <div className="contribution-card__actions">
        <div className="contribution-card__key">
          <span className="label">Chave Pix · CNPJ</span>
          <code>09.394.478/0001-18</code>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={copyPixKey}
          aria-label="Copiar chave Pix para a área de transferência"
        >
          {copyState === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copyState === "copied" ? "Chave copiada" : "Copiar chave Pix"}
        </button>
        {copyState === "error" ? (
          <span className="contribution-card__status is-error" role="status">
            Não foi possível copiar. Selecione a chave acima.
          </span>
        ) : null}
        {copyState === "copied" ? (
          <span className="contribution-card__status" role="status">
            Cole a chave no app do seu banco.
          </span>
        ) : null}
      </div>
    </section>
  );
}
