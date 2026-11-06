const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');

async function query(file, workerData) {
 const child=fork(path.join(__dirname,'database-worker-host.cjs'),[],{env:{...process.env,ELOSYS_DB_PATH:file},execArgv:[],stdio:['ignore','inherit','inherit','ipc']});
 return new Promise((resolve,reject)=>{
  let result, received=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('query timed out'));},5000);
  child.once('message',message=>{result=message;received=true;});
  child.once('error',reject);
  child.once('close',code=>{clearTimeout(timer);if(code!==0||!received)reject(new Error('missing IPC result'));else if(result.error)reject(new Error(result.error));else resolve(result);});
  child.send({scriptPath:path.join(__dirname,'query-worker.cjs'),workerData});
 });
}

test('isolated finance preserves filters, pagination, payments and large IPC replies',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'politica-finance-test-'));
 const file=path.join(dir,'test.db'),db=new Database(file);
 db.exec(`
 CREATE TABLE campaign_org(id INTEGER PRIMARY KEY,person_id INTEGER);
 CREATE INDEX org_person ON campaign_org(person_id);
 CREATE TABLE campaign_expense(id INTEGER PRIMARY KEY,campaign_org_id INTEGER,year INTEGER,expense_date TEXT,amount_cents INTEGER,supplier_name TEXT,supplier_cpf_cnpj TEXT,description TEXT,provenance_id INTEGER);
 CREATE INDEX expense_org ON campaign_expense(campaign_org_id);
 CREATE TABLE campaign_expense_payment(campaign_expense_id INTEGER,amount_cents INTEGER);
 CREATE INDEX payment_expense ON campaign_expense_payment(campaign_expense_id);
 CREATE TABLE company_registry(cnpj TEXT PRIMARY KEY,opened_at TEXT);
 CREATE TABLE parse(id INTEGER PRIMARY KEY,collection_id INTEGER,parser_name TEXT,parser_version TEXT);
 CREATE TABLE collection(id INTEGER PRIMARY KEY,source_id INTEGER,url TEXT,accessed_at TEXT,payload_sha256 TEXT);
 CREATE TABLE source(id INTEGER PRIMARY KEY,name TEXT,agency TEXT,legal_basis TEXT);
 INSERT INTO source VALUES(1,'TSE','TSE',NULL);
 INSERT INTO collection VALUES(1,1,'https://example.test','2026-01-01','fixture');
 INSERT INTO parse VALUES(1,1,'fixture','1');
 INSERT INTO campaign_org VALUES(1,7),(2,99);
 INSERT INTO campaign_expense_payment VALUES(27,200),(27,300);
 `);
 const insert=db.prepare('INSERT INTO campaign_expense VALUES(?,?,?,?,?,?,?,?,?)');
 for(let i=1;i<=27;i++)insert.run(i,1,2024,'2024-09-01',i*100,'Fornecedor '+i,'123','x'.repeat(30000),1);
 insert.run(28,2,2024,'2024-09-01',99999,'Outro candidato','123','outro',1);
 insert.run(29,1,2022,'2022-09-01',99999,'Outro ano','123','outro',1);
 db.close();
 const params={scope:'candidate',dir:'spent',id:'7',year:2024};
 try {
  const first=await query(file,{mode:'finance-page',params});
  assert.equal(first.total,27);assert.equal(first.rows.length,25);
  assert.equal(first.rows[0].id,27);assert.equal(first.rows[0].paidCents,500);
  assert.equal(first.rows[24].detail.length,30000);assert.equal(first.rows[0].provenance.sourceName,'TSE');
  const second=await query(file,{mode:'finance-page',params:{...params,page:2}});
  assert.deepEqual(second.rows.map(r=>r.id),[2,1]);
  const filtered=await query(file,{mode:'finance-page',params:{...params,q:'Fornecedor 27',amountMinCents:400,amountMaxCents:600}});
  assert.equal(filtered.total,1);assert.equal(filtered.rows[0].id,27);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('isolated candidate query preserves totals and section counts',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'politica-query-test-'));
 const file=path.join(dir,'test.db');const db=new Database(file);
 db.exec(`CREATE TABLE politician_history(id INTEGER PRIMARY KEY,person_id INTEGER,year INTEGER,round INTEGER,office TEXT,state TEXT,electoral_unit TEXT,municipality TEXT,party_abbr TEXT,candidate_number TEXT,tse_candidacy_id TEXT,full_name TEXT,ballot_name TEXT,result TEXT);
 CREATE TABLE election_vote_section(history_id INTEGER,votes INTEGER);
 INSERT INTO politician_history(id,person_id,year,round,office) VALUES(1,7,2024,1,'VEREADOR');
 INSERT INTO election_vote_section VALUES(1,200),(1,350);`);db.close();
 const child=fork(path.join(__dirname,'database-worker-host.cjs'),[],{env:{...process.env,ELOSYS_DB_PATH:file},execArgv:[],stdio:['ignore','inherit','inherit','ipc']});
 try {
  const result=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.send({scriptPath:path.join(__dirname,'query-worker.cjs'),workerData:{mode:'person-votes',personId:7}});});
  assert.equal(result[0].totalVotes,550);assert.equal(result[0].sectionCount,2);assert.equal(result[0].office,'VEREADOR');
 } finally {child.kill();rmSync(dir,{recursive:true,force:true});}
});
