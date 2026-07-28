import { describe, expect, it } from "vitest";
import {
  annualBillingSavingsUsd,
  BUNDLES,
  bundleAnnualPriceHeadingLabel,
  bundleRecurringPriceUsd,
  COMMERCE_ADDON,
  bundlePriceHeadingLabel,
  commerceAddonPriceHeadingLabel,
  expectedBundleCheckoutAmountCents,
  getBundle,
  minBundleSetupPriceUsd,
  parseBundleBillingInterval,
} from "./bundles";

/**
 * Direct coverage for the sold-price + Stripe Price env-name source of truth.
 * price-env-readiness / bootstrap-stripe-prices import these constants but do
 * not lock display USD amounts or getBundle lookup — a silent drift would
 * misprice checkout UI / tier upsell while Stripe still charged the old Price.
 */

describe("BUNDLES", () => {
  it("defines starter, growth, and complete in that order", () => {
    expect(BUNDLES.map((b) => b.id)).toEqual(["starter", "growth", "complete"]);
  });

  it("locks sold setup + monthly + annual USD amounts from /docs/product-bundles", () => {
    expect(getBundle("starter")).toMatchObject({
      name: "Starter",
      setupPriceUsd: 500,
      monthlyPriceUsd: null,
      annualPriceUsd: null,
      setupPriceIdEnv: "STRIPE_PRICE_ID_STARTER_SETUP",
      monthlyPriceIdEnv: null,
      annualPriceIdEnv: null,
    });
    expect(getBundle("growth")).toMatchObject({
      name: "Growth",
      setupPriceUsd: 500,
      monthlyPriceUsd: 99,
      annualPriceUsd: 990,
      setupPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_SETUP",
      monthlyPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_MONTHLY",
      annualPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_ANNUAL",
    });
    expect(getBundle("complete")).toMatchObject({
      name: "Complete",
      setupPriceUsd: 500,
      monthlyPriceUsd: 199,
      annualPriceUsd: 1990,
      setupPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_SETUP",
      monthlyPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_MONTHLY",
      annualPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_ANNUAL",
    });
  });

  it("keeps Starter one-time only (no monthly or annual Price env)", () => {
    const starter = getBundle("starter");
    expect(starter?.monthlyPriceUsd).toBeNull();
    expect(starter?.monthlyPriceIdEnv).toBeNull();
    expect(starter?.annualPriceUsd).toBeNull();
    expect(starter?.annualPriceIdEnv).toBeNull();
  });

  it("prices annual at 10x monthly (2 months free) for every recurring tier", () => {
    for (const bundle of BUNDLES) {
      if (bundle.monthlyPriceUsd == null) {
        expect(bundle.annualPriceUsd).toBeNull();
        continue;
      }
      expect(bundle.annualPriceUsd).toBe(bundle.monthlyPriceUsd * 10);
    }
  });

  it("gives every tier a non-empty tagline and feature list — the homepage pricing cards and the /preview/[slug] tier upsell both render these fields directly, so an empty value would ship a blank card", () => {
    for (const bundle of BUNDLES) {
      expect(bundle.tagline.length).toBeGreaterThan(0);
      expect(bundle.features.length).toBeGreaterThan(0);
      for (const feature of bundle.features) {
        expect(feature.length).toBeGreaterThan(0);
      }
    }
  });

  it("chains each paid tier's feature list from the one below it, matching /docs/product-bundles' 'Everything in X plus...' framing", () => {
    expect(getBundle("growth")?.features[0]).toBe("Everything in Starter");
    expect(getBundle("complete")?.features[0]).toBe("Everything in Growth");
  });
});

describe("COMMERCE_ADDON", () => {
  it("locks sold Commerce add-on amounts and Price env names", () => {
    expect(COMMERCE_ADDON).toEqual({
      name: "Commerce add-on",
      setupPriceUsd: 300,
      monthlyPriceUsd: 49,
      setupPriceIdEnv: "STRIPE_PRICE_ID_COMMERCE_SETUP",
      monthlyPriceIdEnv: "STRIPE_PRICE_ID_COMMERCE_MONTHLY",
    });
  });
});

describe("getBundle", () => {
  it("returns undefined for unknown or empty ids", () => {
    expect(getBundle("")).toBeUndefined();
    expect(getBundle("enterprise")).toBeUndefined();
    expect(getBundle("Starter")).toBeUndefined();
  });

  it("resolves each known tier id", () => {
    for (const id of ["starter", "growth", "complete"] as const) {
      expect(getBundle(id)?.id).toBe(id);
    }
  });
});

describe("minBundleSetupPriceUsd", () => {
  it("returns the lowest setupPriceUsd across BUNDLES — the marketing 'from $X' figure", () => {
    expect(minBundleSetupPriceUsd()).toBe(Math.min(...BUNDLES.map((b) => b.setupPriceUsd)));
    expect(minBundleSetupPriceUsd()).toBe(500);
  });
});

describe("bundlePriceHeadingLabel", () => {
  it("formats a one-time tier without a monthlyPriceUsd", () => {
    expect(bundlePriceHeadingLabel(getBundle("starter")!)).toBe("$500 one-time");
  });

  it("formats a recurring tier as setup + monthly", () => {
    expect(bundlePriceHeadingLabel(getBundle("growth")!)).toBe("$500 + $99/mo");
    expect(bundlePriceHeadingLabel(getBundle("complete")!)).toBe("$500 + $199/mo");
  });
});

describe("commerceAddonPriceHeadingLabel", () => {
  it("formats the Commerce add-on as a stacking '+$X + $Y/mo' figure", () => {
    expect(commerceAddonPriceHeadingLabel()).toBe("+$300 + $49/mo");
  });
});

describe("expectedBundleCheckoutAmountCents", () => {
  it("sums setup + first month (+ Commerce add-on) in integer cents", () => {
    const starter = getBundle("starter");
    const growth = getBundle("growth");
    const complete = getBundle("complete");
    expect(starter && expectedBundleCheckoutAmountCents(starter, false, "monthly")).toBe(50_000);
    expect(growth && expectedBundleCheckoutAmountCents(growth, false, "monthly")).toBe(59_900);
    expect(complete && expectedBundleCheckoutAmountCents(complete, false, "monthly")).toBe(69_900);
    expect(growth && expectedBundleCheckoutAmountCents(growth, true, "monthly")).toBe(94_800);
  });

  it("sums setup + first year for annual billing", () => {
    const starter = getBundle("starter");
    const growth = getBundle("growth");
    const complete = getBundle("complete");
    // Starter has no recurring price in either cadence — annual behaves
    // identically to monthly (setup only).
    expect(starter && expectedBundleCheckoutAmountCents(starter, false, "annual")).toBe(50_000);
    expect(growth && expectedBundleCheckoutAmountCents(growth, false, "annual")).toBe(149_000);
    expect(complete && expectedBundleCheckoutAmountCents(complete, false, "annual")).toBe(249_000);
  });

  it("excludes only the bundle's own setup fee when chargedSetupFee is false (tier-upgrade skip)", () => {
    const growth = getBundle("growth")!;
    // Same recurring price as the "sums setup + first month" case above,
    // minus the $500 bundle setup fee — see checkout-setup-fee-skip-on-
    // upgrade / webhook-setup-fee-skip-parity.
    expect(expectedBundleCheckoutAmountCents(growth, false, "monthly", false)).toBe(9_900);
    expect(expectedBundleCheckoutAmountCents(growth, false, "annual", false)).toBe(99_000);
    // The Commerce add-on's own separate $300 setup fee is unaffected — only
    // the bundle's own setup fee is ever skipped (checkout route never skips
    // the add-on's setup fee).
    expect(expectedBundleCheckoutAmountCents(growth, true, "monthly", false)).toBe(
      9_900 + 30_000 + 4_900,
    );
  });
});

describe("bundleRecurringPriceUsd", () => {
  it("resolves the monthly or annual USD amount per interval", () => {
    const growth = getBundle("growth")!;
    expect(bundleRecurringPriceUsd(growth, "monthly")).toBe(99);
    expect(bundleRecurringPriceUsd(growth, "annual")).toBe(990);
  });

  it("returns null for Starter in either interval (no recurring price at all)", () => {
    const starter = getBundle("starter")!;
    expect(bundleRecurringPriceUsd(starter, "monthly")).toBeNull();
    expect(bundleRecurringPriceUsd(starter, "annual")).toBeNull();
  });
});

describe("annualBillingSavingsUsd", () => {
  it("computes dollars saved per year vs. monthly x12", () => {
    expect(annualBillingSavingsUsd(getBundle("growth")!)).toBe(99 * 12 - 990);
    expect(annualBillingSavingsUsd(getBundle("complete")!)).toBe(199 * 12 - 1990);
  });

  it("returns null for a tier with no recurring price", () => {
    expect(annualBillingSavingsUsd(getBundle("starter")!)).toBeNull();
  });
});

describe("bundleAnnualPriceHeadingLabel", () => {
  it("formats setup + annual for a recurring tier", () => {
    expect(bundleAnnualPriceHeadingLabel(getBundle("growth")!)).toBe("$500 + $990/yr");
    expect(bundleAnnualPriceHeadingLabel(getBundle("complete")!)).toBe("$500 + $1990/yr");
  });

  it("returns null for Starter (no annual price)", () => {
    expect(bundleAnnualPriceHeadingLabel(getBundle("starter")!)).toBeNull();
  });
});

describe("parseBundleBillingInterval", () => {
  it("returns 'annual' only for the exact string 'annual'", () => {
    expect(parseBundleBillingInterval("annual")).toBe("annual");
  });

  it("falls back to 'monthly' for missing, malformed, or any other value", () => {
    expect(parseBundleBillingInterval(undefined)).toBe("monthly");
    expect(parseBundleBillingInterval(null)).toBe("monthly");
    expect(parseBundleBillingInterval("")).toBe("monthly");
    expect(parseBundleBillingInterval("ANNUAL")).toBe("monthly");
    expect(parseBundleBillingInterval("monthly")).toBe("monthly");
    expect(parseBundleBillingInterval("yearly")).toBe("monthly");
    expect(parseBundleBillingInterval(true)).toBe("monthly");
  });
});
