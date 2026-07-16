import { describe, expect, it } from "vitest";
import {
  BUNDLES,
  COMMERCE_ADDON,
  expectedBundleCheckoutAmountCents,
  getBundle,
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

  it("locks sold setup + monthly USD amounts from /docs/product-bundles", () => {
    expect(getBundle("starter")).toMatchObject({
      name: "Starter",
      setupPriceUsd: 500,
      monthlyPriceUsd: null,
      setupPriceIdEnv: "STRIPE_PRICE_ID_STARTER_SETUP",
      monthlyPriceIdEnv: null,
    });
    expect(getBundle("growth")).toMatchObject({
      name: "Growth",
      setupPriceUsd: 500,
      monthlyPriceUsd: 99,
      setupPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_SETUP",
      monthlyPriceIdEnv: "STRIPE_PRICE_ID_GROWTH_MONTHLY",
    });
    expect(getBundle("complete")).toMatchObject({
      name: "Complete",
      setupPriceUsd: 500,
      monthlyPriceUsd: 199,
      setupPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_SETUP",
      monthlyPriceIdEnv: "STRIPE_PRICE_ID_COMPLETE_MONTHLY",
    });
  });

  it("keeps Starter one-time only (no monthly Price env)", () => {
    const starter = getBundle("starter");
    expect(starter?.monthlyPriceUsd).toBeNull();
    expect(starter?.monthlyPriceIdEnv).toBeNull();
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

describe("expectedBundleCheckoutAmountCents", () => {
  it("sums setup + first month (+ Commerce add-on) in integer cents", () => {
    const starter = getBundle("starter");
    const growth = getBundle("growth");
    const complete = getBundle("complete");
    expect(starter && expectedBundleCheckoutAmountCents(starter, false)).toBe(50_000);
    expect(growth && expectedBundleCheckoutAmountCents(growth, false)).toBe(59_900);
    expect(complete && expectedBundleCheckoutAmountCents(complete, false)).toBe(69_900);
    expect(growth && expectedBundleCheckoutAmountCents(growth, true)).toBe(94_800);
  });
});
