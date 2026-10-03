"use client";

import { metric } from "@/components/platform/metrics";
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
  const [format,setFormat]=useState("original");
  const [section,setSection]=useState("");
  const [sections,setSections]=useState<{id:string;title:string}[]>([]);
  const [summary,setSummary]=useState(`Consulte ${title} no Politica007. Dados públicos com fontes identificadas.`);
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
    const previousFocus=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";
    const timer=window.setTimeout(()=>document.querySelector<HTMLElement>(".graph-share-dialog button")?.focus(),0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if(event.key==="Tab"){
        const controls=Array.from(document.querySelectorAll<HTMLElement>(".graph-share-dialog button:not([disabled]),.graph-share-dialog input,.graph-share-dialog select,.graph-share-dialog textarea,.graph-share-dialog a[href]"));
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {window.clearTimeout(timer);document.body.style.overflow=previousOverflow;document.removeEventListener("keydown", closeOnEscape);previousFocus?.focus();};
  }, [open]);

  const shareUrl = typeof window === "undefined"
    ? SITE_ORIGIN
    : (()=>{const u=new URL(`${window.location.pathname}${window.location.search}`,SITE_ORIGIN);u.searchParams.set("ref","compartilhamento");return u.toString();})();
  const shareText = summary;

  function openDialog(){const root=targetRef.current||document.querySelector<HTMLElement>(".content__inner main,.graph-page-body,.content__inner");if(root){setSections([...Array.from(root.querySelectorAll<HTMLElement>("section[id],[data-toc-title][id]")).map(n=>({id:n.id,title:n.dataset.tocTitle||n.querySelector("h2,h3,.section-title")?.textContent||n.id})),...Array.from(root.querySelectorAll<HTMLElement>("article,.kpi")).map((n,i)=>({id:`card:${i}`,title:`Dado: ${(n.querySelector("h2,h3,strong,.kpi__label")?.textContent||n.textContent||"Registro").trim().slice(0,90)}`}))]);}setSummary(`Consulte ${title} no Politica007. Dados públicos com fontes identificadas.`);setOpen(true);}
  async function prepareImage() {
    const root=targetRef.current||document.querySelector<HTMLElement>(".content__inner main,.graph-page-body,.content__inner");
    const target = section.startsWith("card:") ? root?.querySelectorAll<HTMLElement>("article,.kpi")[Number(section.slice(5))] : section ? document.getElementById(section) : root;
    if(root)setSections([...Array.from(root.querySelectorAll<HTMLElement>("section[id],[data-toc-title][id]")).map(n=>({id:n.id,title:n.dataset.tocTitle||n.querySelector("h2,h3,.section-title")?.textContent||n.id})),...Array.from(root.querySelectorAll<HTMLElement>("article,.kpi")).map((n,i)=>({id:`card:${i}`,title:`Dado: ${(n.querySelector("h2,h3,strong,.kpi__label")?.textContent||n.textContent||"Registro").trim().slice(0,90)}`}))]);
    if (!target) {
      setMessage("Não foi possível localizar os dados para gerar a imagem.");
      setOpen(true);
      return;
    }

    setGenerating(true);
    setMessage("");
    try {
      const { toCanvas } = await import("html-to-image");
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const pixelRatio=Math.min(2,8000/Math.max(1,target.scrollHeight));
      const backgroundColor = isDark ? "#101820" : "#f3f6f8";
      const includeNode = (node: HTMLElement) => {
        if (typeof node.closest !== "function") return true;
        if (node.closest("[data-graph-share-ignore], .react-flow__controls, .react-flow__minimap, .react-flow__panel")) {
          return false;
        }
        return true;
      };

      const isGraph=target.matches(".react-flow")||!!target.querySelector(".react-flow");
      const captureTarget=format!=="original"&&!isGraph?target.cloneNode(true) as HTMLElement:target;
      if(captureTarget!==target){Object.assign(captureTarget.style,{position:"fixed",left:"-10000px",top:"0",width:"540px",maxWidth:"540px",height:"auto",maxHeight:"none",margin:"0",boxSizing:"border-box"});document.body.appendChild(captureTarget);}
      let graphCanvas: HTMLCanvasElement;
      try {
        graphCanvas = await toCanvas(captureTarget, { style: captureTarget!==target?{position:"static",left:"0",top:"0"}:undefined, backgroundColor, cacheBust: true, pixelRatio, filter: includeNode });
      } catch {
        // Some public photo hosts block canvas export; keep the graph and retry without photos.
        graphCanvas = await toCanvas(captureTarget, {
          style:captureTarget!==target?{position:"static",left:"0",top:"0"}:undefined,
          backgroundColor,
          cacheBust: true,
          pixelRatio,
          filter: (node) => includeNode(node) && node.tagName !== "IMG",
        });
      } finally {if(captureTarget!==target)captureTarget.remove();}

      const output = document.createElement("canvas");
      const sizes:Record<string,[number,number]>={quadrado:[1080,1080],retrato:[1080,1350],paisagem:[1600,900]};
      const dimensions=sizes[format];
      output.width = dimensions?.[0] ?? Math.max(1080,graphCanvas.width);
      const scale=output.width/540;
      const padding=Math.round(24*scale),footerHeight=Math.round(132*scale);
      output.height = dimensions?.[1] ?? graphCanvas.height + footerHeight;
      const footerTop=output.height-footerHeight;
      const context = output.getContext("2d");
      if (!context) throw new Error("Canvas indisponível");

      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, output.width, output.height);
      const ratio=Math.min(output.width/graphCanvas.width,Math.max(1,footerTop)/graphCanvas.height);
      context.drawImage(graphCanvas,(output.width-graphCanvas.width*ratio)/2,0,graphCanvas.width*ratio,graphCanvas.height*ratio);
      context.fillStyle = isDark ? "#18242d" : "#ffffff";
      context.fillRect(0, footerTop, output.width, footerHeight);
      context.strokeStyle = isDark ? "#344752" : "#d8e2e7";
      context.lineWidth = Math.max(1, scale);
      context.beginPath();
      context.moveTo(0, footerTop);
      context.lineTo(output.width, footerTop);
      context.stroke();

      context.textBaseline = "middle";
      context.fillStyle = isDark ? "#f1f6f8" : "#183447";
      context.font = `600 ${Math.round(16 * scale)}px Arial, sans-serif`;
      context.fillText("Politica007", padding, footerTop + Math.round(24 * scale));
      context.fillStyle = isDark ? "#a8bac4" : "#526b78";
      context.font = `${Math.round(9 * scale)}px Arial, sans-serif`;
      context.fillText("DADOS PÚBLICOS · PORTAL INDEPENDENTE", padding, footerTop + Math.round(47 * scale));
      context.fillStyle = isDark ? "#dce8ed" : "#174f68";
      context.textAlign = "right";
      context.font = `600 ${Math.round(13 * scale)}px Arial, sans-serif`;
      context.fillText("politica007.com.br", output.width - padding, footerTop + Math.round(35 * scale));

      context.textAlign="left";
      context.font=`${Math.round(10*scale)}px Arial, sans-serif`;
      const collectionDates=Array.from(target.querySelectorAll<HTMLAnchorElement>("a[data-source-date]")).map(a=>a.dataset.sourceDate!).filter(d=>!Number.isNaN(Date.parse(d))).sort((a,b)=>Date.parse(b)-Date.parse(a));
      const sources=[...new Set(Array.from(target.querySelectorAll<HTMLAnchorElement>("a.source-link")).map(a=>{try{return new URL(a.href).hostname;}catch{return "";}}).filter(Boolean))].slice(0,3);
      const params=new URLSearchParams(window.location.search);
      const collected=collectionDates[0]?new Date(collectionDates[0]).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"indicada nos registros";
      context.fillText(`Fonte(s): ${sources.join(" · ") || "consulte as fontes no portal"}`,padding,footerTop+Math.round(72*scale),output.width-padding*2-110);
      context.fillText(`Período: ${params.get("ano")||params.get("year")||"indicado na consulta"} · coleta: ${collected}`,padding,footerTop+Math.round(94*scale),output.width-padding*2-110);
      const QRCode=await import("qrcode");
      context.fillText(`Imagem: ${new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} · horários de Brasília`,padding,footerTop+Math.round(114*scale),output.width-padding*2-110);
      const qr=document.createElement("canvas");await QRCode.toCanvas(qr,shareUrl,{width:100,margin:1});
      context.drawImage(qr,output.width-padding-100,footerTop+Math.round(52*scale),90,90);

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

      metric("share");
      setFile(image);
      setPreviewUrl(URL.createObjectURL(image));
      setCanShareFile(supportsImageShare);
      setOpen(true);
    } catch (error) {
      console.error("[Politica007] Não foi possível gerar a imagem do grafo.", error);
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
        onClick={openDialog}
        disabled={generating}
        aria-label="Gerar imagem e compartilhar estes dados"
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
                <h2 id="graph-share-title">Compartilhe dados públicos</h2>
                <p>A imagem inclui o domínio, o período, as fontes disponíveis e um QR para explorar os dados.</p>
              </div>
              <button type="button" className="graph-share-close" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </header>

            {sections.length>0&&<label className="platform-form">Conteúdo<select value={section} onChange={e=>setSection(e.target.value)}><option value="">Consulta completa</option>{sections.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
            <label className="platform-form">Formato<select value={format} onChange={e=>setFormat(e.target.value)}><option value="original">Conteúdo completo</option><option value="quadrado">Quadrado · 1080 × 1080</option><option value="retrato">Retrato · 1080 × 1350</option><option value="paisagem">Paisagem · 1600 × 900</option></select></label>
            <label className="platform-form">Texto da publicação<textarea value={summary} onChange={e=>setSummary(e.target.value)} maxLength={1000}/></label>
            <p className="text-sm">Para manter os textos legíveis nas redes, escolha uma seção ou um dado. Uma consulta inteira pode ficar muito longa.</p>
            <button className="btn" disabled={generating} onClick={prepareImage}>{generating?"Gerando imagem…":file?"Atualizar imagem":"Gerar imagem"}</button>
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
