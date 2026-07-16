/**
 * Single source of truth for bundle pricing — see /docs/product-bundles.
 * Stripe Price objects are created in the Stripe Dashboard/CLI per env
 * (test vs live) and referenced here by env var name, never hardcoded IDs.
 */

export type BundleTier = "starter" | "growth" | "complete";

export interface BundleDefinition {
  id: BundleTier;
  name: string;
  setupPriceUsd: number;
  monthlyPriceUsd: number | null;
  /** Env var holding the Stripe Price ID for the one-time setup fee. */
  setupPriceIdEnv: string;
  /** Env var holding the Stripe Price ID for the recurring fee (null tiers have none). */
  monthlyPriceIdEnv: string | null;
}

export const BUNDLES: readonly BundleDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    setupPriceUsd: 500,
    monthlyPriceUsd: null,
    setupPriceIdEnv: "STRIPE_PRICE_ID_STARTER_SETUP",
    monthlyPriceIdEnv: null,
  },
  {
    id: "growth",
    name: "Growth",
    setupPriceUsd: 500,
    monthlyPriceUsd: 99,
    setupPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_SETUP",
    monthlyPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_MONTHLY",
  },
  {
    id: "complete",
    name: "Complete",
    setupPriceUsd: 500,
    monthlyPriceUsd: 199,
    setupPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_SETUP",
    monthlyPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_MONTHLY",
  },
] as const;

export const COMMERCE_ADDON = {
  name: "Commerce add-on",
  setupPriceUsd: 300,
  monthlyPriceUsd: 49,
  setupPriceIdEnv: "STRIPE_PRICE_ID_COMMERCE_SETUP",
  monthlyPriceIdEnv: "STRIPE_PRICE_ID_COMMERCE_MONTHLY",
} as const;

export function getBundle(id: string): BundleDefinition | undefined {
  return BUNDLES.find((bundle) => bundle.id === id);
}

/**
 * Expected Checkout Session `amount_total` (integer cents) for a bundle
 * purchase — setup + first recurring month when present, plus optional
 * Commerce add-on setup+month. Mirrors POST /api/stripe/checkout line_items
 * (Price IDs from env that bootstrap from these USD amounts). The webhook
 * must require session.amount_total === this before recordLeadPayment.
 */
export function expectedBundleCheckoutAmountCents(
  bundle: BundleDefinition,
  commerceAddon: boolean,
): number {
  let cents = Math.round(bundle.setupPriceUsd * 100);
  if (bundle.monthlyPriceUsd != null) {
    cents += Math.round(bundle.monthlyPriceUsd * 100);
  }
  if (commerceAddon) {
    cents += Math.round(COMMERCE_ADDON.setupPriceUsd * 100);
    cents += Math.round(COMMERCE_ADDON.monthlyPriceUsd * 100);
  }
  return cents;
}
