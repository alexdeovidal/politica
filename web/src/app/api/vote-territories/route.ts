import {normalizeName} from "@/lib/normalize";
import {db,hasTable} from "@/lib/db";
import {cached,cacheResult} from "@/lib/platform/store";
export const dynamic="force-dynamic";
type Geometry={type:string;coordinates:number[][][]|number[][][][]};
type Shapes={features:{properties:{codarea:string};geometry:Geometry}[]};
const UF:Record<string,string>={11:"RO",12:"AC",13:"AM",14:"RR",15:"PA",16:"AP",17:"TO",21:"MA",22:"PI",23:"CE",24:"RN",25:"PB",26:"PE",27:"AL",28:"SE",29:"BA",31:"MG",32:"ES",33:"RJ",35:"SP",41:"PR",42:"SC",43:"RS",50:"MS",51:"MT",52:"GO",53:"DF"};
const shapeUrl="https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=minima";
async function official<T>(url:string):Promise<T>{let value=cached<T>(url,30*86400000);if(!value){const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();value=await r.json() as T;cacheResult(url,value,url);}return value;}
async function shapes(uf:string,historyId:number){
 const code=Object.entries(UF).find(([,state])=>state===uf)?.[0];
 const url=code?`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${code}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima`:shapeUrl;
 const geo=await official<Shapes>(url);
 const towns=code?await official<{id:number;nome:string}[]>(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios`):[];
 const totals=code?db().prepare("SELECT normalize_public_name(municipality) AS name,sum(votes) AS votes FROM election_vote_section WHERE history_id=? AND state=? GROUP BY normalize_public_name(municipality)").all(historyId,uf) as {name:string;votes:number}[]:[];
 const names=new Map(towns.map(t=>[String(t.id),t.nome])),votes=new Map(totals.map(t=>[t.name,t.votes]));
 const points:number[][]=[];
 const features=geo.features.map(f=>{const polygons=f.geometry.type==="MultiPolygon"?f.geometry.coordinates as number[][][][]:[f.geometry.coordinates as number[][][]];const label=code?names.get(f.properties.codarea)||f.properties.codarea:UF[f.properties.codarea];return {state:code?uf:UF[f.properties.codarea],label,code:f.properties.codarea,municipality:!!code,votes:code?votes.get(normalizeName(label))||0:undefined,d:polygons.map(poly=>poly.map(ring=>ring.map(([x,y],i)=>{const px=(x+75)*11,py=(7-y)*11;points.push([px,py]);return `${i?"L":"M"}${px.toFixed(2)},${py.toFixed(2)}`;}).join(" ")+"Z").join(" ")).join(" ")};});
 const bounds=points.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[Infinity,Infinity,-Infinity,-Infinity]);let viewBox="0 0 490 470";if(code&&points.length){viewBox=`${bounds[0]-2} ${bounds[1]-2} ${bounds[2]-bounds[0]+4} ${bounds[3]-bounds[1]+4}`;}
 return {features,viewBox,url};
}
export async function GET(request:Request){const p=new URL(request.url).searchParams;const id=Number(p.get("historyId")),page=Number(p.get("page")||1),group=p.get("group")||"municipality",uf=p.get("uf")||"",q=(p.get("q")||"").slice(0,120);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(page)||page<1||page>10000||!["municipality","zone","polling"].includes(group)||(uf&&!/^[A-Z]{2}$/.test(uf)))return Response.json({error:"Consulta inválida."},{status:400});if(!hasTable("election_vote_section"))return Response.json({rows:[],total:0,states:[],shapes:[],votes:0});
 const expression=group==="zone"?"municipality || ' · zona ' || zone_number":group==="polling"?"municipality || ' · ' || coalesce(polling_place_name,'Local não informado') || ' · local ' || coalesce(polling_place_number,'sem número') || ' · zona ' || zone_number":"municipality";
 const where="history_id=? AND (?='' OR state=?)";const args=[id,uf,uf];const cte=`WITH grouped AS(SELECT state,${expression} AS label,sum(votes) AS votes,count(*) AS sections FROM election_vote_section WHERE ${where} GROUP BY state,${expression})`;
 const rows=db().prepare(`${cte} SELECT * FROM grouped WHERE instr(normalize_public_name(label),normalize_public_name(?))>0 ORDER BY votes DESC LIMIT 25 OFFSET ?`).all(...args,q,(page-1)*25);
 const total=(db().prepare(`${cte} SELECT count(*) AS n FROM grouped WHERE instr(normalize_public_name(label),normalize_public_name(?))>0`).get(...args,q) as {n:number}).n;
 const states=db().prepare("SELECT state,sum(votes) AS votes FROM election_vote_section WHERE history_id=? GROUP BY state").all(id);
 const votes=(db().prepare("SELECT coalesce(sum(votes),0) AS n FROM election_vote_section WHERE history_id=?").get(id) as {n:number}).n;
 let map:Awaited<ReturnType<typeof shapes>>={features:[],viewBox:"0 0 490 470",url:shapeUrl};try{map=await shapes(uf,id);}catch{}return Response.json({rows,total,page,states,shapes:map.features,viewBox:map.viewBox,votes,shapeSource:map.url});}
