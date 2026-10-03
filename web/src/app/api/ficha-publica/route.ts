import {allowedOrigin} from "@/lib/platform/origin";
import {randomBytes,createHash,timingSafeEqual} from "node:crypto";
import {resolveTxt} from "node:dns/promises";
import {db} from "@/lib/db";
import {platformStore,rateLimit} from "@/lib/platform/store";
export const dynamic="force-dynamic";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
function sourceUrl(value:unknown){if(typeof value!=="string")return null;try{const url=new URL(value);return url.protocol==="https:"?url.href:null;}catch{return null;}}
export async function POST(request:Request){
 if(!allowedOrigin(request))return Response.json({error:"Origem inválida."},{status:403});
 if(!rateLimit(request,"public-profile",8))return Response.json({error:"Aguarde para tentar novamente."},{status:429});
 const b=await request.json().catch(()=>null);if(!b)return Response.json({error:"Dados inválidos."},{status:400});const personId=Number(b.personId);
 if(!Number.isSafeInteger(personId)||personId<1||!db().prepare("SELECT id FROM people WHERE id=?").get(personId))return Response.json({error:"Perfil inválido."},{status:400});
 if(b.action==="correction"){
 const source=sourceUrl(b.source);const description=String(b.description||"").trim();if(!source||description.length<20||description.length>4000)return Response.json({error:"Informe a correção e um endereço HTTPS com a evidência."},{status:400});
 const id=randomBytes(12).toString("hex");platformStore().prepare("INSERT INTO correction(id,person_id,path,description,source_url,created_at) VALUES(?,?,?,?,?,?)").run(id,personId,`/politico/${personId}`,description,source,new Date().toISOString());return Response.json({protocol:id,status:"recebida",message:"Pedido registrado para conferência. Os dados oficiais continuam preservados."});
 }
 if(b.action==="begin"){
 const domain=String(b.domain||"").toLowerCase().trim();if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))return Response.json({error:"Domínio inválido."},{status:400});
 const sites=db().prepare("SELECT url FROM social_media WHERE person_id=? AND platform='website'").all(personId) as {url:string}[];
 const allowed=sites.some(s=>{try{return new URL(s.url.includes("://")?s.url:`https://${s.url}`).hostname.replace(/^www\./,"")===domain.replace(/^www\./,"");}catch{return false;}});
 if(!allowed)return Response.json({error:"Use um domínio de site declarado pelo candidato ao TSE. Domínios de redes sociais não servem para esta verificação."},{status:400});
 const id=randomBytes(12).toString("hex"),secret=randomBytes(32).toString("hex");platformStore().prepare("INSERT INTO claim(id,person_id,domain,secret_hash,created_at) VALUES(?,?,?,?,?)").run(id,personId,domain,hash(secret),new Date().toISOString());return Response.json({id,secret,dnsName:`_politica007.${domain}`,dnsValue:`politica007=${id}`});
 }
 const claim=platformStore().prepare("SELECT * FROM claim WHERE id=? AND person_id=?").get(String(b.id||""),personId) as {id:string;domain:string;secret_hash:string;verified_at:string|null;created_at:string}|undefined;
 if(!claim||typeof b.secret!=="string"||!timingSafeEqual(Buffer.from(hash(b.secret)),Buffer.from(claim.secret_hash)))return Response.json({error:"Identificação da solicitação inválida."},{status:403});
 if(b.action==="verify"){
 if(!claim.verified_at&&Date.now()-Date.parse(claim.created_at)>7*86400000)return Response.json({error:"Solicitação expirada. Inicie uma nova verificação."},{status:409});
 try{const values=await resolveTxt(`_politica007.${claim.domain}`);if(!values.some(v=>v.join("")===`politica007=${claim.id}`))throw Error();platformStore().prepare("UPDATE claim SET verified_at=? WHERE id=?").run(new Date().toISOString(),claim.id);return Response.json({verified:true,message:"Controle do site declarado verificado. Isso não comprova a identidade pessoal do candidato."});}catch{return Response.json({error:"Registro DNS ainda não encontrado. Aguarde a propagação e tente novamente."},{status:409});}
 }
 if(b.action==="statement"&&claim.verified_at){const sites=db().prepare("SELECT url FROM social_media WHERE person_id=? AND platform='website'").all(personId) as {url:string}[];if(!sites.some(s=>{try{return new URL(s.url.includes("://")?s.url:`https://${s.url}`).hostname.replace(/^www\./,"")===claim.domain.replace(/^www\./,"");}catch{return false;}}))return Response.json({error:"O domínio não está mais na declaração coletada do TSE."},{status:409});try{const values=await resolveTxt(`_politica007.${claim.domain}`);if(!values.some(v=>v.join("")===`politica007=${claim.id}`))throw Error();}catch{return Response.json({error:"Confirme novamente o controle do domínio pelo registro DNS."},{status:409});}const text=String(b.statement||"").trim(),source=sourceUrl(b.source);if(text.length<20||text.length>4000||!source)return Response.json({error:"Informe o esclarecimento e sua fonte HTTPS."},{status:400});platformStore().prepare("UPDATE claim SET statement=?,statement_source=?,verified_at=? WHERE id=?").run(text,source,new Date().toISOString(),claim.id);return Response.json({published:true});}
 return Response.json({error:"Ação inválida ou domínio não verificado."},{status:400});
}
