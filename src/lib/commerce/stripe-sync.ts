/**
 * Sync an operator Commerce catalog to real Stripe Products/Prices, one
 * Product per SKU. Mirrors the idempotency approach in
 * src/lib/pricing/bootstrap-stripe-prices.ts: look up by a stable metadata
 * key before creating, so re-running (e.g. after adding one SKU) does not
 * duplicate Products, and only creates a new Price when the stored price
 * changed (Stripe Prices are immutable once created).
 *
 * The Stripe client is passed in (not constructed here) so this stays unit
 * testable with a fake client — see stripe-sync.test.ts.
 */

import type { CommerceSku } from "./types";

/** Stable per-lead-per-SKU key stored in Product metadata for idempotent lookup. */
export function commerceSkuStripeKey(leadSlug: string, skuId: string): string {
  return `commerce_sku_${leadSlug}_${skuId}`;
}

type MinimalStripeProduct = { id: string; metadata?: Record<string, string> };
type MinimalStripePrice = {
  id: string;
  unit_amount: number | null;
  active: boolean;
};

/** Interface subset this module calls — matches the real Stripe SDK shape. */
export interface StripeProductsAndPrices {
  products: {
    list(params: {
      limit: number;
      active: boolean;
    }): Promise<{ data: MinimalStripeProduct[] }>;
    create(params: {
      name: string;
      metadata: Record<string, string>;
    }): Promise<MinimalStripeProduct>;
    update(
      id: string,
      params: { active: boolean },
    ): Promise<MinimalStripeProduct>;
  };
  prices: {
    list(params: {
      product: string;
      active: boolean;
      limit: number;
    }): Promise<{ data: MinimalStripePrice[] }>;
    create(params: {
      product: string;
      currency: string;
      unit_amount: number;
      metadata: Record<string, string>;
    }): Promise<MinimalStripePrice>;
  };
}

async function findProductByKey(
  stripe: StripeProductsAndPrices,
  key: string,
): Promise<MinimalStripeProduct | null> {
  const listed = await stripe.products.list({ limit: 100, active: true });
  return listed.data.find((product) => product.metadata?.local_site_studio_key === key) ?? null;
}

async function findMatchingPrice(
  stripe: StripeProductsAndPrices,
  productId: string,
  unitAmount: number,
): Promise<MinimalStripePrice | null> {
  const listed = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return listed.data.find((price) => price.unit_amount === unitAmount) ?? null;
}

export type SyncedCommerceSku = CommerceSku & {
  stripeProductId: string;
  stripePriceId: string;
};

/**
 * Create/find a Stripe Product + Price for every SKU in a catalog. Returns
 * items with stripeProductId/stripePriceId populated — callers persist the
 * result via upsertCommerceCatalog. Never mutates or archives Stripe state
 * for SKUs the operator has since removed from the catalog draft — use
 * archiveOrphanCommerceStripeProducts for that (operator-triggered).
 */
export async function syncCommerceCatalogToStripe(
  stripe: StripeProductsAndPrices,
  leadSlug: string,
  businessName: string,
  items: CommerceSku[],
): Promise<SyncedCommerceSku[]> {
  const synced: SyncedCommerceSku[] = [];

  for (const item of items) {
    const key = commerceSkuStripeKey(leadSlug, item.id);
    let product = await findProductByKey(stripe, key);
    if (!product) {
      product = await stripe.products.create({
        name: `${businessName} — ${item.name}`.slice(0, 250),
        metadata: { local_site_studio_key: key, leadSlug, skuId: item.id },
      });
    }

    let price = await findMatchingPrice(stripe, product.id, item.priceCents);
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: item.priceCents,
        metadata: { local_site_studio_key: key, leadSlug, skuId: item.id },
      });
    }

    synced.push({ ...item, stripeProductId: product.id, stripePriceId: price.id });
  }

  return synced;
}

export type OrphanCommerceStripeProduct = {
  productId: string;
  skuId: string;
  key: string;
};

/**
 * Active Stripe Products for this lead whose skuId is no longer in the saved
 * catalog (or whose catalog is empty). Matched via metadata.leadSlug +
 * local_site_studio_key — never archives another lead's Products.
 */
export async function listOrphanCommerceStripeProducts(
  stripe: StripeProductsAndPrices,
  leadSlug: string,
  currentItems: CommerceSku[],
): Promise<OrphanCommerceStripeProduct[]> {
  const keepSkuIds = new Set(currentItems.map((item) => item.id));
  const listed = await stripe.products.list({ limit: 100, active: true });
  const orphans: OrphanCommerceStripeProduct[] = [];

  for (const product of listed.data) {
    const key = product.metadata?.local_site_studio_key;
    const metaLeadSlug = product.metadata?.leadSlug;
    const skuId = product.metadata?.skuId;
    if (!key || !skuId) continue;
    if (metaLeadSlug !== leadSlug && !key.startsWith(`commerce_sku_${leadSlug}_`)) {
      continue;
    }
    if (keepSkuIds.has(skuId)) continue;
    orphans.push({ productId: product.id, skuId, key });
  }

  return orphans;
}

/**
 * Operator-triggered archive (active=false) of orphan Stripe Products for a
 * lead. Does not delete; does not touch Products for SKUs still in the catalog.
 * Returns the archived product ids so the caller can report a count.
 */
export async function archiveOrphanCommerceStripeProducts(
  stripe: StripeProductsAndPrices,
  leadSlug: string,
  currentItems: CommerceSku[],
): Promise<{ archived: OrphanCommerceStripeProduct[] }> {
  const orphans = await listOrphanCommerceStripeProducts(stripe, leadSlug, currentItems);
  const archived: OrphanCommerceStripeProduct[] = [];

  for (const orphan of orphans) {
    await stripe.products.update(orphan.productId, { active: false });
    archived.push(orphan);
  }

  return { archived };
}
