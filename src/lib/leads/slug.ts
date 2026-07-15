/**
 * Shared create-path slug normalization for lead identity tokens.
 *
 * Every path that mints or accepts a lead slug (addLead, CSV import, bundle
 * checkout sanitizeCheckoutLeadSlug) must produce the same [a-z0-9-]+ form
 * with leading/trailing dashes stripped. Leaving edge dashes (e.g.
 * "Demo Cafe!" → demo-cafe-) desyncs the CRM slug from leadSlugAsDnsLabel
 * (src/lib/leads/slug-path.ts), so suggestedHost is demo-cafe.{root} while
 * extractPreviewSubdomainSlug → getLeadBySlug looks up the trailing-dash
 * slug and misses — Starter preview-subdomain Host→preview falls through.
 *
 * Encode-at-use for path construction still lives in slug-path.ts; this
 * module is create-path only.
 */

/**
 * Normalize a raw lead slug to [a-z0-9-]+ with collapsed internal dashes and
 * no leading/trailing dash. Returns "" when the input sanitizes away to
 * nothing (caller must reject or fall back — checkout mints organic-*;
 * addLead rejects; CSV falls back to slugifyBusinessName).
 */
export function sanitizeLeadSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
