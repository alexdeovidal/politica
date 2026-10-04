"use client";

import {useState} from "react";
import {Check,Copy,Share2} from "lucide-react";

export function NewsShareActions({title}:{title:string}){
  const [copied,setCopied]=useState(false);
  const url=typeof window==="undefined"?"https://politica007.com.br":`${location.origin}${location.pathname}`;
  const text=`${title} · Política007`;
  const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),2200);}catch{setCopied(false);}};
  const share=async()=>{try{if(navigator.share)await navigator.share({title,text,url});else await copy();}catch{}}
  const encodedUrl=encodeURIComponent(url),encodedText=encodeURIComponent(text);
  return <div className="news-share-actions" aria-label="Compartilhar matéria">
    <button type="button" className="btn btn--primary" onClick={share}><Share2 size={16}/><span>Compartilhar</span></button>
    <a className="btn" href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
    <a className="btn" href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noopener noreferrer">Facebook</a>
    <a className="btn" href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`} target="_blank" rel="noopener noreferrer">X</a>
    <button type="button" className="btn" onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>}<span>{copied?"Link copiado":"Copiar link"}</span></button>
    <span className="sr-only" role="status">{copied?"Link da notícia copiado.":""}</span>
  </div>;
}
