import { describe, expect, it } from "vitest";
import {
  invoicePaidMayRestoreRecurringEntitlement,
  invoicePaymentFailedPausesRecurringEntitlement,
  listRecurringEntitlementPaused,
  oldestRecurringEntitlementPausedAgeHours,
  orderEligibleForPauseNotice,
  orderGrantsSoldCapabilityEntitlement,
  orderHadRecurringEntitlement,
  orderHasActiveRecurringEntitlement,
  orderRecurringIsCanceled,
  stripeSubscriptionGrantsRecurringEntitlement,
  stripeSubscriptionHasPauseCollection,
  stripeSubscriptionIdFromInvoice,
  stripeSubscriptionPausedAtMs,
  stripeSubscriptionPausesRecurringEntitlement,
  stripeSubscriptionShouldPauseRecurringEntitlement,
  stripeSubscriptionShouldRestoreRecurringEntitlement,
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

describe("orderGrantsSoldCapabilityEntitlement", () => {
  it("accepts an active order with no refund/dispute", () => {
    expect(
      orderGrantsSoldCapabilityEntitlement({ tier: "growth", commerceAddon: false }),
    ).toBe(true);
  });

  it("rejects a refunded order even when the subscription itself is still active", () => {
    expect(
      orderGrantsSoldCapabilityEntitlement({
        tier: "growth",
        commerceAddon: false,
        refundedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("rejects a disputed order even when the subscription itself is still active", () => {
    expect(
      orderGrantsSoldCapabilityEntitlement({
        tier: "complete",
        commerceAddon: false,
        disputedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("still rejects a recurring-canceled order regardless of refund/dispute", () => {
    expect(
      orderGrantsSoldCapabilityEntitlement({
        tier: "growth",
        commerceAddon: false,
        recurringCanceledAt: 1_720_000_000_000,
      }),
    ).toBe(false);
  });
});

describe("orderEligibleForPauseNotice", () => {
  it("accepts an order with a freshly-set recurringCanceledAt (the pause write already ran)", () => {
    expect(
      orderEligibleForPauseNotice({
        tier: "growth",
        commerceAddon: false,
        recurringCanceledAt: 1_720_000_000_000,
      }),
    ).toBe(true);
  });

  it("rejects a non-recurring (Starter, no Commerce) order", () => {
    expect(
      orderEligibleForPauseNotice({
        tier: "starter",
        commerceAddon: false,
        recurringCanceledAt: 1_720_000_000_000,
      }),
    ).toBe(false);
  });

  it("rejects a refunded order even though it just paused", () => {
    expect(
      orderEligibleForPauseNotice({
        tier: "growth",
        commerceAddon: false,
        recurringCanceledAt: 1_720_000_000_000,
        refundedAt: "2026-07-18T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("rejects a disputed order even though it just paused", () => {
    expect(
      orderEligibleForPauseNotice({
        tier: "complete",
        commerceAddon: false,
        recurringCanceledAt: 1_720_000_000_000,
        disputedAt: "2026-07-18T00:00:00.000Z",
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

describe("stripeSubscriptionIdFromInvoice", () => {
  it("extracts string or expanded object ids and rejects blanks", () => {
    expect(stripeSubscriptionIdFromInvoice({ subscription: "sub_renew_1" })).toBe("sub_renew_1");
    expect(stripeSubscriptionIdFromInvoice({ subscription: { id: "sub_exp_1" } })).toBe(
      "sub_exp_1",
    );
    expect(stripeSubscriptionIdFromInvoice({})).toBeNull();
    expect(stripeSubscriptionIdFromInvoice({ subscription: null })).toBeNull();
    expect(stripeSubscriptionIdFromInvoice({ subscription: "" })).toBeNull();
    expect(stripeSubscriptionIdFromInvoice({ subscription: "   " })).toBeNull();
    expect(stripeSubscriptionIdFromInvoice({ subscription: {} })).toBeNull();
  });
});

describe("stripeSubscriptionPausedAtMs", () => {
  it("converts the first item's current_period_start (seconds) to ms", () => {
    const nowMs = 1_800_000_000_000;
    expect(
      stripeSubscriptionPausedAtMs(
        { items: { data: [{ current_period_start: 1_720_000_300 }] } },
        nowMs,
      ),
    ).toBe(1_720_000_300_000);
  });

  it("falls back to nowMs when items are missing (Stripe Subscription no longer carries current_period_start directly)", () => {
    const nowMs = 1_800_000_000_000;
    expect(stripeSubscriptionPausedAtMs({}, nowMs)).toBe(nowMs);
  });

  it("falls back to nowMs when items.data is empty", () => {
    const nowMs = 1_800_000_000_000;
    expect(stripeSubscriptionPausedAtMs({ items: { data: [] } }, nowMs)).toBe(nowMs);
  });

  it("falls back to nowMs on a non-positive or non-finite current_period_start", () => {
    const nowMs = 1_800_000_000_000;
    expect(
      stripeSubscriptionPausedAtMs({ items: { data: [{ current_period_start: 0 }] } }, nowMs),
    ).toBe(nowMs);
    expect(
      stripeSubscriptionPausedAtMs(
        { items: { data: [{ current_period_start: Number.NaN }] } },
        nowMs,
      ),
    ).toBe(nowMs);
    expect(
      stripeSubscriptionPausedAtMs(
        { items: { data: [{ current_period_start: "1720000300" as unknown }] } },
        nowMs,
      ),
    ).toBe(nowMs);
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

  it("accepts Stripe's nested Invoice subscription field", () => {
    expect(
      invoicePaymentFailedPausesRecurringEntitlement({
        parent: { subscription_details: { subscription: { id: "sub_nested_failed" } } },
      }),
    ).toBe(true);
  });
});

describe("invoicePaidMayRestoreRecurringEntitlement", () => {
  it("mirrors the subscription-membership gate used by payment_failed", () => {
    expect(invoicePaidMayRestoreRecurringEntitlement({ subscription: "sub_paid_1" })).toBe(true);
    expect(invoicePaidMayRestoreRecurringEntitlement({ subscription: null })).toBe(false);
  });

  it("accepts Stripe's nested Invoice subscription field", () => {
    expect(
      invoicePaidMayRestoreRecurringEntitlement({
        parent: { subscription_details: { subscription: "sub_nested_paid" } },
      }),
    ).toBe(true);
  });
});

describe("stripeSubscriptionShouldRestoreRecurringEntitlement", () => {
  it("requires grants and rejects pause_collection", () => {
    expect(
      stripeSubscriptionShouldRestoreRecurringEntitlement({ status: "active" }),
    ).toBe(true);
    expect(
      stripeSubscriptionShouldRestoreRecurringEntitlement({ status: "trialing" }),
    ).toBe(true);
    expect(
      stripeSubscriptionShouldRestoreRecurringEntitlement({
        status: "active",
        pause_collection: { behavior: "void" },
      }),
    ).toBe(false);
    expect(
      stripeSubscriptionShouldRestoreRecurringEntitlement({ status: "past_due" }),
    ).toBe(false);
  });
});

describe("stripeSubscriptionShouldPauseRecurringEntitlement", () => {
  it("pauses on past_due/unpaid or pause_collection; skips recovered grants", () => {
    expect(
      stripeSubscriptionShouldPauseRecurringEntitlement({ status: "past_due" }),
    ).toBe(true);
    expect(
      stripeSubscriptionShouldPauseRecurringEntitlement({ status: "unpaid" }),
    ).toBe(true);
    expect(
      stripeSubscriptionShouldPauseRecurringEntitlement({
        status: "active",
        pause_collection: { behavior: "void" },
      }),
    ).toBe(true);
    expect(
      stripeSubscriptionShouldPauseRecurringEntitlement({ status: "active" }),
    ).toBe(false);
    expect(
      stripeSubscriptionShouldPauseRecurringEntitlement({ status: "trialing" }),
    ).toBe(false);
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
