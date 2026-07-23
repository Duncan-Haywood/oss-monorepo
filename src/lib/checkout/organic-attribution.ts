/**
 * Homepage / pricing CTAs often open Checkout without a CRM lead slug.
 * Stripe metadata then stores slug:"" and the webhook skips fulfillment
 * (requires slug && tier). Mint a stable organic-* slug at session create
 * so recordLeadPayment + payment stubs + deploy handoffs still run.
 */

import { createHash, randomBytes } from "node:crypto";
import { sanitizeLeadSlug } from "@/lib/leads/slug";

export const ORGANIC_CHECKOUT_SLUG_PREFIX = "organic-";

/** Hex id length (bytes → 2× hex chars). 6 bytes = 12 hex chars. */
const ORGANIC_ID_BYTES = 6;
const ORGANIC_ID_HEX_LENGTH = ORGANIC_ID_BYTES * 2;

export function mintOrganicCheckoutLeadSlug(
  randomHex: () => string = () => randomBytes(ORGANIC_ID_BYTES).toString("hex"),
): string {
  const id = randomHex().trim().toLowerCase();
  if (!id) {
    throw new Error("organic checkout slug mint produced an empty id");
  }
  return `${ORGANIC_CHECKOUT_SLUG_PREFIX}${id}`;
}

/**
 * Derive a stable organic-* slug from a client idempotency key, so a
 * network-error retry that reuses the same Idempotency-Key (see
 * idempotency-key.ts) mints the SAME slug on every attempt instead of a
 * fresh random one. A retry that sent Stripe a different metadata.slug
 * under a reused Idempotency-Key would hit Stripe's own idempotency_error
 * (a key must not be reused with different parameters), turning the very
 * retry this feature exists to collapse into a hard failure.
 */
export function deriveOrganicCheckoutLeadSlugFromIdempotencyKey(idempotencyKey: string): string {
  const id = createHash("sha256")
    .update(idempotencyKey)
    .digest("hex")
    .slice(0, ORGANIC_ID_HEX_LENGTH);
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
 *
 * When a validated client idempotencyKey is present, the organic slug is
 * derived deterministically from it (never randomly minted) so a same-key
 * retry is stable — see deriveOrganicCheckoutLeadSlugFromIdempotencyKey.
 */
export function resolveBundleCheckoutLeadSlug(
  rawSlug: string | undefined,
  options: {
    idempotencyKey?: string;
    mint?: () => string;
  } = {},
): { leadSlug: string; mintedOrganic: boolean } {
  const { idempotencyKey, mint = mintOrganicCheckoutLeadSlug } = options;
  const sanitized = sanitizeLeadSlug(rawSlug?.trim() ?? "");
  if (sanitized) {
    return { leadSlug: sanitized, mintedOrganic: false };
  }
  if (idempotencyKey) {
    return {
      leadSlug: deriveOrganicCheckoutLeadSlugFromIdempotencyKey(idempotencyKey),
      mintedOrganic: true,
    };
  }
  return { leadSlug: mint(), mintedOrganic: true };
}
