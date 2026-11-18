import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    // Share/news image endpoints are public crawlable assets; other APIs are
    // data/query handlers rather than independent search result pages.
    rules: { userAgent: "*", allow: ["/", "/api/share", "/api/news-image"], disallow: ["/api/"] },
    sitemap: "https://politica007.com.br/sitemap.xml",
  };
}
