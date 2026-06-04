/** Canonical site URL for meta tags (no trailing slash). */
export function getDocsSiteUrl(): string | undefined {
  const raw = import.meta.env.VITE_DOCS_SITE_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

/** Hash-route canonical URL, e.g. https://docs.example.com/#/roi */
export function docsCanonicalUrl(path: string): string | undefined {
  const base = getDocsSiteUrl();
  if (!base) return undefined;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}/#${normalized}`;
}
