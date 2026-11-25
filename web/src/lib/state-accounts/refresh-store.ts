import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Only fixed registry-derived filenames are accepted; keep the last validated file. */
export function refreshedSnapshot<T>(file: string, fallback: T | null, validate: (value: unknown) => T,
  storage = () => process.env.STATE_ACCOUNTS_REFRESH_DIR || "/data/state-accounts-refresh"): () => T | null {
  let last = fallback;
  let nextCheck = 0;
  let signature = "";
  return () => {
    if (Date.now() < nextCheck) return last;
    nextCheck = Date.now() + 60_000;
    const root = storage();
    // Concatenate fixed source path at runtime so Next's file tracer never follows the volume.
    const target = path.resolve(root, file);
    try {
      const stat = statSync(target);
      const stamp = [stat.ino, stat.size, stat.mtimeMs].join(":");
      if (stamp !== signature) {
        if (!stat.isFile() || stat.size > 1_000_000) throw new Error("Arquivo estadual fora dos limites");
        const candidate = validate(JSON.parse(readFileSync(target, "utf8")));
        last = candidate;
        signature = stamp;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Critério de atualização estadual não atendido:", file, error);
    }
    return last;
  };
}
