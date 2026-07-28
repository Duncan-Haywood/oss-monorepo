import { describe, expect, it } from "vitest";
import {
  buildGrowthUpsellCheckoutPath,
  hasCompleteOrder,
  isGrowthOrder,
  leadEligibleForGrowthUpsell,
  listGrowthUpsellCandidates,
  oldestGrowthUpsellCandidateAgeHours,
} from "./growth-upsell";

describe("isGrowthOrder", () => {
  it("accepts a plain Growth order", () => {
    expect(isGrowthOrder({ tier: "growth" })).toBe(true);
  });

  it("rejects Starter and Complete", () => {
    expect(isGrowthOrder({ tier: "starter" })).toBe(false);
    expect(isGrowthOrder({ tier: "complete" })).toBe(false);
  });

  it("rejects a Growth order that was refunded or disputed", () => {
    expect(
      isGrowthOrder({ tier: "growth", refundedAt: "2026-07-01T00:00:00.000Z" }),
    ).toBe(false);
    expect(
      isGrowthOrder({ tier: "growth", disputedAt: "2026-07-01T00:00:00.000Z" }),
    ).toBe(false);
  });

  it("rejects a Growth order whose recurring Subscription was already canceled (customer.subscription.deleted set recurringCanceledAt) — see growth-upsell-canceled-exclusion", () => {
    expect(
      isGrowthOrder({ tier: "growth", recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z") }),
    ).toBe(false);
  });

  it("accepts a Growth order with an absent/null/zero recurringCanceledAt (never canceled)", () => {
    expect(isGrowthOrder({ tier: "growth", recurringCanceledAt: undefined })).toBe(true);
    expect(isGrowthOrder({ tier: "growth", recurringCanceledAt: null })).toBe(true);
    expect(isGrowthOrder({ tier: "growth", recurringCanceledAt: 0 })).toBe(true);
  });
});

describe("hasCompleteOrder", () => {
  it("is true for any Complete order regardless of refund/dispute status", () => {
    expect(hasCompleteOrder([{ tier: "complete" }])).toBe(true);
    expect(
      hasCompleteOrder([{ tier: "complete", refundedAt: "2026-07-01T00:00:00.000Z" }]),
    ).toBe(true);
  });

  it("is false when no order is at the Complete tier", () => {
    expect(hasCompleteOrder([{ tier: "growth" }, { tier: "starter" }])).toBe(false);
    expect(hasCompleteOrder([])).toBe(false);
  });
});

describe("leadEligibleForGrowthUpsell", () => {
  const growthOrder = { tier: "growth" };

  it("requires paid or live stage, email, and a live Growth order", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [growthOrder],
      }),
    ).toBe(true);
    expect(
      leadEligibleForGrowthUpsell({
        stage: "live",
        email: "owner@example.com",
        ordersForLead: [growthOrder],
      }),
    ).toBe(true);
  });

  it("rejects pre-paid stages, missing email, and empty orders", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "outreach_sent",
        email: "owner@example.com",
        ordersForLead: [growthOrder],
      }),
    ).toBe(false);
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "   ",
        ordersForLead: [growthOrder],
      }),
    ).toBe(false);
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [],
      }),
    ).toBe(false);
  });

  it("rejects a lead with no Growth order at all (e.g. Starter-only, or Commerce-only)", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [{ tier: "starter" }],
      }),
    ).toBe(false);
  });

  it("rejects a lead that already has a Complete order, regardless of refund/dispute status", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [growthOrder, { tier: "complete" }],
      }),
    ).toBe(false);
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          growthOrder,
          { tier: "complete", disputedAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    ).toBe(false);
  });

  it("rejects a lead whose only Growth order was refunded or disputed", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [{ tier: "growth", refundedAt: "2026-07-01T00:00:00.000Z" }],
      }),
    ).toBe(false);
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [{ tier: "growth", disputedAt: "2026-07-01T00:00:00.000Z" }],
      }),
    ).toBe(false);
  });

  it("does not exclude a lead just because it also has a Commerce order — Commerce is orthogonal", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [growthOrder, { tier: "starter", commerceAddon: true }],
      }),
    ).toBe(true);
  });

  it("rejects a lead whose only Growth order's Subscription was already canceled — a lapsed subscriber must not be pitched an upgrade to a subscription that no longer exists (growth-upsell-canceled-exclusion)", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          {
            tier: "growth",
            recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z"),
          },
        ],
      }),
    ).toBe(false);
  });

  it("stays eligible when a canceled Growth order sits alongside a separate, still-active Growth order for the same lead (e.g. an old cancel followed by a fresh resubscribe checkout)", () => {
    expect(
      leadEligibleForGrowthUpsell({
        stage: "paid",
        email: "owner@example.com",
        ordersForLead: [
          {
            tier: "growth",
            recurringCanceledAt: Date.parse("2026-06-01T00:00:00.000Z"),
          },
          growthOrder,
        ],
      }),
    ).toBe(true);
  });
});

describe("buildGrowthUpsellCheckoutPath", () => {
  it("threads slug into the checkout query shape, always targeting complete", () => {
    expect(buildGrowthUpsellCheckoutPath("serene-salon")).toBe(
      "/checkout?slug=serene-salon&tier=complete",
    );
    expect(buildGrowthUpsellCheckoutPath("acme co")).toBe(
      "/checkout?slug=acme%20co&tier=complete",
    );
  });

  it("appends billing=annual only when explicitly requested (growth-upsell-annual-billing-carry-through)", () => {
    expect(buildGrowthUpsellCheckoutPath("serene-salon", "annual")).toBe(
      "/checkout?slug=serene-salon&tier=complete&billing=annual",
    );
    expect(buildGrowthUpsellCheckoutPath("serene-salon", "monthly")).toBe(
      "/checkout?slug=serene-salon&tier=complete",
    );
    expect(buildGrowthUpsellCheckoutPath("serene-salon")).toBe(
      "/checkout?slug=serene-salon&tier=complete",
    );
  });
});

describe("listGrowthUpsellCandidates", () => {
  it("filters and sorts by slug", () => {
    const leads = [
      { slug: "zeta", stage: "paid", email: "z@example.com" },
      { slug: "alpha", stage: "live", email: "a@example.com" },
      { slug: "beta", stage: "paid", email: "b@example.com" },
      { slug: "gamma", stage: "discovered", email: "g@example.com" },
    ];
    const orders = [
      { leadSlug: "zeta", tier: "growth" },
      { leadSlug: "alpha", tier: "growth" },
      { leadSlug: "beta", tier: "complete" },
      { leadSlug: "gamma", tier: "growth" },
    ];
    expect(listGrowthUpsellCandidates(leads, orders).map((l) => l.slug)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("excludes a lead whose Growth order was already canceled (growth-upsell-canceled-exclusion)", () => {
    const leads = [
      { slug: "active", stage: "paid", email: "a@example.com" },
      { slug: "canceled", stage: "paid", email: "c@example.com" },
    ];
    const orders = [
      { leadSlug: "active", tier: "growth" },
      {
        leadSlug: "canceled",
        tier: "growth",
        recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z"),
      },
    ];
    expect(listGrowthUpsellCandidates(leads, orders).map((l) => l.slug)).toEqual(["active"]);
  });
});

describe("oldestGrowthUpsellCandidateAgeHours", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const NOW = Date.parse("2026-07-17T12:00:00.000Z");

  it("returns null for no candidates", () => {
    expect(oldestGrowthUpsellCandidateAgeHours([], [], NOW)).toBeNull();
  });

  it("returns hours since the oldest candidate's Growth order, ignoring non-candidates", () => {
    const candidates = [{ slug: "alpha" }, { slug: "beta" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "growth",
        createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "beta",
        tier: "growth",
        createdAt: new Date(NOW - 30 * HOUR_MS).toISOString(),
      },
      // Not a candidate — must not affect the oldest-age scan.
      {
        leadSlug: "gamma",
        tier: "growth",
        createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
      },
      // Candidate but a non-Growth order — must be ignored.
      {
        leadSlug: "alpha",
        tier: "complete",
        createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestGrowthUpsellCandidateAgeHours(candidates, orders, NOW)).toBe(30);
  });

  it("clamps to 0 when nowMs is before the order's createdAt", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "growth",
        createdAt: new Date(NOW + HOUR_MS).toISOString(),
      },
    ];
    expect(oldestGrowthUpsellCandidateAgeHours(candidates, orders, NOW)).toBe(0);
  });

  it("skips orders missing createdAt (daily-digest.ts's lighter orders shape) rather than throwing", () => {
    const candidates = [{ slug: "alpha" }, { slug: "beta" }];
    const orders = [
      { leadSlug: "alpha", tier: "growth" },
      {
        leadSlug: "beta",
        tier: "growth",
        createdAt: new Date(NOW - 6 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestGrowthUpsellCandidateAgeHours(candidates, orders, NOW)).toBe(6);
  });

  it("skips a candidate's canceled Growth order (isGrowthOrder rejects it) rather than counting its age", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "growth",
        recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z"),
        createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestGrowthUpsellCandidateAgeHours(candidates, orders, NOW)).toBeNull();
  });
});
