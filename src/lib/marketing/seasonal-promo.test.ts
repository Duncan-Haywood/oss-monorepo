import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import { MAX_TAGLINE_LENGTH } from "@/lib/leads/create-fields";
import {
  SEASONAL_PROMO_CONTENT_TYPES,
  defaultSeasonalPromoOccasion,
  leadEligibleForSeasonalPromo,
  resolveSeasonalPromoOccasion,
  seasonalPromoRequestForLead,
} from "./seasonal-promo";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "pine-cafe",
    businessName: "Pine Cafe",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "Fresh local plates",
    description: "Neighborhood cafe",
    phone: "303-555-0100",
    email: "hello@pine.example",
    services: ["brunch", "coffee", "catering"],
    hours: { weekday: "7am–3pm", weekend: "8am–2pm" },
    stage: "paid",
    recommendedTier: "growth",
    ...overrides,
  };
}

function completeOrder(overrides: Record<string, unknown> = {}) {
  return {
    tier: "complete",
    commerceAddon: false,
    recurringCanceledAt: null,
    ...overrides,
  };
}

describe("leadEligibleForSeasonalPromo", () => {
  it("is eligible for a paid lead with an active Complete order", () => {
    expect(leadEligibleForSeasonalPromo(baseLead({ stage: "paid" }), [completeOrder()])).toBe(
      true,
    );
  });

  it("is eligible for a live lead with an active Complete order", () => {
    expect(leadEligibleForSeasonalPromo(baseLead({ stage: "live" }), [completeOrder()])).toBe(
      true,
    );
  });

  it("is not eligible for a lead stage outside paid/live", () => {
    expect(
      leadEligibleForSeasonalPromo(baseLead({ stage: "discovered" }), [completeOrder()]),
    ).toBe(false);
  });

  it("is not eligible for a Growth-only lead — Complete differentiator", () => {
    expect(
      leadEligibleForSeasonalPromo(baseLead(), [completeOrder({ tier: "growth" })]),
    ).toBe(false);
  });

  it("is not eligible with no orders", () => {
    expect(leadEligibleForSeasonalPromo(baseLead(), [])).toBe(false);
  });

  it("is not eligible when the Complete order's entitlement has lapsed (refunded)", () => {
    expect(
      leadEligibleForSeasonalPromo(baseLead(), [
        completeOrder({ refundedAt: "2026-01-01T00:00:00.000Z" }),
      ]),
    ).toBe(false);
  });

  it("is not eligible when the Complete order's entitlement has lapsed (canceled)", () => {
    expect(
      leadEligibleForSeasonalPromo(baseLead(), [
        completeOrder({ recurringCanceledAt: 1700000000000 }),
      ]),
    ).toBe(false);
  });

  it("is eligible when a canceled Complete order sits alongside an active one", () => {
    expect(
      leadEligibleForSeasonalPromo(baseLead(), [
        completeOrder({ recurringCanceledAt: 1700000000000 }),
        completeOrder(),
      ]),
    ).toBe(true);
  });
});

describe("defaultSeasonalPromoOccasion", () => {
  it("derives the current UTC month name — never a hemisphere-dependent season word", () => {
    // 2026-07-15T00:00:00Z
    expect(defaultSeasonalPromoOccasion(Date.UTC(2026, 6, 15))).toBe("July promotion");
    // 2026-01-01T00:00:00Z
    expect(defaultSeasonalPromoOccasion(Date.UTC(2026, 0, 1))).toBe("January promotion");
  });
});

describe("resolveSeasonalPromoOccasion", () => {
  const nowMs = Date.UTC(2026, 6, 15);

  it("falls back to the derived month default when blank", () => {
    expect(resolveSeasonalPromoOccasion(undefined, nowMs)).toBe("July promotion");
    expect(resolveSeasonalPromoOccasion("   ", nowMs)).toBe("July promotion");
  });

  it("trims and returns an operator-supplied occasion", () => {
    expect(resolveSeasonalPromoOccasion("  Labor Day weekend  ", nowMs)).toBe(
      "Labor Day weekend",
    );
  });

  it("soft-caps an oversize occasion at the tagline bound", () => {
    const oversize = "X".repeat(MAX_TAGLINE_LENGTH + 50);
    expect(resolveSeasonalPromoOccasion(oversize, nowMs)).toHaveLength(MAX_TAGLINE_LENGTH);
  });
});

describe("seasonalPromoRequestForLead", () => {
  const nowMs = Date.UTC(2026, 6, 15);

  it("requests two seasonal_promo variants plus one ad_copy variant", () => {
    const request = seasonalPromoRequestForLead(baseLead(), undefined, nowMs);
    expect(request.contentTypes).toEqual([...SEASONAL_PROMO_CONTENT_TYPES]);
    expect(request.contentTypes).toEqual(["seasonal_promo", "seasonal_promo", "ad_copy"]);
  });

  it("carries the resolved occasion as campaignContext", () => {
    const request = seasonalPromoRequestForLead(baseLead(), "Grand reopening", nowMs);
    expect(request.business.campaignContext).toBe("Grand reopening");
  });

  it("defaults campaignContext to the current month when occasion is blank", () => {
    const request = seasonalPromoRequestForLead(baseLead(), undefined, nowMs);
    expect(request.business.campaignContext).toBe("July promotion");
  });

  it("copies SEASONAL_PROMO_CONTENT_TYPES without sharing the readonly array", () => {
    const request = seasonalPromoRequestForLead(baseLead(), undefined, nowMs);
    expect(request.contentTypes).not.toBe(SEASONAL_PROMO_CONTENT_TYPES);
  });
});
