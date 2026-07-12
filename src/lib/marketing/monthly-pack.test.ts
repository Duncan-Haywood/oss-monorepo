import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  bestMarketingOrderTier,
  contentTypeLabel,
  isMarketingBundleTier,
  leadEligibleForMarketingPack,
  marketingMonthKey,
  MONTHLY_MARKETING_PACK_TYPES,
} from "./monthly-pack";
import { monthlyPackRequestForLead } from "./build-request";
import {
  getMarketingGenerator,
  resetMarketingGeneratorForTests,
  StubMarketingGenerator,
} from "./generators";

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

describe("marketingMonthKey", () => {
  it("formats UTC YYYY-MM", () => {
    expect(marketingMonthKey(Date.UTC(2026, 6, 12, 15, 0, 0))).toBe("2026-07");
    expect(marketingMonthKey(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe("2026-01");
  });

  it("rejects non-finite nowMs", () => {
    expect(() => marketingMonthKey(Number.NaN)).toThrow(/finite/);
  });
});

describe("eligibility", () => {
  it("requires paid/live + growth/complete order", () => {
    expect(leadEligibleForMarketingPack(baseLead({ stage: "paid" }), [{ tier: "growth" }])).toBe(
      true,
    );
    expect(leadEligibleForMarketingPack(baseLead({ stage: "live" }), [{ tier: "complete" }])).toBe(
      true,
    );
    expect(
      leadEligibleForMarketingPack(baseLead({ stage: "paid" }), [{ tier: "starter" }]),
    ).toBe(false);
    expect(
      leadEligibleForMarketingPack(baseLead({ stage: "outreach_sent" }), [{ tier: "growth" }]),
    ).toBe(false);
  });

  it("isMarketingBundleTier", () => {
    expect(isMarketingBundleTier("growth")).toBe(true);
    expect(isMarketingBundleTier("complete")).toBe(true);
    expect(isMarketingBundleTier("starter")).toBe(false);
  });

  it("bestMarketingOrderTier prefers complete", () => {
    expect(bestMarketingOrderTier([{ tier: "growth" }, { tier: "complete" }])).toBe("complete");
    expect(bestMarketingOrderTier([{ tier: "starter" }, { tier: "growth" }])).toBe("growth");
    expect(bestMarketingOrderTier([{ tier: "starter" }])).toBeNull();
  });
});

describe("MONTHLY_MARKETING_PACK_TYPES", () => {
  it("is 8 posts + 2 emails", () => {
    expect(MONTHLY_MARKETING_PACK_TYPES).toHaveLength(10);
    const posts = MONTHLY_MARKETING_PACK_TYPES.filter(
      (t) =>
        t === "gbp_post" || t === "facebook_caption" || t === "instagram_caption",
    );
    const emails = MONTHLY_MARKETING_PACK_TYPES.filter(
      (t) => t === "email_campaign" || t === "review_request_email",
    );
    expect(posts).toHaveLength(8);
    expect(emails).toHaveLength(2);
  });
});

describe("StubMarketingGenerator", () => {
  it("returns one variant per content type", async () => {
    const gen = new StubMarketingGenerator();
    const { request } = monthlyPackRequestForLead(baseLead(), { orderTier: "growth" });
    const result = await gen.generate(request);
    expect(result.variants).toHaveLength(MONTHLY_MARKETING_PACK_TYPES.length);
    expect(result.variants[0]?.body).toContain("Pine Cafe");
    expect(result.variants[0]?.body).toContain("Boulder");
  });
});

describe("getMarketingGenerator", () => {
  it("defaults to stub when no ANTHROPIC_API_KEY", () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    resetMarketingGeneratorForTests();
    expect(getMarketingGenerator()).toBeInstanceOf(StubMarketingGenerator);
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    resetMarketingGeneratorForTests();
  });
});

describe("contentTypeLabel", () => {
  it("labels known types", () => {
    expect(contentTypeLabel("gbp_post")).toBe("GBP post");
    expect(contentTypeLabel("review_request_email")).toBe("Review-request email");
  });
});
