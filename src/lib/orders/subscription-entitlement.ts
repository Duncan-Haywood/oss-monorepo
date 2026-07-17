import {
  BUNDLES,
  COMMERCE_ADDON,
  type BundleTier,
} from "@/lib/pricing/bundles";

/**
 * Derive live CRM recurring entitlement from Stripe Subscription item Price
 * IDs — never from the historical checkout.session ledger alone.
 *
 * customer.subscription.created|updated / invoice.paid previously only
 * cleared/marked orders.recurringCanceledAt. Billing Portal / Dashboard plan
 * changes (Complete→Growth, remove Commerce monthly) left CRM unlocking
 * Complete voice / Commerce catalog / full_marketing while Stripe no longer
 * charged those Prices. Sync tier + commerceAddon from catalog monthly Prices
 * on the live Subscription; require at least one create-path catalog recurring
 * Price before restoring packs (active foreign-Price subscriptions pause).
 *
 * Subscription items typically carry only recurring (monthly) Prices after the
 * first invoice — setup Fees are one-time Checkout line items — so this helper
 * keys off monthly env Price IDs only.
 */

export type LiveRecurringBundleTier = Extract<BundleTier, "growth" | "complete">;

export type LiveRecurringEntitlement = {
  /** Highest Growth/Complete monthly catalog Price on the Subscription. */
  bundleTier: LiveRecurringBundleTier | null;
  /** True when Commerce monthly catalog Price is on the Subscription. */
  commerceAddon: boolean;
  /** True when any create-path catalog recurring Price is present. */
  hasCatalogRecurring: boolean;
};

/** CRM tier written onto recurring-entitlement orders after a live sync. */
export type SyncedRecurringOrderTier = LiveRecurringBundleTier | "starter";

/**
 * Resolve the tier + commerceAddon flags to persist on CRM orders that still
 * carry recurring entitlement for this customer.
 *
 * - Growth/Complete monthly present → that bundle tier (Complete wins).
 * - Commerce monthly only (Starter+Commerce) → tier "starter" + commerceAddon.
 * - Callers must not sync when hasCatalogRecurring is false.
 */
export function syncedRecurringOrderFields(
  live: LiveRecurringEntitlement,
): { tier: SyncedRecurringOrderTier; commerceAddon: boolean } | null {
  if (!live.hasCatalogRecurring) return null;
  return {
    tier: live.bundleTier ?? "starter",
    commerceAddon: live.commerceAddon,
  };
}

/**
 * Pure: derive live entitlement from Subscription (or Checkout) Price ids
 * against create-path monthly catalog env Prices.
 */
export function deriveLiveRecurringEntitlementFromPriceIds(
  priceIds: ReadonlyArray<string | null | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): LiveRecurringEntitlement {
  const present = new Set<string>();
  for (const id of priceIds) {
    if (typeof id === "string") {
      const trimmed = id.trim();
      if (trimmed) present.add(trimmed);
    }
  }

  let hasComplete = false;
  let hasGrowth = false;
  for (const bundle of BUNDLES) {
    if (!bundle.monthlyPriceIdEnv) continue;
    const monthlyId = env[bundle.monthlyPriceIdEnv]?.trim() ?? "";
    if (!monthlyId || !present.has(monthlyId)) continue;
    if (bundle.id === "complete") hasComplete = true;
    if (bundle.id === "growth") hasGrowth = true;
  }

  const commerceMonthly = env[COMMERCE_ADDON.monthlyPriceIdEnv]?.trim() ?? "";
  const commerceAddon = Boolean(commerceMonthly && present.has(commerceMonthly));

  const bundleTier: LiveRecurringBundleTier | null = hasComplete
    ? "complete"
    : hasGrowth
      ? "growth"
      : null;

  return {
    bundleTier,
    commerceAddon,
    hasCatalogRecurring: bundleTier !== null || commerceAddon,
  };
}

/**
 * Extract Price ids from a Stripe Subscription's items.data page (string or
 * expanded Price object). Mirrors priceIdsFromStripeLineItems for Checkout.
 */
export function priceIdsFromStripeSubscriptionItems(
  items: ReadonlyArray<{ price?: string | { id?: string | null } | null }>,
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const price = item.price;
    if (typeof price === "string" && price.length > 0) {
      ids.push(price);
    } else if (
      price &&
      typeof price === "object" &&
      typeof price.id === "string" &&
      price.id
    ) {
      ids.push(price.id);
    }
  }
  return ids;
}
