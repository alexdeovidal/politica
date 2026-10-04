import {ImageResponse} from "next/og";
import {createElement as h} from "react";
import {getPersonHeader,getPersonFinance,getEntityProfile,getCandidateComparison} from "@/lib/queries";
import {getTseUpdateStatus} from "@/lib/tse-update-status";
import {formatBRL} from "@/lib/format";
import {getStoredNewsArticle} from "@/lib/platform/news";
export const dynamic="force-dynamic";
export function GET(request:Request){const params=new URL(request.url).searchParams;const path=params.get("path")||"/";const value=Number(params.get("ano"));const year=Number.isInteger(value)&&value>=1994&&value<=2100?value:undefined;let title="Dados públicos para consulta cidadã",detail="Candidatos, pessoas físicas, empresas e redes de relações",source="TSE · fontes públicas identificadas";
 const person=/^\/politico\/([0-9]+)$/.exec(path),company=/^\/cnpj\/([0-9]{14})$/.exec(path);
 const news=/^\/news\/(\d{4}-\d{2}-\d{2})\/(p\d+(?:-[a-z-]+)?)$/.exec(path);
 if(news){const article=getStoredNewsArticle(news[1],news[2]);if(article){title=article.title;detail=article.summary.slice(0,150);source=`${article.category} · fontes oficiais identificadas`;}}
 if(person){const id=Number(person[1]),header=getPersonHeader(id);if(header){title=header.person.canonicalName||"Perfil público";const finance=getPersonFinance(id,year);detail=`Recebido: ${formatBRL(finance.donationsTotalCents)} · contratado: ${formatBRL(finance.expensesTotalCents)}`;}}
 if(company){const profile=getEntityProfile(company[1],{year});if(profile){title=profile.displayName||"Empresa";detail=`Despesas contratadas por campanhas: ${formatBRL(profile.paymentsReceivedTotal.totalCents)}`;source="TSE · Receita (cadastro via BrasilAPI)";}}
 if(path==="/comparar"){const ids=(params.get("ids")||"").split(",").map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,3);const rows=getCandidateComparison(ids,year);if(rows.length){title=rows.map(r=>r.name).join(" × ");detail=rows.map(r=>`${r.name.split(" ")[0]}: ${formatBRL(r.expensesTotalCents)} contratado`).join(" · ");}}
 const updated=getTseUpdateStatus().lastUpdatedAt;
 return new ImageResponse(h("div",{style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",background:"#10212b",color:"#f4f8fa",padding:"64px",fontFamily:"sans-serif",justifyContent:"space-between"}},h("div",{style:{display:"flex",fontSize:24,color:"#85c9cd"}},"POLITICA007 · PORTAL INDEPENDENTE"),h("div",{style:{display:"flex",flexDirection:"column",gap:24}},h("div",{style:{display:"flex",fontSize:48,fontWeight:700}},title.slice(0,110)),h("div",{style:{display:"flex",fontSize:26,color:"#c8dae3"}},detail)),h("div",{style:{display:"flex",flexDirection:"column",fontSize:19,gap:10}},h("div",null,`${source} · ${year?`eleição ${year}`:"período disponível na base"}`),h("div",null,`Última sincronização TSE: ${updated?new Date(updated).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"consulte a cobertura"}`),h("div",{style:{display:"flex",fontSize:28,color:"#85c9cd"}},"politica007.com.br"))),{width:1200,height:630});}
