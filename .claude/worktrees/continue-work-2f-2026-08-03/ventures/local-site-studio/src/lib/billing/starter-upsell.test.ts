import { describe, expect, it } from "vitest";
import {
  buildStarterUpsellCheckoutPath,
  isStarterOnlyOrder,
  leadEligibleForStarterUpsell,
  listStarterUpsellCandidates,
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
