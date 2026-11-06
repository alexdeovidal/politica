import { isolatedQuery } from "@/lib/isolated-query";
import {rateLimit} from "@/lib/platform/store";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try {
  if(!rateLimit(request,"network-path",6))return Response.json({error:"Aguarde um minuto para repetir a exploração."},{status:429});
  const p=new URL(request.url).searchParams,a=p.get("a")||"",b=p.get("b")||"",year=Number(p.get("ano"))||undefined,kind=p.get("tipo")||"todos";
  if(!/^(?:\d{11}|\d{14}|soc:[1-9]\d*)$/.test(a)||!/^(?:\d{11}|\d{14}|soc:[1-9]\d*)$/.test(b)||(year&&(!Number.isInteger(year)||year<1994||year>2100))||!["todos","societario","financeiro"].includes(kind))return Response.json({error:"Selecione dois registros válidos."},{status:400});
  const result = await isolatedQuery<{missing?: boolean}>({mode:"network-path",a,b,year,kind}, request.signal);
  if(result.missing)return Response.json({error:"Registro não localizado."},{status:404});
  return Response.json(result);
 } catch {
  return Response.json({error:"Não foi possível concluir a busca de relações agora. Tente novamente."},{status:503});
 }
}
