import {db} from "@/lib/db";
import {normalizeName} from "@/lib/normalize";
import {cached,cacheResult,cacheCollectedAt} from "./store";
export type OfficialItem={id:string;title:string;date:string|null;detail:string;url:string};
export type OfficialPage={source:string;sourceUrl:string;collectedAt:string;identity:string;items:OfficialItem[];hasMore:boolean;page:number;coverage:string};
type Deputy={id:number;uri:string;cpf:string;nomeCivil:string};
type CamaraRecord={id:number;codDocumento:number;tipoDespesa:string;dataDocumento:string|null;nomeFornecedor:string;valorLiquido:number;numDocumento:string;urlDocumento:string;siglaTipo:string;numero:number;ano:number;ementa:string};
type CamaraResponse={dados:CamaraRecord[];links:{rel:string}[]};
type Senator={IdentificacaoParlamentar:{NomeCompletoParlamentar:string;CodigoParlamentar:string}};
type SenateRoster={ListaParlamentarEmExercicio:{Parlamentares:{Parlamentar:Senator[]|Senator}}};
type SenateDetail={DetalheParlamentar:{Parlamentar:{DadosBasicosParlamentar:{DataNascimento:string}}}};
type SenateVote={codigoSessaoVotacao:number;sequencialVotacao:number;codigoMateria:number;identificacao:string;descricaoVotacao:string;ementa:string;dataSessao:string;votos:{codigoParlamentar:number;siglaVotoParlamentar:string}[]};
async function json<T>(url:string):Promise<T>{const hit=cached<T>(url,4*3600000);if(hit)return hit;const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000),cache:"no-store"});if(!response.ok)throw new Error(`A fonte respondeu ${response.status}.`);const data=await response.json() as T;cacheResult(url,data,url);return data;}
async function deputy(personId:number){
 const p=db().prepare("SELECT cpf,canonical_name AS name FROM people WHERE id=?").get(personId) as {cpf:string|null;name:string}|undefined;if(!p)return null;
 const key=`camara:identity:${personId}`;const saved=cached<{id:number;name:string}>(key);if(saved)return saved;
 const aliases=db().prepare("SELECT DISTINCT ballot_name AS name FROM politician_history WHERE person_id=? AND office='DEPUTADO FEDERAL'").all(personId) as {name:string}[];
 for(const name of [...new Set([p.name,...aliases.map(x=>x.name)].filter(Boolean))]){
 const list=await json<{dados:{id:number}[]}>(`https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(name)}&itens=100`);
 for(const item of (list.dados||[]).slice(0,20)){const d=(await json<{dados:Deputy}>(`https://dadosabertos.camara.leg.br/api/v2/deputados/${item.id}`)).dados;
 if(p.cpf && d.cpf===p.cpf && normalizeName(d.nomeCivil||"")===normalizeName(p.name)){const match={id:Number(d.id),name:String(d.nomeCivil)};cacheResult(key,match,d.uri);return match;}}
 }
 return null;
}
export async function camaraRecords(personId:number,kind:string,page:number,year:number,month=1):Promise<OfficialPage>{
 const match=await deputy(personId);const sourceUrl="https://dadosabertos.camara.leg.br/";const base:OfficialPage={source:"Câmara dos Deputados",sourceUrl,collectedAt:new Date().toISOString(),identity:"Documento e nome civil coincidentes",items:[],hasMore:false,page,coverage:`Consulta paginada à API oficial · ${year}`};
 if(!match)return {...base,identity:"Identidade não confirmada",coverage:"Não foi possível associar este perfil a um deputado por nome civil e CPF coincidentes. Isso não indica ausência de mandato."};
 if(kind==="camara-votos"){
 const last=new Date(Date.UTC(year,month,0)).getUTCDate(),m=String(month).padStart(2,"0");
 const url=`https://dadosabertos.camara.leg.br/api/v2/votacoes?dataInicio=${year}-${m}-01&dataFim=${year}-${m}-${last}&itens=20&pagina=${page}`;
 type Vote={id:string;data:string;descricao:string;siglaOrgao:string;uri:string};
 const list=await json<{dados:Vote[];links:{rel:string}[]}>(url);const items:OfficialItem[]=[];
 for(let start=0;start<list.dados.length;start+=4){const chunk=await Promise.all(list.dados.slice(start,start+4).map(async v=>{const source=`https://dadosabertos.camara.leg.br/api/v2/votacoes/${encodeURIComponent(v.id)}/votos`;const votes=await json<{dados:{deputado_:{id:number};tipoVoto:string}[]}>(source);const own=votes.dados.find(r=>Number(r.deputado_?.id)===match.id);return {id:v.id,title:v.descricao||v.id,date:v.data,detail:`${v.siglaOrgao} · ${own?"Voto: "+own.tipoVoto:votes.dados.length?"Não foi encontrado voto individual deste deputado nesta relação. Isso não comprova ausência.":"Sem votos individuais divulgados neste registro; pode ser votação simbólica."}`,url:source};}));items.push(...chunk);}
 return {...base,sourceUrl:url,collectedAt:cacheCollectedAt(url)||base.collectedAt,items,hasMore:list.links.some(r=>r.rel==="next"),coverage:`Votações da Câmara em ${m}/${year}, incluindo registros sem votos nominais. Associação por nome civil e CPF; posição individual somente quando informada pela fonte.`};
 }
 const url=kind==="despesas"?`https://dadosabertos.camara.leg.br/api/v2/deputados/${match.id}/despesas?ano=${year}&itens=20&pagina=${page}&ordem=DESC&ordenarPor=mes`:`https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=${match.id}&ano=${year}&itens=20&pagina=${page}&ordem=DESC&ordenarPor=id`;
 const data=await json<CamaraResponse>(url);return {...base,collectedAt:cacheCollectedAt(url)||base.collectedAt,sourceUrl:url,hasMore:(data.links||[]).some((x)=>x.rel==="next"),items:(data.dados||[]).map((r)=>kind==="despesas"?{id:String(r.codDocumento),title:String(r.tipoDespesa),date:r.dataDocumento||null,detail:`${r.nomeFornecedor} · R$ ${Number(r.valorLiquido||0).toLocaleString("pt-BR",{minimumFractionDigits:2})} · documento ${r.numDocumento||"não informado"}`,url:r.urlDocumento||url}:{id:String(r.id),title:`${r.siglaTipo} ${r.numero}/${r.ano}`,date:null,detail:String(r.ementa||"Ementa não informada"),url:`https://www.camara.leg.br/propostas-legislativas/${r.id}`})};
}

export async function senateRecords(personId:number,page:number,year:number):Promise<OfficialPage>{
 const p=db().prepare("SELECT p.canonical_name AS name,h.birth_date AS birthDate FROM people p LEFT JOIN politician_history h ON h.id=(SELECT id FROM politician_history WHERE person_id=p.id ORDER BY year DESC LIMIT 1) WHERE p.id=?").get(personId) as {name:string;birthDate:string|null}|undefined;
 const sourceUrl="https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json";
 const base:OfficialPage={source:"Senado Federal",sourceUrl,collectedAt:new Date().toISOString(),identity:"Identidade não associada",coverage:"Consulta a senadores atualmente em exercício. Perfis históricos fora de exercício ainda não são associados por esta integração.",items:[],hasMore:false,page};
 if(!p)return base;const roster=await json<SenateRoster>(sourceUrl);const raw=roster.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar||[];const matches=(Array.isArray(raw)?raw:[raw]).filter((r)=>normalizeName(r.IdentificacaoParlamentar?.NomeCompletoParlamentar||"")===normalizeName(p.name));
 if(matches.length!==1)return base;const id=String(matches[0].IdentificacaoParlamentar.CodigoParlamentar);
 const detail=await json<SenateDetail>(`https://legis.senado.leg.br/dadosabertos/senador/${id}.json`);
 const birthday=detail.DetalheParlamentar?.Parlamentar?.DadosBasicosParlamentar?.DataNascimento;
 if(!p.birthDate||birthday!==p.birthDate)return {...base,coverage:"Nome coincidente, mas nascimento não confirmado nas duas fontes; os votos não foram associados automaticamente."};
 const url=`https://legis.senado.leg.br/dadosabertos/votacao?codigoParlamentar=${id}&dataInicio=${year}-01-01&dataFim=${year}-12-31`;
 const data=await json<SenateVote[]>(url);const rows=(Array.isArray(data)?data:[]).filter((v)=>v.votos?.some((vote)=>String(vote.codigoParlamentar)===id));
 return {...base,sourceUrl:url,collectedAt:cacheCollectedAt(url)||base.collectedAt,identity:"Possível correspondência: nome civil e data de nascimento coincidem; sem confirmação por documento",coverage:`Votações nominais do Senado em ${year}. Votações secretas ou sem voto nominal não demonstram a posição individual.`,hasMore:page*20<rows.length,items:rows.slice((page-1)*20,page*20).map((v)=>{const vote=v.votos.find((x)=>String(x.codigoParlamentar)===id);return {id:String(v.codigoSessaoVotacao)+"-"+v.sequencialVotacao,title:String(v.identificacao||v.descricaoVotacao),date:v.dataSessao||null,detail:`Voto: ${vote?.siglaVotoParlamentar||"Não informado"} · ${v.descricaoVotacao} · ${v.ementa||""}`,url:v.codigoMateria?`https://www25.senado.leg.br/web/atividade/materias/-/materia/${v.codigoMateria}`:url};})};
}
