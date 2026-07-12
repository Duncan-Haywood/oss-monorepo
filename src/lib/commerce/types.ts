/**
 * Commerce add-on catalog — see /docs/product-bundles (≤50 SKUs).
 * Operator-editable stub before Stripe Products sync.
 */

/** Sold promise: catalog ≤50 SKUs. */
export const MAX_COMMERCE_SKUS = 50;

/** Soft caps for operator-entered fields. */
export const MAX_SKU_NAME_LENGTH = 80;
export const MAX_SKU_DESCRIPTION_LENGTH = 280;
export const MAX_SKU_PRICE_CENTS = 1_000_000_00; // $1,000,000.00

export interface CommerceSku {
  id: string;
  name: string;
  description?: string;
  /** Integer USD cents (e.g. 1299 = $12.99). */
  priceCents: number;
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
