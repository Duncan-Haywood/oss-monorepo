import { describe, expect, it } from "vitest";
import type { CheckoutSessionRecord } from "../checkout/types";
import type { Lead } from "./types";
import {
  CATEGORY_DEFAULT_TIER,
  bandForScore,
  qualityBandLabel,
  rankLeadsForOutreach,
  scoreLead,
} from "./quality-score";

const NOW = Date.parse("2026-07-12T00:00:00.000Z");

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "test-lead",
    businessName: "Test Lead",
    category: "restaurant",
    city: "Denver",
    state: "CO",
    address: "100 Main St",
    tagline: "Test",
    description: "Test description",
    phone: "(303) 555-0100",
    email: "owner@example.com",
    services: ["Service"],
    hours: { weekday: "Mon–Fri 9–5", weekend: "Closed" },
    stage: "site_built",
    recommendedTier: "growth",
    dataSource: "manual_entry",
    outreachStep: 0,
    ...overrides,
  };
}

function openCheckout(
  overrides: Partial<CheckoutSessionRecord> = {},
): CheckoutSessionRecord {
  return {
    stripeSessionId: "cs_test_abandoned",
    leadSlug: "test-lead",
    tier: "starter",
    commerceAddon: false,
    customerEmail: "owner@example.com",
    status: "open",
    // 3h before NOW → abandoned under the 2h threshold
    createdAt: "2026-07-11T21:00:00.000Z",
    ...overrides,
  };
}

describe("scoreLead", () => {
  it("scores a complete site_built lead as warm/hot and actionable", () => {
    const result = scoreLead(baseLead(), NOW);
    expect(result.actionable).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(["hot", "warm"]).toContain(result.band);
    expect(result.factors.some((f) => f.id === "has_email")).toBe(true);
    expect(result.factors.some((f) => f.id === "ready_email_1")).toBe(true);
  });

  it("penalizes missing email and marks blocked", () => {
    const result = scoreLead(baseLead({ email: undefined }), NOW);
    expect(result.band).toBe("blocked");
    expect(result.factors.some((f) => f.id === "missing_email")).toBe(true);
    expect(result.score).toBeLessThan(scoreLead(baseLead(), NOW).score);
  });

  it("boosts follow-up-due outreach leads above fresh site_built peers", () => {
    const due = scoreLead(
      baseLead({
        stage: "outreach_sent",
        outreachStep: 1,
        lastOutreachAt: "2026-07-01T00:00:00.000Z",
        dataSource: "csv_import",
      }),
      NOW,
    );
    const ready = scoreLead(baseLead({ dataSource: "csv_import" }), NOW);
    expect(due.factors.some((f) => f.id === "follow_up_due")).toBe(true);
    expect(due.score).toBeGreaterThan(ready.score);
  });

  it("deprioritizes demo_catalog vs operator-owned sources", () => {
    const demo = scoreLead(baseLead({ dataSource: "demo_catalog" }), NOW);
    const owned = scoreLead(baseLead({ dataSource: "csv_import" }), NOW);
    expect(demo.score).toBeLessThan(owned.score);
    expect(demo.factors.some((f) => f.id === "demo_source")).toBe(true);
  });

  it("applies tier fit vs category default", () => {
    const fit = scoreLead(
      baseLead({ category: "trades", recommendedTier: "starter" }),
      NOW,
    );
    const mismatch = scoreLead(
      baseLead({ category: "trades", recommendedTier: "complete" }),
      NOW,
    );
    expect(fit.factors.some((f) => f.id === "tier_fit")).toBe(true);
    expect(mismatch.factors.some((f) => f.id === "tier_mismatch")).toBe(true);
    expect(fit.score).toBeGreaterThan(mismatch.score);
    expect(CATEGORY_DEFAULT_TIER.trades).toBe("starter");
  });

  it("marks paid/live as fulfillment and not actionable", () => {
    const paid = scoreLead(baseLead({ stage: "paid" }), NOW);
    const live = scoreLead(baseLead({ stage: "live" }), NOW);
    expect(paid.actionable).toBe(false);
    expect(live.actionable).toBe(false);
    expect(paid.band).toBe("fulfillment");
    expect(live.band).toBe("fulfillment");
  });

  it("clamps score to 0–100", () => {
    const result = scoreLead(
      baseLead({
        email: undefined,
        phone: "",
        address: undefined,
        dataSource: "demo_catalog",
        recommendedTier: "complete",
        category: "trades",
        stage: "discovered",
      }),
      NOW,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
  it("boosts leads who opened the preview after outreach", () => {
    const opened = scoreLead(
      baseLead({
        stage: "outreach_sent",
        outreachStep: 1,
        lastOutreachAt: "2026-07-01T00:00:00.000Z",
        lastPreviewOpenAt: "2026-07-10T00:00:00.000Z",
        dataSource: "csv_import",
      }),
      NOW,
    );
    const silent = scoreLead(
      baseLead({
        slug: "silent",
        stage: "outreach_sent",
        outreachStep: 1,
        lastOutreachAt: "2026-07-01T00:00:00.000Z",
        dataSource: "csv_import",
      }),
      NOW,
    );
    expect(opened.factors.some((f) => f.id === "preview_opened")).toBe(true);
    expect(silent.factors.some((f) => f.id === "never_opened")).toBe(true);
    expect(opened.score).toBeGreaterThan(silent.score);
  });

  it("boosts abandoned checkout above preview-open and follow-up-due peers", () => {
    // Use trades/starter + missing phone/address so scores stay under the 100 clamp
    // and the abandoned-checkout delta is visible as a strict inequality.
    const coldBase = {
      category: "trades" as const,
      recommendedTier: "starter" as const,
      phone: "",
      address: undefined,
      dataSource: "csv_import" as const,
      stage: "outreach_sent" as const,
      outreachStep: 1 as const,
    };
    const sessions = [openCheckout()];
    const abandoned = scoreLead(baseLead({ ...coldBase }), NOW, {
      openCheckoutSessions: sessions,
    });
    const openedOnly = scoreLead(
      baseLead({
        ...coldBase,
        slug: "opened-only",
        lastOutreachAt: "2026-07-01T00:00:00.000Z",
        lastPreviewOpenAt: "2026-07-10T00:00:00.000Z",
      }),
      NOW,
    );
    const followUpDue = scoreLead(
      baseLead({
        ...coldBase,
        slug: "follow-up",
        lastOutreachAt: "2026-07-01T00:00:00.000Z",
      }),
      NOW,
    );
    expect(abandoned.factors.some((f) => f.id === "abandoned_checkout")).toBe(true);
    expect(abandoned.factors.some((f) => f.id === "checkout_recovery_due")).toBe(true);
    expect(abandoned.score).toBeLessThan(100);
    expect(abandoned.score).toBeGreaterThan(openedOnly.score);
    expect(abandoned.score).toBeGreaterThan(followUpDue.score);
  });

  it("ignores abandoned checkout signal for paid/live leads", () => {
    const sessions = [openCheckout({ leadSlug: "paid-lead" })];
    const paid = scoreLead(
      baseLead({ slug: "paid-lead", stage: "paid" }),
      NOW,
      { openCheckoutSessions: sessions },
    );
    expect(paid.factors.some((f) => f.id === "abandoned_checkout")).toBe(false);
    expect(paid.actionable).toBe(false);
  });

  it("does not boost sessions that are still within the abandon window", () => {
    const fresh = openCheckout({ createdAt: "2026-07-11T23:30:00.000Z" }); // 30m ago
    const result = scoreLead(baseLead(), NOW, { openCheckoutSessions: [fresh] });
    expect(result.factors.some((f) => f.id === "abandoned_checkout")).toBe(false);
  });
});

describe("rankLeadsForOutreach", () => {
  it("returns highest scores first and skips paid/live", () => {
    const leads: Lead[] = [
      baseLead({ slug: "a-cold", email: undefined, stage: "discovered" }),
      baseLead({
        slug: "b-hot",
        stage: "discovery_call",
        outreachStep: 1,
        lastOutreachAt: "2026-07-01T00:00:00.000Z",
        dataSource: "csv_import",
      }),
      baseLead({ slug: "c-paid", stage: "paid" }),
      baseLead({ slug: "d-ready", stage: "site_built", dataSource: "manual_entry" }),
    ];
    const ranked = rankLeadsForOutreach(leads, NOW, 10);
    expect(ranked.map((r) => r.slug)).toEqual(["b-hot", "d-ready", "a-cold"]);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(ranked[1]?.score ?? 0);
  });

  it("respects limit", () => {
    const leads = Array.from({ length: 5 }, (_, i) =>
      baseLead({ slug: `lead-${i}`, email: `a${i}@example.com` }),
    );
    expect(rankLeadsForOutreach(leads, NOW, 2)).toHaveLength(2);
  });

  it("ranks abandoned-checkout leads first when sessions are provided", () => {
    const leads: Lead[] = [
      baseLead({
        slug: "follow-up-lead",
        stage: "outreach_sent",
        outreachStep: 1,
        lastOutreachAt: "2026-07-01T00:00:00.000Z",
        dataSource: "csv_import",
      }),
      baseLead({
        slug: "cart-lead",
        stage: "outreach_sent",
        outreachStep: 1,
        lastOutreachAt: "2026-07-08T00:00:00.000Z",
        dataSource: "csv_import",
      }),
    ];
    const ranked = rankLeadsForOutreach(leads, NOW, 5, {
      openCheckoutSessions: [openCheckout({ leadSlug: "cart-lead" })],
    });
    expect(ranked[0]?.slug).toBe("cart-lead");
    expect(ranked[0]?.factors.some((f) => f.id === "abandoned_checkout")).toBe(true);
  });
});

describe("band helpers", () => {
  it("maps bands to labels", () => {
    expect(qualityBandLabel("hot")).toBe("Hot");
    expect(qualityBandLabel("blocked")).toBe("Blocked");
  });

  it("bandForScore prefers fulfillment and blocked", () => {
    expect(bandForScore(90, "paid", false)).toBe("fulfillment");
    expect(bandForScore(90, "site_built", true)).toBe("blocked");
    expect(bandForScore(85, "site_built", false)).toBe("hot");
  });
});
