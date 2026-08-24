import { describe, expect, it } from "vitest";
import {
  MAX_CHECKOUT_BUSINESS_NAME_LENGTH,
  MAX_CHECKOUT_BUSINESS_PHONE_LENGTH,
  normalizeCheckoutBusinessName,
  normalizeCheckoutBusinessPhone,
} from "./business-fields";

describe("normalizeCheckoutBusinessName", () => {
  it("trims and returns a valid businessName", () => {
    expect(normalizeCheckoutBusinessName("  Riverside Plumbing  ")).toBe("Riverside Plumbing");
  });

  it("returns undefined for non-string, blank, or whitespace-only input", () => {
    expect(normalizeCheckoutBusinessName(undefined)).toBeUndefined();
    expect(normalizeCheckoutBusinessName(null)).toBeUndefined();
    expect(normalizeCheckoutBusinessName(42)).toBeUndefined();
    expect(normalizeCheckoutBusinessName("   ")).toBeUndefined();
  });

  it("soft-caps an over-long businessName rather than rejecting it", () => {
    const tooLong = "A".repeat(MAX_CHECKOUT_BUSINESS_NAME_LENGTH + 50);
    const result = normalizeCheckoutBusinessName(tooLong);
    expect(result).toHaveLength(MAX_CHECKOUT_BUSINESS_NAME_LENGTH);
  });
});

describe("normalizeCheckoutBusinessPhone", () => {
  it("trims and returns a valid phone", () => {
    expect(normalizeCheckoutBusinessPhone("  555-867-5309  ")).toBe("555-867-5309");
  });

  it("returns undefined for non-string, blank, or whitespace-only input", () => {
    expect(normalizeCheckoutBusinessPhone(undefined)).toBeUndefined();
    expect(normalizeCheckoutBusinessPhone("")).toBeUndefined();
    expect(normalizeCheckoutBusinessPhone("   ")).toBeUndefined();
  });

  it("soft-caps an over-long phone rather than rejecting it", () => {
    const tooLong = "5".repeat(MAX_CHECKOUT_BUSINESS_PHONE_LENGTH + 10);
    const result = normalizeCheckoutBusinessPhone(tooLong);
    expect(result).toHaveLength(MAX_CHECKOUT_BUSINESS_PHONE_LENGTH);
  });
});
