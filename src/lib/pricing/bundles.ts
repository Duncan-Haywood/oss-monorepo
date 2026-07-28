/**
 * Single source of truth for bundle pricing — see /docs/product-bundles.
 * Stripe Price objects are created in the Stripe Dashboard/CLI per env
 * (test vs live) and referenced here by env var name, never hardcoded IDs.
 */

import { monthlyMarketingEmailCount, monthlyMarketingSocialPostCount } from "@/lib/marketing/monthly-pack";

export type BundleTier = "starter" | "growth" | "complete";

/**
 * Which recurring cadence a bundle checkout selected — see
 * annual-billing-option. "monthly" is the long-standing default and the only
 * option for a tier with no annualPriceIdEnv configured (or none at all,
 * e.g. Starter, which has no recurring price in either cadence).
 */
export type BundleBillingInterval = "monthly" | "annual";

export interface BundleDefinition {
  id: BundleTier;
  name: string;
  setupPriceUsd: number;
  monthlyPriceUsd: number | null;
  /**
   * Annual price, framed as a discount vs. paying monthly × 12 (see
   * annualBillingSavingsUsd). Null for a tier with no recurring price
   * (Starter) — never a tier that simply hasn't bootstrapped an annual
   * Stripe Price yet, which instead leaves annualPriceIdEnv unset while this
   * stays non-null (mirrors how monthlyPriceIdEnv can be temporarily unset
   * pre-bootstrap while monthlyPriceUsd is already defined).
   */
  annualPriceUsd: number | null;
  /** Env var holding the Stripe Price ID for the one-time setup fee. */
  setupPriceIdEnv: string;
  /** Env var holding the Stripe Price ID for the monthly recurring fee (null tiers have none). */
  monthlyPriceIdEnv: string | null;
  /** Env var holding the Stripe Price ID for the annual recurring fee (null tiers have none). */
  annualPriceIdEnv: string | null;
  /** One-line pitch — homepage pricing cards and /preview/[slug] tier upsell. */
  tagline: string;
  /** Short bullet list — same two acquisition surfaces as `tagline`. */
  features: readonly string[];
}

export const BUNDLES: readonly BundleDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    setupPriceUsd: 500,
    monthlyPriceUsd: null,
    annualPriceUsd: null,
    setupPriceIdEnv: "STRIPE_PRICE_ID_STARTER_SETUP",
    monthlyPriceIdEnv: null,
    annualPriceIdEnv: null,
    tagline: "Your site, live in days",
    features: [
      "Professional landing page",
      "Contact form and Google Maps embed",
      "Basic SEO and fast hosting",
      "Preview subdomain → custom domain handoff",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    setupPriceUsd: 500,
    monthlyPriceUsd: 99,
    // 2 months free vs. 99 * 12 = 1188.
    annualPriceUsd: 990,
    setupPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_SETUP",
    monthlyPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_MONTHLY",
    annualPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_ANNUAL",
    tagline: "Site + customers on autopilot",
    features: [
      "Everything in Starter",
      `${monthlyMarketingSocialPostCount()} social/GBP posts + ${monthlyMarketingEmailCount()} emails per month`,
      "Ready-to-post packs for Google, Facebook, Instagram",
      "Brand voice from your site data",
    ],
  },
  {
    id: "complete",
    name: "Complete",
    setupPriceUsd: 500,
    monthlyPriceUsd: 199,
    // 2 months free vs. 199 * 12 = 2388.
    annualPriceUsd: 1990,
    setupPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_SETUP",
    monthlyPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_MONTHLY",
    annualPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_ANNUAL",
    tagline: "Never miss a call or a customer",
    features: [
      "Everything in Growth",
      "Full marketing — seasonal promos, A/B variants",
      "AI phone agent for your business line",
      "Appointment booking and lead capture",
    ],
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
 * Lowest one-time setup price across all bundles — the "from $X" figure
 * quoted in marketing/preview copy (homepage hero, /websites-for-* category
 * landing pages, /preview/[slug] claim CTA, /docs/business-model). Derived
 * from BUNDLES rather than hardcoded so a future price change stays a single
 * edit to this file: bundles.test.ts already documents that "a silent drift
 * would misprice checkout UI / tier upsell while Stripe still charged the old
 * Price" for the checkout UI itself — the same risk existed, unclosed, for
 * every hardcoded "$500" copy string on these acquisition surfaces (a
 * customer who reads one number and gets charged another is a billing-
 * transparency problem, not just a typo).
 */
export function minBundleSetupPriceUsd(): number {
  return Math.min(...BUNDLES.map((bundle) => bundle.setupPriceUsd));
}

/**
 * "$500 one-time" / "$500 + $99/mo" — the exact heading format
 * /docs/product-bundles has hand-typed per tier since that page shipped.
 */
export function bundlePriceHeadingLabel(bundle: BundleDefinition): string {
  return bundle.monthlyPriceUsd != null
    ? `$${bundle.setupPriceUsd} + $${bundle.monthlyPriceUsd}/mo`
    : `$${bundle.setupPriceUsd} one-time`;
}

/** "+$300 + $49/mo" — /docs/product-bundles' Commerce add-on heading format. */
export function commerceAddonPriceHeadingLabel(): string {
  return `+$${COMMERCE_ADDON.setupPriceUsd} + $${COMMERCE_ADDON.monthlyPriceUsd}/mo`;
}

/**
 * "$500 + $990/yr" — the annual-billing twin of bundlePriceHeadingLabel, or
 * null for a tier with no annual price (Starter).
 */
export function bundleAnnualPriceHeadingLabel(bundle: BundleDefinition): string | null {
  if (bundle.annualPriceUsd == null) return null;
  return `$${bundle.setupPriceUsd} + $${bundle.annualPriceUsd}/yr`;
}

/**
 * Dollars saved per year choosing annual billing vs. paying monthly × 12 —
 * the "2 months free" / "$198/yr" framing on the checkout annual toggle and
 * /docs/product-bundles. Null when the tier has no annual price (Starter).
 */
export function annualBillingSavingsUsd(bundle: BundleDefinition): number | null {
  if (bundle.monthlyPriceUsd == null || bundle.annualPriceUsd == null) return null;
  return Math.round(bundle.monthlyPriceUsd * 12 - bundle.annualPriceUsd);
}

/**
 * Validates an untrusted billing-interval value (a client request body field
 * or a Stripe Checkout Session's own metadata, echoed back from create) —
 * "annual" only when exactly that string, "monthly" for every other value
 * (including missing/malformed) so a stale/tampered/pre-annual-feature
 * Session or a client typo always falls back to the original, more
 * conservative cadence rather than an unrecognized value silently reaching
 * the annual Price/amount branch.
 */
export function parseBundleBillingInterval(value: unknown): BundleBillingInterval {
  return value === "annual" ? "annual" : "monthly";
}

/**
 * Resolves which recurring Price USD amount a bundle checkout uses for a
 * given interval — null when the tier has no recurring price at all
 * (Starter) or the tier has no Price configured for that specific interval
 * yet (e.g. annualPriceUsd is set but bootstrap hasn't shipped for it —
 * callers must still gate on the env Price ID separately; this only reports
 * the catalog USD amount).
 */
export function bundleRecurringPriceUsd(
  bundle: BundleDefinition,
  billingInterval: BundleBillingInterval,
): number | null {
  return billingInterval === "annual" ? bundle.annualPriceUsd : bundle.monthlyPriceUsd;
}

/**
 * Expected Checkout Session `amount_total` (integer cents) for a bundle
 * purchase — setup + first recurring period (monthly or annual) when
 * present, plus optional Commerce add-on setup+month (the add-on has no
 * annual price of its own — see annual-billing-option; a checkout combining
 * annual billing with the Commerce add-on is rejected before this is ever
 * called with that combination in practice). Mirrors POST /api/stripe/checkout
 * line_items (Price IDs from env that bootstrap from these USD amounts). The
 * webhook must require session.amount_total === this before recordLeadPayment.
 *
 * `chargedSetupFee` defaults to true (every pre-existing caller/checkout
 * charged it). A tier-upgrade checkout for a lead with a prior order skips
 * the one-time setup fee (checkout-setup-fee-skip-on-upgrade) — the webhook
 * must pass `chargedSetupFee: false` in that case, mirroring what the
 * create-path route actually charged, or a legitimately fee-skipped session's
 * real amount_total will never match this expectation and fulfillment will
 * be silently skipped for a customer who has genuinely paid (see
 * webhook-setup-fee-skip-parity).
 */
export function expectedBundleCheckoutAmountCents(
  bundle: BundleDefinition,
  commerceAddon: boolean,
  billingInterval: BundleBillingInterval,
  chargedSetupFee: boolean = true,
): number {
  let cents = chargedSetupFee ? Math.round(bundle.setupPriceUsd * 100) : 0;
  const recurringUsd = bundleRecurringPriceUsd(bundle, billingInterval);
  if (recurringUsd != null) {
    cents += Math.round(recurringUsd * 100);
  }
  if (commerceAddon) {
    cents += Math.round(COMMERCE_ADDON.setupPriceUsd * 100);
    cents += Math.round(COMMERCE_ADDON.monthlyPriceUsd * 100);
  }
  return cents;
}
