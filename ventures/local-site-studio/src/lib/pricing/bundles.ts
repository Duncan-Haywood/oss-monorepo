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

/**
 * The "from $X" / "the $X website package" figure marketing and legal copy
 * quote. Derived so page metadata and terms cannot drift from the tiers.
 */
export const ENTRY_SETUP_PRICE_USD: number = Math.min(
  ...BUNDLES.map((bundle) => bundle.setupPriceUsd),
);

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
