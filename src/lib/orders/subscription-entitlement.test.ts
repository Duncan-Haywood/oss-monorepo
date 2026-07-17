import { afterEach, describe, expect, it } from "vitest";
import {
  deriveLiveRecurringEntitlementFromPriceIds,
  priceIdsFromStripeSubscriptionItems,
  syncedRecurringOrderFields,
} from "./subscription-entitlement";

const ENV_KEYS = [
  "STRIPE_PRICE_ID_GROWTH_MONTHLY",
  "STRIPE_PRICE_ID_COMPLETE_MONTHLY",
  "STRIPE_PRICE_ID_COMMERCE_MONTHLY",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function setCatalogEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    const next = overrides[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const prev = saved[key];
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
});

describe("deriveLiveRecurringEntitlementFromPriceIds", () => {
  it("picks Complete over Growth and detects Commerce monthly", () => {
    setCatalogEnv({
      STRIPE_PRICE_ID_GROWTH_MONTHLY: "price_growth_m",
      STRIPE_PRICE_ID_COMPLETE_MONTHLY: "price_complete_m",
      STRIPE_PRICE_ID_COMMERCE_MONTHLY: "price_commerce_m",
    });
    expect(
      deriveLiveRecurringEntitlementFromPriceIds([
        "price_growth_m",
        "price_complete_m",
        "price_commerce_m",
      ]),
    ).toEqual({
      bundleTier: "complete",
      commerceAddon: true,
      hasCatalogRecurring: true,
    });
  });

  it("derives Growth-only after a Complete→Growth downgrade", () => {
    setCatalogEnv({
      STRIPE_PRICE_ID_GROWTH_MONTHLY: "price_growth_m",
      STRIPE_PRICE_ID_COMPLETE_MONTHLY: "price_complete_m",
      STRIPE_PRICE_ID_COMMERCE_MONTHLY: "price_commerce_m",
    });
    expect(deriveLiveRecurringEntitlementFromPriceIds(["price_growth_m"])).toEqual({
      bundleTier: "growth",
      commerceAddon: false,
      hasCatalogRecurring: true,
    });
  });

  it("treats Commerce-monthly-only as Starter+Commerce catalog recurring", () => {
    setCatalogEnv({
      STRIPE_PRICE_ID_GROWTH_MONTHLY: "price_growth_m",
      STRIPE_PRICE_ID_COMPLETE_MONTHLY: "price_complete_m",
      STRIPE_PRICE_ID_COMMERCE_MONTHLY: "price_commerce_m",
    });
    expect(deriveLiveRecurringEntitlementFromPriceIds(["price_commerce_m"])).toEqual({
      bundleTier: null,
      commerceAddon: true,
      hasCatalogRecurring: true,
    });
  });

  it("fails closed when only a foreign Price is present", () => {
    setCatalogEnv({
      STRIPE_PRICE_ID_GROWTH_MONTHLY: "price_growth_m",
      STRIPE_PRICE_ID_COMPLETE_MONTHLY: "price_complete_m",
      STRIPE_PRICE_ID_COMMERCE_MONTHLY: "price_commerce_m",
    });
    expect(deriveLiveRecurringEntitlementFromPriceIds(["price_foreign_m"])).toEqual({
      bundleTier: null,
      commerceAddon: false,
      hasCatalogRecurring: false,
    });
  });

  it("fails closed when catalog monthly envs are missing", () => {
    setCatalogEnv({});
    expect(deriveLiveRecurringEntitlementFromPriceIds(["price_growth_m"])).toEqual({
      bundleTier: null,
      commerceAddon: false,
      hasCatalogRecurring: false,
    });
  });
});

describe("syncedRecurringOrderFields", () => {
  it("maps Complete+Commerce and Growth-only", () => {
    expect(
      syncedRecurringOrderFields({
        bundleTier: "complete",
        commerceAddon: true,
        hasCatalogRecurring: true,
      }),
    ).toEqual({ tier: "complete", commerceAddon: true });
    expect(
      syncedRecurringOrderFields({
        bundleTier: "growth",
        commerceAddon: false,
        hasCatalogRecurring: true,
      }),
    ).toEqual({ tier: "growth", commerceAddon: false });
  });

  it("maps Commerce-only to starter + commerceAddon", () => {
    expect(
      syncedRecurringOrderFields({
        bundleTier: null,
        commerceAddon: true,
        hasCatalogRecurring: true,
      }),
    ).toEqual({ tier: "starter", commerceAddon: true });
  });

  it("returns null when no catalog recurring Price", () => {
    expect(
      syncedRecurringOrderFields({
        bundleTier: null,
        commerceAddon: false,
        hasCatalogRecurring: false,
      }),
    ).toBeNull();
  });
});

describe("priceIdsFromStripeSubscriptionItems", () => {
  it("accepts string and expanded Price objects", () => {
    expect(
      priceIdsFromStripeSubscriptionItems([
        { price: "price_a" },
        { price: { id: "price_b" } },
        { price: { id: null } },
        { price: null },
        {},
      ]),
    ).toEqual(["price_a", "price_b"]);
  });
});
