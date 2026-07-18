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
import { listAllPages } from "../stripe/list-all-pages";

/** Stable per-lead-per-SKU key stored in Product metadata for idempotent lookup. */
export function commerceSkuStripeKey(leadSlug: string, skuId: string): string {
  return `commerce_sku_${leadSlug}_${skuId}`;
}

type MinimalStripeProduct = {
  id: string;
  metadata?: Record<string, string>;
  active?: boolean;
};
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
      active?: boolean;
      starting_after?: string;
    }): Promise<{ data: MinimalStripeProduct[]; has_more: boolean }>;
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
      active?: boolean;
      limit: number;
      starting_after?: string;
    }): Promise<{ data: MinimalStripePrice[]; has_more: boolean }>;
    create(params: {
      product: string;
      currency: string;
      unit_amount: number;
      metadata: Record<string, string>;
    }): Promise<MinimalStripePrice>;
    update(
      id: string,
      params: { active: boolean },
    ): Promise<MinimalStripePrice>;
  };
}

/**
 * Look up by metadata key across BOTH active and inactive Products — never
 * pass `active: true` here. A Product can go inactive by a means outside
 * this module's control (the operator's own Archive orphan Stripe products
 * action, or a direct edit in the Stripe Dashboard) while its SKU id stays
 * in the catalog; scoping this lookup to active-only would miss it and mint
 * a second Product under the identical "stable" idempotency key every time
 * Sync to Stripe re-runs, permanently orphaning the first (an inactive
 * Product is invisible to this same lookup AND to
 * listOrphanCommerceStripeProducts' active-only scan, so it can never be
 * cleaned up either). Reactivate a matched-but-inactive Product instead of
 * creating a duplicate — see stripe-product-price-reactivate-on-resync.
 */
async function findProductByKey(
  stripe: StripeProductsAndPrices,
  key: string,
): Promise<MinimalStripeProduct | null> {
  const matchesKey = (product: MinimalStripeProduct) =>
    product.metadata?.local_site_studio_key === key;
  const listed = await listAllPages(
    (starting_after) => stripe.products.list({ limit: 100, starting_after }),
    matchesKey,
  );
  const match = listed.find(matchesKey) ?? null;
  if (match && match.active === false) {
    return stripe.products.update(match.id, { active: true });
  }
  return match;
}

/**
 * Match by amount across BOTH active and inactive Prices for this Product —
 * same reactivate-on-resync rule as findProductByKey (see its doc comment),
 * on the Price axis: a manually-deactivated Price at the same amount must be
 * reactivated, not duplicated under the same product.
 */
async function findMatchingPrice(
  stripe: StripeProductsAndPrices,
  productId: string,
  unitAmount: number,
): Promise<MinimalStripePrice | null> {
  const matchesAmount = (price: MinimalStripePrice) => price.unit_amount === unitAmount;
  const listed = await listAllPages(
    (starting_after) => stripe.prices.list({ product: productId, limit: 100, starting_after }),
    matchesAmount,
  );
  const match = listed.find(matchesAmount) ?? null;
  if (match && match.active === false) {
    return stripe.prices.update(match.id, { active: true });
  }
  return match;
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
  const listed = await listAllPages((starting_after) =>
    stripe.products.list({ limit: 100, active: true, starting_after }),
  );
  const orphans: OrphanCommerceStripeProduct[] = [];

  for (const product of listed) {
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
 * Archive (active=false) a caller-supplied list of orphan Stripe Products.
 * Split out from archiveOrphanCommerceStripeProducts so a caller can re-check
 * the orphan set against a freshly-read catalog after the (materially long,
 * paginated) listOrphanCommerceStripeProducts scan but before actually
 * mutating Stripe — see archiveOrphanCommerceStripeProductsAction, which
 * re-reads the catalog in that window so a concurrent saveCommerceCatalogAction
 * that re-adds/renames a SKU into the same skuId is not archived out from
 * under it.
 */
export async function archiveCommerceStripeProducts(
  stripe: StripeProductsAndPrices,
  orphans: ReadonlyArray<OrphanCommerceStripeProduct>,
): Promise<{ archived: OrphanCommerceStripeProduct[] }> {
  const archived: OrphanCommerceStripeProduct[] = [];

  for (const orphan of orphans) {
    await stripe.products.update(orphan.productId, { active: false });
    archived.push(orphan);
  }

  return { archived };
}

/**
 * Operator-triggered archive (active=false) of orphan Stripe Products for a
 * lead. Does not delete; does not touch Products for SKUs still in the catalog.
 * Returns the archived product ids so the caller can report a count.
 *
 * Convenience wrapper for callers with no concurrent-edit window to guard
 * against (e.g. tests, one-shot scripts). archiveOrphanCommerceStripeProductsAction
 * does NOT use this — it re-checks currentItems against a fresh catalog read
 * between the list and archive steps instead, since listOrphanCommerceStripeProducts'
 * account-wide pagination plus the sequential archive loop is a real window.
 */
export async function archiveOrphanCommerceStripeProducts(
  stripe: StripeProductsAndPrices,
  leadSlug: string,
  currentItems: CommerceSku[],
): Promise<{ archived: OrphanCommerceStripeProduct[] }> {
  const orphans = await listOrphanCommerceStripeProducts(stripe, leadSlug, currentItems);
  return archiveCommerceStripeProducts(stripe, orphans);
}
