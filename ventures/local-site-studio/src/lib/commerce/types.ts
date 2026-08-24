/**
 * Commerce add-on catalog — see /docs/product-bundles (≤50 SKUs).
 * Operator-editable stub before Stripe Products sync.
 */

/** Sold promise: catalog ≤50 SKUs. */
export const MAX_COMMERCE_SKUS = 50;

/**
 * Opaque SKU id ceiling shared by auth-gated catalog save and public Buy now.
 * Soft-cap/truncate is wrong: preserveCommerceStripeIds + Stripe Product
 * metadata key by exact id — truncating distinct over-long ids can collide.
 */
export const MAX_COMMERCE_SKU_ID_LENGTH = 64;

/** Soft caps for operator-entered fields. */
export const MAX_SKU_NAME_LENGTH = 80;
export const MAX_SKU_DESCRIPTION_LENGTH = 280;
export const MAX_SKU_PRICE_CENTS = 1_000_000_00; // $1,000,000.00
/**
 * Stripe rejects a USD Checkout Session line item under its documented
 * per-currency minimum charge amount (50 cents) — see
 * https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts.
 * Below this, Sync to Stripe silently succeeds (Price creation has no
 * minimum) but every "Buy now" click 502s at Checkout Session creation with
 * no operator-visible signal — see MIN_SKU_PRICE_CENTS usage in
 * normalizeCommerceItems.
 */
export const MIN_SKU_PRICE_CENTS = 50; // $0.50

export interface CommerceSku {
  id: string;
  name: string;
  description?: string;
  /** Integer USD cents (e.g. 1299 = $12.99). */
  priceCents: number;
  /** Set once syncCommerceCatalogToStripe creates/finds the matching Stripe Product. */
  stripeProductId?: string;
  /** Set once syncCommerceCatalogToStripe creates/finds a Price matching priceCents. */
  stripePriceId?: string;
}

export interface CommerceCatalog {
  leadSlug: string;
  items: CommerceSku[];
  updatedAt: string;
}

export interface UpsertCommerceCatalogInput {
  leadSlug: string;
  items: CommerceSku[];
  updatedAt: string;
}
