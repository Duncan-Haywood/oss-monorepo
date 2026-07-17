import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  bestMarketingOrderTier,
  contentTypeLabel,
  isMarketingBundleTier,
  leadEligibleForMarketingPack,
  leadNeedsMarketingPackForMonth,
  listMarketingPacksDue,
  marketingMonthKey,
  marketingMonthStartMs,
  MONTHLY_MARKETING_PACK_TYPES,
  oldestMarketingPacksDueAgeHours,
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

  it("rejects Growth/Complete orders after recurringCanceledAt", () => {
    expect(
      leadEligibleForMarketingPack(baseLead({ stage: "paid" }), [
        { tier: "growth", recurringCanceledAt: 1_720_000_000_000 },
      ]),
    ).toBe(false);
    expect(
      leadEligibleForMarketingPack(baseLead({ stage: "paid" }), [
        { tier: "growth", recurringCanceledAt: 1_720_000_000_000 },
        { tier: "complete" },
      ]),
    ).toBe(true);
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

  it("bestMarketingOrderTier ignores paused/canceled Complete over active Growth", () => {
    expect(
      bestMarketingOrderTier([
        { tier: "complete", recurringCanceledAt: 1_720_000_000_000 },
        { tier: "growth" },
      ]),
    ).toBe("growth");
    expect(
      bestMarketingOrderTier([
        { tier: "complete", recurringCanceledAt: 1_720_000_000_000 },
        { tier: "growth", recurringCanceledAt: 1_720_000_000_000 },
      ]),
    ).toBeNull();
    expect(
      bestMarketingOrderTier([
        { tier: "growth", recurringCanceledAt: 1_720_000_000_000 },
        { tier: "complete" },
      ]),
    ).toBe("complete");
  });
});

describe("listMarketingPacksDue", () => {
  const month = "2026-07";

  it("includes eligible leads without a pack for the month", () => {
    const paid = baseLead({ slug: "needs-pack", stage: "paid" });
    const live = baseLead({ slug: "has-pack", stage: "live" });
    const starter = baseLead({ slug: "starter-only", stage: "paid" });
    const due = listMarketingPacksDue(
      [paid, live, starter],
      [
        { leadSlug: "needs-pack", tier: "growth" },
        { leadSlug: "has-pack", tier: "complete" },
        { leadSlug: "starter-only", tier: "starter" },
      ],
      [{ leadSlug: "has-pack", yearMonth: month }],
      month,
    );
    expect(due.map((l) => l.slug)).toEqual(["needs-pack"]);
  });

  it("leadNeedsMarketingPackForMonth is false when pack exists", () => {
    expect(
      leadNeedsMarketingPackForMonth(
        baseLead({ slug: "pine-cafe", stage: "paid" }),
        [{ tier: "growth" }],
        [{ leadSlug: "pine-cafe", yearMonth: month }],
        month,
      ),
    ).toBe(false);
  });

  it("truncating packs to newest N invents false due for an older fulfilled lead", () => {
    const fulfilledOld = baseLead({ slug: "old-fulfilled", stage: "paid" });
    const filler = Array.from({ length: 5 }, (_, i) =>
      baseLead({ slug: `filler-${i}`, stage: "paid" }),
    );
    const orders = [
      { leadSlug: "old-fulfilled", tier: "growth" as const },
      ...filler.map((l) => ({ leadSlug: l.slug, tier: "growth" as const })),
    ];
    const fullPacks = [
      { leadSlug: "old-fulfilled", yearMonth: month },
      ...filler.map((l) => ({ leadSlug: l.slug, yearMonth: month })),
    ];
    // Simulate listMarketingPacksForMonth's old 100/200 newest cap dropping the
    // older fulfilled row while filler packs remain.
    const truncatedPacks = fullPacks.filter((p) => p.leadSlug !== "old-fulfilled");

    expect(
      listMarketingPacksDue([fulfilledOld, ...filler], orders, fullPacks, month).map(
        (l) => l.slug,
      ),
    ).toEqual([]);
    expect(
      listMarketingPacksDue(
        [fulfilledOld, ...filler],
        orders,
        truncatedPacks,
        month,
      ).map((l) => l.slug),
    ).toEqual(["old-fulfilled"]);
  });
});

describe("marketingMonthStartMs", () => {
  it("returns the first UTC instant of the month", () => {
    expect(marketingMonthStartMs("2026-07")).toBe(Date.UTC(2026, 6, 1, 0, 0, 0));
    expect(marketingMonthStartMs("2026-01")).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
  });

  it("rejects a malformed yearMonth", () => {
    expect(() => marketingMonthStartMs("2026-7")).toThrow(/invalid yearMonth/);
    expect(() => marketingMonthStartMs("not-a-month")).toThrow(/invalid yearMonth/);
  });
});

describe("oldestMarketingPacksDueAgeHours", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const month = "2026-07";
  const monthStartMs = Date.UTC(2026, 6, 1, 0, 0, 0);
  const NOW = monthStartMs + 10 * HOUR_MS;

  it("returns null for no candidates", () => {
    expect(oldestMarketingPacksDueAgeHours([], [], month, NOW)).toBeNull();
  });

  it("anchors to month start for a long-time subscriber", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "growth",
        // Subscribed long before this month — due-since is still month start,
        // not their original signup, so the age doesn't grow unbounded forever.
        createdAt: new Date(monthStartMs - 999 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestMarketingPacksDueAgeHours(candidates, orders, month, NOW)).toBe(10);
  });

  it("anchors to the order's createdAt for a mid-month signup", () => {
    const candidates = [{ slug: "beta" }];
    const orders = [
      {
        leadSlug: "beta",
        tier: "complete",
        createdAt: new Date(monthStartMs + 6 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestMarketingPacksDueAgeHours(candidates, orders, month, NOW)).toBe(4);
  });

  it("ignores non-candidates, paused entitlement, and unparseable orders", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      { leadSlug: "gamma", tier: "growth", createdAt: new Date(monthStartMs).toISOString() },
      {
        leadSlug: "alpha",
        tier: "growth",
        recurringCanceledAt: monthStartMs,
        createdAt: new Date(monthStartMs).toISOString(),
      },
      { leadSlug: "alpha", tier: "growth", createdAt: "not-a-date" },
    ];
    expect(oldestMarketingPacksDueAgeHours(candidates, orders, month, NOW)).toBeNull();
  });

  it("clamps to 0 when nowMs is before the due-since instant", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "growth",
        createdAt: new Date(monthStartMs + 2 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestMarketingPacksDueAgeHours(candidates, orders, month, monthStartMs)).toBe(0);
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
