import { describe, expect, it } from "vitest";
import { orderEligibleForBillingPortal } from "./portal";
import {
  buildStarterUpsellCheckoutPath,
  isStarterOnlyOrder,
  leadEligibleForStarterUpsell,
  listStarterUpsellCandidates,
  oldestStarterUpsellCandidateAgeHours,
  resolveUpsellTargetTier,
} from "./starter-upsell";

describe("isStarterOnlyOrder", () => {
  it("accepts plain Starter", () => {
    expect(isStarterOnlyOrder({ tier: "starter", commerceAddon: false })).toBe(true);
  });

  it("rejects Commerce-stacked Starter and higher tiers", () => {
    expect(isStarterOnlyOrder({ tier: "starter", commerceAddon: true })).toBe(false);
    expect(isStarterOnlyOrder({ tier: "growth", commerceAddon: false })).toBe(false);
    expect(isStarterOnlyOrder({ tier: "complete", commerceAddon: false })).toBe(false);
  });

  it("rejects a Starter order that was refunded or disputed", () => {
    expect(
      isStarterOnlyOrder({
        tier: "starter",
        commerceAddon: false,
        refundedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      isStarterOnlyOrder({
        tier: "starter",
        commerceAddon: false,
        disputedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("leadEligibleForStarterUpsell", () => {
  const starterOrder = { tier: "starter", commerceAddon: false };

  it("requires paid or live stage, email, and a Starter-only order", () => {
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [starterOrder],
      }),
    ).toBe(true);
    expect(
      leadEligibleForStarterUpsell({
        stage: "live",
        email: "owner@example.com",
        ordersForLead: [starterOrder],
      }),
    ).toBe(true);
  });

  it("rejects pre-paid stages, missing email, and empty orders", () => {
    expect(
      leadEligibleForStarterUpsell({
        stage: "outreach_sent",
        email: "owner@example.com",
        ordersForLead: [starterOrder],
      }),
    ).toBe(false);
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "   ",
        ordersForLead: [starterOrder],
      }),
    ).toBe(false);
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [],
      }),
    ).toBe(false);
  });

  it("rejects leads that already have Growth/Complete/Commerce (billing-portal eligible)", () => {
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [starterOrder, { tier: "growth", commerceAddon: false }],
      }),
    ).toBe(false);
    expect(
      leadEligibleForStarterUpsell({
        stage: "live",
        email: "owner@example.com",
        ordersForLead: [{ tier: "starter", commerceAddon: true }],
      }),
    ).toBe(false);
  });

  it("rejects the upsell even when the lead's only Growth/Complete/Commerce order was refunded or disputed (mutual-exclusion-restore regression)", () => {
    // A Stripe refund or dispute is a single-charge event and does not
    // always cancel the underlying Subscription — orderEligibleForBillingPortal
    // never excludes refunded/disputed orders (a disputed-but-still-billing
    // subscriber keeps Manage billing on purpose), so this predicate must not
    // either: unblocking the upsell here let a customer whose Growth
    // subscription is still actively billing get nudged to buy Growth again,
    // risking two simultaneously active recurring subscriptions if they
    // clicked through (see starter-upsell-billing-portal-mutual-exclusion-restore).
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          starterOrder,
          { tier: "growth", commerceAddon: false, refundedAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    ).toBe(false);
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          starterOrder,
          { tier: "complete", commerceAddon: false, disputedAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    ).toBe(false);
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          starterOrder,
          { tier: "starter", commerceAddon: true, refundedAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    ).toBe(false);
  });

  it("still rejects when the Growth/Complete/Commerce order is live (not refunded/disputed)", () => {
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [starterOrder, { tier: "growth", commerceAddon: false }],
      }),
    ).toBe(false);
  });

  it("never allows the upsell for an order set where orderEligibleForBillingPortal is true (mutual exclusion with Manage billing)", () => {
    // Direct cross-check against the Billing Portal predicate this module's
    // doc comment claims mutual exclusivity with — for every order a
    // disputed/refunded Growth/Complete/Commerce order still satisfies
    // (since orderEligibleForBillingPortal ignores refund/dispute status by
    // design), the upsell must be rejected too, or both CTAs render at once.
    const disputedOrCanceledRecurringOrders = [
      { tier: "growth", commerceAddon: false },
      { tier: "complete", commerceAddon: false },
      { tier: "starter", commerceAddon: true },
      { tier: "growth", commerceAddon: false, refundedAt: "2026-07-01T00:00:00.000Z" },
      { tier: "complete", commerceAddon: false, disputedAt: "2026-07-01T00:00:00.000Z" },
    ];
    for (const recurringOrder of disputedOrCanceledRecurringOrders) {
      expect(orderEligibleForBillingPortal(recurringOrder)).toBe(true);
      expect(
        leadEligibleForStarterUpsell({
          stage: "paid",
          email: "owner@example.com",
          ordersForLead: [starterOrder, recurringOrder],
        }),
      ).toBe(false);
    }
  });

  it("rejects a lead whose only Starter order was refunded or disputed", () => {
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          { tier: "starter", commerceAddon: false, refundedAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    ).toBe(false);
    expect(
      leadEligibleForStarterUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          { tier: "starter", commerceAddon: false, disputedAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    ).toBe(false);
  });
});

describe("resolveUpsellTargetTier", () => {
  it("defaults to Growth and honors Complete recommendations", () => {
    expect(resolveUpsellTargetTier(undefined)).toBe("growth");
    expect(resolveUpsellTargetTier("starter")).toBe("growth");
    expect(resolveUpsellTargetTier("growth")).toBe("growth");
    expect(resolveUpsellTargetTier("complete")).toBe("complete");
  });
});

describe("buildStarterUpsellCheckoutPath", () => {
  it("threads slug + tier into the existing checkout query shape", () => {
    expect(buildStarterUpsellCheckoutPath("serene-salon", "growth")).toBe(
      "/checkout?slug=serene-salon&tier=growth",
    );
    expect(buildStarterUpsellCheckoutPath("acme co", "complete")).toBe(
      "/checkout?slug=acme%20co&tier=complete",
    );
  });
});

describe("listStarterUpsellCandidates", () => {
  it("filters and sorts by slug", () => {
    const leads = [
      { slug: "zeta", stage: "paid", email: "z@example.com" },
      { slug: "alpha", stage: "live", email: "a@example.com" },
      { slug: "beta", stage: "paid", email: "b@example.com" },
      { slug: "gamma", stage: "discovered", email: "g@example.com" },
    ];
    const orders = [
      { leadSlug: "zeta", tier: "starter", commerceAddon: false },
      { leadSlug: "alpha", tier: "starter", commerceAddon: false },
      { leadSlug: "beta", tier: "growth", commerceAddon: false },
      { leadSlug: "gamma", tier: "starter", commerceAddon: false },
    ];
    expect(listStarterUpsellCandidates(leads, orders).map((l) => l.slug)).toEqual([
      "alpha",
      "zeta",
    ]);
  });
});

describe("oldestStarterUpsellCandidateAgeHours", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const NOW = Date.parse("2026-07-17T12:00:00.000Z");

  it("returns null for no candidates", () => {
    expect(oldestStarterUpsellCandidateAgeHours([], [], NOW)).toBeNull();
  });

  it("returns hours since the oldest candidate's Starter order, ignoring non-candidates", () => {
    const candidates = [{ slug: "alpha" }, { slug: "beta" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "starter",
        commerceAddon: false,
        createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "beta",
        tier: "starter",
        commerceAddon: false,
        createdAt: new Date(NOW - 30 * HOUR_MS).toISOString(),
      },
      // Not a candidate — must not affect the oldest-age scan.
      {
        leadSlug: "gamma",
        tier: "starter",
        commerceAddon: false,
        createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
      },
      // Candidate but a non-Starter-only order — must be ignored.
      {
        leadSlug: "alpha",
        tier: "growth",
        commerceAddon: false,
        createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestStarterUpsellCandidateAgeHours(candidates, orders, NOW)).toBe(30);
  });

  it("clamps to 0 when nowMs is before the order's createdAt", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "starter",
        commerceAddon: false,
        createdAt: new Date(NOW + HOUR_MS).toISOString(),
      },
    ];
    expect(oldestStarterUpsellCandidateAgeHours(candidates, orders, NOW)).toBe(0);
  });

  it("skips orders missing createdAt (daily-digest.ts's lighter orders shape) rather than throwing", () => {
    const candidates = [{ slug: "alpha" }, { slug: "beta" }];
    const orders = [
      { leadSlug: "alpha", tier: "starter", commerceAddon: false },
      {
        leadSlug: "beta",
        tier: "starter",
        commerceAddon: false,
        createdAt: new Date(NOW - 6 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestStarterUpsellCandidateAgeHours(candidates, orders, NOW)).toBe(6);
  });
});
