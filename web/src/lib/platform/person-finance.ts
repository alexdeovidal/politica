import { cache } from "react";
import { runCachedDatabaseWorker } from "@/lib/database-worker";
import type { FinanceSummary } from "@/lib/queries";

export type PersonFinanceInsights = {
  expensesTotalCents: number;
  suppliers: Array<{ doc: string | null; name: string | null; cents: number }>;
  donationOrigins: Array<{ name: string; cents: number }>;
  expenseYears: Array<{ year: number; cents: number; n: number }>;
};

export const getCachedPersonFinanceSummary = cache((personId: number, year?: number) =>
  runCachedDatabaseWorker<FinanceSummary>(
    `derived:person-finance-summary:v1:${personId}:${year ?? 0}`,
    "person-finance-worker.cjs",
    { personId, year, part: "summary" },
    "local candidate finance summary",
    { priority: 100 },
  ),
);

export const getCachedPersonFinanceInsights = cache((personId: number, year?: number) =>
  runCachedDatabaseWorker<PersonFinanceInsights>(
    `derived:person-finance-insights:v1:${personId}:${year ?? 0}`,
    "person-finance-worker.cjs",
    { personId, year, part: "insights" },
    "local candidate finance insights",
    { priority: 10 },
  ),
);
