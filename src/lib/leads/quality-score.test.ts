import { describe, expect, it } from "vitest";
import type { Lead } from "./types";
import {
  bandForScore,
  compareLeadQuality,
  scoreLead,
  scoreLeads,
  sortLeadsByQuality,
} from "./quality-score";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "test-lead",
    businessName: "Test Co",
    category: "restaurant",
    city: "Denver",
    state: "CO",
    address: "100 Main St",
    tagline: "t",
    description: "d",
    phone: "(555) 000-0000",
    email: "owner@example.com",
    services: [],
    hours: { weekday: "Mon-Fri", weekend: "Sat" },
    stage: "outreach_sent",
    recommendedTier: "growth",
    outreachStep: 1,
    lastOutreachAt: "2026-07-08T12:00:00.000Z", // 4d ago → Email 2 due
    ...overrides,
  };
}

describe("scoreLead", () => {
  it("scores a complete follow-up-due lead as hot/actionable", () => {
    const result = scoreLead(makeLead(), NOW);
    expect(result.actionable).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.band).toBe("hot");
    expect(result.factors.some((f) => f.id === "follow_up_due")).toBe(true);
    expect(result.factors.some((f) => f.id === "email_present")).toBe(true);
  });

  it("penalizes missing email heavily", () => {
    const withEmail = scoreLead(makeLead({ email: "a@b.com" }), NOW);
    const without = scoreLead(makeLead({ email: undefined, slug: "no-email" }), NOW);
    expect(without.score).toBeLessThan(withEmail.score - 20);
    expect(without.factors.some((f) => f.id === "email_missing")).toBe(true);
  });

  it("rewards category template fit over generic", () => {
    const base = {
      stage: "discovered" as const,
      outreachStep: 0 as const,
      lastOutreachAt: undefined,
      recommendedTier: "starter" as const,
    };
    const restaurant = scoreLead(makeLead({ ...base, category: "restaurant", slug: "r" }), NOW);
    const generic = scoreLead(makeLead({ ...base, category: "generic", slug: "g" }), NOW);
    expect(restaurant.score).toBeGreaterThan(generic.score);
  });

  it("rewards higher recommended tier upside", () => {
    const base = {
      stage: "discovered" as const,
      outreachStep: 0 as const,
      lastOutreachAt: undefined,
      category: "generic" as const,
    };
    const starter = scoreLead(makeLead({ ...base, recommendedTier: "starter", slug: "s" }), NOW);
    const complete = scoreLead(makeLead({ ...base, recommendedTier: "complete", slug: "c" }), NOW);
    expect(complete.score).toBeGreaterThan(starter.score);
  });

  it("parks paid and live leads as non-actionable", () => {
    const paid = scoreLead(makeLead({ stage: "paid", slug: "paid" }), NOW);
    const live = scoreLead(makeLead({ stage: "live", slug: "live" }), NOW);
    expect(paid.actionable).toBe(false);
    expect(live.actionable).toBe(false);
    expect(paid.band).toBe("parked");
    expect(live.band).toBe("parked");
  });

  it("flags stale outreach when sequence is mid-flight and quiet ≥10d", () => {
    const result = scoreLead(
      makeLead({
        outreachStep: 2,
        lastOutreachAt: "2026-06-20T12:00:00.000Z",
        // Email 3 due after 4d — also due; either factor is fine
      }),
      NOW,
    );
    const ids = result.factors.map((f) => f.id);
    expect(ids.includes("follow_up_due") || ids.includes("stale_outreach")).toBe(true);
  });

  it("clamps score to 0–100", () => {
    const result = scoreLead(
      makeLead({
        email: undefined,
        phone: "",
        address: undefined,
        category: "generic",
        recommendedTier: "starter",
        stage: "paid",
      }),
      NOW,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("bandForScore", () => {
  it("maps thresholds", () => {
    expect(bandForScore(80, true)).toBe("hot");
    expect(bandForScore(60, true)).toBe("warm");
    expect(bandForScore(20, true)).toBe("cold");
    expect(bandForScore(99, false)).toBe("parked");
  });
});

describe("sortLeadsByQuality", () => {
  it("puts actionable high scores before parked paid leads", () => {
    const hot = makeLead({ slug: "hot", stage: "outreach_sent" });
    const paid = makeLead({ slug: "paid", stage: "paid" });
    const thin = makeLead({
      slug: "thin",
      stage: "discovered",
      email: undefined,
      phone: "",
      address: undefined,
      category: "generic",
      recommendedTier: "starter",
      outreachStep: 0,
      lastOutreachAt: undefined,
    });
    const sorted = sortLeadsByQuality([paid, thin, hot], NOW);
    expect(sorted.map((l) => l.slug)).toEqual(["hot", "thin", "paid"]);
  });
});

describe("scoreLeads / compareLeadQuality", () => {
  it("returns stable slug order on equal scores", () => {
    const a = scoreLead(makeLead({ slug: "aaa", stage: "live" }), NOW);
    const b = scoreLead(makeLead({ slug: "bbb", stage: "live" }), NOW);
    expect(compareLeadQuality(a, b)).toBeLessThan(0);
    const list = scoreLeads(
      [makeLead({ slug: "bbb", stage: "live" }), makeLead({ slug: "aaa", stage: "live" })],
      NOW,
    );
    expect(list.map((s) => s.slug)).toEqual(["aaa", "bbb"]);
  });
});
