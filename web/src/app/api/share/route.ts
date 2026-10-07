import {ImageResponse} from "next/og";
import {createElement as h} from "react";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {getPersonHeader,getPersonFinance,getEntityProfile,getCandidateComparison} from "@/lib/queries";
import {getTseUpdateStatus} from "@/lib/tse-update-status";
import {formatBRL} from "@/lib/format";
import {getNewsArticle, type DailyNewsArticle} from "@/lib/platform/news";
import {OPENING_NEWS_SLUG} from "@/components/news-story-cover";

export const dynamic="force-dynamic";
export const runtime="nodejs";

const newsCover=`data:image/jpeg;base64,${readFileSync(join(process.cwd(),"public","news","capa-adesivos-campanha.jpg"),"base64")}`;

function newsImage(article:DailyNewsArticle):ImageResponse{
  if(article.slug===OPENING_NEWS_SLUG){
    return new ImageResponse(h("div",{style:{position:"relative",width:"100%",height:"100%",display:"flex",overflow:"hidden",backgroundColor:"#0b1d26",color:"#f5f8f8",fontFamily:"sans-serif"}},
      h("img",{src:newsCover,style:{position:"absolute",top:0,right:0,bottom:0,left:0,width:"100%",height:"100%",objectFit:"cover"}}),
      h("div",{style:{position:"absolute",top:0,right:0,bottom:0,left:0,background:"linear-gradient(90deg,rgba(8,20,27,0.98) 0%,rgba(8,20,27,0.92) 45%,rgba(8,20,27,0.43) 73%,rgba(8,20,27,0.18) 100%),linear-gradient(0deg,rgba(8,20,27,0.54),transparent 42%)"}}),
      h("div",{style:{position:"relative",display:"flex",flexDirection:"column",justifyContent:"space-between",width:"100%",height:"100%",padding:"49px 62px"}},
        h("div",{style:{display:"flex",alignItems:"center",gap:13}},h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:43,height:43,borderRadius:12,backgroundColor:"#17495d",color:"#9bd7d8",fontSize:26,fontWeight:700}},"P"),h("div",{style:{display:"flex",flexDirection:"column",gap:3}},h("span",{style:{fontSize:22,fontWeight:700,letterSpacing:2}},"POLITICA007"),h("span",{style:{fontSize:12,color:"#a9c0c8",letterSpacing:1.5}},"RADAR DE DADOS PÚBLICOS"))),
        h("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:10,maxWidth:690}},
          h("div",{style:{display:"flex",padding:"7px 12px",borderRadius:999,border:"1px solid rgba(169,218,221,0.55)",color:"#a9dadd",fontSize:14,letterSpacing:1.1}},"PRESTAÇÃO DE CONTAS · ELEIÇÃO 2026"),
          h("div",{style:{display:"flex",fontSize:82,fontWeight:750,letterSpacing:-4,lineHeight:1,color:"#fff"}},"R$ 766 MIL"),
          h("div",{style:{display:"flex",fontSize:30,fontWeight:600,lineHeight:1.2,color:"#f0f4f4"}},"Dois lançamentos de adesivos"),
          h("div",{style:{display:"flex",fontSize:21,color:"#c6d8df"}},"na campanha de Flávio Bolsonaro")),
        h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,paddingTop:15,borderTop:"1px solid rgba(209,232,235,0.35)"}},
          h("span",{style:{display:"flex",fontSize:15,color:"#e5eeee"}},"Registros declarados · não comprovam irregularidade"),
          h("span",{style:{display:"flex",fontSize:19,fontWeight:650,letterSpacing:1.2,color:"#9bd7d8"}},"POLITICA007.COM.BR")))),
    {width:1200,height:630,headers:{"Cache-Control":"public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"}});
  }

  const fact=article.highlights[0];
  const title=article.title.length>105?`${article.title.slice(0,102).trimEnd()}…`:article.title;
  const label=article.category.toLocaleUpperCase("pt-BR");
  const year=new Date(article.publishedAt).getFullYear();
  return new ImageResponse(h("div",{style:{position:"relative",width:"100%",height:"100%",display:"flex",overflow:"hidden",background:"radial-gradient(ellipse at 80% 43%,rgba(80,163,168,.24),transparent 32%),linear-gradient(120deg,#0c202a 0%,#173744 58%,#102630 100%)",color:"#f4f8fa",fontFamily:"sans-serif"}},
    h("div",{style:{position:"absolute",right:-138,top:-326,width:760,height:760,border:"1px solid rgba(151,216,218,.18)",borderRadius:"50%"}}),
    h("div",{style:{position:"absolute",right:-55,top:-380,width:920,height:920,border:"1px solid rgba(151,216,218,.1)",borderRadius:"50%"}}),
    h("div",{style:{position:"absolute",right:130,top:132,width:270,height:370,display:"flex",flexDirection:"column",gap:25,padding:38,border:"1px solid rgba(190,223,226,.35)",borderRadius:14,background:"linear-gradient(145deg,rgba(227,240,238,.17),rgba(53,98,108,.2))",transform:"rotate(7deg)"}},
      h("div",{style:{display:"flex",fontSize:17,fontWeight:700,letterSpacing:2,color:"rgba(189,229,229,.78)"}},"P007"),
      ...["88%","72%","94%","57%","78%"].map((width,index)=>h("div",{key:index,style:{display:"flex",width,height:9,borderRadius:99,background:"rgba(194,225,226,.3)"}})),
      h("div",{style:{position:"absolute",right:29,bottom:40,width:165,height:115,display:"flex",alignItems:"flex-end",gap:10,padding:"12px 12px 0",borderBottom:"1px solid rgba(157,217,216,.56)",borderLeft:"1px solid rgba(157,217,216,.35)"}},
        ...["37%","63%","48%","82%","100%"].map((height,index)=>h("div",{key:index,style:{display:"flex",flex:1,height,borderRadius:"5px 5px 0 0",background:"linear-gradient(180deg,#77c4c2,rgba(56,126,137,.42))"}})))),
    h("div",{style:{position:"relative",display:"flex",flexDirection:"column",justifyContent:"space-between",width:"100%",height:"100%",padding:"48px 64px"}},
      h("div",{style:{display:"flex",alignItems:"center",gap:13}},
        h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:43,height:43,borderRadius:12,backgroundColor:"#17495d",color:"#9bd7d8",fontSize:26,fontWeight:700}},"P"),
        h("div",{style:{display:"flex",flexDirection:"column",gap:3}},h("span",{style:{fontSize:22,fontWeight:700,letterSpacing:2}},"POLITICA007"),h("span",{style:{fontSize:12,color:"#a9c0c8",letterSpacing:1.5}},"RADAR DE DADOS PÚBLICOS"))),
      h("div",{style:{display:"flex",maxWidth:755,flexDirection:"column",alignItems:"flex-start",gap:13}},
        h("div",{style:{display:"flex",padding:"7px 12px",borderRadius:999,border:"1px solid rgba(169,218,221,.55)",color:"#a9dadd",fontSize:14,letterSpacing:1.1}},`${label} · ${year}`),
        h("div",{style:{display:"flex",maxWidth:750,fontSize:title.length>78?39:47,fontWeight:680,letterSpacing:-1.2,lineHeight:1.12,color:"#fff"}},title),
        fact&&h("div",{style:{display:"flex",alignItems:"baseline",gap:14,flexWrap:"wrap",paddingTop:6}},
          h("span",{style:{display:"flex",fontSize:15,color:"#c1dadd",letterSpacing:1}},fact.label.toLocaleUpperCase("pt-BR")),
          h("strong",{style:{display:"flex",fontSize:43,fontWeight:700,color:"#a7dfd5",letterSpacing:-1}},fact.value))),
      h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,paddingTop:15,borderTop:"1px solid rgba(209,232,235,.35)"}},
        h("span",{style:{display:"flex",fontSize:15,color:"#e5eeee"}},"Dados públicos · confira o contexto e as fontes na matéria"),
        h("span",{style:{display:"flex",fontSize:19,fontWeight:650,letterSpacing:1.2,color:"#9bd7d8"}},"POLITICA007.COM.BR")))),
  {width:1200,height:630,headers:{"Cache-Control":"public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"}});
}

export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const path=params.get("path")||"/";
  const value=Number(params.get("ano"));
  const year=Number.isInteger(value)&&value>=1994&&value<=2100?value:undefined;
  let title="Dados públicos para consulta cidadã",detail="Candidatos, pessoas físicas, empresas e redes de relações",source="TSE · fontes públicas identificadas";
  const person=/^\/politico\/([0-9]+)$/.exec(path),company=/^\/cnpj\/([0-9]{14})$/.exec(path);
  const news=/^\/news\/(\d{4}-\d{2}-\d{2})\/(p\d+(?:-[a-z0-9-]+)?)$/.exec(path);
  if(news){
    const article=await getNewsArticle(news[1],news[2]);
    if(article)return newsImage(article);
  }
  if(person){const id=Number(person[1]),header=getPersonHeader(id);if(header){title=header.person.canonicalName||"Perfil público";const finance=getPersonFinance(id,year);detail=`Recebido: ${formatBRL(finance.donationsTotalCents)} · contratado: ${formatBRL(finance.expensesTotalCents)}`;}}
  if(company){const profile=getEntityProfile(company[1],{year});if(profile){title=profile.displayName||"Empresa";detail=`Despesas contratadas por campanhas: ${formatBRL(profile.paymentsReceivedTotal.totalCents)}`;source="TSE · Receita (cadastro via BrasilAPI)";}}
  if(path==="/comparar"){const ids=(params.get("ids")||"").split(",").map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,3);const rows=getCandidateComparison(ids,year);if(rows.length){title=rows.map(r=>r.name).join(" × ");detail=rows.map(r=>`${r.name.split(" ")[0]}: ${formatBRL(r.expensesTotalCents)} contratado`).join(" · ");}}
  const updated=getTseUpdateStatus().lastUpdatedAt;
  return new ImageResponse(
    h("div",{style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",background:"#10212b",color:"#f4f8fa",padding:"64px",fontFamily:"sans-serif",justifyContent:"space-between"}},
      h("div",{style:{display:"flex",fontSize:24,color:"#85c9cd"}},"POLITICA007 · PORTAL INDEPENDENTE"),
      h("div",{style:{display:"flex",flexDirection:"column",gap:24}},
        h("div",{style:{display:"flex",fontSize:48,fontWeight:700}},title.slice(0,110)),
        h("div",{style:{display:"flex",fontSize:26,color:"#c8dae3"}},detail)),
      h("div",{style:{display:"flex",flexDirection:"column",fontSize:19,gap:10}},
        h("div",null,`${source} · ${year?`eleição ${year}`:"período disponível na base"}`),
        h("div",null,`Última sincronização TSE: ${updated?new Date(updated).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"consulte a cobertura"}`),
        h("div",{style:{display:"flex",fontSize:28,color:"#85c9cd"}},"politica007.com.br"))),
    {width:1200,height:630});
}
