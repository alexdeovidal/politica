import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

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
