import type { Metadata } from "next";
import { PUBLIC_SITE_URL } from "@/lib/seo-metadata";

export function shareMetadata(title: string, path: string, description = "Consulte dados públicos, relações e fontes no Politica007.", params: Record<string, string> = {}): Metadata {
  const query = new URLSearchParams({ path, ...params });
  const image = `${PUBLIC_SITE_URL}/api/share?${query}`;
  // A selected year changes the share card, while the profile keeps one stable URL.
  const canonical = new URL(path, PUBLIC_SITE_URL).toString();
  return {
    title: `${title} · Politica007`,
    description,
    alternates: { canonical },
    openGraph: {
      title, description,
      url: `${canonical}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`,
      siteName: "Politica007", locale: "pt_BR", type: "website",
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
