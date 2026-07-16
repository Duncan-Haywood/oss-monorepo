/**
 * Shared lead-slug helpers for create-path normalization AND auth-gated
 * dashboard lookup hard-reject.
 *
 * Create-path: every path that mints or accepts a lead slug (addLead, CSV
 * import, bundle checkout sanitizeCheckoutLeadSlug) must produce the same
 * [a-z0-9-]+ form with leading/trailing dashes stripped AND length ≤
 * MAX_LEAD_SLUG_LENGTH (RFC 1035 DNS label max — 63). Leaving edge dashes
 * (e.g. "Demo Cafe!" → demo-cafe-) or over-length labels desyncs the CRM
 * slug from leadSlugAsDnsLabel (src/lib/leads/slug-path.ts), so
 * suggestedHost is demo-cafe.{root} (or an invalid >63 label) while
 * extractPreviewSubdomainSlug → getLeadBySlug looks up a different token
 * and misses — Starter preview-subdomain Host→preview falls through.
 *
 * Auth-gated lookup: dashboard actions that take a client-supplied slug
 * (Mark live, Assign project/domain, stage/notes/snooze, packs, commerce
 * catalog, Billing portal, …) must hard-reject over MAX before any
 * Convex/SQLite / Stripe / Resend work — requireOperatorAuth is not a
 * payload-size throttle, and soft-cap/truncate would change the opaque
 * CRM lookup key (same class as parseInquiryId / parseCheckoutSessionId /
 * parseVercelProjectId). Public path/query sinks use the wider
 * MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH=120; dashboard CRM keys match
 * create-path MAX_LEAD_SLUG_LENGTH=63.
 *
 * Encode-at-use for path construction still lives in slug-path.ts.
 */

/**
 * Max length of a lead slug / DNS label. Hostnames cannot percent-encode
 * path segments; each DNS label is capped at 63 octets (RFC 1035). Keeping
 * CRM slugs at this cap guarantees suggestedHost =
 * `{slug}.{productionRootDomain}` is a valid single-label host and that
 * extractPreviewSubdomainSlug → getLeadBySlug identity holds.
 */
export const MAX_LEAD_SLUG_LENGTH = 63;

export type ParseLeadSlugLookupResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Trim and validate a dashboard / money-route lead slug lookup key.
 * Empty/whitespace → missing; over MAX_LEAD_SLUG_LENGTH → too_long
 * (never truncate — soft-cap would change the opaque CRM key).
 */
export function parseLeadSlugLookup(raw: unknown): ParseLeadSlugLookupResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "missing" };
  }
  const slug = raw.trim();
  if (!slug) {
    return { ok: false, reason: "missing" };
  }
  if (slug.length > MAX_LEAD_SLUG_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, slug };
}

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
