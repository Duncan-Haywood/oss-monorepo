import { describe, expect, it } from "vitest";
import {
  invoicePaymentFailedPausesRecurringEntitlement,
  listRecurringEntitlementPaused,
  oldestRecurringEntitlementPausedAgeHours,
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

describe("listRecurringEntitlementPaused", () => {
  const pausedAt = 1_720_000_000_000;

  it("lists paid|live leads with only canceled recurring orders (oldest first)", () => {
    const paused = listRecurringEntitlementPaused(
      [
        { slug: "newer", businessName: "Newer Cafe", stage: "paid" },
        { slug: "older", businessName: "Older Bakery", stage: "live" },
        { slug: "outreach", businessName: "Cold", stage: "outreach_sent" },
      ],
      [
        {
          leadSlug: "newer",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: pausedAt + 10_000,
          stripeCustomerId: "cus_new",
        },
        {
          leadSlug: "older",
          tier: "complete",
          commerceAddon: false,
          recurringCanceledAt: pausedAt,
          stripeCustomerId: "cus_old",
        },
        {
          leadSlug: "outreach",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: pausedAt,
        },
      ],
    );
    expect(paused.map((row) => row.slug)).toEqual(["older", "newer"]);
    expect(paused[0]?.pausedAtMs).toBe(pausedAt);
    expect(paused[0]?.hasStripeCustomerId).toBe(true);
    expect(paused[1]?.stage).toBe("paid");
  });

  it("excludes leads that still have an active recurring order", () => {
    const paused = listRecurringEntitlementPaused(
      [{ slug: "mixed", businessName: "Mixed", stage: "paid" }],
      [
        {
          leadSlug: "mixed",
          tier: "starter",
          commerceAddon: true,
          recurringCanceledAt: pausedAt,
        },
        {
          leadSlug: "mixed",
          tier: "growth",
          commerceAddon: false,
        },
      ],
    );
    expect(paused).toEqual([]);
  });

  it("excludes Starter-only and uncanceled recurring leads", () => {
    expect(
      listRecurringEntitlementPaused(
        [{ slug: "starter", businessName: "Starter", stage: "paid" }],
        [{ leadSlug: "starter", tier: "starter", commerceAddon: false }],
      ),
    ).toEqual([]);
    expect(
      listRecurringEntitlementPaused(
        [{ slug: "active", businessName: "Active", stage: "live" }],
        [{ leadSlug: "active", tier: "growth", commerceAddon: false }],
      ),
    ).toEqual([]);
  });
});

describe("oldestRecurringEntitlementPausedAgeHours", () => {
  it("returns null when empty and whole hours for the oldest pause", () => {
    expect(oldestRecurringEntitlementPausedAgeHours([], 1_720_003_600_000)).toBeNull();
    expect(
      oldestRecurringEntitlementPausedAgeHours(
        [{ pausedAtMs: 1_720_000_000_000 }],
        1_720_003_600_000,
      ),
    ).toBe(1);
  });
});
