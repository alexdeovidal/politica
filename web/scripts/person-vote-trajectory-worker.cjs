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
    parentPort.postMessage({ elections: [], cityComparison: [] });
  } else {
    const grouped = database.prepare(`
      SELECT v.history_id AS historyId, v.year, v.round, v.state,
             v.municipality_code AS municipalityCode, v.municipality,
             sum(v.votes) AS votes, count(*) AS sections
      FROM election_vote_section v
      WHERE v.history_id IN (SELECT id FROM politician_history WHERE person_id = ?)
      GROUP BY v.history_id, v.year, v.round, v.state, v.municipality_code, v.municipality
      ORDER BY v.year, v.round, votes DESC
    `).all(personId);

    const elections = new Map();
    for (const row of grouped) {
      const historyId = Number(row.historyId);
      let election = elections.get(historyId);
      if (!election) {
        election = {
          historyId,
          year: Number(row.year),
          round: Number(row.round) || 1,
          totalVotes: 0,
          sectionCount: 0,
          cities: new Map(),
          states: new Map(),
        };
        elections.set(historyId, election);
      }

      const votes = Number(row.votes) || 0;
      election.totalVotes += votes;
      election.sectionCount += Number(row.sections) || 0;
      if (votes <= 0) continue;

      const state = String(row.state || "").trim();
      const municipality = String(row.municipality || "").trim();
      const municipalityCode = String(row.municipalityCode || "").trim();
      if (state) election.states.set(state, (election.states.get(state) || 0) + votes);

      if (municipality || municipalityCode) {
        const cityKey = `${state}|${municipalityCode || municipality.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")}`;
        const city = election.cities.get(cityKey) || {
          state: state || "UF não informada",
          municipality: municipality || municipalityCode,
          municipalityCode,
          votes: 0,
        };
        city.votes += votes;
        election.cities.set(cityKey, city);
      }
    }

    const electionRows = [...elections.values()].map((election) => ({
      historyId: election.historyId,
      year: election.year,
      round: election.round,
      totalVotes: election.totalVotes,
      sectionCount: election.sectionCount,
      municipalityCount: election.cities.size,
      stateCount: election.states.size,
      topMunicipalities: [...election.cities.values()]
        .sort((a, b) => b.votes - a.votes || a.municipality.localeCompare(b.municipality, "pt-BR"))
        .slice(0, 3),
      topStates: [...election.states.entries()]
        .map(([state, votes]) => ({ state, votes }))
        .sort((a, b) => b.votes - a.votes || a.state.localeCompare(b.state))
        .slice(0, 3),
    }));

    const finalElectionByYear = new Map();
    for (const election of electionRows) {
      const current = finalElectionByYear.get(election.year);
      if (!current || election.round > current.round) finalElectionByYear.set(election.year, election);
    }

    const cityTotals = new Map();
    for (const election of finalElectionByYear.values()) {
      const source = elections.get(election.historyId);
      if (!source) continue;
      for (const [cityKey, city] of source.cities) {
        const current = cityTotals.get(cityKey) || {
          state: city.state,
          municipality: city.municipality,
          totalVotes: 0,
          votesByYear: {},
        };
        current.totalVotes += city.votes;
        current.votesByYear[election.year] = city.votes;
        cityTotals.set(cityKey, current);
      }
    }

    const cityComparison = [...cityTotals.values()]
      .sort((a, b) => b.totalVotes - a.totalVotes || a.municipality.localeCompare(b.municipality, "pt-BR"))
      .slice(0, 6)
      .map(({ state, municipality, votesByYear }) => ({ state, municipality, votesByYear }));

    parentPort.postMessage({
      elections: electionRows.sort((a, b) => a.year - b.year || a.round - b.round),
      cityComparison,
    });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Candidate vote trajectory query failed" });
} finally {
  database.close();
}
