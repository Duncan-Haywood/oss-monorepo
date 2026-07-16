/**
 * Bounds for client-supplied slug + skuId on POST /api/commerce/checkout.
 *
 * Soft-cap is wrong for opaque lookup keys: truncating a slug/skuId looks
 * up the wrong catalog row (or none) while still burning a DB read and —
 * for a near-miss — can still reach Stripe session create with wrong
 * metadata. Hard-reject over-length before getCommerceCatalog / Stripe.
 *
 * Slug ceiling matches create-path MAX_LEAD_SLUG_LENGTH (RFC 1035 DNS
 * label max). SKU id ceiling matches auth-gated catalog save
 * (MAX_COMMERCE_SKU_ID_LENGTH) so public Buy now cannot probe with ids
 * the operator UI never persists.
 */

import {
  MAX_LEAD_SLUG_LENGTH,
  parseLeadSlugLookup,
} from "@/lib/leads/slug";
import { MAX_COMMERCE_SKU_ID_LENGTH } from "./types";

export { MAX_LEAD_SLUG_LENGTH as MAX_COMMERCE_CHECKOUT_SLUG_LENGTH };

/** Same ceiling as normalizeCommerceItems (auth-gated catalog save). */
export const MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH = MAX_COMMERCE_SKU_ID_LENGTH;

export type ParseCommerceCheckoutFieldResult =
  | { ok: true; value: string }
  | { ok: false; reason: "missing" | "too_long" };

function parseBoundedTrimmedString(
  raw: unknown,
  maxLength: number,
): ParseCommerceCheckoutFieldResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "missing" };
  }
  const value = raw.trim();
  if (!value) {
    return { ok: false, reason: "missing" };
  }
  if (value.length > maxLength) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, value };
}

/** Trim + hard-reject over MAX_COMMERCE_CHECKOUT_SLUG_LENGTH (never truncate). */
export function parseCommerceCheckoutSlug(
  raw: unknown,
): ParseCommerceCheckoutFieldResult {
  // Shared with auth-gated dashboard slug lookups (parseLeadSlugLookup).
  const parsed = parseLeadSlugLookup(raw);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }
  return { ok: true, value: parsed.slug };
}

/** Trim + hard-reject over MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH (never truncate). */
export function parseCommerceCheckoutSkuId(
  raw: unknown,
): ParseCommerceCheckoutFieldResult {
  return parseBoundedTrimmedString(raw, MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH);
}
