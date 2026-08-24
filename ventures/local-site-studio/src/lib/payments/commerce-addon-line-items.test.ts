import { afterEach, describe, expect, it } from "vitest";
import { COMMERCE_ADDON } from "@/lib/pricing/bundles";
import {
  commerceAddonPriceIdsFromEnv,
  priceIdsFromStripeLineItems,
  resolveCommerceAddonFromLineItems,
  sessionLineItemsIncludeCommerceAddon,
} from "./commerce-addon-line-items";

describe("commerceAddonPriceIdsFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns both trimmed Price IDs when set", () => {
    process.env[COMMERCE_ADDON.setupPriceIdEnv] = "  price_setup  ";
    process.env[COMMERCE_ADDON.monthlyPriceIdEnv] = " price_monthly ";
    expect(commerceAddonPriceIdsFromEnv()).toEqual({
      setupId: "price_setup",
      monthlyId: "price_monthly",
    });
  });

  it("returns null when either Price env is missing or whitespace-only", () => {
    delete process.env[COMMERCE_ADDON.setupPriceIdEnv];
    process.env[COMMERCE_ADDON.monthlyPriceIdEnv] = "price_monthly";
    expect(commerceAddonPriceIdsFromEnv()).toBeNull();

    process.env[COMMERCE_ADDON.setupPriceIdEnv] = "price_setup";
    process.env[COMMERCE_ADDON.monthlyPriceIdEnv] = "   ";
    expect(commerceAddonPriceIdsFromEnv()).toBeNull();
  });
});

describe("sessionLineItemsIncludeCommerceAddon", () => {
  const prices = { setupId: "price_c_setup", monthlyId: "price_c_monthly" };

  it("requires both setup and monthly Price IDs", () => {
    expect(
      sessionLineItemsIncludeCommerceAddon(
        ["price_bundle", "price_c_setup", "price_c_monthly"],
        prices,
      ),
    ).toBe(true);
    expect(sessionLineItemsIncludeCommerceAddon(["price_c_setup"], prices)).toBe(false);
    expect(sessionLineItemsIncludeCommerceAddon(["price_c_monthly"], prices)).toBe(false);
    expect(sessionLineItemsIncludeCommerceAddon([], prices)).toBe(false);
  });

  it("ignores null/empty price ids", () => {
    expect(
      sessionLineItemsIncludeCommerceAddon(
        [null, "", "price_c_setup", undefined, "price_c_monthly"],
        prices,
      ),
    ).toBe(true);
  });
});

describe("resolveCommerceAddonFromLineItems", () => {
  const prices = { setupId: "price_c_setup", monthlyId: "price_c_monthly" };

  it("derives true from line items even when metadata is false", () => {
    expect(
      resolveCommerceAddonFromLineItems({
        metadataCommerceAddon: false,
        lineItemPriceIds: ["price_c_setup", "price_c_monthly"],
        commercePrices: prices,
      }),
    ).toEqual({ commerceAddon: true, metadataMismatch: true });
  });

  it("derives false when metadata claims true but Prices are absent", () => {
    expect(
      resolveCommerceAddonFromLineItems({
        metadataCommerceAddon: true,
        lineItemPriceIds: ["price_bundle_only"],
        commercePrices: prices,
      }),
    ).toEqual({ commerceAddon: false, metadataMismatch: true });
  });

  it("fails closed when Commerce Price env is missing", () => {
    expect(
      resolveCommerceAddonFromLineItems({
        metadataCommerceAddon: true,
        lineItemPriceIds: ["price_c_setup", "price_c_monthly"],
        commercePrices: null,
      }),
    ).toEqual({ commerceAddon: false, metadataMismatch: true });
  });

  it("reports no mismatch when metadata and line items agree", () => {
    expect(
      resolveCommerceAddonFromLineItems({
        metadataCommerceAddon: true,
        lineItemPriceIds: ["price_c_setup", "price_c_monthly"],
        commercePrices: prices,
      }),
    ).toEqual({ commerceAddon: true, metadataMismatch: false });
  });
});

describe("priceIdsFromStripeLineItems", () => {
  it("accepts expanded price objects and bare price id strings", () => {
    expect(
      priceIdsFromStripeLineItems([
        { price: { id: "price_a" } },
        { price: "price_b" },
        { price: null },
        { price: { id: null } },
      ]),
    ).toEqual(["price_a", "price_b"]);
  });
});
