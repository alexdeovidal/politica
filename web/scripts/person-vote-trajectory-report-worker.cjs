const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

try {
  const personId = Number(workerData.personId);
  const hasVotes = Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='election_vote_section'",
  ).get());

  if (!Number.isSafeInteger(personId) || personId < 1 || !hasVotes) {
    parentPort.postMessage({ elections: [] });
  } else {
    const rows = database.prepare(`
      SELECT v.history_id AS historyId, v.year, v.round, v.state,
             v.municipality_code AS municipalityCode, v.municipality,
             sum(v.votes) AS votes, count(*) AS sections
      FROM election_vote_section v
      WHERE v.year >= 2012
        AND v.history_id IN (SELECT id FROM politician_history WHERE person_id = ?)
      GROUP BY v.history_id, v.year, v.round, v.state, v.municipality_code, v.municipality
      ORDER BY v.year, v.round, votes DESC
    `).all(personId);

    const elections = new Map();
    for (const row of rows) {
      const historyId = Number(row.historyId);
      let election = elections.get(historyId);
      if (!election) {
        election = {
          historyId,
          year: Number(row.year),
          round: Number(row.round) || 1,
          totalVotes: 0,
          sectionCount: 0,
          municipalities: new Map(),
          states: new Map(),
        };
        elections.set(historyId, election);
      }

      const votes = Number(row.votes) || 0;
      const sections = Number(row.sections) || 0;
      const state = String(row.state || "").trim() || "UF não informada";
      const municipality = String(row.municipality || "").trim();
      const municipalityCode = String(row.municipalityCode || "").trim();
      election.totalVotes += votes;
      election.sectionCount += sections;
      election.states.set(state, (election.states.get(state) || 0) + votes);

      if (municipality || municipalityCode) {
        const cityKey = `${state}|${municipalityCode || municipality.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")}`;
        const city = election.municipalities.get(cityKey) || {
          state,
          municipality: municipality || municipalityCode,
          municipalityCode,
          votes: 0,
          sections: 0,
        };
        city.votes += votes;
        city.sections += sections;
        election.municipalities.set(cityKey, city);
      }
    }

    parentPort.postMessage({
      elections: [...elections.values()].map((election) => ({
        historyId: election.historyId,
        year: election.year,
        round: election.round,
        totalVotes: election.totalVotes,
        sectionCount: election.sectionCount,
        municipalities: [...election.municipalities.values()]
          .sort((a, b) => b.votes - a.votes || a.municipality.localeCompare(b.municipality, "pt-BR")),
        states: [...election.states.entries()]
          .map(([state, votes]) => ({ state, votes }))
          .sort((a, b) => b.votes - a.votes || a.state.localeCompare(b.state, "pt-BR")),
      })),
    });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Candidate vote trajectory report query failed" });
} finally {
  database.close();
}
