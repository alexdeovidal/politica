"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Heart } from "lucide-react";
import { Modal } from "@/components/ui/modal";

const PIX_KEY = "09394478000118";
const REMINDER_STORAGE_KEY = "politica:contribution-reminder-shown";

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
          <p>Servidores e armazenamento têm custo. Seu Pix ajuda a manter os dados atualizados e o serviço gratuito.</p>
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

export function ContributionReminder() {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem(REMINDER_STORAGE_KEY) === "shown";
    } catch {}
    if (alreadyShown) return;

    let timeout: number | null = null;
    const startTimer = () => {
      if (document.visibilityState !== "visible" || timeout !== null) return;
      timeout = window.setTimeout(() => {
        timeout = null;
        try {
          window.sessionStorage.setItem(REMINDER_STORAGE_KEY, "shown");
        } catch {}
        setOpen(true);
      }, 30_000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timeout !== null) window.clearTimeout(timeout);
        timeout = null;
        return;
      }
      startTimer();
    };

    startTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  async function copyPixKey() {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  if (!open) return null;

  return (
    <Modal title="UMA AJUDA PARA MANTER O POLITICA" onClose={() => setOpen(false)}>
      <div className="contribution-reminder">
        <div className="contribution-reminder__lead">
          <span className="contribution-card__icon" aria-hidden="true">
            <Heart size={19} />
          </span>
          <div>
            <h2>Ajude a manter o POLITICA gratuito</h2>
            <p>
              Reunir milhões de informações públicas e deixá-las disponíveis para todos gera custos
              com servidores, armazenamento e atualizações. Se este sistema ajudou você, qualquer
              contribuição via Pix ajuda a manter os dados atualizados e o serviço no ar.
            </p>
          </div>
        </div>

        <div className="contribution-reminder__payment">
          <div className="contribution-card__key">
            <span className="label">Chave Pix · CNPJ</span>
            <code>09.394.478/0001-18</code>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={copyPixKey}
            aria-label="Copiar chave Pix para a área de transferência"
            autoFocus
          >
            {copyState === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copyState === "copied" ? "Chave copiada" : "Copiar chave Pix"}
          </button>
        </div>
        {copyState === "error" ? (
          <p className="contribution-reminder__status is-error" role="status">
            Não foi possível copiar. Selecione a chave acima.
          </p>
        ) : null}
        {copyState === "copied" ? (
          <p className="contribution-reminder__status" role="status">
            Chave copiada. Cole no app do seu banco e escolha o valor da contribuição.
          </p>
        ) : null}
        <button type="button" className="btn contribution-reminder__dismiss" onClick={() => setOpen(false)}>
          Continuar usando o POLITICA
        </button>
      </div>
    </Modal>
  );
}
