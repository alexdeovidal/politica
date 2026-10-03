/** Incremental official PNCP import. Run alongside the TSE monitor every four hours. */
import Database from 'better-sqlite3';
import path from 'node:path';
import {mkdirSync} from 'node:fs';
const filename=process.env.POLITICA_PLATFORM_DB_PATH||path.join(path.dirname(process.env.ELOSYS_DB_PATH||'/data/elosys.db'),'politica-platform.db');
mkdirSync(path.dirname(filename),{recursive:true});const db=new Database(filename);db.pragma('journal_mode=WAL');db.pragma('busy_timeout=15000');
db.exec(`CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL,source_url TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS external_record(id TEXT PRIMARY KEY,source TEXT NOT NULL,entity_key TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,event_date TEXT,url TEXT NOT NULL,payload TEXT NOT NULL,collected_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_external_entity ON external_record(entity_key,source,event_date);
CREATE TABLE IF NOT EXISTS sync_run(id INTEGER PRIMARY KEY,source TEXT NOT NULL,status TEXT NOT NULL,checked_at TEXT NOT NULL,changed_at TEXT,detail TEXT);`);
const write=db.prepare('INSERT INTO external_record VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,title=excluded.title,event_date=excluded.event_date,collected_at=excluded.collected_at,url=excluded.url');
const getState=()=>JSON.parse(db.prepare("SELECT payload FROM cache WHERE key='pncp:cursor'").get()?.payload||'{"day":"2021-04-01","page":1}');
const setState=s=>db.prepare("INSERT INTO cache VALUES('pncp:cursor',?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").run(JSON.stringify(s),new Date().toISOString(),'https://pncp.gov.br/');
const nextDay=day=>new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const compact=s=>s.replaceAll('-','');const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const collect=async(day,page,changes=false)=>{const url=`https://pncp.gov.br/api/consulta/v1/contratos${changes?"/atualizacao":""}?dataInicial=${compact(day)}&dataFinal=${compact(day)}&pagina=${page}&tamanhoPagina=100`;const response=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{Accept:'application/json'}});if(response.status===204)return {next:false,count:0};if(!response.ok)throw Error(`PNCP HTTP ${response.status}`);const result=await response.json();if(!Array.isArray(result.data))throw Error('PNCP retornou estrutura desconhecida');const now=new Date().toISOString();db.transaction(()=>{for(const row of result.data){const key=String(row.niFornecedor||'').replace(/\D/g,'');if(key.length!==14)continue;const control=String(row.numeroControlePNCP||'');if(!control)continue;const org=String(row.orgaoEntidade?.cnpj||'');const href=`https://pncp.gov.br/app/contratos/${org}/${row.anoContrato}/${row.sequencialContrato}`;write.run('pncp:'+control,'PNCP',key,'contract',String(row.objetoContrato||'Objeto não informado'),row.dataAssinatura||null,href,JSON.stringify(row),now);}})();return {next:Number(result.totalPaginas)>page,count:result.data.length,url};};
db.exec('CREATE TABLE IF NOT EXISTS worker_lock(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL)');
const owner=`${process.pid}:${Date.now()}`;
const locked=db.prepare("INSERT INTO worker_lock VALUES('pncp',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE worker_lock.expires<?").run(owner,Date.now()+7200000,Date.now()).changes;
if(!locked){console.log('PNCP: uma atualização já está em execução');db.close();process.exit(0);}
let updated=0;
try{
 // Recheck the latest three days, including late changes. Historical coverage advances durably.
 for(let offset=2;offset>=0;offset--){const day=new Date(Date.parse(today+'T12:00:00Z')-offset*86400000).toISOString().slice(0,10);for(let page=1;page<=1000;page++){const r=await collect(day,page,true);updated+=r.count;if(!r.next)break;if(page===1000)throw Error('Janela recente excedeu 1000 páginas; aumente a capacidade sem declarar a cobertura completa.');}}
 const cursor=getState();for(let i=0;i<60&&cursor.day<today;i++){const r=await collect(cursor.day,cursor.page);updated+=r.count;if(r.next)cursor.page++;else{cursor.day=nextDay(cursor.day);cursor.page=1;}setState(cursor);}
 db.prepare('INSERT INTO sync_run(source,status,checked_at,changed_at,detail) VALUES(?,?,?,?,?)').run('PNCP','success',new Date().toISOString(),updated?new Date().toISOString():null,JSON.stringify({rows:updated,historicalCursor:cursor,latestWindowDays:3}));
 console.log(JSON.stringify({source:'PNCP',status:'success',rows:updated,historicalCursor:cursor}));
}catch(error){db.prepare('INSERT INTO sync_run(source,status,checked_at,detail) VALUES(?,?,?,?)').run('PNCP','failed',new Date().toISOString(),String(error));console.error(String(error));process.exitCode=1;}finally{db.prepare("DELETE FROM worker_lock WHERE name='pncp' AND owner=?").run(owner);db.close();}
