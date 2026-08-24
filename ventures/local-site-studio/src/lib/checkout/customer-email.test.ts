import { describe, expect, it } from "vitest";
import {
  MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH,
  normalizeCheckoutCustomerEmail,
} from "./customer-email";

describe("normalizeCheckoutCustomerEmail", () => {
  it("returns undefined for non-string / blank / whitespace-only", () => {
    expect(normalizeCheckoutCustomerEmail(undefined)).toBeUndefined();
    expect(normalizeCheckoutCustomerEmail(null)).toBeUndefined();
    expect(normalizeCheckoutCustomerEmail(42)).toBeUndefined();
    expect(normalizeCheckoutCustomerEmail("")).toBeUndefined();
    expect(normalizeCheckoutCustomerEmail("   ")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCheckoutCustomerEmail("  owner@demo.test  ")).toBe(
      "owner@demo.test",
    );
  });

  it("soft-caps at MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH", () => {
    const over = `${"a".repeat(MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH + 40)}@x.com`;
    const capped = normalizeCheckoutCustomerEmail(over);
    expect(capped).toHaveLength(MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH);
    expect(capped).toBe(over.slice(0, MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH));
  });

  it("passes through a normal email unchanged", () => {
    expect(normalizeCheckoutCustomerEmail("buyer@example.com")).toBe(
      "buyer@example.com",
    );
  });
});
