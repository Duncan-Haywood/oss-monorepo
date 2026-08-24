import { describe, expect, it } from "vitest";
import {
  assessBundlePriceEnvReadiness,
  listRequiredBundlePriceEnvNames,
} from "./price-env-readiness";

const ALL_REQUIRED = [
  "STRIPE_PRICE_ID_STARTER_SETUP",
  "STRIPE_PRICE_ID_GROWTH_SETUP",
  "STRIPE_PRICE_ID_GROWTH_MONTHLY",
  "STRIPE_PRICE_ID_GROWTH_ANNUAL",
  "STRIPE_PRICE_ID_COMPLETE_SETUP",
  "STRIPE_PRICE_ID_COMPLETE_MONTHLY",
  "STRIPE_PRICE_ID_COMPLETE_ANNUAL",
  "STRIPE_PRICE_ID_COMMERCE_SETUP",
  "STRIPE_PRICE_ID_COMMERCE_MONTHLY",
] as const;

describe("listRequiredBundlePriceEnvNames", () => {
  it("lists every BUNDLES + COMMERCE_ADDON Price env in stable order", () => {
    expect(listRequiredBundlePriceEnvNames()).toEqual([...ALL_REQUIRED]);
  });
});

describe("assessBundlePriceEnvReadiness", () => {
  it("reports all missing when env is empty", () => {
    const result = assessBundlePriceEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual([...ALL_REQUIRED]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual([...ALL_REQUIRED]);
  });

  it("treats whitespace-only values as missing", () => {
    const result = assessBundlePriceEnvReadiness({
      STRIPE_PRICE_ID_STARTER_SETUP: "   ",
      STRIPE_PRICE_ID_GROWTH_SETUP: "price_growth_setup",
    });
    expect(result.present).toEqual(["STRIPE_PRICE_ID_GROWTH_SETUP"]);
    expect(result.missing).toContain("STRIPE_PRICE_ID_STARTER_SETUP");
    expect(result.ready).toBe(false);
  });

  it("is ready only when every required Price env is set", () => {
    const filled = Object.fromEntries(
      ALL_REQUIRED.map((name) => [name, `price_${name}`]),
    );
    const result = assessBundlePriceEnvReadiness(filled);
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual([...ALL_REQUIRED]);
  });

  it("lists only the unset vars as missing when partially configured", () => {
    const result = assessBundlePriceEnvReadiness({
      STRIPE_PRICE_ID_STARTER_SETUP: "price_starter",
      STRIPE_PRICE_ID_GROWTH_SETUP: "price_growth_setup",
      STRIPE_PRICE_ID_GROWTH_MONTHLY: "price_growth_monthly",
      STRIPE_PRICE_ID_GROWTH_ANNUAL: "price_growth_annual",
      STRIPE_PRICE_ID_COMPLETE_SETUP: "price_complete_setup",
      // COMPLETE_MONTHLY missing
      STRIPE_PRICE_ID_COMPLETE_ANNUAL: "price_complete_annual",
      STRIPE_PRICE_ID_COMMERCE_SETUP: "price_commerce_setup",
      STRIPE_PRICE_ID_COMMERCE_MONTHLY: "price_commerce_monthly",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["STRIPE_PRICE_ID_COMPLETE_MONTHLY"]);
    expect(result.present).toHaveLength(8);
  });

  it("is NOT ready when only the monthly Price env is set for a bundle but its annual twin is missing (bundle-price-env-readiness-annual-gap)", () => {
    const filled = Object.fromEntries(
      ALL_REQUIRED.map((name) => [name, `price_${name}`]),
    );
    // Plausible partial-config state: an operator pastes the monthly Prices
    // (the long-standing default) but never bootstraps the newer annual
    // option — POST /api/stripe/checkout still 501s on an annual Growth
    // checkout in this state, so readiness must not report true.
    const result = assessBundlePriceEnvReadiness({
      ...filled,
      STRIPE_PRICE_ID_GROWTH_ANNUAL: undefined,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("STRIPE_PRICE_ID_GROWTH_ANNUAL");
  });
});
