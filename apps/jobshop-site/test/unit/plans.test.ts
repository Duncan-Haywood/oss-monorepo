import {
  type Billing,
  deriveRfqAllowance,
  EARLY_ACCESS_PLAN,
  fullCostPerMonth,
  llmCostPerRfq,
  MARKUP_BAND,
  markup,
  PLANS,
  TARGET_MARKUP,
} from "@shared/plans";
import { describe, expect, it } from "vitest";

const BILLINGS: Billing[] = ["monthly", "annual"];

describe("proposed plans (docs/PRICING.md)", () => {
  it.each(PLANS.flatMap((p) => BILLINGS.map((b) => [p.name, b, p] as const)))(
    "%s billed %s stays inside the markup band",
    (_name, billing, plan) => {
      const m = markup(plan, billing);
      expect(m).toBeGreaterThanOrEqual(MARKUP_BAND[0]);
      expect(m).toBeLessThanOrEqual(MARKUP_BAND[1]);
    },
  );

  it("anchors the entry plan at $199 a month", () => {
    expect(PLANS[0]?.monthlyPrice).toBe(199);
  });

  it("gives every paid plan a positive allowance that grows with price", () => {
    const allowances = PLANS.map((p) => p.rfqsPerMonth);
    expect(allowances.every((n) => n > 0)).toBe(true);
    expect([...allowances].sort((a, b) => a - b)).toEqual(allowances);
    expect(allowances.every((n) => n % 25 === 0)).toBe(true);
  });

  it("derives the largest allowance that keeps the target markup", () => {
    for (const p of PLANS) {
      expect(deriveRfqAllowance(p)).toBe(p.rfqsPerMonth);
      const next = { ...p, rfqsPerMonth: p.rfqsPerMonth + 25 };
      expect(Math.min(...BILLINGS.map((b) => markup(next, b)))).toBeLessThan(TARGET_MARKUP);
    }
  });

  it("keeps the LLM estimate per RFQ under a dollar and the free tier's cost bounded", () => {
    expect(llmCostPerRfq()).toBeGreaterThan(0.1);
    expect(llmCostPerRfq()).toBeLessThan(1);
    const free = fullCostPerMonth(
      { monthlyPrice: 0, supportPerMonth: 0 },
      EARLY_ACCESS_PLAN.rfqsPerMonth,
      "monthly",
    );
    // Only the MoR fixed fee is non-zero at $0, and no charge is made; still bounded under $25.
    expect(free).toBeLessThan(25);
  });
});
