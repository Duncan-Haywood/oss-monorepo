/**
 * Homepage / pricing CTAs often open Checkout without a CRM lead slug.
 * Stripe metadata then stores slug:"" and the webhook skips fulfillment
 * (requires slug && tier). Mint a stable organic-* slug at session create
 * so recordLeadPayment + payment stubs + deploy handoffs still run.
 */

import { randomBytes } from "node:crypto";
import { sanitizeLeadSlug } from "@/lib/leads/slug";

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
 * Prefer an explicit lead slug from the request; otherwise mint organic-*.
 * Empty / whitespace-only strings (or strings that sanitize to nothing —
 * e.g. all-symbol input) count as missing (homepage CTAs).
 *
 * Uses shared sanitizeLeadSlug (src/lib/leads/slug.ts) — same create-path
 * contract as addLeadAction / CSV so a request-body slug cannot keep edge
 * dashes that desync CRM identity from suggestedHost DNS labels.
 */
export function resolveBundleCheckoutLeadSlug(
  rawSlug: string | undefined,
  mint: () => string = mintOrganicCheckoutLeadSlug,
): { leadSlug: string; mintedOrganic: boolean } {
  const sanitized = sanitizeLeadSlug(rawSlug?.trim() ?? "");
  if (sanitized) {
    return { leadSlug: sanitized, mintedOrganic: false };
  }
  return { leadSlug: mint(), mintedOrganic: true };
}
