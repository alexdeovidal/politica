import {getGraphNodeNetwork,resolveGraphNode,type GraphEdge} from "@/lib/queries";
import {rateLimit} from "@/lib/platform/store";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try {
  if(!rateLimit(request,"network-path",6))return Response.json({error:"Aguarde um minuto para repetir a exploração."},{status:429});
  const p=new URL(request.url).searchParams,a=p.get("a")||"",b=p.get("b")||"",year=Number(p.get("ano"))||undefined,kind=p.get("tipo")||"todos";
  if(!/^(?:\d{11}|\d{14}|soc:[1-9]\d*)$/.test(a)||!/^(?:\d{11}|\d{14}|soc:[1-9]\d*)$/.test(b)||(year&&(!Number.isInteger(year)||year<1994||year>2100))||!["todos","societario","financeiro"].includes(kind))return Response.json({error:"Selecione dois registros válidos."},{status:400});
  const start=resolveGraphNode(a),end=resolveGraphNode(b);if(!start||!end)return Response.json({error:"Registro não localizado."},{status:404});
  const queue=[{id:start.cpfCnpj,path:[] as GraphEdge[],ids:[start.cpfCnpj]}],seen=new Set<string>(),nodes=new Map([[start.cpfCnpj,start],[end.cpfCnpj,end]]),began=Date.now();let limited=false;
  while(queue.length&&seen.size<160&&Date.now()-began<8000){const current=queue.shift()!;if(current.id===end.cpfCnpj)return Response.json({found:true,nodes:current.ids.map(id=>nodes.get(id)),edges:current.path,visited:seen.size,limited,year});if(current.path.length>=4||seen.has(current.id))continue;seen.add(current.id);const network=getGraphNodeNetwork(current.id,40,year,kind);if(network.truncated)limited=true;for(const n of network.nodes)nodes.set(n.cpfCnpj,n);for(const edge of network.edges){const financial=["donation","payment"].includes(edge.kind);if((kind==="societario"&&financial)||(kind==="financeiro"&&!financial))continue;const next=edge.source===current.id?edge.target:edge.source;if(!seen.has(next)&&!current.ids.includes(next))queue.push({id:next,path:[...current.path,edge],ids:[...current.ids,next]});}}
  return Response.json({found:false,nodes:[],edges:[],visited:seen.size,limited:limited||queue.length>0,coverage:"Busca em até 4 ligações, 160 nós e 40 relações por expansão. Não encontrar um caminho não comprova ausência de relação."});
 } catch {
  return Response.json({error:"Não foi possível concluir a busca de relações agora. Tente novamente."},{status:500});
 }
}
