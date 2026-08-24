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

/**
 * Stable Stripe Idempotency-Key for a SKU's product.create call — mirrors
 * stripe-connect.ts's connectAccountIdempotencyKey pattern. findProductByKey
 * (list-then-create) is a check-then-act race: two concurrent
 * syncCommerceCatalogToStripe calls for the same lead (an operator
 * double-clicking "Sync to Stripe," two open dashboard tabs, or a
 * client-retried request) can both see no existing Product for a SKU and
 * both call products.create, minting two permanently-orphaned Products under
 * the identical "stable" metadata key — the metadata-based lookup alone
 * cannot prevent this, since neither concurrent call can see the other's
 * write until it commits. Passing this key as the request's Idempotency-Key
 * closes the race at the Stripe API layer.
 */
function commerceProductIdempotencyKey(key: string): string {
  return `local_site_studio_${key}_product`;
}

/**
 * Stable Stripe Idempotency-Key for a SKU's price.create call — same race as
 * commerceProductIdempotencyKey, on the Price axis. Includes unitAmount so a
 * legitimate later price change (a new, distinct Price object, since Stripe
 * Prices are immutable) still gets its own key rather than colliding with an
 * earlier amount's create call.
 */
function commercePriceIdempotencyKey(key: string, unitAmount: number): string {
  return `local_site_studio_${key}_price_${unitAmount}`;
}

type MinimalStripeProduct = {
  id: string;
  name?: string;
  description?: string | null;
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
    create(
      params: {
        name: string;
        description?: string;
        metadata: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<MinimalStripeProduct>;
    update(
      id: string,
      params: { active?: boolean; name?: string; description?: string },
    ): Promise<MinimalStripeProduct>;
  };
  prices: {
    list(params: {
      product: string;
      active?: boolean;
      limit: number;
      starting_after?: string;
    }): Promise<{ data: MinimalStripePrice[]; has_more: boolean }>;
    create(
      params: {
        product: string;
        currency: string;
        unit_amount: number;
        metadata: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<MinimalStripePrice>;
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

/**
 * Deactivate every other active Price on this Product besides the one the
 * current sync just resolved as current — a repriced SKU mints a brand-new
 * Price (Stripe Prices are immutable) via findMatchingPrice/prices.create
 * above, but the superseded Price it replaces was otherwise never touched:
 * this module creates exactly one Product per SKU, so any other active Price
 * left on that Product is stale by definition once a current one is known.
 * Left unfixed, every operator reprice permanently accumulates one more
 * active-but-orphaned Price per SKU in the connected Stripe account, with no
 * existing cleanup path (archiveOrphanCommerceStripeProducts only targets
 * whole Products for SKUs removed from the catalog, never a stale Price on a
 * SKU that's still present at a new amount). Mirrors the reactivate-on-resync
 * precedent above — automatic, not operator-gated, since deactivating a
 * superseded Price (unlike archiving a Product for a removed SKU) carries no
 * customer-facing or money-movement risk and keeps external Stripe state
 * matching the catalog's current desired state, the same principle this file
 * already enforces for Products via archiveOrphanCommerceStripeProducts.
 */
async function deactivateSupersededPrices(
  stripe: StripeProductsAndPrices,
  productId: string,
  currentPriceId: string,
): Promise<void> {
  const stale = await listAllPages((starting_after) =>
    stripe.prices.list({ product: productId, active: true, limit: 100, starting_after }),
  );
  for (const price of stale) {
    if (price.id === currentPriceId) continue;
    await stripe.prices.update(price.id, { active: false });
  }
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
    const desiredName = `${businessName} — ${item.name}`.slice(0, 250);
    const desiredDescription = item.description?.trim() || undefined;
    let product = await findProductByKey(stripe, key);
    if (!product) {
      product = await stripe.products.create(
        {
          name: desiredName,
          ...(desiredDescription ? { description: desiredDescription } : {}),
          metadata: { local_site_studio_key: key, leadSlug, skuId: item.id },
        },
        { idempotencyKey: commerceProductIdempotencyKey(key) },
      );
    } else if (product.name !== desiredName || (product.description ?? undefined) !== desiredDescription) {
      // A SKU name/description (or the lead's businessName) can change after
      // the Product was first created — Stripe Products are mutable, unlike
      // Prices, so resync both display fields in place rather than leaving
      // Stripe permanently showing whatever was true at first-sync time.
      product = await stripe.products.update(product.id, {
        name: desiredName,
        description: desiredDescription ?? "",
      });
    }

    let price = await findMatchingPrice(stripe, product.id, item.priceCents);
    if (!price) {
      price = await stripe.prices.create(
        {
          product: product.id,
          currency: "usd",
          unit_amount: item.priceCents,
          metadata: { local_site_studio_key: key, leadSlug, skuId: item.id },
        },
        { idempotencyKey: commercePriceIdempotencyKey(key, item.priceCents) },
      );
    }
    await deactivateSupersededPrices(stripe, product.id, price.id);

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
 *
 * The optional isStillOrphan callback is invoked before EACH individual
 * archive call, not just once before the whole loop — this list can contain
 * several orphans, each archived via its own sequential awaited Stripe call,
 * so a concurrent catalog save that re-adds a SKU between two orphans' turns
 * (not only before the loop starts) must still be caught
 * (buffer-schedule-stale-pack-variant-guard fixed the identical bug shape in
 * scheduleMarketingPackToBufferAction's Buffer-posting loop; this closes the
 * same shape here). Orphans for which isStillOrphan resolves false are
 * skipped, not archived.
 */
export async function archiveCommerceStripeProducts(
  stripe: StripeProductsAndPrices,
  orphans: ReadonlyArray<OrphanCommerceStripeProduct>,
  options?: {
    isStillOrphan?: (orphan: OrphanCommerceStripeProduct) => Promise<boolean>;
  },
): Promise<{ archived: OrphanCommerceStripeProduct[] }> {
  const archived: OrphanCommerceStripeProduct[] = [];

  for (const orphan of orphans) {
    if (options?.isStillOrphan && !(await options.isStillOrphan(orphan))) {
      continue;
    }
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
