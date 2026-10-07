import { cache } from "react";
import { runCachedDatabaseWorker } from "@/lib/database-worker";
import type { FinanceSummary } from "@/lib/queries";

export type PersonFinanceProfile = FinanceSummary & {
  suppliers: Array<{ doc: string | null; name: string | null; cents: number }>;
  donationOrigins: Array<{ name: string; cents: number }>;
  expenseYears: Array<{ year: number; cents: number; n: number }>;
};

export const getCachedPersonFinance = cache((personId: number, year?: number) =>
  runCachedDatabaseWorker<PersonFinanceProfile>(
    `derived:person-finance:v2:${personId}:${year ?? 0}`,
    "person-finance-worker.cjs",
    { personId, year },
    "local candidate finance summary and insights",
    { priority: 100 },
  ),
);
