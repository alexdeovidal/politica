import {camaraRecords,senateRecords} from "@/lib/platform/official";
import {rateLimit} from "@/lib/platform/store";
export const dynamic="force-dynamic";
export async function GET(request:Request){const p=new URL(request.url).searchParams;const id=Number(p.get("personId")),year=Number(p.get("ano")||new Date().getFullYear()),page=Number(p.get("page")||1),month=Number(p.get("mes")||1),kind=p.get("kind")||"proposicoes";
 if(!Number.isSafeInteger(id)||id<1||!Number.isInteger(year)||year<1994||year>2100||!Number.isSafeInteger(page)||page<1||page>10000||!Number.isInteger(month)||month<1||month>12||!["proposicoes","despesas","senado-votos","camara-votos"].includes(kind))return Response.json({error:"Consulta inválida."},{status:400});
 if(!rateLimit(request,"official",20))return Response.json({error:"Aguarde um minuto para consultar novamente."},{status:429});
 try{return Response.json(await (kind==="senado-votos"?senateRecords(id,page,year):camaraRecords(id,kind,page,year,month)));}catch{return Response.json({error:"A fonte oficial está indisponível no momento. Tente novamente."},{status:503});}}
