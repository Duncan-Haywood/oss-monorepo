/**
 * Encode-at-use helpers for lead slugs in URL path segments.
 *
 * Create-paths (addLead, CSV, sanitizeCheckoutLeadSlug on bundle checkout)
 * normalize new slugs to [a-z0-9-]+, but legacy payment_stub / pre-sanitize
 * rows (and any future create-path miss) can still hold free-form slugs.
 * Interpolating those into `/preview/${slug}` or `/api/contact/${slug}`
 * without encoding turns `/` into extra path segments and can collapse via
 * WHATWG URL path normalization — the same traversal class
 * sanitizeCheckoutLeadSlug closed on the create path.
 *
 * encodeURIComponent keeps the stored identity unchanged for DB lookup
 * (Next.js decodes dynamic route params) while forcing a single path segment
 * at every construction site.
 */

/** Encode a lead slug for use as a single URL path segment. */
export function encodeLeadSlugPathSegment(slug: string): string {
  return encodeURIComponent(slug);
}

/** App-relative preview path for a lead (`/preview/{encoded}`). */
export function leadPreviewPath(slug: string): string {
  return `/preview/${encodeLeadSlugPathSegment(slug)}`;
}

/** App-relative contact API path for a lead (`/api/contact/{encoded}`). */
export function leadContactApiPath(slug: string): string {
  return `/api/contact/${encodeLeadSlugPathSegment(slug)}`;
}

/**
 * Absolute preview URL from a base origin (no trailing slash required).
 * Use for outbound email and handoff records where siteUrl()/appBaseUrl()
 * already supply the origin.
 */
export function leadPreviewAbsoluteUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${leadPreviewPath(slug)}`;
}

/**
 * Absolute contact form API URL from a base origin.
 */
export function leadContactAbsoluteUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${leadContactApiPath(slug)}`;
}

/**
 * DNS label for suggestedHost (`{label}.{productionRootDomain}`).
 * Hostnames cannot use percent-encoding the way paths can — collapse to
 * [a-z0-9-] so a legacy free-form slug never produces an invalid or
 * multi-label host string.
 */
export function leadSlugAsDnsLabel(slug: string): string {
  const label = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return label || "lead";
}
