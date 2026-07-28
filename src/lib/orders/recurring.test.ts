import { describe, expect, it } from "vitest";
import {
  billingNoticeTypeLabel,
  existingRecurringStripeCustomerId,
  invoiceIsSubscriptionRenewalCharge,
  invoicePaidMayRestoreRecurringEntitlement,
  invoicePaymentFailedPausesRecurringEntitlement,
  listOrdersWithFailedBillingNotice,
  listRecurringEntitlementPaused,
  oldestBillingNoticeSendFailedAgeHours,
  oldestRecurringEntitlementPausedAgeHours,
  orderEligibleForPauseNotice,
  orderGrantsSoldCapabilityEntitlement,
  orderHadRecurringEntitlement,
  orderHasActiveRecurringEntitlement,
  orderRecurringIsCanceled,
  otherLiveRecurringOrdersToSupersede,
  stripeSubscriptionBillingInterval,
  stripeSubscriptionCancellationWasInternalSupersede,
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

describe("existingRecurringStripeCustomerId", () => {
  it("returns the Customer id of a live recurring order", () => {
    expect(
      existingRecurringStripeCustomerId([
        { tier: "starter", commerceAddon: false, stripeCustomerId: undefined },
        { tier: "growth", commerceAddon: false, stripeCustomerId: "cus_growth" },
      ]),
    ).toBe("cus_growth");
  });

  it("skips a non-recurring (Starter, no commerce addon) order", () => {
    expect(
      existingRecurringStripeCustomerId([
        { tier: "starter", commerceAddon: false, stripeCustomerId: "cus_starter" },
      ]),
    ).toBeNull();
  });

  it("returns null for a lead with no orders at all (first-time checkout)", () => {
    expect(existingRecurringStripeCustomerId([])).toBeNull();
  });

  it("skips a live recurring order missing a Customer id", () => {
    expect(
      existingRecurringStripeCustomerId([
        { tier: "growth", commerceAddon: false, stripeCustomerId: "" },
      ]),
    ).toBeNull();
  });
});

describe("otherLiveRecurringOrdersToSupersede", () => {
  const growthOrder = {
    stripeSessionId: "cs_old_growth",
    stripeCustomerId: "cus_old",
    tier: "growth",
    commerceAddon: false,
  };

  it("returns the prior live recurring order when a second subscription lands", () => {
    expect(otherLiveRecurringOrdersToSupersede([growthOrder], "cs_new_complete")).toEqual([
      { stripeSessionId: "cs_old_growth", stripeCustomerId: "cus_old" },
    ]);
  });

  it("excludes the just-completed session's own order", () => {
    expect(
      otherLiveRecurringOrdersToSupersede(
        [{ ...growthOrder, stripeSessionId: "cs_new_complete" }],
        "cs_new_complete",
      ),
    ).toEqual([]);
  });

  it("still returns a prior order sharing the new session's own Customer id — the common case once existingRecurringStripeCustomerId reuses the Customer for a tier upgrade, not an exception to exclude (stripe-checkout-recurring-upgrade-dedup-shared-customer-fix)", () => {
    expect(
      otherLiveRecurringOrdersToSupersede(
        [{ ...growthOrder, stripeCustomerId: "cus_new" }],
        "cs_new_complete",
      ),
    ).toEqual([{ stripeSessionId: "cs_old_growth", stripeCustomerId: "cus_new" }]);
  });

  it("excludes a non-recurring (Starter) prior order", () => {
    expect(
      otherLiveRecurringOrdersToSupersede(
        [{ ...growthOrder, tier: "starter", commerceAddon: false }],
        "cs_new_complete",
      ),
    ).toEqual([]);
  });

  it("returns one entry per stray order even when they share the same superseded Customer id", () => {
    expect(
      otherLiveRecurringOrdersToSupersede(
        [growthOrder, { ...growthOrder, stripeSessionId: "cs_old_growth_2" }],
        "cs_new_complete",
      ),
    ).toEqual([
      { stripeSessionId: "cs_old_growth", stripeCustomerId: "cus_old" },
      { stripeSessionId: "cs_old_growth_2", stripeCustomerId: "cus_old" },
    ]);
  });

  it("returns empty for a genuinely first-time recurring checkout (no prior orders)", () => {
    expect(otherLiveRecurringOrdersToSupersede([], "cs_new_complete")).toEqual([]);
  });
});

describe("stripeSubscriptionCancellationWasInternalSupersede", () => {
  it("recognizes this app's own supersede-cleanup cancellation comment", () => {
    expect(
      stripeSubscriptionCancellationWasInternalSupersede({
        cancellation_details: { comment: "superseded_by_recurring_upgrade" },
      }),
    ).toBe(true);
  });

  it("returns false for a genuine customer-initiated cancellation", () => {
    expect(
      stripeSubscriptionCancellationWasInternalSupersede({
        cancellation_details: { comment: "too_expensive" },
      }),
    ).toBe(false);
  });

  it("returns false when cancellation_details is absent", () => {
    expect(stripeSubscriptionCancellationWasInternalSupersede({})).toBe(false);
    expect(
      stripeSubscriptionCancellationWasInternalSupersede({ cancellation_details: null }),
    ).toBe(false);
  });
});

describe("stripeSubscriptionBillingInterval", () => {
  it("returns \"annual\" for a Subscription whose first item Price recurs yearly", () => {
    expect(
      stripeSubscriptionBillingInterval({
        items: { data: [{ price: { recurring: { interval: "year" } } }] },
      }),
    ).toBe("annual");
  });

  it("returns \"monthly\" for a Subscription whose first item Price recurs monthly", () => {
    expect(
      stripeSubscriptionBillingInterval({
        items: { data: [{ price: { recurring: { interval: "month" } } }] },
      }),
    ).toBe("monthly");
  });

  it("falls back to \"monthly\" when items/price/recurring is missing (conservative default, never invents annual)", () => {
    expect(stripeSubscriptionBillingInterval({})).toBe("monthly");
    expect(stripeSubscriptionBillingInterval({ items: { data: [] } })).toBe("monthly");
    expect(
      stripeSubscriptionBillingInterval({ items: { data: [{ price: null }] } }),
    ).toBe("monthly");
    expect(
      stripeSubscriptionBillingInterval({
        items: { data: [{ price: { recurring: null } }] },
      }),
    ).toBe("monthly");
  });

  it("only ever matches the exact \"year\" interval string, never an unrecognized cadence", () => {
    expect(
      stripeSubscriptionBillingInterval({
        items: { data: [{ price: { recurring: { interval: "week" } } }] },
      }),
    ).toBe("monthly");
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
    // recurringCanceledAt is intentionally present but ignored by the function's
    // narrower parameter type (see the doc comment on orderEligibleForPauseNotice)
    // — routed through a variable so the excess-property check doesn't flag it.
    const order = {
      tier: "growth",
      commerceAddon: false,
      recurringCanceledAt: 1_720_000_000_000,
    };
    expect(orderEligibleForPauseNotice(order)).toBe(true);
  });

  it("rejects a non-recurring (Starter, no Commerce) order", () => {
    const order = {
      tier: "starter",
      commerceAddon: false,
      recurringCanceledAt: 1_720_000_000_000,
    };
    expect(orderEligibleForPauseNotice(order)).toBe(false);
  });

  it("rejects a refunded order even though it just paused", () => {
    const order = {
      tier: "growth",
      commerceAddon: false,
      recurringCanceledAt: 1_720_000_000_000,
      refundedAt: "2026-07-18T00:00:00.000Z",
    };
    expect(orderEligibleForPauseNotice(order)).toBe(false);
  });

  it("rejects a disputed order even though it just paused", () => {
    const order = {
      tier: "complete",
      commerceAddon: false,
      recurringCanceledAt: 1_720_000_000_000,
      disputedAt: "2026-07-18T00:00:00.000Z",
    };
    expect(orderEligibleForPauseNotice(order)).toBe(false);
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

describe("invoiceIsSubscriptionRenewalCharge", () => {
  it("is true only for billing_reason subscription_cycle", () => {
    expect(invoiceIsSubscriptionRenewalCharge({ billing_reason: "subscription_cycle" })).toBe(
      true,
    );
  });

  it("is false for the subscription's first invoice (already counted at order creation)", () => {
    expect(invoiceIsSubscriptionRenewalCharge({ billing_reason: "subscription_create" })).toBe(
      false,
    );
  });

  it("is false for other billing reasons and when absent", () => {
    expect(invoiceIsSubscriptionRenewalCharge({ billing_reason: "subscription_update" })).toBe(
      false,
    );
    expect(invoiceIsSubscriptionRenewalCharge({ billing_reason: "manual" })).toBe(false);
    expect(invoiceIsSubscriptionRenewalCharge({})).toBe(false);
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

describe("listOrdersWithFailedBillingNotice", () => {
  const failedAt = 1_720_000_000_000;

  it("lists orders whose most recent billing-notice send failed (oldest failure first)", () => {
    // recurringCanceledAt is set on both — realistic for payment_failed /
    // subscription_paused, since the webhook always marks recurring-canceled
    // BEFORE writing this marker for these two types (see the doc comment on
    // listOrdersWithFailedBillingNotice) — and must not exclude either row.
    const failed = listOrdersWithFailedBillingNotice(
      [
        { slug: "newer", businessName: "Newer Cafe" },
        { slug: "older", businessName: "Older Bakery" },
      ],
      [
        {
          leadSlug: "newer",
          stripeSessionId: "cs_new",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: failedAt + 10_000,
          lastBillingNoticeSendFailedAt: failedAt + 10_000,
          lastBillingNoticeSendFailedType: "payment_failed",
        },
        {
          leadSlug: "older",
          stripeSessionId: "cs_old",
          tier: "complete",
          commerceAddon: false,
          recurringCanceledAt: failedAt,
          lastBillingNoticeSendFailedAt: failedAt,
          lastBillingNoticeSendFailedType: "subscription_paused",
        },
      ],
    );
    expect(failed.map((row) => row.slug)).toEqual(["older", "newer"]);
    expect(failed[0]).toEqual({
      slug: "older",
      businessName: "Older Bakery",
      stripeSessionId: "cs_old",
      noticeType: "subscription_paused",
      failedAtMs: failedAt,
      hasStripeCustomerId: false,
    });
  });

  it("sets hasStripeCustomerId from the order's own stripeCustomerId — gates the leads-panel Billing Portal action (billing-notice-send-failed-leads-panel)", () => {
    const failed = listOrdersWithFailedBillingNotice(
      [{ slug: "with-customer", businessName: "With Customer Cafe" }],
      [
        {
          leadSlug: "with-customer",
          stripeSessionId: "cs_with_customer",
          stripeCustomerId: "cus_123",
          tier: "growth",
          commerceAddon: false,
          lastBillingNoticeSendFailedAt: failedAt,
          lastBillingNoticeSendFailedType: "payment_recovered",
        },
      ],
    );
    expect(failed[0]?.hasStripeCustomerId).toBe(true);

    const failedNoCustomer = listOrdersWithFailedBillingNotice(
      [{ slug: "no-customer", businessName: "No Customer Cafe" }],
      [
        {
          leadSlug: "no-customer",
          stripeSessionId: "cs_no_customer",
          stripeCustomerId: "   ",
          tier: "growth",
          commerceAddon: false,
          lastBillingNoticeSendFailedAt: failedAt,
          lastBillingNoticeSendFailedType: "payment_recovered",
        },
      ],
    );
    expect(failedNoCustomer[0]?.hasStripeCustomerId).toBe(false);
  });

  it("excludes orders with no failure, a cleared failure, or a missing notice type", () => {
    expect(
      listOrdersWithFailedBillingNotice(
        [{ slug: "clean", businessName: "Clean Cafe" }],
        [{ leadSlug: "clean", stripeSessionId: "cs_1", tier: "growth", commerceAddon: false }],
      ),
    ).toEqual([]);
    expect(
      listOrdersWithFailedBillingNotice(
        [{ slug: "cleared", businessName: "Cleared Cafe" }],
        [
          {
            leadSlug: "cleared",
            stripeSessionId: "cs_2",
            tier: "growth",
            commerceAddon: false,
            lastBillingNoticeSendFailedAt: null,
            lastBillingNoticeSendFailedType: null,
          },
        ],
      ),
    ).toEqual([]);
  });

  it("falls back to the lead slug when no matching lead businessName is found", () => {
    const failed = listOrdersWithFailedBillingNotice(
      [],
      [
        {
          leadSlug: "unmatched",
          stripeSessionId: "cs_3",
          tier: "growth",
          commerceAddon: false,
          lastBillingNoticeSendFailedAt: failedAt,
          lastBillingNoticeSendFailedType: "payment_recovered",
        },
      ],
    );
    expect(failed[0]?.businessName).toBe("unmatched");
  });

  it("excludes a refunded or disputed order even with a live payment_failed/subscription_paused marker", () => {
    const baseFailure = {
      stripeSessionId: "cs_gone",
      tier: "growth" as const,
      commerceAddon: false,
      recurringCanceledAt: failedAt + 1_000,
      lastBillingNoticeSendFailedAt: failedAt,
      lastBillingNoticeSendFailedType: "payment_failed" as const,
    };
    expect(
      listOrdersWithFailedBillingNotice(
        [{ slug: "refunded", businessName: "Refunded Cafe" }],
        [{ leadSlug: "refunded", ...baseFailure, refundedAt: "2026-01-01T00:00:00.000Z" }],
      ),
    ).toEqual([]);
    expect(
      listOrdersWithFailedBillingNotice(
        [{ slug: "disputed", businessName: "Disputed Cafe" }],
        [{ leadSlug: "disputed", ...baseFailure, disputedAt: "2026-01-01T00:00:00.000Z" }],
      ),
    ).toEqual([]);
  });

  it("still surfaces a payment_failed/subscription_paused order whose pause write already ran (recurringCanceledAt set) and is not refunded/disputed", () => {
    // The webhook always marks recurring-canceled BEFORE writing the failure
    // marker for these two notice types, so recurringCanceledAt is *always*
    // non-null on a real mid-dunning/mid-pause order — the prior fixture
    // shape (omitting recurringCanceledAt) never occurs in production and
    // would not have caught the entitlement gate rejecting every such order
    // outright. See billing-notice-failed-pause-gate-terminal-clear.
    const failedPaymentFailed = listOrdersWithFailedBillingNotice(
      [{ slug: "mid-dunning", businessName: "Mid Dunning Cafe" }],
      [
        {
          leadSlug: "mid-dunning",
          stripeSessionId: "cs_dunning",
          tier: "complete",
          commerceAddon: false,
          recurringCanceledAt: failedAt,
          lastBillingNoticeSendFailedAt: failedAt,
          lastBillingNoticeSendFailedType: "payment_failed",
        },
      ],
    );
    expect(failedPaymentFailed).toHaveLength(1);
    expect(failedPaymentFailed[0]?.slug).toBe("mid-dunning");

    const failedSubscriptionPaused = listOrdersWithFailedBillingNotice(
      [{ slug: "mid-pause", businessName: "Mid Pause Cafe" }],
      [
        {
          leadSlug: "mid-pause",
          stripeSessionId: "cs_pause",
          tier: "growth",
          commerceAddon: true,
          recurringCanceledAt: failedAt,
          lastBillingNoticeSendFailedAt: failedAt,
          lastBillingNoticeSendFailedType: "subscription_paused",
        },
      ],
    );
    expect(failedSubscriptionPaused).toHaveLength(1);
    expect(failedSubscriptionPaused[0]?.slug).toBe("mid-pause");
  });

  it("excludes a recurring-canceled order with a live payment_recovered/subscription_resumed marker", () => {
    // Unlike payment_failed/subscription_paused, these two types are only
    // ever written once recurringCanceledAt was just cleared — a still-set
    // recurringCanceledAt here means the order was re-paused since, so this
    // stays gated by orderGrantsSoldCapabilityEntitlement (unchanged).
    const baseFailure = {
      stripeSessionId: "cs_recovered_then_paused",
      tier: "growth" as const,
      commerceAddon: false,
      recurringCanceledAt: failedAt + 1_000,
      lastBillingNoticeSendFailedAt: failedAt,
    };
    expect(
      listOrdersWithFailedBillingNotice(
        [{ slug: "re-paused", businessName: "Re-paused Cafe" }],
        [
          {
            leadSlug: "re-paused",
            ...baseFailure,
            lastBillingNoticeSendFailedType: "payment_recovered",
          },
        ],
      ),
    ).toEqual([]);
    expect(
      listOrdersWithFailedBillingNotice(
        [{ slug: "re-paused-2", businessName: "Re-paused Cafe 2" }],
        [
          {
            leadSlug: "re-paused-2",
            ...baseFailure,
            stripeSessionId: "cs_resumed_then_paused",
            lastBillingNoticeSendFailedType: "subscription_resumed",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("excludes a Starter-only (non-recurring) order even with a stray failure marker", () => {
    // Starter is a one-time payment with no subscription lifecycle, so it can
    // never legitimately carry one of these four notice types in practice —
    // orderGrantsSoldCapabilityEntitlement correctly rejects it as belt-and-suspenders.
    expect(
      listOrdersWithFailedBillingNotice(
        [{ slug: "starter", businessName: "Starter Cafe" }],
        [
          {
            leadSlug: "starter",
            stripeSessionId: "cs_starter",
            tier: "starter",
            commerceAddon: false,
            lastBillingNoticeSendFailedAt: failedAt,
            lastBillingNoticeSendFailedType: "payment_failed",
          },
        ],
      ),
    ).toEqual([]);
  });
});

describe("oldestBillingNoticeSendFailedAgeHours", () => {
  it("returns null when empty and whole hours for the oldest failure", () => {
    expect(oldestBillingNoticeSendFailedAgeHours([], 1_720_003_600_000)).toBeNull();
    expect(
      oldestBillingNoticeSendFailedAgeHours(
        [{ failedAtMs: 1_720_000_000_000 }],
        1_720_003_600_000,
      ),
    ).toBe(1);
  });
});

describe("billingNoticeTypeLabel", () => {
  it("returns the exact digest-row wording for every BillingNoticeType (single source of truth for both the daily digest and the leads-panel)", () => {
    expect(billingNoticeTypeLabel("payment_failed")).toBe("payment-failed (dunning)");
    expect(billingNoticeTypeLabel("payment_recovered")).toBe("payment-recovered");
    expect(billingNoticeTypeLabel("subscription_paused")).toBe("subscription-paused");
    expect(billingNoticeTypeLabel("subscription_resumed")).toBe("subscription-resumed");
    expect(billingNoticeTypeLabel("subscription_canceled")).toBe("subscription-canceled");
  });
});
