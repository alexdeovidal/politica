import { NextRequest, NextResponse } from "next/server";
import { findPublishedMunicipality } from "./lib/municipal-catalog-server";

// Check before React streams the global loading shell, otherwise Next can turn
// a notFound() into HTTP 200 for unimported or invented municipal URLs.
export function proxy(request: NextRequest) {
  const match = /^\/contas-do-municipio\/([a-z]{2})\/([a-z0-9-]+)\/?$/.exec(request.nextUrl.pathname);
  if (!match || !findPublishedMunicipality(match[1],match[2])) {
    return new NextResponse("Município ainda sem painel publicado.",{status:404,
      headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
  }
  return NextResponse.next();
}
export const config = { matcher: "/contas-do-municipio/:uf/:cidade" };
