import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { databaseFingerprint, databaseFingerprintsMatch, databasePath } from "@/lib/db";
import { cached, cacheResult } from "@/lib/platform/store";

type WorkerSnapshot<T> = { fingerprint: string; value: T };
export type CachedDatabaseWorkerResult<T> = { value: T; stale: boolean };
const cachedWorkerFlights = new Map<string, Promise<unknown>>();
// Database workers share large SQLite files and can be CPU intensive. Keep a
// separate slot for explicitly interactive lookups so a cold aggregate cannot
// hold search requests in the queue for minutes.
const maxConcurrentWorkers = 2;
// Large full-table rankings must not occupy the shared slot used by live
// election configuration and ordinary page data. They still share the overall
// worker ceiling, so one analytical query cannot fan out into many scans.
const maxWorkersByLane = { interactive: 1, shared: 1, bulk: 1 } as const;
let activeWorkers = 0;
const activeWorkersByLane = { interactive: 0, shared: 0, bulk: 0 };
let workerSequence = 0;

type WorkerLane = keyof typeof maxWorkersByLane;

type QueuedWorker = {
  priority: number;
  sequence: number;
  lane: WorkerLane;
  state: "queued" | "running" | "finished";
  preemptible: boolean;
  cancel?: () => void;
  start: () => void;
};

const workerQueue: QueuedWorker[] = [];
const activeJobs = new Set<QueuedWorker>();
type PersistentSearchReply = { requestId: number; result?: unknown; error?: string };
type PendingSearchRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  workerData: unknown;
};
type PersistentSearchWorkerSlot = { worker: Worker | null; requestId: number | null };
const persistentSearchWorkers: PersistentSearchWorkerSlot[] = [
  { worker: null, requestId: null },
  { worker: null, requestId: null },
];
let persistentSearchSequence = 0;
const pendingSearchRequests = new Map<number, PendingSearchRequest>();
const persistentSearchQueue: number[] = [];

function rejectSearchRequest(requestId: number, error: Error) {
  const request = pendingSearchRequests.get(requestId);
  if (!request) return;
  pendingSearchRequests.delete(requestId);
  if (request.onAbort) request.signal?.removeEventListener("abort", request.onAbort);
  request.reject(error);
}

function dispatchPersistentSearchQueue() {
  for (const slot of persistentSearchWorkers) {
    const worker = slot.worker;
    if (!worker || slot.requestId !== null) continue;

    while (persistentSearchQueue.length) {
      const requestId = persistentSearchQueue.shift()!;
      const request = pendingSearchRequests.get(requestId);
      if (!request) continue;

      slot.requestId = requestId;
      worker.ref();
      try {
        worker.postMessage({ requestId, data: request.workerData });
      } catch (error) {
        slot.requestId = null;
        rejectSearchRequest(requestId, error instanceof Error ? error : new Error("Could not send search request to worker"));
        continue;
      }
      break;
    }
  }

  if (!pendingSearchRequests.size) {
    for (const slot of persistentSearchWorkers) {
      if (slot.worker && slot.requestId === null) slot.worker.unref();
    }
  }
}

function createPersistentSearchWorker(slot: PersistentSearchWorkerSlot) {
  const candidates = [
    path.resolve(process.cwd(), "scripts", "search-worker.cjs"),
    path.resolve(process.cwd(), "web", "scripts", "search-worker.cjs"),
  ];
  const scriptPath = candidates.find(existsSync);
  if (!scriptPath) throw new Error("Database worker not found: search-worker.cjs");

  const worker = new Worker(scriptPath, { workerData: { databasePath: databasePath(), persistent: true } });
  slot.worker = worker;
  slot.requestId = null;
  worker.unref();
  worker.on("message", (message: PersistentSearchReply) => {
    if (slot.worker !== worker || slot.requestId !== message.requestId) return;
    slot.requestId = null;
    const request = pendingSearchRequests.get(message.requestId);
    if (request) {
      pendingSearchRequests.delete(message.requestId);
      if (request.onAbort) request.signal?.removeEventListener("abort", request.onAbort);
      if (typeof message.error === "string") request.reject(new Error(message.error));
      else request.resolve(message.result);
    }
    dispatchPersistentSearchQueue();
  });
  const failWorker = (error: Error) => {
    if (slot.worker !== worker) return;
    const requestId = slot.requestId;
    slot.worker = null;
    slot.requestId = null;
    if (requestId !== null) rejectSearchRequest(requestId, error);
    if (pendingSearchRequests.size) {
      try { createPersistentSearchWorker(slot); }
      catch (restartError) {
        const message = restartError instanceof Error ? restartError : new Error("Could not restart persistent search worker");
        for (const id of persistentSearchQueue.splice(0)) rejectSearchRequest(id, message);
      }
    }
    dispatchPersistentSearchQueue();
  };
  worker.on("error", failWorker);
  worker.on("exit", (code) => {
    if (slot.worker === worker) failWorker(new Error(`Persistent search worker exited with code ${code}`));
  });
  return worker;
}

function ensurePersistentSearchWorkers() {
  let created = 0;
  let lastError: Error | null = null;
  for (const slot of persistentSearchWorkers) {
    if (!slot.worker) {
      try {
        createPersistentSearchWorker(slot);
        created += 1;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Could not start persistent search worker");
      }
    }
  }
  if (created) dispatchPersistentSearchQueue();
  if (!persistentSearchWorkers.some((slot) => slot.worker)) {
    throw lastError ?? new Error("No persistent search workers are available");
  }
}

export function warmSearchWorker() {
  try {
    ensurePersistentSearchWorkers();
  } catch (error) {
    console.error("Unable to warm the persistent search worker:", error);
  }
}

export function runPersistentSearchWorker<T>(
  workerData: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const signal = options.signal;
  if (signal?.aborted) return Promise.reject(abortedError());

  try {
    ensurePersistentSearchWorkers();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("Could not start persistent search worker"));
  }

  return new Promise<T>((resolve, reject) => {
    const requestId = persistentSearchSequence++;
    const request: PendingSearchRequest = {
      resolve: (value) => resolve(value as T),
      reject,
      signal,
      workerData,
    };
    const onAbort = () => {
      if (!pendingSearchRequests.delete(requestId)) return;
      signal?.removeEventListener("abort", onAbort);
      const queuedIndex = persistentSearchQueue.indexOf(requestId);
      if (queuedIndex >= 0) persistentSearchQueue.splice(queuedIndex, 1);
      reject(abortedError());
      const slot = persistentSearchWorkers.find((candidate) => candidate.requestId === requestId);
      if (slot?.worker) {
        // better-sqlite3 runs synchronously inside the worker. Terminating this
        // one abandoned lookup stops its query without blocking other searches.
        const worker = slot.worker;
        slot.worker = null;
        slot.requestId = null;
        void worker.terminate().then(() => {
          try { ensurePersistentSearchWorkers(); }
          catch (error) {
            const message = error instanceof Error ? error : new Error("Could not restart persistent search worker");
            for (const id of persistentSearchQueue.splice(0)) rejectSearchRequest(id, message);
          }
          dispatchPersistentSearchQueue();
        }, (error: unknown) => {
          const message = error instanceof Error ? error : new Error("Could not stop persistent search worker");
          for (const id of persistentSearchQueue.splice(0)) rejectSearchRequest(id, message);
        });
      } else {
        dispatchPersistentSearchQueue();
      }
    };
    request.onAbort = onAbort;
    pendingSearchRequests.set(requestId, request);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    persistentSearchQueue.push(requestId);
    dispatchPersistentSearchQueue();
  });
}

function drainWorkerQueue() {
  workerQueue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  while (activeWorkers < maxConcurrentWorkers && workerQueue.length) {
    const nextIndex = workerQueue.findIndex((job) =>
      job.state === "queued" && activeWorkersByLane[job.lane] < maxWorkersByLane[job.lane],
    );
    if (nextIndex < 0) break;
    const [job] = workerQueue.splice(nextIndex, 1);
    job.state = "running";
    activeJobs.add(job);
    activeWorkers += 1;
    activeWorkersByLane[job.lane] += 1;
    job.start();
  }
}

function abortedError() {
  return Object.assign(new Error("Database worker was cancelled"), { name: "AbortError" });
}

export function runDatabaseWorker<T>(
  scriptName: string,
  workerData: unknown,
  options: { signal?: AbortSignal; priority?: number; preemptible?: boolean; lane?: WorkerLane } = {},
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
      activeWorkersByLane[job.lane] -= 1;
      activeJobs.delete(job);
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
      lane: options.lane ?? "shared",
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
          activeWorkersByLane[job.lane] -= 1;
          activeJobs.delete(job);
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
    for (const activeJob of activeJobs) {
      if (activeJob.preemptible && job.priority > activeJob.priority) activeJob.cancel?.();
    }
    drainWorkerQueue();
  });
}

export async function runCachedDatabaseWorkerSnapshot<T>(
  cacheKey: string,
  scriptName: string,
  workerData: Record<string, unknown> = {},
  source = "local database worker snapshot",
  options: {
    signal?: AbortSignal;
    priority?: number;
    preemptible?: boolean;
    lane?: WorkerLane;
    staleWhileRevalidate?: boolean;
    serveStaleWithoutRefresh?: boolean;
  } = {},
): Promise<CachedDatabaseWorkerResult<T>> {
  const fingerprint = databaseFingerprint();
  const stored = cached<WorkerSnapshot<T>>(cacheKey, 365 * 24 * 60 * 60 * 1000);
  if (stored?.value && databaseFingerprintsMatch(stored.fingerprint, fingerprint)) {
    return { value: stored.value, stale: false };
  }

  // Some derived aggregates touch very large SQLite files. When a valid prior
  // snapshot exists, a public page request must never start that work on the
  // request's behalf; callers can serve the saved result while a separate,
  // deliberately paced refresh mechanism updates it.
  if (stored?.value && options.serveStaleWithoutRefresh) {
    return { value: stored.value, stale: true };
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
  options: {
    signal?: AbortSignal;
    priority?: number;
    preemptible?: boolean;
    lane?: WorkerLane;
    staleWhileRevalidate?: boolean;
    serveStaleWithoutRefresh?: boolean;
  } = {},
): Promise<T> {
  const result = await runCachedDatabaseWorkerSnapshot<T>(cacheKey, scriptName, workerData, source, options);
  return result.value;
}
