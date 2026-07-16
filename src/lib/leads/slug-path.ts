/**
 * Encode-at-use helpers for lead slugs in URL path segments.
 *
 * Create-paths (addLead, CSV, sanitizeCheckoutLeadSlug on bundle checkout)
 * normalize new slugs to [a-z0-9-]+ with length ≤ MAX_LEAD_SLUG_LENGTH (63 —
 * RFC 1035 DNS label max), but legacy payment_stub / pre-sanitize rows (and
 * any future create-path miss) can still hold free-form or over-length slugs.
 * Interpolating those into `/preview/${slug}` or `/api/contact/${slug}`
 * without encoding turns `/` into extra path segments and can collapse via
 * WHATWG URL path normalization — the same traversal class
 * sanitizeCheckoutLeadSlug closed on the create path.
 *
 * encodeURIComponent keeps the stored identity unchanged for DB lookup
 * (Next.js decodes dynamic route params) while forcing a single path segment
 * at every construction site. DNS labels (suggestedHost) cannot percent-
 * encode — leadSlugAsDnsLabel reuses sanitizeLeadSlug so Host→preview
 * identity matches create-path storage.
 */

import { sanitizeLeadSlug } from "./slug";

/**
 * Public dynamic-route slug path params (`/api/contact/[slug]`,
 * `/api/preview/[slug]/open`, and the sold SSR `/preview/[slug]` page via
 * loadPreviewPageLead) must hard-reject over this length before any CRM/demo
 * lookup. Create-path minting caps at MAX_LEAD_SLUG_LENGTH (63), but legacy /
 * pre-sanitize rows and percent-decoded path tokens can be longer — 120
 * matches the historical preview-open bound and still blocks multi-KB path
 * abuse. Soft-cap/truncate would change the lookup key.
 */
export const MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH = 120;

/** True when a public path slug is non-empty and within the path-length cap. */
export function isPublicLeadSlugPathLengthOk(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH;
}

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
 * Hostnames cannot use percent-encoding the way paths can — reuse
 * sanitizeLeadSlug (charset + edge-dash + ≤63) so create-path CRM identity
 * equals the preview-subdomain Host label. Empty sanitization falls back to
 * "lead" (suggestedHost must never be bare `.{root}`).
 */
export function leadSlugAsDnsLabel(slug: string): string {
  return sanitizeLeadSlug(slug) || "lead";
}
