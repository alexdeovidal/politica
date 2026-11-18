import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { supplierSchema } from "./sync-caldas-suppliers.mjs";

const relations = new Set(["conjuge", "companheiro", "pai-mae-filho", "avo-neto", "irmao", "bisavo-bisneto", "tio-sobrinho", "primo", "afinidade-1", "afinidade-2", "afinidade-3"]);
const required = (row, field, limit = 250) => {
  const value = typeof row[field] === "string" ? row[field].trim() : "";
  if (!value || value.length > limit) throw new Error(`Campo inválido: ${field}`);
  return value;
};
const date = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Data documental inválida");
  return value;
};

if (!process.argv[2]) throw new Error("Informe o arquivo JSON revisado com as evidências documentais");
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(data) || !data.length || data.length > 1000) throw new Error("Informe de 1 a 1000 registros");
const file = process.env.MUNICIPAL_DB_PATH ?? path.join(path.dirname(process.env.ELOSYS_DB_PATH ?? "../elosys.db"), "caldas-novas.db");
const db = new Database(file, { fileMustExist: true, timeout: 5000 });
try {
  supplierSchema(db);
  const find = db.prepare("SELECT supplier_cnpj FROM contract WHERE id=?");
  const insert = db.prepare("INSERT OR REPLACE INTO supplier_kinship VALUES (?,?,?,?,?,?,?,?,?)");
  db.transaction(() => {
    for (const row of data) {
      const id = required(row, "contractId");
      const cnpj = required(row, "cnpj");
      if (!/^\d{14}$/.test(cnpj) || find.get(id)?.supplier_cnpj !== cnpj) throw new Error("O contrato não pertence ao CNPJ informado");
      const relationship = required(row, "relationship");
      if (!relations.has(relationship)) throw new Error("Tipo de parentesco não reconhecido");
      const url = new URL(required(row, "sourceUrl", 2000));
      if (url.protocol !== "https:" || !url.hostname.endsWith(".gov.br") && !url.hostname.endsWith(".jus.br") ||
          url.username || url.password || url.port) throw new Error("Use um documento público oficial em HTTPS");
      const evidence = required(row, "evidence", 500);
      if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(evidence)) throw new Error("Remova documentos pessoais do resumo público");
      insert.run(id, cnpj, required(row, "partner"), required(row, "official"), required(row, "office"),
        relationship, url.href, date(required(row, "documentDate")), evidence);
    }
  })();
  console.log(`${data.length} evidências documentais registradas`);
} finally {
  db.close();
}
