import { describe, expect, it } from "vitest";
import {
  checkoutSessionEligibleForBillingPortal,
  latestEligibleOrder,
  orderEligibleForBillingPortal,
  stripeCustomerIdFromUnknown,
} from "./portal";

describe("orderEligibleForBillingPortal", () => {
  it("allows Growth and Complete without commerce", () => {
    expect(orderEligibleForBillingPortal({ tier: "growth", commerceAddon: false })).toBe(true);
    expect(orderEligibleForBillingPortal({ tier: "complete", commerceAddon: false })).toBe(true);
  });

  it("rejects Starter unless Commerce add-on is present", () => {
    expect(orderEligibleForBillingPortal({ tier: "starter", commerceAddon: false })).toBe(false);
    expect(orderEligibleForBillingPortal({ tier: "starter", commerceAddon: true })).toBe(true);
  });
});

describe("checkoutSessionEligibleForBillingPortal", () => {
  it("allows subscription-mode only when a catalog recurring Price is proven", () => {
    expect(
      checkoutSessionEligibleForBillingPortal({
        mode: "subscription",
        commerceAddon: false,
        catalogRecurringProven: true,
      }),
    ).toBe(true);
    expect(
      checkoutSessionEligibleForBillingPortal({
        mode: "subscription",
        commerceAddon: true,
        catalogRecurringProven: true,
      }),
    ).toBe(true);
  });

  it("rejects subscription-mode without catalogRecurringProven (Dashboard-minted Price)", () => {
    expect(
      checkoutSessionEligibleForBillingPortal({
        mode: "subscription",
        commerceAddon: false,
      }),
    ).toBe(false);
    expect(
      checkoutSessionEligibleForBillingPortal({
        mode: "subscription",
        commerceAddon: false,
        catalogRecurringProven: false,
      }),
    ).toBe(false);
  });

  it("rejects payment-mode Growth/Complete metadata without proven commerceAddon", () => {
    // Create path never emits payment+growth/complete — forged metadata only.
    expect(
      checkoutSessionEligibleForBillingPortal({
        mode: "payment",
        commerceAddon: false,
      }),
    ).toBe(false);
  });

  it("allows payment-mode only when commerceAddon is proven", () => {
    expect(
      checkoutSessionEligibleForBillingPortal({
        mode: "payment",
        commerceAddon: true,
      }),
    ).toBe(true);
  });
});

describe("stripeCustomerIdFromUnknown", () => {
  it("accepts plain ids and expanded objects", () => {
    expect(stripeCustomerIdFromUnknown("cus_123")).toBe("cus_123");
    expect(stripeCustomerIdFromUnknown({ id: "cus_abc" })).toBe("cus_abc");
  });

  it("rejects empty / missing values", () => {
    expect(stripeCustomerIdFromUnknown(null)).toBeNull();
    expect(stripeCustomerIdFromUnknown(undefined)).toBeNull();
    expect(stripeCustomerIdFromUnknown("")).toBeNull();
    expect(stripeCustomerIdFromUnknown("   ")).toBeNull();
    expect(stripeCustomerIdFromUnknown({})).toBeNull();
  });
});

describe("latestEligibleOrder", () => {
  it("returns the first eligible order in newest-first list", () => {
    const orders = [
      { id: "1", tier: "starter", commerceAddon: false },
      { id: "2", tier: "growth", commerceAddon: false },
      { id: "3", tier: "complete", commerceAddon: false },
    ];
    expect(latestEligibleOrder(orders)?.id).toBe("2");
  });

  it("returns null when nothing is eligible", () => {
    expect(
      latestEligibleOrder([{ id: "1", tier: "starter", commerceAddon: false }]),
    ).toBeNull();
  });
});
