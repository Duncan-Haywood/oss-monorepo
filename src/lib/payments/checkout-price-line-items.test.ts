import { afterEach, describe, expect, it } from "vitest";
import { getBundle } from "@/lib/pricing/bundles";
import {
  bundleCatalogPriceIdsFromEnv,
  catalogRecurringPriceIdsFromEnv,
  sessionLineItemsIncludeCatalogRecurringPrice,
  sessionLineItemsIncludePriceId,
  sessionLineItemsMatchBundleCatalogPrices,
} from "./checkout-price-line-items";

describe("sessionLineItemsIncludePriceId", () => {
  it("returns true when the Price id is present", () => {
    expect(
      sessionLineItemsIncludePriceId(["price_a", "price_b"], "price_a"),
    ).toBe(true);
  });

  it("returns false when the Price id is missing, blank, or only whitespace", () => {
    expect(sessionLineItemsIncludePriceId(["price_a"], "price_b")).toBe(false);
    expect(sessionLineItemsIncludePriceId(["price_a"], "")).toBe(false);
    expect(sessionLineItemsIncludePriceId(["price_a"], "   ")).toBe(false);
    expect(sessionLineItemsIncludePriceId([null, undefined, ""], "price_a")).toBe(
      false,
    );
  });

  it("trims the wanted Price id but does not soft-match substrings", () => {
    expect(sessionLineItemsIncludePriceId(["price_a"], "  price_a  ")).toBe(true);
    expect(sessionLineItemsIncludePriceId(["price_ab"], "price_a")).toBe(false);
  });
});

describe("bundleCatalogPriceIdsFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns setup-only for Starter when setup env is set", () => {
    process.env.STRIPE_PRICE_ID_STARTER_SETUP = "price_starter";
    const starter = getBundle("starter");
    expect(starter).toBeDefined();
    expect(bundleCatalogPriceIdsFromEnv(starter!)).toEqual({
      setupId: "price_starter",
      monthlyId: null,
    });
  });

  it("returns null when Growth monthly env is missing", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = "price_growth_setup";
    delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    const growth = getBundle("growth");
    expect(bundleCatalogPriceIdsFromEnv(growth!)).toBeNull();
  });

  it("returns setup+monthly for Growth when both envs are set", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = " price_growth_setup ";
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    const growth = getBundle("growth");
    expect(bundleCatalogPriceIdsFromEnv(growth!)).toEqual({
      setupId: "price_growth_setup",
      monthlyId: "price_growth_monthly",
    });
  });
});

describe("sessionLineItemsMatchBundleCatalogPrices", () => {
  it("requires setup for Starter and setup+monthly for Growth", () => {
    expect(
      sessionLineItemsMatchBundleCatalogPrices(["price_starter"], {
        setupId: "price_starter",
        monthlyId: null,
      }),
    ).toBe(true);
    expect(
      sessionLineItemsMatchBundleCatalogPrices(
        ["price_growth_setup", "price_growth_monthly"],
        { setupId: "price_growth_setup", monthlyId: "price_growth_monthly" },
      ),
    ).toBe(true);
    expect(
      sessionLineItemsMatchBundleCatalogPrices(["price_growth_setup"], {
        setupId: "price_growth_setup",
        monthlyId: "price_growth_monthly",
      }),
    ).toBe(false);
  });
});

describe("catalogRecurringPriceIdsFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("collects Growth/Complete/Commerce monthly Price ids when set", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = " price_growth_m ";
    process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY = "price_complete_m";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_m";
    delete process.env.STRIPE_PRICE_ID_STARTER_SETUP;
    expect(catalogRecurringPriceIdsFromEnv()).toEqual([
      "price_growth_m",
      "price_complete_m",
      "price_commerce_m",
    ]);
  });

  it("returns empty when no recurring Price envs are configured", () => {
    delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    expect(catalogRecurringPriceIdsFromEnv()).toEqual([]);
  });
});

describe("sessionLineItemsIncludeCatalogRecurringPrice", () => {
  it("returns true when any catalog recurring Price is present", () => {
    expect(
      sessionLineItemsIncludeCatalogRecurringPrice(
        ["price_setup", "price_growth_m"],
        ["price_growth_m", "price_complete_m"],
      ),
    ).toBe(true);
  });

  it("fails closed when recurringPriceIds is empty or none match", () => {
    expect(
      sessionLineItemsIncludeCatalogRecurringPrice(["price_foreign"], []),
    ).toBe(false);
    expect(
      sessionLineItemsIncludeCatalogRecurringPrice(
        ["price_foreign"],
        ["price_growth_m"],
      ),
    ).toBe(false);
  });
});
