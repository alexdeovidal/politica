import { readFileSync } from "node:fs";
import path from "node:path";

type TSEMonitorState = {
  derived_refresh_pending?:unknown;
  check_interval_hours?: unknown;
  checked_at?: unknown;
  history?:{source:string;status:string;checked_at:string}[];
  sources?: Record<string, { synced_at?: unknown;checked_at?:unknown;status?:unknown;url?:unknown }>;
};

export type TseUpdateStatus = {
  derivedRefreshPending?:boolean;
  lastUpdatedAt: string | null;
  checkIntervalHours: number;
  lastCheckedAt?:string|null;
  sources?:{name:string;syncedAt:string|null;checkedAt:string|null;status:string;url:string}[];
  sourcesTotal:number;
  sourcesPage:number;
  sourcesPages:number;
  hasFailedSources:boolean;
  history?:{source:string;status:string;checked_at:string}[];
  historyTotal:number;
  historyPage:number;
  historyPages:number;
};

const DEFAULT_CHECK_INTERVAL_HOURS = 4;
const PAGE_SIZE = 20;

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function requestedPage(value: number, pages: number) {
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return Math.min(page, pages);
}

export function getTseUpdateStatus(pagination: { sourcesPage?: number; historyPage?: number } = {}): TseUpdateStatus {
  const dbPath = process.env.ELOSYS_DB_PATH?.trim()
    || path.resolve(process.cwd(), "..", "elosys.db");
  const statePath = process.env.TSE_MONITOR_STATE_PATH?.trim()
    || path.join(path.dirname(dbPath), "tse-source-monitor.json");

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as TSEMonitorState;
    const allSources = Object.entries(state.sources ?? {}).map(([name, row]) => ({
      name,
      syncedAt: validDate(row.synced_at),
      checkedAt: validDate(row.checked_at),
      status: typeof row.status === "string" ? row.status : "não informado",
      url: typeof row.url === "string" ? row.url : "https://dadosabertos.tse.jus.br/",
    }));
    const updatedDates = allSources
      .map((source) => source.syncedAt)
      .filter((date): date is string => date !== null)
      .sort((left, right) => Date.parse(right) - Date.parse(left));
    const history = Array.isArray(state.history) ? state.history.slice().reverse() : [];
    const sourcesPages = Math.max(1, Math.ceil(allSources.length / PAGE_SIZE));
    const historyPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
    const sourcesPage = requestedPage(pagination.sourcesPage ?? 1, sourcesPages);
    const historyPage = requestedPage(pagination.historyPage ?? 1, historyPages);
    const configuredInterval = Number(state.check_interval_hours);

    return {
      derivedRefreshPending:state.derived_refresh_pending===true,
      lastUpdatedAt: updatedDates[0] ?? null,
      lastCheckedAt:validDate(state.checked_at),
      sources: allSources.slice((sourcesPage - 1) * PAGE_SIZE, sourcesPage * PAGE_SIZE),
      sourcesTotal: allSources.length,
      sourcesPage,
      sourcesPages,
      hasFailedSources: allSources.some((source) => source.status === "failed"),
      history: history.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE),
      historyTotal: history.length,
      historyPage,
      historyPages,
      checkIntervalHours: Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : DEFAULT_CHECK_INTERVAL_HOURS,
    };
  } catch {
    return {
      lastUpdatedAt: null,
      checkIntervalHours: DEFAULT_CHECK_INTERVAL_HOURS,
      sources: [],
      sourcesTotal: 0,
      sourcesPage: 1,
      sourcesPages: 1,
      hasFailedSources: false,
      history: [],
      historyTotal: 0,
      historyPage: 1,
      historyPages: 1,
    };
  }
}
