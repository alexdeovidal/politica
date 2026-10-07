const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

try {
  const { historyId, page, query } = workerData;
  const pageSize = 25;
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  if (!tables.has("election_vote_section")) {
    parentPort.postMessage({ sections: [], total: 0, pageSize });
  } else {
    const trimmedQuery = String(query || "").trim().slice(0, 100);
    const filterSql = trimmedQuery
      ? `AND (
           COALESCE(t.municipality, '') LIKE ? ESCAPE '\\' OR
           COALESCE(t.polling_place_name, '') LIKE ? ESCAPE '\\' OR
           COALESCE(t.polling_place_address, '') LIKE ? ESCAPE '\\' OR
           COALESCE(t.polling_place_number, '') LIKE ? ESCAPE '\\' OR
           COALESCE(t.zone_number, '') LIKE ? ESCAPE '\\' OR
           COALESCE(t.section_number, '') LIKE ? ESCAPE '\\'
         )`
      : "";
    const pattern = `%${trimmedQuery.replace(/[\\%_]/g, "\\$&")}%`;
    const filterParams = trimmedQuery ? [pattern, pattern, pattern, pattern, pattern, pattern] : [];
    const total = database.prepare(`SELECT COUNT(*) AS total FROM election_vote_section t WHERE t.history_id = ? ${filterSql}`)
      .get(historyId, ...filterParams).total;
    const rows = database.prepare(
      `SELECT t.municipality, t.zone_number AS zoneNumber, t.section_number AS sectionNumber,
              t.polling_place_number AS pollingPlaceNumber,
              t.polling_place_name AS pollingPlaceName,
              t.polling_place_address AS pollingPlaceAddress, t.votes,
              src.name AS srcSourceName,
              src.agency AS srcAgency,
              src.legal_basis AS srcLegalBasis,
              col.url AS srcUrl,
              col.accessed_at AS srcAccessedAt,
              col.payload_sha256 AS srcSha256,
              pa.parser_name AS srcParserName,
              pa.parser_version AS srcParserVersion
       FROM election_vote_section t
       JOIN parse pa ON pa.id = t.provenance_id
       JOIN collection col ON col.id = pa.collection_id
       JOIN source src ON src.id = col.source_id
       WHERE t.history_id = ? ${filterSql}
       ORDER BY t.votes DESC, t.municipality COLLATE NOCASE, t.polling_place_name COLLATE NOCASE,
                t.zone_number, t.section_number
       LIMIT ? OFFSET ?`
    ).all(historyId, ...filterParams, pageSize, (page - 1) * pageSize);

    parentPort.postMessage({
      total,
      pageSize,
      sections: rows.map(row => ({
        municipality: row.municipality ?? null,
        zoneNumber: row.zoneNumber ?? null,
        sectionNumber: row.sectionNumber,
        pollingPlaceNumber: row.pollingPlaceNumber ?? null,
        pollingPlaceName: row.pollingPlaceName ?? null,
        pollingPlaceAddress: row.pollingPlaceAddress ?? null,
        votes: row.votes,
        provenance: {
          sourceName: row.srcSourceName,
          agency: row.srcAgency,
          legalBasis: row.srcLegalBasis ?? null,
          url: row.srcUrl,
          accessedAt: row.srcAccessedAt,
          sha256: row.srcSha256,
          parserName: row.srcParserName,
          parserVersion: row.srcParserVersion,
        },
      })),
    });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Vote section search failed" });
} finally {
  database.close();
}
