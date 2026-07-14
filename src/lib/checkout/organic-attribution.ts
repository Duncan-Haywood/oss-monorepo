/**
 * Homepage / pricing CTAs often open Checkout without a CRM lead slug.
 * Stripe metadata then stores slug:"" and the webhook skips fulfillment
 * (requires slug && tier). Mint a stable organic-* slug at session create
 * so recordLeadPayment + payment stubs + deploy handoffs still run.
 */

import { randomBytes } from "node:crypto";

export const ORGANIC_CHECKOUT_SLUG_PREFIX = "organic-";

/** Hex id length (bytes → 2× hex chars). 6 bytes = 12 hex chars. */
const ORGANIC_ID_BYTES = 6;

export function mintOrganicCheckoutLeadSlug(
  randomHex: () => string = () => randomBytes(ORGANIC_ID_BYTES).toString("hex"),
): string {
  const id = randomHex().trim().toLowerCase();
  if (!id) {
    throw new Error("organic checkout slug mint produced an empty id");
  }
  return `${ORGANIC_CHECKOUT_SLUG_PREFIX}${id}`;
}

export function isOrganicCheckoutLeadSlug(slug: string): boolean {
  return slug.trim().toLowerCase().startsWith(ORGANIC_CHECKOUT_SLUG_PREFIX);
}

/**
 * Same [a-z0-9-]+ normalization every other lead-slug-creation path already
 * applies (slugifyBusinessName / addLeadAction's explicit-slug sanitize) —
 * a request-body slug is otherwise unrestricted and gets persisted verbatim
 * by the webhook's recordLeadPayment/markLeadPaid on first payment, then
 * interpolated unescaped into suggestedHost / previewUrl / contactFormUrl
 * (src/lib/deploy/handoff.ts) and proxy.ts's preview-subdomain rewrite —
 * a `..`-segment slug there collapses the rewrite target via URL path
 * normalization, the same traversal class safeNextPath now rejects on the
 * login-redirect surface, just reachable via an unauthenticated paid
 * checkout instead of the next= query param.
 */
function sanitizeCheckoutLeadSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Prefer an explicit lead slug from the request; otherwise mint organic-*.
 * Empty / whitespace-only strings (or strings that sanitize to nothing —
 * e.g. all-symbol input) count as missing (homepage CTAs).
 */
export function resolveBundleCheckoutLeadSlug(
  rawSlug: string | undefined,
  mint: () => string = mintOrganicCheckoutLeadSlug,
): { leadSlug: string; mintedOrganic: boolean } {
  const sanitized = sanitizeCheckoutLeadSlug(rawSlug?.trim() ?? "");
  if (sanitized) {
    return { leadSlug: sanitized, mintedOrganic: false };
  }
  return { leadSlug: mint(), mintedOrganic: true };
}
