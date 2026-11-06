// Deliberately independent of SQLite and external APIs: checks the HTTP loop.
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
