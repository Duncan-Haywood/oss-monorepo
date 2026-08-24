import { describe, expect, it } from "vitest";
import {
  MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH,
  MAX_COMMERCE_CHECKOUT_SLUG_LENGTH,
  parseCommerceCheckoutSkuId,
  parseCommerceCheckoutSlug,
} from "./checkout-fields";

describe("parseCommerceCheckoutSlug", () => {
  it("trims and accepts a normal lead slug", () => {
    expect(parseCommerceCheckoutSlug("  demo-bakery  ")).toEqual({
      ok: true,
      value: "demo-bakery",
    });
  });

  it("rejects missing / non-string / whitespace-only", () => {
    expect(parseCommerceCheckoutSlug(undefined).ok).toBe(false);
    expect(parseCommerceCheckoutSlug(null).ok).toBe(false);
    expect(parseCommerceCheckoutSlug(12).ok).toBe(false);
    expect(parseCommerceCheckoutSlug("")).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCommerceCheckoutSlug("   ")).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("hard-rejects over MAX_COMMERCE_CHECKOUT_SLUG_LENGTH (never truncates)", () => {
    const exact = "a".repeat(MAX_COMMERCE_CHECKOUT_SLUG_LENGTH);
    expect(parseCommerceCheckoutSlug(exact)).toEqual({
      ok: true,
      value: exact,
    });
    const over = "a".repeat(MAX_COMMERCE_CHECKOUT_SLUG_LENGTH + 1);
    expect(parseCommerceCheckoutSlug(over)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("parseCommerceCheckoutSkuId", () => {
  it("trims and accepts a catalog SKU id", () => {
    expect(parseCommerceCheckoutSkuId("  sku_abc123_xyz  ")).toEqual({
      ok: true,
      value: "sku_abc123_xyz",
    });
  });

  it("rejects missing / non-string / whitespace-only", () => {
    expect(parseCommerceCheckoutSkuId(undefined)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCommerceCheckoutSkuId("")).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("hard-rejects over MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH (never truncates)", () => {
    const exact = "s".repeat(MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH);
    expect(parseCommerceCheckoutSkuId(exact)).toEqual({
      ok: true,
      value: exact,
    });
    const over = "s".repeat(MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH + 1);
    expect(parseCommerceCheckoutSkuId(over)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});
