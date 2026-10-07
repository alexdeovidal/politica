import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { databaseFingerprint, databaseFingerprintsMatch, databasePath } from "@/lib/db";
import { cached, cacheResult } from "@/lib/platform/store";

type WorkerSnapshot<T> = { fingerprint: string; value: T };
export type CachedDatabaseWorkerResult<T> = { value: T; stale: boolean };
const cachedWorkerFlights = new Map<string, Promise<unknown>>();
// Database workers share the same large SQLite files and are CPU and disk intensive.
// Keep only one active by default so background aggregates cannot starve navigation.
const maxConcurrentWorkers = 1;
let activeWorkers = 0;
let workerSequence = 0;

type QueuedWorker = {
  priority: number;
  sequence: number;
  state: "queued" | "running" | "finished";
  preemptible: boolean;
  cancel?: () => void;
  start: () => void;
};

const workerQueue: QueuedWorker[] = [];
let activeJob: QueuedWorker | null = null;

function drainWorkerQueue() {
  workerQueue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  while (activeWorkers < maxConcurrentWorkers && workerQueue.length) {
    const job = workerQueue.shift()!;
    if (job.state !== "queued") continue;
    job.state = "running";
    activeJob = job;
    activeWorkers += 1;
    job.start();
  }
}

function abortedError() {
  return Object.assign(new Error("Database worker was cancelled"), { name: "AbortError" });
}

export function runDatabaseWorker<T>(
  scriptName: string,
  workerData: unknown,
  options: { signal?: AbortSignal; priority?: number; preemptible?: boolean } = {},
): Promise<T> {
  const candidates = [
    path.resolve(process.cwd(), "scripts", scriptName),
    path.resolve(process.cwd(), "web", "scripts", scriptName),
  ];
  const scriptPath = candidates.find(existsSync);
  if (!scriptPath) return Promise.reject(new Error(`Database worker not found: ${scriptName}`));

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let worker: Worker | null = null;
    let job: QueuedWorker;
    const signal = options.signal;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const releaseSlot = () => {
      if (job.state !== "running") return;
      job.state = "finished";
      activeWorkers -= 1;
      if (activeJob === job) activeJob = null;
      cleanup();
      drainWorkerQueue();
    };

    const onAbort = () => {
      if (settled) return;
      if (job.state === "queued") {
        job.state = "finished";
        const queuedIndex = workerQueue.indexOf(job);
        if (queuedIndex >= 0) workerQueue.splice(queuedIndex, 1);
        fail(abortedError());
        drainWorkerQueue();
        return;
      }
      if (job.state === "running") job.cancel?.();
    };

    job = {
      priority: options.priority ?? 0,
      sequence: workerSequence++,
      state: "queued",
      preemptible: options.preemptible ?? false,
      cancel: () => {
        if (job.state !== "running" || !worker) return;
        fail(abortedError());
        void worker.terminate();
      },
      start: () => {
        if (signal?.aborted) {
          job.state = "finished";
          activeWorkers -= 1;
          if (activeJob === job) activeJob = null;
          fail(abortedError());
          drainWorkerQueue();
          return;
        }
        try {
          worker = new Worker(scriptPath, { workerData });
        } catch (error) {
          fail(error instanceof Error ? error : new Error("Could not start database worker"));
          releaseSlot();
          return;
        }

        worker.once("message", (result: T | { error: string }) => {
          if (result && typeof result === "object" && "error" in result) {
            const message = (result as { error?: unknown }).error;
            fail(new Error(typeof message === "string" ? message : "Database worker failed"));
            return;
          }
          settled = true;
          cleanup();
          resolve(result as T);
        });
        worker.once("error", (error) => {
          fail(error);
          releaseSlot();
        });
        worker.once("exit", (code) => {
          if (code !== 0) fail(new Error(`Database worker exited with code ${code}`));
          else if (!settled) fail(new Error("Database worker exited without a result"));
          releaseSlot();
        });
      },
    };

    if (signal?.aborted) {
      fail(abortedError());
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    workerQueue.push(job);
    if (activeJob?.preemptible && job.priority > activeJob.priority) activeJob.cancel?.();
    drainWorkerQueue();
  });
}

export async function runCachedDatabaseWorkerSnapshot<T>(
  cacheKey: string,
  scriptName: string,
  workerData: Record<string, unknown> = {},
  source = "local database worker snapshot",
  options: { signal?: AbortSignal; priority?: number; preemptible?: boolean; staleWhileRevalidate?: boolean } = {},
): Promise<CachedDatabaseWorkerResult<T>> {
  const fingerprint = databaseFingerprint();
  const stored = cached<WorkerSnapshot<T>>(cacheKey, 365 * 24 * 60 * 60 * 1000);
  if (stored?.value && databaseFingerprintsMatch(stored.fingerprint, fingerprint)) {
    return { value: stored.value, stale: false };
  }

  const flightKey = `${cacheKey}:${fingerprint}`;
  let flight = cachedWorkerFlights.get(flightKey) as Promise<T> | undefined;

  if (!flight) {
    flight = runDatabaseWorker<T>(scriptName, {
      databasePath: databasePath(),
      ...workerData,
    }, options).then((value) => {
      cacheResult(cacheKey, { fingerprint, value } satisfies WorkerSnapshot<T>, source);
      return value;
    }).finally(() => cachedWorkerFlights.delete(flightKey));

    cachedWorkerFlights.set(flightKey, flight);
  }

  if (stored?.value && options.staleWhileRevalidate) {
    void flight.catch((error) => {
      console.error(`Unable to refresh ${source}:`, error);
    });
    return { value: stored.value, stale: true };
  }

  return { value: await flight, stale: false };
}

export async function runCachedDatabaseWorker<T>(
  cacheKey: string,
  scriptName: string,
  workerData: Record<string, unknown> = {},
  source = "local database worker snapshot",
  options: { signal?: AbortSignal; priority?: number; preemptible?: boolean; staleWhileRevalidate?: boolean } = {},
): Promise<T> {
  const result = await runCachedDatabaseWorkerSnapshot<T>(cacheKey, scriptName, workerData, source, options);
  return result.value;
}
