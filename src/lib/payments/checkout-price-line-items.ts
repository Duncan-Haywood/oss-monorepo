import { BUNDLES, COMMERCE_ADDON, type BundleDefinition } from "@/lib/pricing/bundles";

/**
 * Derive whether a Checkout Session actually charged the create-path catalog
 * Price IDs from Stripe line items — never from amount_total / currency alone.
 *
 * Buy now create charges catalog.stripePriceId; bundle create charges BUNDLES
 * setup (+ monthly) env Prices (+ optional COMMERCE_ADDON). Amount↔catalog and
 * currency usd gates compare cents / ISO code but do not prove which Price was
 * on the Session. A Dashboard-minted session with matching minor units + usd
 * but a different Price must not reach the ledger.
 *
 * Billing Portal / checkout-success subscription mode similarly must prove a
 * create-path *recurring* catalog Price is on listLineItems — mode===subscription
 * alone is not enough (subscription-mode-billing-portal-catalog-recurring-price-gate).
 */

/** True when `priceId` appears among the session's line-item Price ids. */
export function sessionLineItemsIncludePriceId(
  lineItemPriceIds: ReadonlyArray<string | null | undefined>,
  priceId: string,
): boolean {
  const wanted = priceId.trim();
  if (!wanted) return false;
  for (const id of lineItemPriceIds) {
    if (typeof id === "string" && id === wanted) return true;
  }
  return false;
}

/**
 * True when any session line item's (expanded) Price carries `metadataKey`
 * under `local_site_studio_key` metadata. Unlike sessionLineItemsIncludePriceId
 * (exact match against ONE specific Price id), this proves a line item was
 * charged using SOME Price this platform minted for the given SKU — old or
 * current — which is what a stable per-SKU metadata key
 * (commerceSkuStripeKey, src/lib/commerce/stripe-sync.ts) is for.
 *
 * Needed because Stripe Prices are immutable: an operator editing a Commerce
 * SKU's price and re-syncing mints a brand-new Price id and overwrites the
 * catalog's stripePriceId, but a Checkout Session created before that resync
 * still references the OLD (now catalog-orphaned but still valid and still
 * platform-issued) Price id. Matching only the catalog's *current*
 * stripePriceId would reject that already-paid session outright
 * (commerce-sku-price-resync-metadata-match) — real money charged with no
 * ledger row. Matching by the stable metadata key instead accepts any Price
 * this platform ever minted for that exact leadSlug+skuId, regardless of
 * whether a later resync superseded it.
 */
export function sessionLineItemsIncludeMetadataKey(
  lineItems: ReadonlyArray<{
    price?: { metadata?: Record<string, string> | null } | string | null;
  }>,
  metadataKey: string,
): boolean {
  const wanted = metadataKey.trim();
  if (!wanted) return false;
  for (const item of lineItems) {
    const price = item.price;
    if (price && typeof price === "object" && price.metadata?.local_site_studio_key === wanted) {
      return true;
    }
  }
  return false;
}

export type BundleCatalogPriceIds = {
  setupId: string;
  /** Null when the bundle has no recurring Price (Starter). */
  monthlyId: string | null;
};

/**
 * Trimmed BUNDLES setup (+ monthly) Price IDs from env, or null when a required
 * Price env is missing (create already 501s without those Prices).
 */
export function bundleCatalogPriceIdsFromEnv(
  bundle: BundleDefinition,
  env: NodeJS.ProcessEnv = process.env,
): BundleCatalogPriceIds | null {
  const setupId = env[bundle.setupPriceIdEnv]?.trim() ?? "";
  if (!setupId) return null;
  if (!bundle.monthlyPriceIdEnv) {
    return { setupId, monthlyId: null };
  }
  const monthlyId = env[bundle.monthlyPriceIdEnv]?.trim() ?? "";
  if (!monthlyId) return null;
  return { setupId, monthlyId };
}

/**
 * Pure: true only when create-path bundle catalog Prices appear among the
 * session's line-item price ids (setup always; monthly when the tier has one).
 * Commerce add-on Prices are additive and checked separately via
 * resolveCommerceAddonFromLineItems.
 */
export function sessionLineItemsMatchBundleCatalogPrices(
  lineItemPriceIds: ReadonlyArray<string | null | undefined>,
  catalogPrices: BundleCatalogPriceIds,
): boolean {
  if (!sessionLineItemsIncludePriceId(lineItemPriceIds, catalogPrices.setupId)) {
    return false;
  }
  if (catalogPrices.monthlyId === null) return true;
  return sessionLineItemsIncludePriceId(lineItemPriceIds, catalogPrices.monthlyId);
}

/**
 * Create-path recurring (monthly) catalog Price IDs from env — Growth/Complete
 * bundle monthlies plus Commerce add-on monthly. Empty when no recurring Price
 * envs are configured (fail closed for subscription-mode portal eligibility).
 */
export function catalogRecurringPriceIdsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const ids: string[] = [];
  for (const bundle of BUNDLES) {
    if (!bundle.monthlyPriceIdEnv) continue;
    const monthlyId = env[bundle.monthlyPriceIdEnv]?.trim() ?? "";
    if (monthlyId) ids.push(monthlyId);
  }
  const commerceMonthly = env[COMMERCE_ADDON.monthlyPriceIdEnv]?.trim() ?? "";
  if (commerceMonthly) ids.push(commerceMonthly);
  return ids;
}

/**
 * Pure: true when any create-path catalog recurring Price id appears among
 * the session's line-item price ids. Empty `recurringPriceIds` fails closed.
 */
export function sessionLineItemsIncludeCatalogRecurringPrice(
  lineItemPriceIds: ReadonlyArray<string | null | undefined>,
  recurringPriceIds: ReadonlyArray<string>,
): boolean {
  if (recurringPriceIds.length === 0) return false;
  for (const wanted of recurringPriceIds) {
    if (sessionLineItemsIncludePriceId(lineItemPriceIds, wanted)) return true;
  }
  return false;
}
