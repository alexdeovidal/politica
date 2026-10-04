/** Offline collector regression: rate limit, interrupted page, durable resumption. */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
const dir=mkdtempSync(path.join(os.tmpdir(),'politica-pncp-test-'));
process.env.POLITICA_PLATFORM_DB_PATH=path.join(dir,'fixture.db');
const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;
globalThis.setTimeout=callback=>{queueMicrotask(callback);return 0;};
let calls=0;
const row=n=>({niFornecedor:'11222333000181',numeroControlePNCP:'FIXTURE-'+n,orgaoEntidade:{cnpj:'99888777000166'},anoContrato:2026,sequencialContrato:n,objetoContrato:'Contrato fictício de teste'});
try{
 globalThis.fetch=async()=>{calls++;if(calls===1)return new Response('',{status:429,headers:{'Retry-After':'1'}});if(calls===2)return Response.json({data:[row(1)],totalPaginas:2});throw Error('Interrupção simulada');};
 await import('./sync-public-sources.mjs?fixture=first');process.exitCode=0;
 let con=new Database(process.env.POLITICA_PLATFORM_DB_PATH);
 assert.equal(con.prepare('SELECT count(*) AS n FROM external_record').get().n,1);
 assert.equal(JSON.parse(con.prepare("SELECT payload FROM cache WHERE key='pncp:recent-cursor'").get().payload).page,2);
 assert.equal(con.prepare('SELECT count(*) AS n FROM worker_lock').get().n,0);con.close();
 let resumed=false;
 globalThis.fetch=async url=>{if(!resumed){assert.equal(new URL(url).searchParams.get('pagina'),'2');resumed=true;return Response.json({data:[row(2)],totalPaginas:2});}return new Response(null,{status:204});};
 await import('./sync-public-sources.mjs?fixture=second');
 con=new Database(process.env.POLITICA_PLATFORM_DB_PATH);
 assert.equal(con.prepare('SELECT count(*) AS n FROM external_record').get().n,2);
 assert.equal(con.prepare("SELECT count(*) AS n FROM cache WHERE key='pncp:recent-cursor'").get().n,0);
 assert.equal(con.prepare('SELECT status FROM sync_run ORDER BY id DESC LIMIT 1').get().status,'success');
 assert.equal(con.prepare('SELECT count(*) AS n FROM worker_lock').get().n,0);con.close();
 const recentStamp=new Database(process.env.POLITICA_PLATFORM_DB_PATH);const originalStamp=recentStamp.prepare("SELECT updated_at FROM cache WHERE key='pncp:recent-completed'").get().updated_at;recentStamp.close();
 let timeoutCalls=0;globalThis.fetch=async url=>{assert.ok(!new URL(url).pathname.endsWith('/atualizacao'),'A completed recent window is not redownloaded within four hours');if(timeoutCalls++===0)throw Object.assign(new Error('Tempo limite simulado'),{name:'TimeoutError'});return new Response(null,{status:204});};
 await import('./sync-public-sources.mjs?fixture=third');assert.equal(timeoutCalls,61);
 con=new Database(process.env.POLITICA_PLATFORM_DB_PATH);assert.equal(con.prepare("SELECT updated_at FROM cache WHERE key='pncp:recent-completed'").get().updated_at,originalStamp);assert.equal(con.prepare('SELECT status FROM sync_run ORDER BY id DESC LIMIT 1').get().status,'success');assert.equal(con.prepare('SELECT count(*) AS n FROM worker_lock').get().n,0);con.prepare("UPDATE cache SET updated_at='2000-01-01T00:00:00Z' WHERE key='pncp:recent-completed'").run();con.close();
 let recentRequested=false;globalThis.fetch=async url=>{if(new URL(url).pathname.endsWith('/atualizacao'))recentRequested=true;return new Response(null,{status:204});};await import('./sync-public-sources.mjs?fixture=fourth');assert.ok(recentRequested,'An expired recent window is refreshed');
 console.log('PNCP mock: rate limits, timeouts, preservation, cursor resumption and recent-window freshness passed');
}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;rmSync(dir,{recursive:true,force:true});}
