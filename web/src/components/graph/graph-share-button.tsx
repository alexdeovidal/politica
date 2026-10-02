"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, LoaderCircle, Share2, X } from "lucide-react";
import { SiFacebook, SiTelegram, SiWhatsapp, SiX } from "react-icons/si";

const SITE_ORIGIN = "https://politica007.com.br";

type ShareNetwork = {
  name: string;
  icon: typeof SiWhatsapp;
  url: (shareUrl: string, text: string) => string;
};

const networks: ShareNetwork[] = [
  {
    name: "WhatsApp",
    icon: SiWhatsapp,
    url: (shareUrl, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`,
  },
  {
    name: "Facebook",
    icon: SiFacebook,
    url: (shareUrl) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
  },
  {
    name: "X",
    icon: SiX,
    url: (shareUrl, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`,
  },
  {
    name: "Telegram",
    icon: SiTelegram,
    url: (shareUrl, text) => `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`,
  },
];

type GraphShareButtonProps = {
  targetRef: RefObject<HTMLElement | null>;
  title: string;
  className?: string;
};

export function GraphShareButton({ targetRef, title, className = "" }: GraphShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const shareUrl = typeof window === "undefined"
    ? SITE_ORIGIN
    : new URL(`${window.location.pathname}${window.location.search}`, SITE_ORIGIN).toString();
  const shareText = `Veja este grafo de dados públicos no Politica007.`;

  async function prepareImage() {
    const target = targetRef.current;
    if (!target) {
      setMessage("Não foi possível localizar o grafo para gerar a imagem.");
      setOpen(true);
      return;
    }

    setGenerating(true);
    setMessage("");
    try {
      const { toCanvas } = await import("html-to-image");
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const backgroundColor = isDark ? "#101820" : "#f3f6f8";
      const includeNode = (node: HTMLElement) => {
        if (node.closest("[data-graph-share-ignore], .react-flow__controls, .react-flow__minimap, .react-flow__panel")) {
          return false;
        }
        return true;
      };

      let graphCanvas: HTMLCanvasElement;
      try {
        graphCanvas = await toCanvas(target, { backgroundColor, cacheBust: true, pixelRatio: 2, filter: includeNode });
      } catch {
        // Some public photo hosts block canvas export; keep the graph and retry without photos.
        graphCanvas = await toCanvas(target, {
          backgroundColor,
          cacheBust: true,
          pixelRatio: 2,
          filter: (node) => includeNode(node) && node.tagName !== "IMG",
        });
      }

      const scale = graphCanvas.width / Math.max(1, target.getBoundingClientRect().width);
      const padding = Math.round(24 * scale);
      const footerHeight = Math.round(68 * scale);
      const output = document.createElement("canvas");
      output.width = graphCanvas.width;
      output.height = graphCanvas.height + footerHeight;
      const context = output.getContext("2d");
      if (!context) throw new Error("Canvas indisponível");

      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, output.width, output.height);
      context.drawImage(graphCanvas, 0, 0);
      context.fillStyle = isDark ? "#18242d" : "#ffffff";
      context.fillRect(0, graphCanvas.height, output.width, footerHeight);
      context.strokeStyle = isDark ? "#344752" : "#d8e2e7";
      context.lineWidth = Math.max(1, scale);
      context.beginPath();
      context.moveTo(0, graphCanvas.height);
      context.lineTo(output.width, graphCanvas.height);
      context.stroke();

      context.textBaseline = "middle";
      context.fillStyle = isDark ? "#f1f6f8" : "#183447";
      context.font = `600 ${Math.round(16 * scale)}px Arial, sans-serif`;
      context.fillText("Politica007", padding, graphCanvas.height + Math.round(24 * scale));
      context.fillStyle = isDark ? "#a8bac4" : "#526b78";
      context.font = `${Math.round(9 * scale)}px Arial, sans-serif`;
      context.fillText("DADOS PÚBLICOS · PORTAL INDEPENDENTE", padding, graphCanvas.height + Math.round(47 * scale));
      context.fillStyle = isDark ? "#dce8ed" : "#174f68";
      context.textAlign = "right";
      context.font = `600 ${Math.round(13 * scale)}px Arial, sans-serif`;
      context.fillText("politica007.com.br", output.width - padding, graphCanvas.height + Math.round(35 * scale));

      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((value) => value ? resolve(value) : reject(new Error("Não foi possível criar o PNG")), "image/png");
      });
      const safeTitle = title.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
      const image = new File([blob], `politica007-${safeTitle || "grafo"}.png`, { type: "image/png" });
      let supportsImageShare = false;
      try {
        supportsImageShare = typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [image] });
      } catch {
        supportsImageShare = false;
      }

      setFile(image);
      setPreviewUrl(URL.createObjectURL(image));
      setCanShareFile(supportsImageShare);
      setOpen(true);
    } catch {
      setMessage("Não foi possível gerar a imagem agora. Tente novamente em instantes.");
      setOpen(true);
    } finally {
      setGenerating(false);
    }
  }

  function downloadImage() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareImage() {
    if (!file || !canShareFile) return;
    try {
      await navigator.share({ files: [file], title: `Politica007 · ${title}`, text: `${shareText} ${shareUrl}` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("O compartilhamento foi cancelado ou não está disponível. Você ainda pode baixar a imagem.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Não foi possível copiar o link neste navegador.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={prepareImage}
        disabled={generating}
        aria-label="Gerar imagem e compartilhar este grafo"
        className={`graph-share-trigger ${className}`}
        data-graph-share-ignore
      >
        {generating ? <LoaderCircle size={15} className="animate-spin" /> : <Share2 size={15} />}
        <span>{generating ? "gerando imagem…" : "compartilhar"}</span>
      </button>

      {open ? createPortal(
        <div
          className="graph-share-backdrop"
          role="presentation"
          data-graph-share-ignore
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className="graph-share-dialog" role="dialog" aria-modal="true" aria-labelledby="graph-share-title">
            <header className="graph-share-dialog__header">
              <div>
                <div className="mono-label">Politica007</div>
                <h2 id="graph-share-title">Compartilhe este grafo</h2>
                <p>A imagem inclui a marca e o endereço politica007.com.br.</p>
              </div>
              <button type="button" className="graph-share-close" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </header>

            {previewUrl ? (
              <div className="graph-share-preview">
                {/* Generated locally in the browser from the graph the person is sharing. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={`Prévia da imagem de ${title}`} />
              </div>
            ) : null}

            {message ? <p className="graph-share-message" role="status">{message}</p> : null}

            {canShareFile ? (
              <button type="button" className="graph-share-primary" onClick={shareImage}>
                <Share2 size={16} /> compartilhar imagem
              </button>
            ) : null}
            {file ? (
              <p className="graph-share-hint">
                {canShareFile
                  ? "O botão acima envia o PNG. Os atalhos de rede abaixo abrem o link e baixam a imagem para anexar à publicação."
                  : "Os atalhos abaixo abrem o link e baixam o PNG; anexe a imagem à publicação se a rede solicitar."}
              </p>
            ) : null}

            {file ? (
              <button type="button" className="graph-share-download" onClick={downloadImage}>
                <Download size={16} /> baixar imagem PNG
              </button>
            ) : null}

            <div className="graph-share-networks" aria-label="Compartilhar link nas redes sociais">
              {networks.map(({ name, icon: Icon, url }) => (
                <a
                  key={name}
                  href={url(shareUrl, shareText)}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={downloadImage}
                  className="graph-share-network"
                >
                  <Icon size={18} aria-hidden="true" /> {name}
                </a>
              ))}
              <button type="button" className="graph-share-network" onClick={copyLink}>
                {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                {copied ? "Link copiado" : "Copiar link"}
              </button>
            </div>

            <p className="graph-share-domain">{shareUrl}</p>
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}
