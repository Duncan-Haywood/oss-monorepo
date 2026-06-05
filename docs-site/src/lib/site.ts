/** Site URL metadata for canonical links and Open Graph (optional). */
export function docsSiteOrigin(): string | undefined {
  const domain = process.env.DOCS_SITE_DOMAIN?.trim();
  if (!domain) return undefined;
  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return host ? `https://${host}` : undefined;
}
