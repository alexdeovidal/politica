import { getSitemapFile, sitemapResponse, sitemapUnavailable } from "@/lib/seo-sitemaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  try {
    const xml = await getSitemapFile(file, request.signal);
    return xml === null ? new Response("Sitemap não encontrado.\n", { status: 404 }) : sitemapResponse(xml);
  } catch (error) {
    return sitemapUnavailable(error);
  }
}
