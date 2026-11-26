import { describe, expect, it } from "vitest";
import {
  customersForMrr,
  formatUsd,
  limitText,
  MAX_MARKUP,
  MIN_MARKUP,
  PAID_PLANS,
  PLANS,
  planCost,
} from "./plans";

describe("plans", () => {
  it("keeps every paid plan inside the $99-$249 range and Free at $0", () => {
    expect(PLANS[0]?.key).toBe("free");
    expect(PLANS[0]?.priceCents).toBe(0);
    for (const p of PAID_PLANS) {
      expect(p.priceCents).toBeGreaterThanOrEqual(9_900);
      expect(p.priceCents).toBeLessThanOrEqual(24_900);
    }
  });

  it("prices every paid plan inside the cost-plus band", () => {
    for (const p of PAID_PLANS) {
      const { markup } = planCost(p);
      expect(markup, p.key).toBeGreaterThanOrEqual(MIN_MARKUP);
      expect(markup, p.key).toBeLessThanOrEqual(MAX_MARKUP);
    }
  });

  it("orders plans by price, jobs and seats (null = unlimited)", () => {
    const n = (v: number | null) => v ?? Number.POSITIVE_INFINITY;
    for (let i = 1; i < PLANS.length; i++) {
      const prev = PLANS[i - 1];
      const cur = PLANS[i];
      if (!prev || !cur) throw new Error("missing plan");
      expect(cur.priceCents).toBeGreaterThan(prev.priceCents);
      expect(n(cur.activeJobs)).toBeGreaterThan(n(prev.activeJobs));
      expect(n(cur.seats)).toBeGreaterThanOrEqual(n(prev.seats));
    }
  });

  it("adds up the cost parts (Solo, as in docs/PRICING.md)", () => {
    const solo = PLANS.find((p) => p.key === "solo");
    if (!solo) throw new Error("missing plan");
    const c = planCost(solo);
    // 5% + $0.50 = $5.45; 3% = $2.97; 0.75 h x $60 = $45; $0.40 + 5 x $0.02 = $0.50; 5 GB x $0.015
    expect(c.merchantCents).toBeCloseTo(545);
    expect(c.refundReserveCents).toBeCloseTo(297);
    expect(c.supportCents).toBe(4_500);
    expect(c.hostingCents).toBe(50);
    expect(c.storageCents).toBeCloseTo(7.5);
    expect(c.totalCents).toBeCloseTo(5_399.5);
  });

  it("formats prices and limits and sizes the MRR goal", () => {
    expect(formatUsd(9_900)).toBe("$99");
    expect(formatUsd(9_950)).toBe("$99.50");
    expect(formatUsd(106_900)).toBe("$1,069");
    expect(limitText(1, "user")).toBe("1 user");
    expect(limitText(null, "active job")).toBe("unlimited active jobs");
    // $10k MRR at a 40/40/20 Solo/Crew/Company mix (blended $161).
    expect(customersForMrr(1_000_000, { solo: 0.4, crew: 0.4, company: 0.2 })).toBe(63);
  });
});
