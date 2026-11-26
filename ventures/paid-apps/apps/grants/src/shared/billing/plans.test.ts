import { describe, expect, it } from "vitest";
import {
  applicationCostEstimate,
  merchantFeeMicros,
  monthlyCost,
  STAGE_TOKENS,
} from "./cost-model";
import {
  checkoutPriceKey,
  MAX_MARKUP,
  MIN_MARGIN,
  MIN_MARKUP,
  PAID_PLAN_KEYS,
  PLANS,
  parseCheckoutPriceKey,
  planMarkup,
  planMonthlyCost,
} from "./plans";

describe("plan margin floor (at least 40% over the fully loaded cost at full allowance)", () => {
  for (const key of PAID_PLAN_KEYS) {
    const plan = PLANS[key];
    it(`${key}: monthly billing is within the band`, () => {
      const m = planMarkup(plan, "month");
      expect(m).toBeGreaterThanOrEqual(MIN_MARKUP);
      expect(m).toBeLessThanOrEqual(MAX_MARKUP);
    });
    it(`${key}: annual billing is within the band`, () => {
      expect(plan.annualPriceCents).not.toBeNull();
      const m = planMarkup(plan, "year");
      expect(m).toBeGreaterThanOrEqual(MIN_MARKUP);
      expect(m).toBeLessThanOrEqual(MAX_MARKUP);
    });
    it(`${key}: includes at least one drafted application`, () => {
      expect(plan.includedApplicationDrafts).toBeGreaterThanOrEqual(1);
    });
  }

  it("tiers are monotonic: more money buys more drafts, at a lower per-draft price", () => {
    const [s, st, p] = PAID_PLAN_KEYS.map((k) => PLANS[k]);
    if (!s || !st || !p) throw new Error("missing plan");
    expect(s.priceCents).toBeLessThan(st.priceCents);
    expect(st.priceCents).toBeLessThan(p.priceCents);
    expect(s.includedApplicationDrafts).toBeLessThan(st.includedApplicationDrafts);
    expect(st.includedApplicationDrafts).toBeLessThan(p.includedApplicationDrafts);
    const perDraft = (x: typeof s) => x.priceCents / x.includedApplicationDrafts;
    expect(perDraft(st)).toBeLessThanOrEqual(perDraft(s));
    expect(perDraft(p)).toBeLessThanOrEqual(perDraft(st));
  });

  it("prices are $10 / $29 / $149, set for the 2026-11-24 40–60% margin goal", () => {
    expect(PLANS.starter.priceCents).toBe(1_000);
    expect(PLANS.standard.priceCents).toBe(2_900);
    expect(PLANS.pro.priceCents).toBe(14_900);
  });

  it("drafts are 5 / 20 / 120, within what the cost model allows at a 50% margin", () => {
    expect(PAID_PLAN_KEYS.map((k) => PLANS[k].includedApplicationDrafts)).toEqual([5, 20, 120]);
  });

  it("every paid plan clears the 40% floor and lands near the 50% quota margin or above", () => {
    for (const key of PAID_PLAN_KEYS) {
      for (const interval of ["month", "year"] as const) {
        const margin = 1 - 1 / planMarkup(PLANS[key], interval);
        expect(margin).toBeGreaterThanOrEqual(MIN_MARGIN);
        expect(margin).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it("comp is free, not purchasable and more generous than starter", () => {
    expect(PLANS.comp.priceCents).toBe(0);
    expect(PLANS.comp.purchasable).toBe(false);
    expect(PLANS.comp.includedApplicationDrafts).toBeGreaterThan(
      PLANS.standard.includedApplicationDrafts,
    );
  });
});

describe("cost model", () => {
  it("prices a typical application from per-stage token estimates", () => {
    const est = applicationCostEstimate();
    expect(est.lines.map((l) => l.purpose)).toEqual([
      "requirements.parse",
      "drafting.section",
      "drafting.summary",
      "grounding.verify",
    ]);
    // Sanity: on the default model (Haiku 5.5) a drafted, independently verified application costs
    // between 1¢ and 25¢; on Opus 5.5 between $0.25 and $5.
    expect(est.totalMicros).toBeGreaterThan(10_000);
    expect(est.totalMicros).toBeLessThan(250_000);
    const opus = applicationCostEstimate("claude-opus-5-5").totalMicros;
    expect(opus).toBeGreaterThan(250_000);
    expect(opus).toBeLessThan(5_000_000);
  });

  it("cached section drafts are cheaper than the first (cache-writing) draft", () => {
    const est = applicationCostEstimate("claude-opus-5-5", { sections: 1, revisionFactor: 1 });
    const est6 = applicationCostEstimate("claude-opus-5-5", { sections: 6, revisionFactor: 1 });
    const first = est.lines[1]?.costMicros ?? 0;
    const six = est6.lines[1]?.costMicros ?? 0;
    expect((six - first) / 5).toBeLessThan(first);
    expect(STAGE_TOKENS.sectionDraftCached.cacheReadTokens).toBeGreaterThan(0);
  });

  it("MoR fee is 5% + $0.50 per charge; annual billing spreads it over 12 months", () => {
    expect(merchantFeeMicros(500)).toBe(750_000);
    expect(merchantFeeMicros(0)).toBe(0);
    const allowance = {
      applicationDrafts: 1,
      opportunityScores: 0,
      documentPages: 0,
      interviewTurns: 0,
    };
    const monthly = monthlyCost(allowance, { cents: 500, interval: "month" });
    const annual = monthlyCost(allowance, { cents: 5_400, interval: "year" });
    expect(annual.merchantFeeMicros).toBeLessThan(monthly.merchantFeeMicros);
  });

  it("plan cost breakdown sums to its total", () => {
    const c = planMonthlyCost(PLANS.standard);
    expect(c.llmMicros + c.hostingMicros + c.merchantFeeMicros + c.refundReserveMicros).toBe(
      c.totalMicros,
    );
  });
});

describe("checkout price keys", () => {
  it("round-trips plan + interval", () => {
    expect(parseCheckoutPriceKey(checkoutPriceKey("starter", "year"))).toEqual({
      planKey: "starter",
      interval: "year",
    });
    expect(parseCheckoutPriceKey("pro")).toEqual({ planKey: "pro", interval: "month" });
    expect(parseCheckoutPriceKey("comp")).toBeNull();
    expect(parseCheckoutPriceKey("pro:weekly")).toBeNull();
  });
});
