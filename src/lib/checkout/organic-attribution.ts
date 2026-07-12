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
 * Prefer an explicit lead slug from the request; otherwise mint organic-*.
 * Empty / whitespace-only strings count as missing (homepage CTAs).
 */
export function resolveBundleCheckoutLeadSlug(
  rawSlug: string | undefined,
  mint: () => string = mintOrganicCheckoutLeadSlug,
): { leadSlug: string; mintedOrganic: boolean } {
  const trimmed = rawSlug?.trim() ?? "";
  if (trimmed) {
    return { leadSlug: trimmed, mintedOrganic: false };
  }
  return { leadSlug: mint(), mintedOrganic: true };
}
