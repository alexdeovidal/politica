import { readFileSync } from "node:fs";
import path from "node:path";

type TSEMonitorState = {
  check_interval_hours?: unknown;
  sources?: Record<string, { synced_at?: unknown }>;
};

export type TseUpdateStatus = {
  lastUpdatedAt: string | null;
  checkIntervalHours: number;
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
      lastUpdatedAt: updatedDates[0] ?? null,
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
