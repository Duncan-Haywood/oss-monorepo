import { describe, expect, it } from "vitest";
import {
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
