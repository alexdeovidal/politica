import { runDatabaseWorker, runCachedDatabaseWorker } from "./database-worker";
import type { PersonVoteResult } from "./queries";

export function isolatedQuery<T>(data: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return runDatabaseWorker<T>("query-worker.cjs", data, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    lane: "interactive", priority: 5,
  });
}

export function personVoteResults(personId: number): Promise<PersonVoteResult[]> {
  return runCachedDatabaseWorker<PersonVoteResult[]>(
    `derived:person-vote-results:v1:${personId}`, "query-worker.cjs",
    { mode: "person-votes", personId }, "candidate vote totals",
    { lane: "interactive", priority: 5, staleWhileRevalidate: true },
  );
}
