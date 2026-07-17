import type { BundleDefinition } from "@/lib/pricing/bundles";

/**
 * Derive whether a Checkout Session actually charged the create-path catalog
 * Price IDs from Stripe line items — never from amount_total / currency alone.
 *
 * Buy now create charges catalog.stripePriceId; bundle create charges BUNDLES
 * setup (+ monthly) env Prices (+ optional COMMERCE_ADDON). Amount↔catalog and
 * currency usd gates compare cents / ISO code but do not prove which Price was
 * on the Session. A Dashboard-minted session with matching minor units + usd
 * but a different Price must not reach the ledger.
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
