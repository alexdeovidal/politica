const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
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
