const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const filename = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(filename, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");
const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
const hasTable = name => tables.has(name);

function factsFor(personId, views) {
  const candidate = database.prepare(`SELECT p.id,p.canonical_name AS name,h.id AS historyId,h.year,h.office,h.party_abbr AS party,h.state,h.municipality,h.result
    FROM people p JOIN politician_history h ON h.id=(SELECT hh.id FROM politician_history hh WHERE hh.person_id=p.id ORDER BY hh.year DESC,hh.round DESC,hh.id DESC LIMIT 1)
    WHERE p.id=?`).get(personId);
  if (!candidate || !candidate.name) return null;
  const facts = { candidate, views, processCount: 0, openProcessCount: 0, signals: [] };

  if (["electoral_case", "electoral_case_candidate"].every(hasTable)) {
    const totals = database.prepare(`SELECT count(*) AS total,sum(is_open) AS open FROM (
      SELECT ec.id,max(CASE WHEN ec.closed_at IS NULL THEN 1 ELSE 0 END) AS is_open
      FROM electoral_case_candidate cc JOIN electoral_case ec ON ec.id=cc.case_id WHERE cc.person_id=? GROUP BY ec.id
    )`).get(personId);
    facts.processCount = totals.total || 0;
    facts.openProcessCount = totals.open || 0;
    facts.recentProcess = database.prepare(`SELECT ec.case_number AS number,ec.source_dataset_year AS year,ec.filed_at AS filedAt,ec.closed_at AS closedAt,ec.class_name AS className,
      ec.main_subject AS subject,ec.last_decision_at AS lastDecisionAt,ec.last_decision_type AS lastDecisionType,cc.pole,
      COALESCE(NULLIF(ec.source_url,''),col.url) AS sourceUrl
      FROM electoral_case_candidate cc JOIN electoral_case ec ON ec.id=cc.case_id
      LEFT JOIN parse pa ON pa.id=ec.provenance_id LEFT JOIN collection col ON col.id=pa.collection_id
      WHERE cc.person_id=? ORDER BY COALESCE(ec.last_decision_at,ec.filed_at,ec.distributed_at,'') DESC,ec.case_number LIMIT 1`).get(personId);
  }

  if (["signal", "signal_actor", "signal_evidence", "campaign_expense", "rule_run"].every(hasTable)) {
    facts.signals = database.prepare(`SELECT ce.year,ce.description,ce.amount_cents AS amountCents,s.explanation,coalesce(col.url,'') AS sourceUrl
      FROM signal_actor sa JOIN signal s ON s.id=sa.signal_id JOIN rule_run rr ON rr.id=s.rule_run_id
      JOIN signal_evidence se ON se.signal_id=s.id AND se.table_name='campaign_expense'
      JOIN campaign_expense ce ON ce.id=se.record_id LEFT JOIN parse pa ON pa.id=ce.provenance_id LEFT JOIN collection col ON col.id=pa.collection_id
      WHERE sa.type='person' AND sa.actor_id=? AND rr.rule='disproportionate_expense'
      ORDER BY ce.amount_cents DESC,ce.year DESC LIMIT 3`).all(personId);
  }

  if (hasTable("election_vote_section")) {
    const vote = database.prepare(`SELECT ph.year,sum(v.votes) AS votes,count(*) AS sections,count(DISTINCT v.municipality_code) AS municipalities
      FROM politician_history ph JOIN election_vote_section v ON v.history_id=ph.id WHERE ph.person_id=?
      GROUP BY ph.id,ph.year ORDER BY ph.year DESC LIMIT 1`).get(personId);
    if (vote && vote.sections > 0) facts.votes = vote;
  }

  const donation = database.prepare(`SELECT co.year,count(*) AS count,coalesce(sum(d.amount_cents),0) AS amountCents
    FROM campaign_donation d JOIN campaign_org co ON co.id=d.campaign_org_id WHERE co.person_id=?
    GROUP BY co.year ORDER BY co.year DESC LIMIT 1`).get(personId);
  if (donation && donation.count) facts.donations = donation;
  const expense = database.prepare(`SELECT co.year,count(*) AS count,coalesce(sum(e.amount_cents),0) AS amountCents
    FROM campaign_expense e JOIN campaign_org co ON co.id=e.campaign_org_id WHERE co.person_id=?
    GROUP BY co.year ORDER BY co.year DESC LIMIT 1`).get(personId);
  if (expense && expense.count) facts.expenses = expense;
  if (hasTable("declared_assets")) {
    const assets = database.prepare(`SELECT year,count(*) AS count,count(value_cents) AS valuedCount,coalesce(sum(value_cents),0) AS amountCents
      FROM declared_assets WHERE person_id=? GROUP BY year ORDER BY year DESC LIMIT 1`).get(personId);
    if (assets && assets.count) facts.assets = assets;
  }
  return facts;
}

try {
  const profiles = Array.isArray(workerData.profiles) ? workerData.profiles : [];
  parentPort.postMessage(profiles.map(profile => factsFor(Number(profile.personId), Number(profile.views) || 0)).filter(Boolean));
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Could not load news facts" });
} finally {
  database.close();
}
