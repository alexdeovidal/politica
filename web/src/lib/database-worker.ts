import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { cached, cacheResult } from "@/lib/platform/store";

type WorkerSnapshot<T> = { fingerprint: string; value: T };
const cachedWorkerFlights = new Map<string, Promise<unknown>>();

export function runDatabaseWorker<T>(scriptName: string, workerData: unknown): Promise<T> {
  const candidates = [
    path.resolve(process.cwd(), "scripts", scriptName),
    path.resolve(process.cwd(), "web", "scripts", scriptName),
  ];
  const scriptPath = candidates.find(existsSync);
  if (!scriptPath) return Promise.reject(new Error(`Database worker not found: ${scriptName}`));

  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(scriptPath, { workerData });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    worker.once("message", (result: T | { error: string }) => {
      if (result && typeof result === "object" && "error" in result) {
        const message = (result as { error?: unknown }).error;
        fail(new Error(typeof message === "string" ? message : "Database worker failed"));
        return;
      }
      settled = true;
      resolve(result as T);
    });
    worker.once("error", fail);
    worker.once("exit", (code) => {
      if (code !== 0) fail(new Error(`Database worker exited with code ${code}`));
      else if (!settled) fail(new Error("Database worker exited without a result"));
    });
  });
}

export async function runCachedDatabaseWorker<T>(
  cacheKey: string,
  scriptName: string,
  workerData: Record<string, unknown> = {},
  source = "local database worker snapshot",
): Promise<T> {
  const fingerprint = databaseFingerprint();
  const stored = cached<WorkerSnapshot<T>>(cacheKey, 365 * 24 * 60 * 60 * 1000);
  if (stored?.fingerprint === fingerprint && stored.value) return stored.value;

  const flightKey = `${cacheKey}:${fingerprint}`;
  const existing = cachedWorkerFlights.get(flightKey) as Promise<T> | undefined;
  if (existing) return existing;

  const flight = runDatabaseWorker<T>(scriptName, {
    databasePath: databasePath(),
    ...workerData,
  }).then((value) => {
    cacheResult(cacheKey, { fingerprint, value } satisfies WorkerSnapshot<T>, source);
    return value;
  }).finally(() => cachedWorkerFlights.delete(flightKey));

  cachedWorkerFlights.set(flightKey, flight);
  return flight;
}
