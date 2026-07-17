import { describe, expect, it } from "vitest";
import {
  invoicePaymentFailedPausesRecurringEntitlement,
  orderHadRecurringEntitlement,
  orderHasActiveRecurringEntitlement,
  orderRecurringIsCanceled,
  stripeSubscriptionGrantsRecurringEntitlement,
  stripeSubscriptionHasPauseCollection,
  stripeSubscriptionPausesRecurringEntitlement,
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

describe("stripeSubscriptionPausesRecurringEntitlement", () => {
  it("accepts past_due and unpaid only", () => {
    expect(stripeSubscriptionPausesRecurringEntitlement("past_due")).toBe(true);
    expect(stripeSubscriptionPausesRecurringEntitlement("unpaid")).toBe(true);
    expect(stripeSubscriptionPausesRecurringEntitlement("active")).toBe(false);
    expect(stripeSubscriptionPausesRecurringEntitlement("trialing")).toBe(false);
    expect(stripeSubscriptionPausesRecurringEntitlement("canceled")).toBe(false);
    expect(stripeSubscriptionPausesRecurringEntitlement("incomplete")).toBe(false);
    expect(stripeSubscriptionPausesRecurringEntitlement(null)).toBe(false);
    expect(stripeSubscriptionPausesRecurringEntitlement(undefined)).toBe(false);
  });
});

describe("invoicePaymentFailedPausesRecurringEntitlement", () => {
  it("requires a non-empty subscription id (string or expanded)", () => {
    expect(
      invoicePaymentFailedPausesRecurringEntitlement({ subscription: "sub_renew_1" }),
    ).toBe(true);
    expect(
      invoicePaymentFailedPausesRecurringEntitlement({ subscription: { id: "sub_exp_1" } }),
    ).toBe(true);
    expect(invoicePaymentFailedPausesRecurringEntitlement({})).toBe(false);
    expect(invoicePaymentFailedPausesRecurringEntitlement({ subscription: null })).toBe(false);
    expect(invoicePaymentFailedPausesRecurringEntitlement({ subscription: "" })).toBe(false);
    expect(invoicePaymentFailedPausesRecurringEntitlement({ subscription: "   " })).toBe(false);
    expect(invoicePaymentFailedPausesRecurringEntitlement({ subscription: {} })).toBe(false);
  });
});

describe("stripeSubscriptionHasPauseCollection", () => {
  it("treats a non-null object as paused (behavior void/keep_as_draft/mark_uncollectible)", () => {
    expect(stripeSubscriptionHasPauseCollection({ behavior: "void" })).toBe(true);
    expect(stripeSubscriptionHasPauseCollection({ behavior: "keep_as_draft" })).toBe(true);
    expect(stripeSubscriptionHasPauseCollection({})).toBe(true);
  });

  it("rejects null/undefined/non-objects", () => {
    expect(stripeSubscriptionHasPauseCollection(null)).toBe(false);
    expect(stripeSubscriptionHasPauseCollection(undefined)).toBe(false);
    expect(stripeSubscriptionHasPauseCollection("void")).toBe(false);
    expect(stripeSubscriptionHasPauseCollection(0)).toBe(false);
  });
});
