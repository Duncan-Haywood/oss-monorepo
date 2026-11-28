import {
  buildPricingModels,
  type PricingOrderInput,
  priceForProfit,
  quotePrice,
} from "@shared/pricing";
import { describe, expect, it } from "vitest";

const order = (o: Partial<PricingOrderInput>): PricingOrderInput => ({
  platform: "ebay",
  itemCents: 0,
  shippingChargedCents: 0,
  shippingLabelCents: 0,
  feesCents: 0,
  ...o,
});

const build = (
  orders: PricingOrderInput[],
  charges = [] as { platform: string; kind: string; amountCents: number }[],
) => buildPricingModels({ from: "2026-01-01", to: "2026-12-31", orders, charges });

describe("buildPricingModels", () => {
  it("fits a fixed part and a percent when the fees are 30¢ + 13% of the price", () => {
    // Prices $10, $20, $40, $50, $80: fees 30 + 13% each, exactly.
    const prices = [1000, 2000, 4000, 5000, 8000];
    const r = build(prices.map((p) => order({ itemCents: p, feesCents: 30 + 0.13 * p })));
    const m = r.platforms[0];
    expect(m?.model).toBe("fit");
    expect(m?.fixedCents).toBe(30);
    expect(m?.percent).toBeCloseTo(0.13, 10);
    expect(m?.typicalMissCents).toBe(0);
    expect(m?.orders).toBe(5);
  });

  it("falls back to fees ÷ item price below five orders", () => {
    const r = build([
      order({ itemCents: 2000, feesCents: 300 }),
      order({ itemCents: 6000, feesCents: 700 }),
    ]);
    const m = r.platforms[0];
    expect(m?.model).toBe("ratio");
    expect(m?.fixedCents).toBe(0);
    expect(m?.percent).toBeCloseTo(1000 / 8000, 10);
  });

  it("falls back when every order has the same price (fixed and percent cannot be told apart)", () => {
    const r = build(Array.from({ length: 6 }, () => order({ itemCents: 2500, feesCents: 400 })));
    expect(r.platforms[0]?.model).toBe("ratio");
    expect(r.platforms[0]?.percent).toBeCloseTo(0.16, 10);
  });

  it("falls back when the fit's fixed part comes out negative", () => {
    // Fees grow faster than the price: the line through them crosses zero above $0.
    const r = build(
      [1000, 2000, 3000, 4000, 5000].map((p) => order({ itemCents: p, feesCents: 0.2 * p - 100 })),
    );
    expect(r.platforms[0]?.model).toBe("ratio");
    expect(r.platforms[0]?.fixedCents).toBe(0);
  });

  it("counts net postage, ads as a rate and leaves subscriptions and refunds' zero prices out", () => {
    const r = build(
      [
        order({
          itemCents: 4000,
          feesCents: 520,
          shippingChargedCents: 500,
          shippingLabelCents: 0,
        }),
        order({ itemCents: 6000, feesCents: 780, shippingChargedCents: 0, shippingLabelCents: 0 }),
        order({ itemCents: 0, feesCents: -50 }), // a refund-like row with no price is not an order here
      ],
      [
        { platform: "ebay", kind: "shipping_label", amountCents: 1300 }, // two labels bought apart
        { platform: "ebay", kind: "advertising", amountCents: 300 },
        { platform: "ebay", kind: "subscription", amountCents: 2195 },
      ],
    );
    const m = r.platforms[0];
    expect(m?.orders).toBe(2);
    expect(m?.postageCents).toBe(1300);
    // (1300 postage − 500 the buyers paid) ÷ 2 orders.
    expect(m?.netPostageCents).toBe(400);
    expect(m?.otherRate).toBeCloseTo(300 / 10000, 10);
    expect(m?.effectiveRate).toBeCloseTo((1300 + 300) / 10000, 10);
  });

  it("sorts platforms by orders and warns about fee-less platforms and charges with no orders", () => {
    const r = build(
      [
        order({ platform: "poshmark", itemCents: 3000, feesCents: 600 }),
        order({ platform: "direct", itemCents: 2000 }),
        order({ platform: "direct", itemCents: 1500 }),
      ],
      [{ platform: "mercari", kind: "advertising", amountCents: 200 }],
    );
    expect(r.platforms.map((p) => p.platform)).toEqual(["direct", "poshmark"]);
    expect(r.warnings.some((w) => w.startsWith("Direct sales: no fees"))).toBe(true);
    expect(r.warnings.some((w) => w.startsWith("Mercari: charges with no orders"))).toBe(true);
  });
});

describe("quotePrice and priceForProfit", () => {
  const models = build(
    [1000, 2000, 4000, 5000, 8000].map((p) =>
      order({ itemCents: p, feesCents: 30 + 0.13 * p, shippingLabelCents: 500 }),
    ),
  );
  const first = models.platforms[0];
  if (!first) throw new Error("no model");
  const m = first;

  it("nets a $30 price: $30 − (30¢ + $3.90) − $5 postage = $20.80", () => {
    const q = quotePrice(m, 3000, 1000);
    expect(q.feesCents).toBe(420);
    expect(q.netPostageCents).toBe(500);
    expect(q.netCents).toBe(2080);
    expect(q.profitCents).toBe(1080);
    expect(q.margin).toBeCloseTo(1080 / 3000, 10);
  });

  it("finds the lowest price for a $15 profit on a $10 item", () => {
    // (1500 + 1000 + 30 + 500) ÷ 0.87 = 3482.76 → 3483; check the cents either side.
    const p = priceForProfit(m, 1000, 1500) ?? -1;
    expect(p).toBe(3483);
    expect(quotePrice(m, p, 1000).profitCents).toBeGreaterThanOrEqual(1500);
    expect(quotePrice(m, p - 1, 1000).profitCents).toBeLessThan(1500);
  });

  it("returns null when fees take the whole price", () => {
    expect(priceForProfit({ ...m, percent: 0.7, otherRate: 0.3 }, 1000, 500)).toBeNull();
  });

  it("never asks for a negative price when buyers' shipping more than covers everything", () => {
    expect(priceForProfit({ ...m, fixedCents: 0, netPostageCents: -2000 }, 0, 0)).toBe(0);
  });
});
