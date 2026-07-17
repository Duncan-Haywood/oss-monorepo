import { describe, expect, it } from "vitest";
import {
  orderHadRecurringEntitlement,
  orderHasActiveRecurringEntitlement,
  orderRecurringIsCanceled,
  stripeSubscriptionGrantsRecurringEntitlement,
} from "./recurring";

describe("orderHadRecurringEntitlement", () => {
  it("accepts Growth, Complete, and Commerce add-on", () => {
    expect(orderHadRecurringEntitlement({ tier: "growth", commerceAddon: false })).toBe(true);
    expect(orderHadRecurringEntitlement({ tier: "complete", commerceAddon: false })).toBe(true);
    expect(orderHadRecurringEntitlement({ tier: "starter", commerceAddon: true })).toBe(true);
  });

  it("rejects Starter without Commerce", () => {
    expect(orderHadRecurringEntitlement({ tier: "starter", commerceAddon: false })).toBe(false);
  });
});

describe("orderRecurringIsCanceled", () => {
  it("treats missing/invalid as not canceled", () => {
    expect(orderRecurringIsCanceled({})).toBe(false);
    expect(orderRecurringIsCanceled({ recurringCanceledAt: null })).toBe(false);
    expect(orderRecurringIsCanceled({ recurringCanceledAt: 0 })).toBe(false);
    expect(orderRecurringIsCanceled({ recurringCanceledAt: Number.NaN })).toBe(false);
  });

  it("accepts a finite positive timestamp", () => {
    expect(orderRecurringIsCanceled({ recurringCanceledAt: 1_720_000_000_000 })).toBe(true);
  });
});

describe("orderHasActiveRecurringEntitlement", () => {
  it("requires historical recurring and no cancel timestamp", () => {
    expect(
      orderHasActiveRecurringEntitlement({ tier: "growth", commerceAddon: false }),
    ).toBe(true);
    expect(
      orderHasActiveRecurringEntitlement({
        tier: "growth",
        commerceAddon: false,
        recurringCanceledAt: 1_720_000_000_000,
      }),
    ).toBe(false);
    expect(
      orderHasActiveRecurringEntitlement({
        tier: "starter",
        commerceAddon: false,
        recurringCanceledAt: undefined,
      }),
    ).toBe(false);
  });
});

describe("stripeSubscriptionGrantsRecurringEntitlement", () => {
  it("accepts active and trialing only", () => {
    expect(stripeSubscriptionGrantsRecurringEntitlement("active")).toBe(true);
    expect(stripeSubscriptionGrantsRecurringEntitlement("trialing")).toBe(true);
    expect(stripeSubscriptionGrantsRecurringEntitlement("past_due")).toBe(false);
    expect(stripeSubscriptionGrantsRecurringEntitlement("unpaid")).toBe(false);
    expect(stripeSubscriptionGrantsRecurringEntitlement("canceled")).toBe(false);
    expect(stripeSubscriptionGrantsRecurringEntitlement("incomplete")).toBe(false);
    expect(stripeSubscriptionGrantsRecurringEntitlement(null)).toBe(false);
    expect(stripeSubscriptionGrantsRecurringEntitlement(undefined)).toBe(false);
  });
});
