import { db, hasTable } from "@/lib/db";
import { normalizeName } from "@/lib/normalize";

export type ExploreFilters={q?:string;year?:number;state?:string;office?:string;city?:string;page?:number};
export function exploreCandidates(filters:ExploreFilters){
  const clauses:string[]=[];const args:(string|number)[]=[];
  for(const [field,value] of [["year",filters.year],["state",filters.state],["office",filters.office]] as const)if(value){clauses.push(`ph.${field}=?`);args.push(value);}
  if(filters.q)for(const token of normalizeName(filters.q).split(" ").filter(Boolean)){clauses.push("(instr(ph.normalized_name,?)>0 OR instr(normalize_public_name(coalesce(ph.ballot_name,'')),?)>0)");args.push(token,token);}
  if(filters.city)for(const token of normalizeName(filters.city).split(" ").filter(Boolean)){clauses.push("instr(normalize_public_name(coalesce(ph.municipality,ph.electoral_unit,'')),?)>0");args.push(token);}
  const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
  const total=(db().prepare(`SELECT count(DISTINCT ph.person_id) AS n FROM politician_history ph ${where}`).get(...args) as {n:number}).n;
  const page=Math.max(1,Math.floor(filters.page||1));
  const rows=db().prepare(`WITH ranked AS(SELECT ph.id,row_number() OVER(PARTITION BY ph.person_id ORDER BY ph.year DESC,ph.round DESC,ph.id DESC) AS n FROM politician_history ph ${where}),chosen AS(SELECT id FROM ranked WHERE n=1)
    SELECT ph.person_id AS personId,ph.full_name AS name,ph.ballot_name AS ballotName,ph.year,ph.office,ph.state,ph.municipality,ph.party_abbr AS party,ph.result
    FROM chosen JOIN politician_history ph ON ph.id=chosen.id ORDER BY ph.full_name LIMIT 24 OFFSET ?`).all(...args,(page-1)*24) as {personId:number;name:string;ballotName:string|null;year:number;office:string;state:string;municipality:string;party:string;result:string|null}[];
  return {rows,total,page};
}
export function exploreOptions(){return {years:(db().prepare("SELECT DISTINCT year FROM politician_history ORDER BY year DESC").all() as {year:number}[]).map(x=>x.year),offices:(db().prepare("SELECT DISTINCT office FROM politician_history WHERE office IS NOT NULL ORDER BY office").all() as {office:string}[]).map(x=>x.office),states:(db().prepare("SELECT DISTINCT state FROM politician_history WHERE state IS NOT NULL ORDER BY state").all() as {state:string}[]).map(x=>x.state)};}

export function voteTerritories(personId:number,year?:number){
  if(!hasTable("election_vote_section"))return [];
  return db().prepare(`SELECT v.year,v.round,v.state,v.municipality,sum(v.votes) AS votes,count(*) AS sections
    FROM election_vote_section v JOIN politician_history ph ON ph.id=v.history_id
    WHERE ph.person_id=? ${year ? "AND v.year=?":""} GROUP BY v.year,v.round,v.state,v.municipality ORDER BY v.year DESC,v.round,votes DESC`).all(...(year?[personId,year]:[personId])) as {year:number;round:number;state:string;municipality:string;votes:number;sections:number}[];
}

export function coverage(){
  return (db().prepare(`SELECT src.name,src.agency,src.base_url AS sourceUrl,max(col.accessed_at) AS collectedAt,
    count(DISTINCT col.id) AS collections FROM source src LEFT JOIN collection col ON col.source_id=src.id GROUP BY src.id ORDER BY src.name`).all() as {name:string;agency:string;sourceUrl:string;collectedAt:string|null;collections:number}[]);
}
