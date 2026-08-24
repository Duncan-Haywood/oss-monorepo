import { BUNDLES, COMMERCE_ADDON, type BundleBillingInterval, type BundleDefinition } from "@/lib/pricing/bundles";

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

/**
 * Units actually charged for the SKU proven present by
 * sessionLineItemsIncludeMetadataKey — the matching line item's own Stripe
 * `quantity` (adjustable_quantity, see commerce-checkout-adjustable-quantity).
 * Returns undefined when no line item carries the metadata key, or when
 * Stripe's own `quantity` field is missing / not a positive integer, so
 * callers persist "unknown" rather than a bogus 0/NaN/negative value — never
 * assume 1 as a fallback (see commerce-order-quantity-visibility: a stale
 * legacy row or an unexpected line-item shape must read as "quantity
 * unknown," not silently as "quantity 1").
 */
export function commerceSkuLineItemQuantity(
  lineItems: ReadonlyArray<{
    price?: { metadata?: Record<string, string> | null } | string | null;
    quantity?: number | null;
  }>,
  metadataKey: string,
): number | undefined {
  const wanted = metadataKey.trim();
  if (!wanted) return undefined;
  for (const item of lineItems) {
    const price = item.price;
    if (price && typeof price === "object" && price.metadata?.local_site_studio_key === wanted) {
      const quantity = item.quantity;
      if (typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0) {
        return quantity;
      }
      return undefined;
    }
  }
  return undefined;
}

export type BundleCatalogPriceIds = {
  setupId: string;
  /** Null when the bundle has no recurring Price for the requested interval (Starter, always; any tier if that interval's Price env is unset). */
  recurringId: string | null;
};

/**
 * Trimmed BUNDLES setup (+ monthly or annual, per `billingInterval`) Price IDs
 * from env, or null when a required Price env is missing (create already
 * 501s without those Prices). Defaults to "monthly" — the long-standing
 * cadence every existing caller predates the annual option with.
 */
export function bundleCatalogPriceIdsFromEnv(
  bundle: BundleDefinition,
  billingInterval: BundleBillingInterval = "monthly",
  env: NodeJS.ProcessEnv = process.env,
): BundleCatalogPriceIds | null {
  const setupId = env[bundle.setupPriceIdEnv]?.trim() ?? "";
  if (!setupId) return null;
  const recurringPriceIdEnv =
    billingInterval === "annual" ? bundle.annualPriceIdEnv : bundle.monthlyPriceIdEnv;
  if (!recurringPriceIdEnv) {
    return { setupId, recurringId: null };
  }
  const recurringId = env[recurringPriceIdEnv]?.trim() ?? "";
  if (!recurringId) return null;
  return { setupId, recurringId };
}

/**
 * Pure: true only when create-path bundle catalog Prices appear among the
 * session's line-item price ids (the recurring Price for whichever interval
 * `catalogPrices` was resolved for, when the tier has one — always required;
 * the setup Price — required unless `requireSetupFee` is false). Commerce
 * add-on Prices are additive and checked separately via
 * resolveCommerceAddonFromLineItems.
 *
 * `requireSetupFee` defaults to true (every pre-existing caller charged the
 * setup fee). Pass false for a tier-upgrade checkout that skipped the
 * one-time setup fee for a lead with a prior order (checkout-setup-fee-skip-
 * on-upgrade) — when false, the setup Price's presence is simply not
 * required (its absence is not itself invalid; a Session that charged it
 * anyway still matches). Callers must independently confirm the lead
 * actually qualifies for the skip before passing false — this function only
 * proves what Prices are present on the Session, not who is entitled to omit
 * the setup fee.
 */
export function sessionLineItemsMatchBundleCatalogPrices(
  lineItemPriceIds: ReadonlyArray<string | null | undefined>,
  catalogPrices: BundleCatalogPriceIds,
  options: { requireSetupFee?: boolean } = {},
): boolean {
  const requireSetupFee = options.requireSetupFee ?? true;
  if (
    requireSetupFee &&
    !sessionLineItemsIncludePriceId(lineItemPriceIds, catalogPrices.setupId)
  ) {
    return false;
  }
  if (catalogPrices.recurringId === null) return true;
  return sessionLineItemsIncludePriceId(lineItemPriceIds, catalogPrices.recurringId);
}

/**
 * Create-path recurring catalog Price IDs from env, both cadences — Growth/
 * Complete bundle monthly AND annual, plus Commerce add-on monthly (no annual
 * Price of its own — see annual-billing-option). Empty when no recurring
 * Price envs are configured (fail closed for subscription-mode portal
 * eligibility). This is a flat "any of these is a recognized recurring
 * Price" set, not tier/interval-specific — sessionLineItemsIncludeCatalogRecurringPrice
 * only needs to prove SOME catalog recurring Price is on the session, so an
 * annual subscriber's Billing Portal / checkout-success eligibility works
 * exactly the same way a monthly subscriber's already does, with no call-site
 * change needed at either consumer (create-portal-session.ts, success-session.ts).
 */
export function catalogRecurringPriceIdsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const ids: string[] = [];
  for (const bundle of BUNDLES) {
    if (bundle.monthlyPriceIdEnv) {
      const monthlyId = env[bundle.monthlyPriceIdEnv]?.trim() ?? "";
      if (monthlyId) ids.push(monthlyId);
    }
    if (bundle.annualPriceIdEnv) {
      const annualId = env[bundle.annualPriceIdEnv]?.trim() ?? "";
      if (annualId) ids.push(annualId);
    }
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
