/**
 * Shared create-path slug normalization for lead identity tokens.
 *
 * Every path that mints or accepts a lead slug (addLead, CSV import, bundle
 * checkout sanitizeCheckoutLeadSlug) must produce the same [a-z0-9-]+ form
 * with leading/trailing dashes stripped AND length ≤ MAX_LEAD_SLUG_LENGTH
 * (RFC 1035 DNS label max — 63). Leaving edge dashes (e.g. "Demo Cafe!" →
 * demo-cafe-) or over-length labels desyncs the CRM slug from
 * leadSlugAsDnsLabel (src/lib/leads/slug-path.ts), so suggestedHost is
 * demo-cafe.{root} (or an invalid >63 label) while extractPreviewSubdomainSlug
 * → getLeadBySlug looks up a different token and misses — Starter
 * preview-subdomain Host→preview falls through.
 *
 * Encode-at-use for path construction still lives in slug-path.ts; this
 * module is create-path only.
 */

/**
 * Max length of a lead slug / DNS label. Hostnames cannot percent-encode
 * path segments; each DNS label is capped at 63 octets (RFC 1035). Keeping
 * CRM slugs at this cap guarantees suggestedHost =
 * `{slug}.{productionRootDomain}` is a valid single-label host and that
 * extractPreviewSubdomainSlug → getLeadBySlug identity holds.
 */
export const MAX_LEAD_SLUG_LENGTH = 63;

/**
 * Normalize a raw lead slug to [a-z0-9-]+ with collapsed internal dashes,
 * no leading/trailing dash, and length ≤ MAX_LEAD_SLUG_LENGTH. Returns ""
 * when the input sanitizes away to nothing (caller must reject or fall back
 * — checkout mints organic-*; addLead rejects; CSV falls back to
 * slugifyBusinessName).
 */
export function sanitizeLeadSlug(raw: string): string {
  let slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length > MAX_LEAD_SLUG_LENGTH) {
    // Truncate then re-strip trailing dashes so a mid-dash cut never leaves
    // an edge dash that would desync CRM identity from leadSlugAsDnsLabel.
    slug = slug.slice(0, MAX_LEAD_SLUG_LENGTH).replace(/-+$/g, "");
  }
  return slug;
}
