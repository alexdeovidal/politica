import type { Metadata } from "next";

export const PUBLIC_SITE_URL = "https://politica007.com.br";

/** A canonical belongs to one page, never to the shared root layout. */
export function pageMetadata(title: string, description: string, path: string): Metadata {
  const url = new URL(path, PUBLIC_SITE_URL).toString();
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Politica007",
      locale: "pt_BR",
      type: "website",
      images: [`${PUBLIC_SITE_URL}/api/share`],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${PUBLIC_SITE_URL}/api/share`] },
  };
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

type SearchParams = Record<string, string | string[] | undefined>;
type CanonicalFilters = Record<string, RegExp | readonly string[]>;

/** Keep distinct listing pages; drop tracking keys and free-text searches. */
export function listingMetadata(title: string, description: string, path: string, params: SearchParams, filters: CanonicalFilters = {}, paginationKeys: readonly string[] = ["page"]): Metadata {
  const query = new URLSearchParams();
  for (const key of Object.keys(filters).sort()) {
    const value = params[key], rule = filters[key];
    if (typeof value !== "string" || value.length > 120) continue;
    if (rule instanceof RegExp ? rule.test(value) : rule.includes(value)) query.set(key, value);
  }
  for (const key of [...paginationKeys].sort()) {
    const raw = params[key];
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) continue;
    const page = Number(raw);
    if (Number.isSafeInteger(page) && page > 1 && page <= 10000) query.set(key, String(page));
  }
  return pageMetadata(title, description, `${path}${query.size ? `?${query}` : ""}`);
}
