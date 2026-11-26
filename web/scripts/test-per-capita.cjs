const assert=require("node:assert/strict"), fs=require("node:fs"), os=require("node:os"), path=require("node:path");
const {buildSync}=require("esbuild");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"test-per-capita-"));
try{
 const entry=path.join(temp,"per-capita.cjs");
 buildSync({entryPoints:["src/lib/per-capita.ts"],bundle:true,platform:"node",format:"cjs",alias:{"server-only":"./scripts/server-only-noop.cjs"},outfile:entry});
 const lib=require(entry);
 const schoolEntry=path.join(temp,"school.cjs");
 buildSync({entryPoints:["src/lib/school-scenario.ts"],bundle:true,platform:"node",format:"cjs",outfile:schoolEntry});
 const {schoolScenario,inputCents}=require(schoolEntry);
 assert.equal(inputCents("1.200.000,00"),120000000);
 assert.equal(inputCents("838.85"),83885); assert.equal(inputCents(""),null);
 assert.equal(schoolScenario({tuition:85000,installments:12,seats:100,avoidable:120000000,extras:5000000}).balance,13000000);
 assert.equal(schoolScenario({tuition:85000,installments:12,seats:100,avoidable:100000000,extras:0}).balance,-2000000);
 assert.equal(schoolScenario({tuition:85000,installments:12,seats:0,avoidable:100000000,extras:0}),null);
 const go=lib.stateFor("GO"), df=lib.stateFor("DF");
 assert.equal(go.population,7423629);assert.equal(df.scope,"state");
 assert.equal(lib.fiscalPilot.entities.filter(row=>row.scope==="state").length,27);
 assert.equal(Object.keys(lib.fiscalPilot.populationSet).length,5596);
 assert.equal(lib.cityFor("5300108"),undefined);
 const calc=lib.stateAllocation("5204508",go);
 assert.equal(calc.population,106820);
 assert.equal(calc.groups.length,3);
 for(const [name,value] of [["count",calc.population],["annual",calc.annual],["monthly",calc.monthly]]) {
   assert.equal(calc.groups.reduce((n,g)=>n+g[name],0),value);
 }
 assert.equal(calc.monthlyPer,Math.round(go.totalCents/go.population/12));
 assert.equal(lib.stateAllocation("5204508",df),null);
 assert.equal(lib.stateAllocation("5101837",lib.stateFor("MT")).groups.length,0);
 assert.equal(lib.ranked([go,df],"state","Saúde").length,2);
 assert.equal(lib.fiscalEntity("5204508").educationSubfunctions["Educação Infantil"],3873082587);
 console.log("PASS: 27 UFs, 5.569 municípios, rateio e soma exatos, cidade sem Censo, escopo da fonte");
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
