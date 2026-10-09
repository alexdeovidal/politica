import {createHash} from "node:crypto";
import {platformStore} from "@/lib/platform/store";
import {ELECTION_YEAR, findElection, isLiveResultComplete, object, parseElections, parseOverview, parseResult, parseStates, resultUrl, tseTimestamp, validateSelection, TSE_RESULTS_BASE, type ElectionSelection, type LiveConfig, type LiveOverview, type LiveResult, type PublicConfig} from "./model";

type FileRecord = {payload: string | null; checked_at: string | null; attempted_at: string; retry_at: number; etag: string | null; modified: string | null; error: string | null};
type OfficialFile = {data: unknown; checkedAt: string; stale: boolean};
type BinaryRecord = {payload: string | null; checked_at: string | null; attempted_at: string; retry_at: number; error: string | null};
export type OfficialBinaryFile = {data: Buffer; checkedAt: string; stale: boolean};
export type LiveResultSnapshotSummary = {id: number; firstSeenAt: string; lastSeenAt: string; generatedAt: string | null; totalizedAt: string | null; sourceCheckedAt: string; completedAt: string | null; officeName: string; areaName: string; progress: LiveResult["progress"]; sectionsCounted: number; sectionsTotal: number; sectionsPercentage: number; candidateCount: number; stale: boolean};
export type LiveResultSnapshot = LiveResultSnapshotSummary & {result: LiveResult};
let initialized = false;
const memory = new Map<string, FileRecord>();
const pending = new Map<string, Promise<OfficialFile>>();
const binaryPending = new Map<string, Promise<OfficialBinaryFile>>();
let nextRequestAt = 0;
let blockedUntil = 0;
let activeRequests = 0;
const requestQueue: (() => void)[] = [];
let lastSectionCacheCleanup = 0;

export class SourceUnavailable extends Error {
  constructor(public readonly kind: string, public readonly retryAfterSeconds = 60) { super("A fonte oficial está temporariamente indisponível para esta consulta."); }
}

function storage() {
  const store = platformStore();
  if (!initialized) {
    store.exec(`CREATE TABLE IF NOT EXISTS live_tse_file(url TEXT PRIMARY KEY,payload TEXT,checked_at TEXT,attempted_at TEXT NOT NULL,retry_at INTEGER NOT NULL,etag TEXT,modified TEXT,error TEXT);
      CREATE INDEX IF NOT EXISTS ix_live_tse_retry ON live_tse_file(retry_at);
      CREATE TABLE IF NOT EXISTS live_tse_binary_file(url TEXT PRIMARY KEY,payload TEXT,checked_at TEXT,attempted_at TEXT NOT NULL,retry_at INTEGER NOT NULL,error TEXT);
      CREATE INDEX IF NOT EXISTS ix_live_tse_binary_retry ON live_tse_binary_file(retry_at);
      CREATE TABLE IF NOT EXISTS live_result_snapshot(id INTEGER PRIMARY KEY,election_year INTEGER NOT NULL,turn INTEGER NOT NULL,office TEXT NOT NULL,state TEXT NOT NULL,municipality TEXT NOT NULL,zone TEXT NOT NULL,source_url TEXT NOT NULL,fingerprint TEXT NOT NULL,first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,generated_at TEXT,totalized_at TEXT,source_checked_at TEXT NOT NULL,completed_at TEXT,office_name TEXT NOT NULL,area_name TEXT NOT NULL,progress TEXT NOT NULL,sections_counted INTEGER NOT NULL,sections_total INTEGER NOT NULL,sections_percentage REAL NOT NULL,candidate_count INTEGER NOT NULL,stale INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(source_url,fingerprint));
      CREATE INDEX IF NOT EXISTS ix_live_result_snapshot_selection ON live_result_snapshot(election_year,turn,office,state,municipality,zone,id DESC);`);
    const snapshotColumns = store.pragma("table_info(live_result_snapshot)") as Array<{name: string}>;
    if (!snapshotColumns.some(column => column.name === "completed_at")) {
      store.exec("ALTER TABLE live_result_snapshot ADD COLUMN completed_at TEXT");
      store.exec(`UPDATE live_result_snapshot SET completed_at=source_checked_at
        WHERE completed_at IS NULL AND stale=0 AND (progress='final' OR (sections_total>0 AND sections_counted>=sections_total AND sections_percentage>=100));`);
    }
    initialized = true;
  }
  return store;
}
export function cleanupLiveSectionCache() {
  if (Date.now() - lastSectionCacheCleanup < 60000) return;
  const store = storage();
  store.exec(`DELETE FROM live_tse_file WHERE url LIKE '%-aux.json' AND url NOT IN (SELECT url FROM live_tse_file WHERE url LIKE '%-aux.json' ORDER BY attempted_at DESC LIMIT 10000);
    DELETE FROM live_tse_binary_file WHERE url NOT IN (SELECT url FROM live_tse_binary_file WHERE payload IS NOT NULL ORDER BY checked_at DESC LIMIT 5000);`);
  lastSectionCacheCleanup = Date.now();
}
function remember(url: string, row: FileRecord) {
  memory.delete(url); memory.set(url, row);
  while (memory.size > 32) memory.delete(memory.keys().next().value!);
}
function readRecord(url: string): FileRecord | undefined {
  const hit = memory.get(url);
  if (hit) { remember(url, hit); return hit; }
  const row = storage().prepare("SELECT payload,checked_at,attempted_at,retry_at,etag,modified,error FROM live_tse_file WHERE url=?").get(url) as FileRecord | undefined;
  if (row) remember(url, row);
  return row;
}
function writeRecord(url: string, row: FileRecord) {
  storage().prepare("INSERT INTO live_tse_file VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at,attempted_at=excluded.attempted_at,retry_at=excluded.retry_at,etag=excluded.etag,modified=excluded.modified,error=excluded.error").run(url, row.payload, row.checked_at, row.attempted_at, row.retry_at, row.etag, row.modified, row.error);
  remember(url, row);
}
function availableFile(row: FileRecord): OfficialFile {
  if (!row.payload || !row.checked_at) throw new SourceUnavailable(row.error || "not-published", Math.max(30, Math.ceil((row.retry_at - Date.now()) / 1000)));
  return {data: JSON.parse(row.payload), checkedAt: row.checked_at, stale: Boolean(row.error)};
}
async function acquireRequest() {
  if (activeRequests >= 4) {
    if (requestQueue.length >= 40) throw new SourceUnavailable("busy", 30);
    await new Promise<void>((resolve, reject) => {
      const proceed = () => {clearTimeout(timeout); resolve();};
      const timeout = setTimeout(() => {
        const index = requestQueue.indexOf(proceed);
        if (index >= 0) requestQueue.splice(index, 1);
        reject(new SourceUnavailable("busy", 30));
      }, 5000);
      requestQueue.push(proceed);
    });
  } else activeRequests++;
  const start = Math.max(Date.now(), nextRequestAt);
  nextRequestAt = start + 110;
  if (start > Date.now()) await new Promise(resolve => setTimeout(resolve, start - Date.now()));
}
function releaseRequest() { const next = requestQueue.shift(); if (next) next(); else activeRequests--; }

// Polling is shared by all visitors, with persisted snapshots, conditional HTTP
// validation, bounded concurrency and negative caching for unpublished files.
async function officialFile(url: string, ttl: number, validate: (value: unknown) => unknown): Promise<OfficialFile> {
  if (!url.startsWith(`${TSE_RESULTS_BASE}/`)) throw new Error("Fonte não autorizada.");
  const prior = readRecord(url);
  if (prior && Date.now() < prior.retry_at) return availableFile(prior);
  const running = pending.get(url);
  if (running) {
    if (prior?.payload && prior.checked_at) {
      try { return {...availableFile(prior), stale: true}; } catch {}
    }
    return running;
  }
  const operation = (async () => {
    let acquired = false;
    try {
      if (Date.now() < blockedUntil) throw new SourceUnavailable("rate-limit", Math.ceil((blockedUntil - Date.now()) / 1000));
      await acquireRequest(); acquired = true;
      if (Date.now() < blockedUntil) throw new SourceUnavailable("rate-limit", Math.ceil((blockedUntil - Date.now()) / 1000));
      const headers: Record<string, string> = {Accept: "application/json", "User-Agent": "Politica007/1.0 (+https://politica007.com.br/apuracao)"};
      if (prior?.payload && prior.etag) headers["If-None-Match"] = prior.etag;
      if (prior?.payload && prior.modified) headers["If-Modified-Since"] = prior.modified;
      const response = await fetch(url, {headers, cache: "no-store", signal: AbortSignal.timeout(10000), redirect: "error"});
      if (response.status === 403 || response.status === 429) {
        blockedUntil = Date.now() + Math.max(600000, Number(response.headers.get("retry-after")) * 1000 || 0);
        throw new SourceUnavailable("rate-limit", Math.ceil((blockedUntil - Date.now()) / 1000));
      }
      if (response.status === 404) throw new SourceUnavailable("not-published", 300);
      const now = new Date().toISOString();
      if (response.status === 304 && prior?.payload) {
        validate(JSON.parse(prior.payload));
        const row = {...prior, checked_at: now, attempted_at: now, retry_at: Date.now() + ttl, error: null};
        writeRecord(url, row); return availableFile(row);
      }
      if (!response.ok) throw new SourceUnavailable("upstream", 60);
      const text = await response.text();
      if (!text || text.length > 8000000) throw new SourceUnavailable("invalid", 60);
      let data: unknown;
      try { data = JSON.parse(text); validate(data); } catch { throw new SourceUnavailable("invalid", 60); }
      const root = object(data), previous = prior?.payload ? object(JSON.parse(prior.payload)) : null;
      const generatedAt = tseTimestamp(root.dg, root.hg), previousGeneration = previous && tseTimestamp(previous.dg, previous.hg);
      if (generatedAt && previousGeneration && Date.parse(generatedAt) < Date.parse(previousGeneration)) throw new SourceUnavailable("older-file", 30);
      const row: FileRecord = {payload: JSON.stringify(data), checked_at: now, attempted_at: now, retry_at: Date.now() + ttl, etag: response.headers.get("etag"), modified: response.headers.get("last-modified"), error: null};
      writeRecord(url, row); return availableFile(row);
    } catch (error) {
      const failure = error instanceof SourceUnavailable ? error : new SourceUnavailable("connection", 60);
      const row: FileRecord = {payload: prior?.payload ?? null, checked_at: prior?.checked_at ?? null, etag: prior?.etag ?? null, modified: prior?.modified ?? null, attempted_at: new Date().toISOString(), retry_at: Date.now() + failure.retryAfterSeconds * 1000, error: failure.kind};
      writeRecord(url, row);
      return availableFile(row);
    } finally { if (acquired) releaseRequest(); }
  })();
  pending.set(url, operation);
  void operation.finally(() => {
    if (pending.get(url) === operation) pending.delete(url);
  }).catch(() => {});
  if (prior?.payload && prior.checked_at) {
    try {
      const stale = {...availableFile(prior), stale: true};
      void operation.catch(error => console.error("Unable to refresh cached TSE configuration:", error));
      return stale;
    } catch {}
  }
  return operation;
}

function readBinaryRecord(url: string): BinaryRecord | undefined {
  return storage().prepare("SELECT payload,checked_at,attempted_at,retry_at,error FROM live_tse_binary_file WHERE url=?").get(url) as BinaryRecord | undefined;
}
function writeBinaryRecord(url: string, row: BinaryRecord) {
  storage().prepare("INSERT INTO live_tse_binary_file VALUES(?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at,attempted_at=excluded.attempted_at,retry_at=excluded.retry_at,error=excluded.error").run(url, row.payload, row.checked_at, row.attempted_at, row.retry_at, row.error);
}
function availableBinary(row: BinaryRecord): OfficialBinaryFile {
  if (!row.payload || !row.checked_at) throw new SourceUnavailable(row.error || "not-published", Math.max(30, Math.ceil((row.retry_at - Date.now()) / 1000)));
  return {data: Buffer.from(row.payload, "base64"), checkedAt: row.checked_at, stale: Boolean(row.error)};
}

// EA18 points to an immutable BU using its hash. Cache these bounded binary
// payloads and share the same request queue used for the official JSON files.
export async function officialBinaryFile(url: string, ttl = 86400000, maxBytes = 4000000): Promise<OfficialBinaryFile> {
  if (!url.startsWith(`${TSE_RESULTS_BASE}/`)) throw new Error("Fonte não autorizada.");
  const prior = readBinaryRecord(url);
  if (prior && Date.now() < prior.retry_at) return availableBinary(prior);
  const running = binaryPending.get(url);
  if (running) return running;
  const operation = (async () => {
    let acquired = false;
    try {
      if (Date.now() < blockedUntil) throw new SourceUnavailable("rate-limit", Math.ceil((blockedUntil - Date.now()) / 1000));
      await acquireRequest(); acquired = true;
      if (Date.now() < blockedUntil) throw new SourceUnavailable("rate-limit", Math.ceil((blockedUntil - Date.now()) / 1000));
      const response = await fetch(url, {headers: {Accept: "application/octet-stream", "User-Agent": "Politica007/1.0 (+https://politica007.com.br/apuracao)"}, cache: "no-store", signal: AbortSignal.timeout(15000), redirect: "error"});
      if (response.status === 403 || response.status === 429) {
        blockedUntil = Date.now() + Math.max(600000, Number(response.headers.get("retry-after")) * 1000 || 0);
        throw new SourceUnavailable("rate-limit", Math.ceil((blockedUntil - Date.now()) / 1000));
      }
      if (response.status === 404) throw new SourceUnavailable("not-published", 60);
      if (!response.ok) throw new SourceUnavailable("upstream", 60);
      const declaredSize = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new SourceUnavailable("invalid", 300);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > maxBytes) throw new SourceUnavailable("invalid", 300);
      const now = new Date().toISOString(), row: BinaryRecord = {payload: bytes.toString("base64"), checked_at: now, attempted_at: now, retry_at: Date.now() + ttl, error: null};
      writeBinaryRecord(url, row); return availableBinary(row);
    } catch (error) {
      const failure = error instanceof SourceUnavailable ? error : new SourceUnavailable("connection", 60);
      const row: BinaryRecord = {payload: prior?.payload ?? null, checked_at: prior?.checked_at ?? null, attempted_at: new Date().toISOString(), retry_at: Date.now() + failure.retryAfterSeconds * 1000, error: failure.kind};
      writeBinaryRecord(url, row);
      return availableBinary(row);
    } finally { if (acquired) releaseRequest(); }
  })();
  binaryPending.set(url, operation);
  try { return await operation; } finally { binaryPending.delete(url); }
}

export async function officialJsonFile(url: string, ttl: number, validate: (value: unknown) => unknown) {
  return officialFile(url, ttl, validate);
}

export async function getLiveConfig(turn = 1): Promise<LiveConfig> {
  const electionFile = await officialFile(`${TSE_RESULTS_BASE}/comum/config/ele-c.json`, 600000, parseElections);
  const elections = parseElections(electionFile.data);
  const election = elections.find(item => item.turn === turn && item.offices.some(office => office.code === "1"));
  if (!election) throw new Error("Este turno ainda não está disponível na configuração oficial do TSE.");
  const sourceUrl = `${TSE_RESULTS_BASE}/${election.cycle}/${election.code}/config/mun-e${election.code.padStart(6, "0")}-cm.json`;
  const cityFile = await officialFile(sourceUrl, 3600000, parseStates);
  const root = object(cityFile.data);
  return {elections, states: parseStates(cityFile.data), sourceUrl, generatedAt: tseTimestamp(root.dg, root.hg), checkedAt: cityFile.checkedAt, stale: electionFile.stale || cityFile.stale};
}
export function publicConfig(config: LiveConfig, state: string): PublicConfig {
  return {...config, states: config.states.map(item => ({code: item.code, name: item.name})), municipalities: config.states.find(item => item.code === state)?.municipalities || [], exteriorMunicipalities: config.states.find(item => item.code === "zz")?.municipalities || []};
}

export async function getLiveResult(selection: ElectionSelection): Promise<LiveResult> {
  const saved = getCompletedLiveResult(selection);
  if (saved) return saved;
  const config = await getLiveConfig(selection.turn), election = findElection(config.elections, selection);
  validateSelection(selection, config.states, election);
  const file = await officialFile(resultUrl(election, selection), 30000, value => parseResult(value, election, selection, config.states));
  const result = {...parseResult(file.data, election, selection, config.states), checkedAt: file.checkedAt, stale: file.stale || config.stale};
  try {
    const completedAt = saveLiveResultSnapshot(result);
    return completedAt ? {...result, completedAt} : result;
  } catch {
    console.error("Não foi possível registrar uma versão no histórico da apuração.");
    return result;
  }
}

export function getCompletedLiveResult(selection: ElectionSelection): LiveResult | null {
  const row = storage().prepare(`SELECT payload,source_checked_at AS sourceCheckedAt,completed_at AS completedAt
    FROM live_result_snapshot WHERE election_year=? AND turn=? AND office=? AND state=? AND municipality=? AND zone=?
      AND completed_at IS NOT NULL AND stale=0 ORDER BY completed_at DESC,id DESC LIMIT 1`).get(
      ELECTION_YEAR, selection.turn, selection.office, selection.state, selection.municipality, selection.zone,
    ) as {payload: string; sourceCheckedAt: string; completedAt: string} | undefined;
  if (!row) return null;
  try {
    const result = JSON.parse(row.payload) as LiveResult;
    if (!isLiveResultComplete(result) || result.selection.turn !== selection.turn || result.selection.office !== selection.office || result.selection.state !== selection.state || result.selection.municipality !== selection.municipality || result.selection.zone !== selection.zone) return null;
    return {...result, checkedAt: row.sourceCheckedAt, stale: false, completedAt: row.completedAt};
  } catch {
    return null;
  }
}

function saveLiveResultSnapshot(result: LiveResult): string | null {
  const store = storage(), observedAt = new Date().toISOString();
  const stableResult = Object.fromEntries(Object.entries(result).filter(([key]) => key !== "checkedAt" && key !== "stale"));
  const fingerprint = createHash("sha256").update(JSON.stringify(stableResult)).digest("hex");
  store.prepare(`INSERT INTO live_result_snapshot(election_year,turn,office,state,municipality,zone,source_url,fingerprint,first_seen_at,last_seen_at,generated_at,totalized_at,source_checked_at,completed_at,office_name,area_name,progress,sections_counted,sections_total,sections_percentage,candidate_count,stale,payload)
    VALUES(@election_year,@turn,@office,@state,@municipality,@zone,@source_url,@fingerprint,@first_seen_at,@last_seen_at,@generated_at,@totalized_at,@source_checked_at,@completed_at,@office_name,@area_name,@progress,@sections_counted,@sections_total,@sections_percentage,@candidate_count,@stale,@payload)
    ON CONFLICT(source_url,fingerprint) DO UPDATE SET last_seen_at=excluded.last_seen_at,source_checked_at=excluded.source_checked_at,completed_at=COALESCE(live_result_snapshot.completed_at,excluded.completed_at),stale=excluded.stale,payload=excluded.payload
    WHERE live_result_snapshot.source_checked_at<>excluded.source_checked_at OR live_result_snapshot.stale<>excluded.stale`).run({
      election_year: result.election.cycle.slice(3), turn: result.selection.turn, office: result.selection.office, state: result.selection.state,
      municipality: result.selection.municipality, zone: result.selection.zone, source_url: result.sourceUrl, fingerprint,
      first_seen_at: observedAt, last_seen_at: observedAt, generated_at: result.generatedAt, totalized_at: result.totalizedAt,
      source_checked_at: result.checkedAt, completed_at: !result.stale && isLiveResultComplete(result) ? observedAt : null,
      office_name: result.office.name, area_name: result.areaName, progress: result.progress,
      sections_counted: result.sections.counted, sections_total: result.sections.total, sections_percentage: result.sections.percentage,
      candidate_count: result.candidates.length, stale: Number(result.stale), payload: JSON.stringify(result),
    });
  return (store.prepare("SELECT completed_at AS completedAt FROM live_result_snapshot WHERE source_url=? AND fingerprint=?").get(result.sourceUrl, fingerprint) as {completedAt: string | null} | undefined)?.completedAt ?? null;
}

export function listLiveResultSnapshots(selection: ElectionSelection, limit = 50): LiveResultSnapshotSummary[] {
  return storage().prepare(`SELECT id,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,generated_at AS generatedAt,totalized_at AS totalizedAt,source_checked_at AS sourceCheckedAt,completed_at AS completedAt,office_name AS officeName,area_name AS areaName,progress,sections_counted AS sectionsCounted,sections_total AS sectionsTotal,sections_percentage AS sectionsPercentage,candidate_count AS candidateCount,stale
    FROM live_result_snapshot WHERE election_year=? AND turn=? AND office=? AND state=? AND municipality=? AND zone=? ORDER BY id DESC LIMIT ?`).all(
      ELECTION_YEAR, selection.turn, selection.office, selection.state, selection.municipality, selection.zone, Math.max(1, Math.min(100, limit)),
    ).map((row: unknown) => {
      const item = row as Omit<LiveResultSnapshotSummary, "stale"> & {stale: number};
      return {...item, stale: Boolean(item.stale)};
    });
}

export function getLiveResultSnapshot(id: number): LiveResultSnapshot | null {
  const row = storage().prepare(`SELECT id,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,generated_at AS generatedAt,totalized_at AS totalizedAt,source_checked_at AS sourceCheckedAt,completed_at AS completedAt,office_name AS officeName,area_name AS areaName,progress,sections_counted AS sectionsCounted,sections_total AS sectionsTotal,sections_percentage AS sectionsPercentage,candidate_count AS candidateCount,stale,payload FROM live_result_snapshot WHERE id=?`).get(id) as (Omit<LiveResultSnapshotSummary, "stale"> & {stale: number; payload: string}) | undefined;
  if (!row) return null;
  const {payload, ...summary} = row;
  return {...summary, stale: Boolean(row.stale), result: {...JSON.parse(payload) as LiveResult, completedAt: summary.completedAt}};
}

export async function getLiveOverview(selection: ElectionSelection): Promise<LiveOverview> {
  const config = await getLiveConfig(selection.turn), election = findElection(config.elections, selection);
  validateSelection(selection, config.states, election);
  const state = selection.state;
  const sourceUrl = `${TSE_RESULTS_BASE}/${election.cycle}/${election.code}/dados/${state}/${state}-e${election.code.padStart(6, "0")}-ab.json`;
  const file = await officialFile(sourceUrl, 30000, value => parseOverview(value, election, state, config.states));
  return {...parseOverview(file.data, election, state, config.states), sourceUrl, checkedAt: file.checkedAt, stale: file.stale || config.stale};
}

export function unavailableResultMessage(error: unknown) {
  if (error instanceof SourceUnavailable) return {error: error.kind === "not-published" ? "O TSE ainda não publicou o arquivo deste recorte. A consulta automática continuará." : error.kind === "section-archive-pending" ? "Os dados detalhados por seção estão sendo integrados à base oficial. Tente novamente em instantes." : "A fonte oficial está indisponível neste momento. A consulta automática continuará.", code: error.kind, retryAfterSeconds: error.retryAfterSeconds};
  return {error: error instanceof Error ? error.message : "Consulta inválida.", code: "invalid-selection", retryAfterSeconds: 30};
}
