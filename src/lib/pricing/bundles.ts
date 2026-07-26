/**
 * Single source of truth for bundle pricing — see /docs/product-bundles.
 * Stripe Price objects are created in the Stripe Dashboard/CLI per env
 * (test vs live) and referenced here by env var name, never hardcoded IDs.
 */

import { monthlyMarketingEmailCount, monthlyMarketingSocialPostCount } from "@/lib/marketing/monthly-pack";

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
    setupPriceIdEnv: "STRIPE_PRICE_ID_STARTER_SETUP",
    monthlyPriceIdEnv: null,
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
    setupPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_SETUP",
    monthlyPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_MONTHLY",
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
    setupPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_SETUP",
    monthlyPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_MONTHLY",
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
