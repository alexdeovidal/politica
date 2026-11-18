import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

const chamberUrl = "https://dadosabertos.camara.leg.br/arquivos/funcionarios/json/funcionarios.json";
const electoralPath = process.env.ELOSYS_DB_PATH ?? "../elosys.db";
const municipalPath = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(electoralPath), "caldas-novas.db");
const normalize = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

if (existsSync(municipalPath)) {
  const local = new Database(municipalPath, {timeout: 5000});
  try {
    const has = name => local.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (has("supplier_snapshot")) await sync(local);
  } finally {
    local.close();
  }
}

async function sync(local) {
  local.exec(`
    CREATE TABLE IF NOT EXISTS supplier_political_links (
      cnpj TEXT PRIMARY KEY, snapshot_id INTEGER NOT NULL, checked TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supplier_chamber_snapshot (
      id INTEGER PRIMARY KEY CHECK(id=1), checked TEXT NOT NULL, payload TEXT NOT NULL
    );
  `);
  let chamber = local.prepare("SELECT checked,payload FROM supplier_chamber_snapshot WHERE id=1").get();
  if (!chamber || Date.now() - Date.parse(chamber.checked) >= 24 * 3600_000) {
    try {
      const response = await fetch(chamberUrl, {signal: AbortSignal.timeout(20_000)});
      if (!response.ok) throw new Error(`Câmara HTTP ${response.status}`);
      const {dados} = await response.json();
      if (!Array.isArray(dados) || dados.length < 1000 || dados.length > 40000) throw new Error("Arquivo da Câmara incompleto ou inesperado");
      const staff = dados.filter(row => [row.nome, row.cargo, row.grupo].every(v => typeof v === "string") &&
        /SECRET.RI[OA] PARLAMENTAR|NATUREZA ESPECIAL|ASSESSOR/.test(normalize(row.cargo + " " + row.grupo)));
      if (!staff.length) throw new Error("Cadastro da Câmara sem registros de assessoria");
      chamber = { checked: new Date().toISOString(), payload: JSON.stringify(staff.map(row => ({
        name: normalize(row.nome), role: [row.grupo, row.cargo].filter(Boolean).join(" · "), unit: row.lotacao, appointed: row.dataNomeacao,
      }))) };
      local.prepare("INSERT OR REPLACE INTO supplier_chamber_snapshot VALUES (1,?,?)").run(chamber.checked,chamber.payload);
    } catch (error) { console.warn("[caldas-political-links]", error.message); }
  }

  const staffByName = new Map();
  for (const row of JSON.parse(chamber?.payload ?? "[]")) {
    const list = staffByName.get(row.name) ?? [];
    list.push({ role: row.role, unit: row.unit, appointed: row.appointed });
    staffByName.set(row.name, list);
  }
  if (!existsSync(electoralPath)) return;
  const db = new Database(electoralPath, {readonly:true,fileMustExist:true,timeout:1000});
  try {
    const rows = local.prepare(`
      WITH suppliers AS (SELECT cnpj,max(id) AS id FROM supplier_snapshot GROUP BY cnpj)
      SELECT s.cnpj,s.id,s.payload FROM suppliers t JOIN supplier_snapshot s ON s.id=t.id
      LEFT JOIN supplier_political_links l ON l.cnpj=s.cnpj
      WHERE l.cnpj IS NULL OR l.snapshot_id <> s.id OR l.checked < ?
      ORDER BY l.checked LIMIT 24
    `).all(new Date(Date.now()-24*3600_000).toISOString());
    const findPeople = db.prepare(`
      SELECT p.id,p.cpf,p.cpf_trusted FROM people p
      WHERE p.canonical_name=? AND EXISTS (SELECT 1 FROM politician_history ph WHERE ph.person_id=p.id)
      ORDER BY p.id LIMIT 21`);
    const history = db.prepare(`
      SELECT DISTINCT h.year,h.office,h.party_abbr AS party,h.state,h.municipality,h.result,col.url
      FROM politician_history h JOIN parse pa ON pa.id=h.provenance_id JOIN collection col ON col.id=pa.collection_id
      WHERE h.person_id=? ORDER BY h.year DESC,h.office,h.state LIMIT 12`);
    const expenses = db.prepare(`
      SELECT t.id,t.year,t.description,t.amount_cents AS contracted,t.expense_date AS day,
        co.person_id AS personId,co.candidate_name AS candidate,co.office,co.state,col.url,
        (SELECT sum(p.amount_cents) FROM campaign_expense_payment p WHERE p.campaign_expense_id=t.id) AS paid
      FROM campaign_expense t LEFT JOIN campaign_org co ON co.id=t.campaign_org_id
      JOIN parse pa ON pa.id=t.provenance_id JOIN collection col ON col.id=pa.collection_id
      WHERE t.supplier_cpf_cnpj=? ORDER BY t.year DESC,t.id DESC LIMIT 8`);
    const write = local.prepare(`
      INSERT INTO supplier_political_links VALUES (?,?,?,?) ON CONFLICT(cnpj) DO UPDATE
      SET snapshot_id=excluded.snapshot_id, checked=excluded.checked,payload=excluded.payload
      WHERE excluded.snapshot_id >= supplier_political_links.snapshot_id AND excluded.checked > supplier_political_links.checked`);
    const checked = new Date().toISOString();
    for (const row of rows) {
      const registration = JSON.parse(row.payload);
      const partners = registration.partners.filter(person => !person.corporate).slice(0, 100).flatMap(person => {
        const name = normalize(person.name);
        if (!name.includes(" ")) return [];
        const candidates = findPeople.all(name);
        const matchingDocument = candidates.filter(p => /^\d{11}$/.test(p.cpf ?? "") &&
          hash([person.name, "***" + p.cpf.slice(3,9) + "**"]) === person.key);
        const hasMask = person.key !== hash([person.name, null]);
        const matches = hasMask ? matchingDocument : candidates;
        const political = matches.slice(0,3).map(p => ({
          id:p.id, elections:history.all(p.id),
          confidence: matchingDocument.length === 1 && p.cpf_trusted ? "masked" : "name",
          expenses: matchingDocument.length === 1 && p.cpf_trusted && matchingDocument[0].id === p.id ? expenses.all(p.cpf) : [],
        }));
        const staff = (staffByName.get(name) ?? []).slice(0, 5);
        return political.length || staff.length ? [{ name:person.name,key:person.key,candidates:political,matches:matches.length,staff }] : [];
      });
      write.run(row.cnpj,row.id,checked,JSON.stringify({partners, companyExpenses:expenses.all(row.cnpj), chamberChecked:chamber?.checked ?? null, chamberUrl}));
    }
    if (rows.length) console.log(`[caldas-political-links] ${rows.length} fornecedores cruzados`);
  } finally { db.close(); }
}
