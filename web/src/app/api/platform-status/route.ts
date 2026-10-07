import path from "node:path";
import { databaseFingerprint, databasePath } from "@/lib/db";
import { runDatabaseWorker } from "@/lib/database-worker";
import { rateLimit } from "@/lib/platform/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FollowedPage = { path: string; fingerprint: string | null; checkedAt: string | null };

function platformDatabasePath() {
  return process.env.POLITICA_PLATFORM_DB_PATH || path.join(path.dirname(databasePath()), "politica-platform.db");
}

export async function POST(request: Request) {
  if (!rateLimit(request, "follow-status", 20)) {
    return Response.json({ error: "Aguarde para verificar novamente." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    !Array.isArray(body.paths) ||
    body.paths.length > 20 ||
    body.paths.some((value: unknown) => typeof value !== "string" || value.length > 1000)
  ) {
    return Response.json({ error: "Consulta inválida." }, { status: 400 });
  }

  try {
    const { items } = await runDatabaseWorker<{ items: FollowedPage[] }>(
      "platform-status-worker.cjs",
      {
        databasePath: databasePath(),
        databaseVersion: databaseFingerprint(),
        platformDatabasePath: platformDatabasePath(),
        paths: body.paths,
      },
      // Saved-query checks run in the background and yield to interactive search.
      { signal: request.signal, priority: -10, preemptible: true },
    );
    return Response.json({ items });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return new Response(null, { status: 499 });
    }
    console.error("Unable to check followed pages:", error);
    return Response.json({ error: "Não foi possível verificar as consultas agora." }, { status: 503 });
  }
}
