const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = workerData.databasePath || process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(), "../elosys.db");
const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

function normalizePublicTimestamp(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const timestamp = /^(?:\d{10}|\d{13})$/.test(raw) ? Number(raw) * (raw.length === 10 ? 1000 : 1) : Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

database.function("normalize_public_name", { deterministic: true }, normalizeName);
database.function("public_timestamp", { deterministic: true }, normalizePublicTimestamp);

function hasTable(name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function safeJsonArray(value) {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EXPENSE_CATEGORY_SPELLINGS = {
  CANETA: ["CANETA"], LAPIS: ["LAPIS", "LÁPIS"], LAPISEIRA: ["LAPISEIRA"],
  BORRACHA: ["BORRACHA"], APONTADOR: ["APONTADOR"], ADESIVO: ["ADESIVO"],
  CRACHA: ["CRACHA", "CRACHÁ"], ETIQUETA: ["ETIQUETA"], CLIPS: ["CLIPS"],
  GRAMPO: ["GRAMPO"], GRAMPEADOR: ["GRAMPEADOR"], REGUA: ["REGUA", "RÉGUA"],
  "BLOCO DE ANOTA": ["BLOCO DE ANOTA"], ENVELOPE: ["ENVELOPE"],
  "MARCADOR DE TEXTO": ["MARCADOR DE TEXTO"], PRANCHETA: ["PRANCHETA"],
  PERFURADOR: ["PERFURADOR"], ELASTICO: ["ELASTICO", "ELÁSTICO"],
};

function expenseRanking() {
  const category = workerData.category || null;
  const spellings = category == null
    ? Object.values(EXPENSE_CATEGORY_SPELLINGS).flat()
    : EXPENSE_CATEGORY_SPELLINGS[category];
  if (!spellings) return { rows: [] };

  const likeClause = spellings.map(() => "description LIKE ?").join(" OR ");
  const likeArgs = spellings.map(value => `%${value}%`);
  const year = Number.isInteger(Number(workerData.year)) ? Number(workerData.year) : null;
  const expenseYearClause = year != null ? " AND year = ?" : "";
  const donationYearClause = year != null ? " AND d.year = ?" : "";
  const yearArgs = year != null ? [year] : [];
  const photo = hasTable("candidate_photo")
    ? "(SELECT cp.photo_url FROM candidate_photo cp WHERE cp.person_id=p.id ORDER BY cp.year DESC LIMIT 1)"
    : "NULL";

  const rows = database.prepare(
    `WITH matched_expense AS MATERIALIZED (
       SELECT campaign_org_id, amount_cents
       FROM campaign_expense
       WHERE (${likeClause})${expenseYearClause}
     ),
     cat_spend AS MATERIALIZED (
       SELECT co.person_id AS personId, sum(m.amount_cents) AS categoryCents, count(*) AS categoryCount,
              co.office AS office, co.state AS state
       FROM matched_expense m JOIN campaign_org co ON co.id = m.campaign_org_id
       WHERE co.person_id IS NOT NULL
       GROUP BY co.person_id
     ),
     revenue AS (
       SELECT cs.personId, coalesce(sum(d.amount_cents), 0) AS revenueCents
       FROM cat_spend cs
       CROSS JOIN campaign_org co ON co.person_id = cs.personId
       CROSS JOIN campaign_donation d ON d.campaign_org_id = co.id
       WHERE co.person_id IS NOT NULL${donationYearClause}
       GROUP BY cs.personId
     ),
     share AS (
       SELECT cs.personId, cs.categoryCents, cs.categoryCount, cs.office, cs.state,
              coalesce(r.revenueCents, 0) AS revenueCents,
              CASE WHEN coalesce(r.revenueCents, 0) > 0
                   THEN (cs.categoryCents * 100.0 / r.revenueCents) END AS sharePct
       FROM cat_spend cs LEFT JOIN revenue r ON r.personId = cs.personId
     ),
     peer_group AS (
       SELECT office, state, sum(sharePct) AS sumSharePct, count(*) AS n
       FROM share WHERE sharePct IS NOT NULL
       GROUP BY office, state
     )
     SELECT s.personId, p.canonical_name AS name, ${photo} AS photoUrl, s.office, s.state,
            s.categoryCents, s.categoryCount, s.revenueCents, s.sharePct,
            CASE
              WHEN s.sharePct IS NOT NULL AND pg.n > 1 THEN (pg.sumSharePct - s.sharePct) / (pg.n - 1)
              WHEN s.sharePct IS NULL AND pg.n > 0 THEN pg.sumSharePct / pg.n
            END AS peerAvgSharePct,
            CASE WHEN s.sharePct IS NOT NULL THEN coalesce(pg.n, 1) - 1 ELSE coalesce(pg.n, 0) END AS peerCount
     FROM share s
     JOIN people p ON p.id = s.personId
     LEFT JOIN peer_group pg ON pg.office = s.office AND pg.state = s.state
     ORDER BY s.categoryCents DESC`
  ).all(...likeArgs, ...yearArgs, ...yearArgs);
  return { rows };
}

function publicPosts() {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(workerData.page) || 1)));
  const query = String(workerData.query || "").slice(0, 120);
  const theme = String(workerData.theme || "");
  const from = String(workerData.from || "");
  const to = String(workerData.to || "");
  const personId = Number(workerData.personId) || 0;
  const themes = {
    saude: ["SAUDE", "HOSPITAL", "SUS"],
    educacao: ["EDUCACAO", "ESCOLA", "PROFESSOR"],
    seguranca: ["SEGURANCA", "POLICIA", "VIOLENCIA"],
    economia: ["ECONOMIA", "EMPREGO", "IMPOSTO"],
    ambiente: ["AMBIENTE", "CLIMA", "FLORESTA"],
  };
  const clauses = [];
  const args = [];
  for (const token of normalizeName(query).split(" ").filter(Boolean)) {
    clauses.push("instr(normalize_public_name(sp.text||' '||coalesce(pe.canonical_name,'')||' '||a.handle),?)>0");
    args.push(token);
  }
  if (themes[theme]) {
    clauses.push(`(${themes[theme].map(() => "instr(normalize_public_name(sp.text),?)>0").join(" OR ")})`);
    args.push(...themes[theme]);
  }
  if (from) { clauses.push("substr(public_timestamp(sp.posted_at),1,10)>=?"); args.push(from); }
  if (to) { clauses.push("substr(public_timestamp(sp.posted_at),1,10)<=?"); args.push(to); }
  if (personId > 0) { clauses.push("a.person_id=?"); args.push(personId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const joined = "FROM social_post sp JOIN social_account a ON a.id=sp.social_account_id LEFT JOIN people pe ON pe.id=a.person_id";
  const available = hasTable("social_post");
  const total = available ? database.prepare(`SELECT count(*) AS n ${joined} ${where}`).get(...args).n : 0;
  const rows = available ? database.prepare(
    `SELECT sp.id,sp.text,sp.kind,public_timestamp(sp.posted_at) AS postedAt,sp.retrieved_at AS collectedAt,sp.url,sp.in_reply_to_external AS replyTo,a.handle,a.person_id AS personId,pe.canonical_name AS name ${joined} ${where} ORDER BY public_timestamp(sp.posted_at) DESC,sp.id DESC LIMIT 20 OFFSET ?`
  ).all(...args, (page - 1) * 20) : [];
  return { total, page, rows };
}

const GROUP_CATEGORIES = ["lgbtfobia", "racismo", "misoginia", "capacitismo", "xenofobia", "regionalismo", "aporofobia", "gordofobia", "antissemitismo", "intolerancia_religiosa", "etarismo_saude"];

function discourseWhere(opts) {
  const clauses = ["r.is_offensive=1"];
  const args = [];
  if (opts.personId != null) { clauses.push("a.person_id=?"); args.push(opts.personId); }
  if (opts.category) { clauses.push("r.categories LIKE ?"); args.push(`%"${opts.category}"%`); }
  else if (opts.group) {
    clauses.push(`(${GROUP_CATEGORIES.map(() => "r.categories LIKE ?").join(" OR ")})`);
    args.push(...GROUP_CATEGORIES.map(category => `%"${category}"%`));
  }
  if (opts.severity && ["high", "medium", "low"].includes(opts.severity)) { clauses.push("r.severity=?"); args.push(opts.severity); }
  const handle = String(opts.handle || "").trim().replace(/^@/, "").toLowerCase();
  if (handle) { clauses.push("a.handle=?"); args.push(handle); }
  const query = String(opts.query || "").trim();
  if (query) {
    clauses.push("(p.text LIKE ? OR pe.canonical_name LIKE ? OR a.handle LIKE ?)");
    args.push(`%${query}%`, `%${normalizeName(query)}%`, `%${query.toLowerCase()}%`);
  }
  return { where: `WHERE ${clauses.join(" AND ")}`, args };
}

const DISCOURSE_FROM = "FROM social_post_review r JOIN social_post p ON p.id=r.social_post_id JOIN social_account a ON a.id=p.social_account_id LEFT JOIN people pe ON pe.id=a.person_id";

function discourseSummary() {
  const empty = { reviewed: 0, total: 0, accounts: 0, bySeverity: {}, byCategory: {} };
  if (!hasTable("social_post_review")) return empty;
  const reviewed = database.prepare("SELECT count(*) AS n FROM social_post_review").get().n;
  const total = database.prepare("SELECT count(*) AS n FROM social_post_review WHERE is_offensive=1").get().n;
  const accounts = database.prepare(`SELECT count(DISTINCT p.social_account_id) AS n FROM social_post_review r JOIN social_post p ON p.id=r.social_post_id WHERE r.is_offensive=1`).get().n;
  const bySeverity = {};
  for (const row of database.prepare("SELECT severity,count(*) AS n FROM social_post_review WHERE is_offensive=1 GROUP BY severity").all()) {
    if (row.severity) bySeverity[row.severity] = row.n;
  }
  const byCategory = {};
  for (const row of database.prepare("SELECT categories FROM social_post_review WHERE is_offensive=1").all()) {
    for (const category of safeJsonArray(row.categories)) byCategory[category] = (byCategory[category] || 0) + 1;
  }
  return { reviewed, total, accounts, bySeverity, byCategory };
}

function discourseCount(opts) {
  if (!hasTable("social_post_review")) return 0;
  const { where, args } = discourseWhere(opts);
  return database.prepare(`SELECT count(*) AS n ${DISCOURSE_FROM} ${where}`).get(...args).n;
}

function discourseSignals(opts) {
  if (!hasTable("social_post_review")) return [];
  const { where, args } = discourseWhere(opts);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(opts.limit) || 30)));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const rows = database.prepare(
    `SELECT p.id AS postId,a.handle AS handle,a.person_id AS personId,pe.canonical_name AS personName,
       (SELECT ph.party_abbr FROM politician_history ph WHERE ph.person_id=a.person_id AND ph.result LIKE 'ELEITO%' ORDER BY ph.year DESC LIMIT 1) AS party,
       (SELECT ph.state FROM politician_history ph WHERE ph.person_id=a.person_id AND ph.result LIKE 'ELEITO%' ORDER BY ph.year DESC LIMIT 1) AS state,
       p.kind AS kind,p.text AS text,p.url AS url,p.posted_at AS postedAt,p.matched_terms AS matchedTerms,
       p.reply_to_handle AS replyToHandle,r.severity AS severity,r.categories AS categories,r.quote AS quote,r.explanation AS explanation
     ${DISCOURSE_FROM} ${where}
     ORDER BY CASE r.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,p.posted_at DESC,p.id DESC
     LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  return rows.map(row => ({
    postId: row.postId,
    handle: row.handle,
    personId: row.personId ?? null,
    personName: row.personName ?? null,
    party: row.party ?? null,
    state: row.state ?? null,
    kind: row.kind,
    text: row.text,
    url: row.url ?? null,
    postedAt: row.postedAt ?? null,
    matchedTerms: safeJsonArray(row.matchedTerms),
    severity: row.severity ?? null,
    categories: safeJsonArray(row.categories),
    quote: row.quote ?? null,
    explanation: row.explanation ?? null,
    replyToHandle: row.replyToHandle ?? null,
  }));
}

try {
  if (workerData.mode === "expense-ranking") {
    parentPort.postMessage(expenseRanking());
  } else if (workerData.mode === "public-posts") {
    parentPort.postMessage(publicPosts());
  } else if (workerData.mode === "discourse-profile") {
    const opts = { personId: Number(workerData.personId), limit: workerData.limit || 8 };
    parentPort.postMessage({ count: discourseCount(opts), signals: discourseSignals(opts) });
  } else {
    const opts = {
      category: workerData.category || undefined,
      group: workerData.group === true,
      severity: workerData.severity || undefined,
      query: String(workerData.query || "").slice(0, 120) || undefined,
    };
    const summary = discourseSummary();
    const count = discourseCount(opts);
    const signals = discourseSignals({ ...opts, limit: workerData.limit || 25, offset: workerData.offset || 0 });
    parentPort.postMessage({ summary, count, signals });
  }
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Social data query failed" });
} finally {
  database.close();
}
