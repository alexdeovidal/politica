import { getSitemapIndex, sitemapResponse, sitemapUnavailable } from "@/lib/seo-sitemaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return sitemapResponse(await getSitemapIndex(request.signal));
  } catch (error) {
    return sitemapUnavailable(error);
  }
}
