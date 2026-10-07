const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

try {
  database.function("normalize_public_name", { deterministic: true }, normalizeName);
  const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='parliamentary_earmark_beneficiary'").get();
  if (!exists) {
    parentPort.postMessage({ rows: [], total: 0, types: [] });
  } else if (workerData.mode === "options") {
    const types = database.prepare("SELECT DISTINCT earmark_type AS name FROM parliamentary_earmark WHERE earmark_type IS NOT NULL ORDER BY name").all().map(row => row.name);
    parentPort.postMessage({ types });
  } else {
    const types = database.prepare("SELECT DISTINCT earmark_type AS name FROM parliamentary_earmark WHERE earmark_type IS NOT NULL ORDER BY name").all().map(row => row.name);
    const page = Math.max(1, Math.min(10000, Math.floor(Number(workerData.page) || 1)));
    const offset = (page - 1) * 50;
    const query = String(workerData.q || "").trim().slice(0, 200);
    const year = Number.isInteger(workerData.year) ? workerData.year : null;
    const type = String(workerData.type || "").slice(0, 120);
    const includePublic = workerData.includePublic === true;
    const passthrough = ["00000000000191", "00360305000104", "00038166000105"];
    const governmentPatterns = [
      "MUNICIPIO D%", "ESTADO D%", "PREFEITURA%", "GOVERNO D%", "CAMARA MUNICIPAL%",
      "ASSEMBLEIA LEGISLATIVA%", "UNIAO FEDERAL%", "%MINISTERIO%", "%SECRETARIA%",
      "%FUNDO ESTADUAL%", "%FUNDO MUNICIPAL%", "%FUNDO NACIONAL%", "%FUNDO ESPECIAL%",
      "%FUNDO DE SAUDE%", "%DEPARTAMENTO DE ESTRADAS%",
      "CONSORCIO INTERFEDERATIVO%", "CONSORCIO PUBLICO%", "CONSORCIO INTERMUNICIPAL%",
    ];
    const cte = `WITH agg AS (
      SELECT earmark_code, beneficiary_doc, beneficiary_name, sum(amount_cents) AS amountCents
      FROM parliamentary_earmark_beneficiary
      WHERE beneficiary_type LIKE 'Pessoa Jur%' AND earmark_code != 'Sem informação'
        ${includePublic ? "" : `AND beneficiary_doc NOT IN (${passthrough.map(() => "?").join(", ")}) AND ${governmentPatterns.map(() => "beneficiary_name NOT LIKE ?").join(" AND ")}`}
      GROUP BY earmark_code, beneficiary_doc
    ), author AS (
      SELECT earmark_code, author_name, author_person_id, year, earmark_type, program_name, action_name, locality,
             row_number() OVER(PARTITION BY earmark_code ORDER BY id) AS rn
      FROM parliamentary_earmark
    ), joined AS (
      SELECT agg.earmark_code AS earmarkCode, agg.beneficiary_doc AS companyCnpj,
             agg.beneficiary_name AS companyName, agg.amountCents,
             author.author_name AS authorName, author.author_person_id AS authorPersonId,
             author.year AS year, author.earmark_type AS earmarkType,
             author.program_name || ' · ' || author.action_name AS purpose, author.locality,
             (SELECT col.url FROM parliamentary_earmark_beneficiary b JOIN parse pa ON pa.id=b.provenance_id JOIN collection col ON col.id=pa.collection_id WHERE b.earmark_code=agg.earmark_code AND b.beneficiary_doc=agg.beneficiary_doc LIMIT 1) AS sourceUrl,
             (SELECT max(b.collected_at) FROM parliamentary_earmark_beneficiary b WHERE b.earmark_code=agg.earmark_code AND b.beneficiary_doc=agg.beneficiary_doc) AS collectedAt
      FROM agg LEFT JOIN author ON author.earmark_code=agg.earmark_code AND author.rn=1
    )`;
    const filters = [];
    const queryArgs = [];
    if (query) { filters.push("(instr(normalize_public_name(companyName), normalize_public_name(?)) > 0 OR instr(normalize_public_name(authorName), normalize_public_name(?)) > 0)"); queryArgs.push(query, query); }
    if (year !== null) { filters.push("year = ?"); queryArgs.push(year); }
    if (type) { filters.push("earmarkType = ?"); queryArgs.push(type); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const cteArgs = includePublic ? [] : [...passthrough, ...governmentPatterns];
    const total = database.prepare(`${cte} SELECT count(*) AS total FROM joined ${where}`).get(...cteArgs, ...queryArgs).total;
    const rows = database.prepare(`${cte} SELECT * FROM joined ${where} ORDER BY amountCents DESC LIMIT ? OFFSET ?`)
      .all(...cteArgs, ...queryArgs, 50, offset);
    const personIds = [...new Set(rows.map(row => row.authorPersonId).filter(id => id != null))];
    let photos = new Map();
    if (personIds.length && database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='candidate_photo'").get()) {
      const placeholders = personIds.map(() => "?").join(",");
      const photoRows = database.prepare(`SELECT person_id AS personId, photo_url AS photoUrl, max(year) AS year FROM candidate_photo WHERE person_id IN (${placeholders}) GROUP BY person_id`).all(...personIds);
      photos = new Map(photoRows.map(row => [row.personId, row.photoUrl]));
    }
    parentPort.postMessage({
      page,
      total,
      types,
      rows: rows.map(row => ({
        earmarkCode: row.earmarkCode,
        year: row.year ?? null,
        authorName: row.authorName ?? null,
        authorPersonId: row.authorPersonId ?? null,
        authorPhotoUrl: row.authorPersonId != null ? (photos.get(row.authorPersonId) ?? null) : null,
        companyName: row.companyName ?? null,
        companyCnpj: row.companyCnpj,
        amountCents: row.amountCents,
        earmarkType: row.earmarkType ?? null,
        purpose: row.purpose ?? null,
        locality: row.locality ?? null,
        sourceUrl: row.sourceUrl ?? null,
        collectedAt: row.collectedAt ?? null,
      })),
    });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Failed to load earmarks" });
} finally {
  database.close();
}
