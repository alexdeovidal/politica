import {getNewsArticle} from "@/lib/platform/news";

export const dynamic="force-dynamic";
export const runtime="nodejs";

function escapeXml(value:string):string{return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g," ").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[char]!));}
function wrap(value:string,maxChars:number,maxLines:number):string[]{
  const words=value.replace(/\s+/g," ").trim().split(" ");const lines:string[]=[];let line="";
  for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>maxChars&&line){lines.push(line);line=word;if(lines.length===maxLines)break;}else line=next;}
  if(line&&lines.length<maxLines)lines.push(line);
  const used=lines.join(" ").length;
  if(used<value.replace(/\s+/g," ").trim().length&&lines.length)lines[lines.length-1]=`${lines[lines.length-1].replace(/[.…]+$/g,"").trimEnd()}…`;
  return lines;
}
function spans(lines:string[],x:number,step:number):string{return lines.map((line,index)=>`<tspan x="${x}" dy="${index?step:0}">${escapeXml(line)}</tspan>`).join("");}

export function GET(request:Request){
  const params=new URL(request.url).searchParams;const day=params.get("day")||"";const slug=params.get("slug")||"";
  const article=getNewsArticle(day,slug);
  if(!article)return Response.json({error:"Notícia não encontrada."},{status:404});
  const key=`${article.personId}:${article.slug}`;const hash=[...key].reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7);const hue=hash%360;
  const palette={background:"#10232d",accent:`hsl(${hue},68%,76%)`,glow:`hsl(${hue},48%,32%)`};
  const title=wrap(article.title,35,3);const summary=wrap(article.summary,48,2);const value=wrap(article.highlights[0]?.value||"Dados públicos",16,2);
  const label=article.highlights[0]?.label||"DADO EM DESTAQUE";const name=article.personName;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Arte da notícia ${escapeXml(article.title)}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.background}"/><stop offset="1" stop-color="#101c25"/></linearGradient><radialGradient id="glow"><stop offset="0" stop-color="${palette.glow}"/><stop offset="1" stop-color="${palette.background}" stop-opacity="0"/></radialGradient><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="${palette.accent}" opacity=".2"/></pattern></defs>
<rect width="1200" height="630" fill="url(#bg)"/><circle cx="1110" cy="225" r="360" fill="url(#glow)"/><circle cx="1080" cy="235" r="195" fill="none" stroke="${palette.accent}" stroke-opacity=".34" stroke-width="2"/><circle cx="1080" cy="235" r="142" fill="none" stroke="${palette.accent}" stroke-opacity=".24" stroke-width="2"/><rect x="815" y="0" width="385" height="630" fill="url(#dots)" opacity=".55"/>
<rect x="62" y="47" width="42" height="42" rx="12" fill="${palette.glow}"/><text x="83" y="77" text-anchor="middle" fill="${palette.accent}" font-family="Arial,sans-serif" font-size="27" font-weight="700">P</text><text x="120" y="65" fill="#f5f8fa" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="2">POLITICA007</text><text x="120" y="88" fill="#a9c0c8" font-family="Arial,sans-serif" font-size="10" letter-spacing="1.5">RADAR DE DADOS PÚBLICOS</text>
<rect x="822" y="48" width="316" height="38" rx="19" fill="${palette.glow}" fill-opacity=".65" stroke="${palette.accent}" stroke-opacity=".65"/><text x="980" y="72" text-anchor="middle" fill="${palette.accent}" font-family="Arial,sans-serif" font-size="12" letter-spacing="1">${escapeXml(article.category.toLocaleUpperCase("pt-BR").slice(0,38))}</text>
<text x="66" y="208" fill="#ffffff" font-family="Arial,sans-serif" font-size="43" font-weight="700" letter-spacing="-1.3">${spans(title,66,52)}</text><text x="68" y="407" fill="#c8d9de" font-family="Arial,sans-serif" font-size="20">${spans(summary,68,29)}</text>
<rect x="838" y="145" width="278" height="300" rx="20" fill="#0b1721" fill-opacity=".84" stroke="${palette.accent}" stroke-opacity=".5"/><text x="862" y="185" fill="${palette.accent}" font-family="Arial,sans-serif" font-size="12" letter-spacing="1">${escapeXml(label.toLocaleUpperCase("pt-BR").slice(0,31))}</text><text x="862" y="264" fill="#ffffff" font-family="Arial,sans-serif" font-size="${value.join("").length>16?32:41}" font-weight="700" letter-spacing="-1">${spans(value,862,46)}</text><line x1="862" y1="326" x2="1090" y2="326" stroke="${palette.accent}" stroke-opacity=".38"/><text x="862" y="362" fill="#d6e2e6" font-family="Arial,sans-serif" font-size="14">DADOS PÚBLICOS · COM FONTES</text><text x="862" y="392" fill="#a9c0c8" font-family="Arial,sans-serif" font-size="13">Consulte os documentos de origem</text>
<line x1="64" y1="536" x2="1138" y2="536" stroke="#d1e8eb" stroke-opacity=".28"/><text x="66" y="574" fill="#e5eeee" font-family="Arial,sans-serif" font-size="15">${escapeXml(name.slice(0,72))}</text><text x="1138" y="574" text-anchor="end" fill="${palette.accent}" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="1">POLITICA007.COM.BR</text>
</svg>`;
  return new Response(svg,{headers:{"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"public, max-age=300, s-maxage=86400, stale-while-revalidate=604800","X-Content-Type-Options":"nosniff"}});
}
