import { sumCents } from "./comparison";
import type { DashboardSnapshot } from "./dashboard-model";

/** Presence and value are separate: a documented zero is not a missing observation. */
export function getKnownAmount(rows: readonly { amountCents: number }[]): number | null {
  return rows.length ? sumCents(rows.map(row => row.amountCents)) : null;
}

/** The caller must first select the same accounting measure and period on both sides. */
export function getComparisonRatio(left: number | null, right: number | null): number | null {
  if (left === null || right === null || !Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right <= 0) return null;
  return left / right;
}

/** Months are read from the published coverage, never inferred from today's date. */
export function getTreasuryMonths(snapshot: DashboardSnapshot, year: number): number[] {
  return [...new Set((snapshot.windows[String(year)]?.months ?? []).map(month => Number(month.slice(5))))].sort((a, b) => a - b);
}

/** Different documentary ledgers may have more recent months than Treasury payments. */
export function getSnapshotYearMonths(snapshot: DashboardSnapshot, year: number): number[] {
  if (!snapshot.years.includes(year)) return [];
  const prefix = `${year}-`;
  const rows = [...snapshot.monthly, ...snapshot.invoiceMonthly, ...snapshot.companyMonthly, ...snapshot.surgery.monthly];
  return [...new Set([...getTreasuryMonths(snapshot, year), ...rows.filter(row => row.month.startsWith(prefix))
    .map(row => Number(row.month.slice(5)))])].sort((a, b) => a - b);
}
