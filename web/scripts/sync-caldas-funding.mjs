import Database from "better-sqlite3";
import path from "node:path";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const file = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(process.env.ELOSYS_DB_PATH ?? "../elosys.db"), "caldas-novas.db");
if (existsSync(file)) {
  const db = new Database(file,{timeout:2500});
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS municipal_flow_revenue (
        year INTEGER PRIMARY KEY, period INTEGER NOT NULL, checked TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS municipal_flow_funding (
        tender TEXT PRIMARY KEY, checked TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS municipal_flow_source (
        tender TEXT NOT NULL, source_id INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY(tender,source_id)
      );
      CREATE INDEX IF NOT EXISTS municipal_flow_source_code ON municipal_flow_source(source_id,tender);
      CREATE TABLE IF NOT EXISTS municipal_flow_attempt (tender TEXT PRIMARY KEY, attempted TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS municipal_flow_pause (id INTEGER PRIMARY KEY CHECK(id=1), until_ms INTEGER NOT NULL);
    `);
    const has = name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (has("fiscal_snapshot")) {
      try { await syncRevenue(db); }
      catch (e) { console.warn("[caldas-flow:tesouro]",e.message); }
    }
    if (has("contract")) await syncFunding(db);
  } finally { db.close(); }
}

async function syncRevenue(db) {
  const targets = db.prepare(`
    SELECT f.year,f.period FROM fiscal_snapshot f LEFT JOIN municipal_flow_revenue r ON f.year=r.year
    WHERE r.year IS NULL OR r.period<f.period OR r.checked < ? ORDER BY f.year DESC
  `).all(new Date(Date.now()-12*3600_000).toISOString());
  const lookup = new Map([
    ["IPTULiquidoExcetoTransferenciasEFUNDEB",["IPTU","Arrecadação municipal"]],
    ["ISSLiquidoExcetoTransferenciasEFUNDEB",["ISS","Arrecadação municipal"]],
    ["ITBILiquidoExcetoTransferenciasEFUNDEB",["ITBI","Arrecadação municipal"]],
    ["IRRFLiquidoExcetoTransferenciasEFUNDEB",["IRRF","Receita registrada pelo município"]],
    ["RREO3CotaParteDoFPM",["FPM","Transferência da União"]],
    ["RREO3CotaParteDoITR",["Cota-parte do ITR","Transferência da União"]],
    ["RREO3CotaParteDoICMS",["Cota-parte do ICMS","Transferência estadual"]],
    ["RREO3CotaParteDoIPVA",["Cota-parte do IPVA","Transferência estadual"]],
    ["RREO3TransferenciasDoFUNDEB",["Fundeb","Transferência do fundo"]],
  ]);
  for (const {year,period} of targets) {
    const q=new URLSearchParams({an_exercicio:String(year),nr_periodo:String(period),co_tipo_demonstrativo:"RREO",no_anexo:"RREO-Anexo 03",id_ente:"5204508"});
    const url="https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?"+q;
    const response=await fetch(url,{signal:AbortSignal.timeout(13000)});
    if (!response.ok) throw new Error(`Siconfi HTTP ${response.status}`);
    const data=await response.json();
    if (!Array.isArray(data.items)||data.hasMore) throw new Error("Anexo 03 incompleto");
    const found=new Map();
    for (const row of data.items) {
      const label=lookup.get(row.cod_conta);
      if (!label || row.coluna!=="TOTAL (ÚLTIMOS 12 MESES)") continue;
      if (Number(row.cod_ibge)!==5204508 || Number(row.exercicio)!==year || Number(row.periodo)!==period ||
          row.anexo!=="RREO-Anexo 03" || !Number.isFinite(row.valor) || found.has(row.cod_conta)) throw new Error("Linha fiscal incompatível ou duplicada");
      found.set(row.cod_conta,{name:label[0],group:label[1],amount:Math.round(row.valor*100)});
    }
    if (!found.size) continue;
    db.prepare(`INSERT INTO municipal_flow_revenue VALUES (?,?,?,?)
      ON CONFLICT(year) DO UPDATE SET period=excluded.period,checked=excluded.checked,payload=excluded.payload
      WHERE excluded.period>=municipal_flow_revenue.period AND excluded.checked>municipal_flow_revenue.checked`)
      .run(year,period,new Date().toISOString(),JSON.stringify({year,period,url,items:[...found.values()]}));
  }
}

async function syncFunding(db) {
  if ((db.prepare("SELECT until_ms FROM municipal_flow_pause WHERE id=1").get()?.until_ms ?? 0)>Date.now()) return;
  const targets=db.prepare(`
    SELECT c.tender FROM contract c LEFT JOIN municipal_flow_funding f ON f.tender=c.tender
    LEFT JOIN municipal_flow_attempt a ON a.tender=c.tender
    WHERE c.initial=1 AND c.tender IS NOT NULL AND (f.checked IS NULL OR f.checked<?)
      AND (a.attempted IS NULL OR a.attempted<?)
    GROUP BY c.tender ORDER BY f.checked IS NOT NULL,a.attempted IS NOT NULL,max(c.amount_cents) DESC LIMIT 10
  `).all(new Date(Date.now()-7*86400_000).toISOString(), new Date(Date.now()-12*3600_000).toISOString());
  const save=db.transaction((id,checked,items)=>{
    const result=db.prepare(`INSERT INTO municipal_flow_funding VALUES (?,?,?)
      ON CONFLICT(tender) DO UPDATE SET checked=excluded.checked,payload=excluded.payload
      WHERE excluded.checked>municipal_flow_funding.checked`).run(id,checked,JSON.stringify(items));
    if (!result.changes) return;
    db.prepare("DELETE FROM municipal_flow_source WHERE tender=?").run(id);
    const put=db.prepare("INSERT INTO municipal_flow_source VALUES (?,?,?)");
    for (const row of items) put.run(id,row.id,row.name);
  });
  const mark=db.prepare("INSERT OR REPLACE INTO municipal_flow_attempt VALUES (?,?)");
  let collected=0;
  for (const {tender} of targets) {
    mark.run(tender,new Date().toISOString());
    const match=/^(\d{14})-1-(\d{1,12})\/(\d{4})$/.exec(tender);
    if (!match) continue;
    const [,org,seq,year]=match;
    const url=`https://pncp.gov.br/api/pncp/v1/orgaos/${org}/compras/${year}/${Number(seq)}/fonte-orcamentaria`;
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}});
      if (response.status===429 || response.status===503) {
        const header=response.headers.get("Retry-After") ?? "";
        const until=/^\d+$/.test(header)?Date.now()+Number(header)*1000:Date.parse(header)||0;
        db.prepare("INSERT OR REPLACE INTO municipal_flow_pause VALUES (1,?)").run(Math.max(until,Date.now()+30*60_000));
        await response.body?.cancel();
        break;
      }
      if (!response.ok) throw new Error(`PNCP HTTP ${response.status}`);
      const data=response.status===204?[]:await response.json();
      if (!Array.isArray(data) || data.length>100 || data.some(row => row.numeroControlePNCPCompra!==tender ||
          !Number.isSafeInteger(row.fonteOrcamentaria?.id) || row.fonteOrcamentaria.id<1 ||
          typeof row.fonteOrcamentaria?.nome!=="string" || !row.fonteOrcamentaria.nome.trim())) throw new Error("Fonte orçamentária incompatível");
      const items=[...new Map(data.map(({fonteOrcamentaria:s})=>[s.id,{id:s.id,name:s.nome.trim()}])).values()];
      save(tender,new Date().toISOString(),items);
      collected++;
    } catch (e) { console.warn("[caldas-flow:pncp]",tender,e.message); }
    await sleep(1600);
  }
  if (targets.length) console.log(`[caldas-flow:pncp] ${collected} fontes de contratações consultadas`);
}
