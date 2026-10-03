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
  history?:{source:string;status:string;checked_at:string}[];
};

const DEFAULT_CHECK_INTERVAL_HOURS = 4;

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

export function getTseUpdateStatus(): TseUpdateStatus {
  const dbPath = process.env.ELOSYS_DB_PATH?.trim()
    || path.resolve(process.cwd(), "..", "elosys.db");
  const statePath = process.env.TSE_MONITOR_STATE_PATH?.trim()
    || path.join(path.dirname(dbPath), "tse-source-monitor.json");

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as TSEMonitorState;
    const updatedDates = Object.values(state.sources ?? {})
      .map((source) => validDate(source?.synced_at))
      .filter((date): date is string => date !== null)
      .sort((left, right) => Date.parse(right) - Date.parse(left));
    const configuredInterval = Number(state.check_interval_hours);

    return {
      derivedRefreshPending:state.derived_refresh_pending===true,
      lastUpdatedAt: updatedDates[0] ?? null,
      lastCheckedAt:validDate(state.checked_at),
      sources:Object.entries(state.sources??{}).map(([name,row])=>({name,syncedAt:validDate(row.synced_at),checkedAt:validDate(row.checked_at),status:typeof row.status==="string"?row.status:"não informado",url:typeof row.url==="string"?row.url:"https://dadosabertos.tse.jus.br/"})),
      history:Array.isArray(state.history)?state.history.slice(-50).reverse():[],
      checkIntervalHours: Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : DEFAULT_CHECK_INTERVAL_HOURS,
    };
  } catch {
    return {
      lastUpdatedAt: null,
      checkIntervalHours: DEFAULT_CHECK_INTERVAL_HOURS,
    };
  }
}
