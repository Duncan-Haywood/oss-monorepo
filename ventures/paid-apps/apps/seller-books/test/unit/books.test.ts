import { allocateLotCost } from "@worker/services/books/lots";
import { buildPnl, type PnlSaleInput } from "@worker/services/books/pnl";
import { buildScheduleC, type ScInput } from "@worker/services/books/schedule-c";
import { totalMiles } from "@worker/services/books/service";
import { describe, expect, it } from "vitest";

describe("allocateLotCost", () => {
  it("splits evenly and gives leftover cents to the first items", () => {
    const r = allocateLotCost(1000, [
      { id: "a", manualCostCents: null },
      { id: "b", manualCostCents: null },
      { id: "c", manualCostCents: null },
    ]);
    expect([...r.costs.values()]).toEqual([334, 333, 333]);
    expect(r.unallocatedCents).toBe(0);
  });
  it("keeps typed-in costs and spreads the rest", () => {
    const r = allocateLotCost(5000, [
      { id: "a", manualCostCents: 2000 },
      { id: "b", manualCostCents: null },
      { id: "c", manualCostCents: null },
    ]);
    expect(Object.fromEntries(r.costs)).toEqual({ a: 2000, b: 1500, c: 1500 });
  });
  it("always adds back up to the lot total", () => {
    for (const total of [0, 1, 99, 100, 12345, 999_999]) {
      for (let n = 1; n <= 7; n++) {
        const items = Array.from({ length: n }, (_, i) => ({ id: `i${i}`, manualCostCents: null }));
        const r = allocateLotCost(total, items);
        expect([...r.costs.values()].reduce((s, v) => s + v, 0)).toBe(total);
      }
    }
  });
  it("reports cost that no item carries", () => {
    expect(allocateLotCost(800, []).unallocatedCents).toBe(800);
    const short = allocateLotCost(800, [{ id: "a", manualCostCents: 300 }]);
    expect(short.unallocatedCents).toBe(500);
    expect(short.warnings[0]).toMatch(/less than the lot cost/);
    const over = allocateLotCost(800, [
      { id: "a", manualCostCents: 900 },
      { id: "b", manualCostCents: null },
    ]);
    expect(over.costs.get("b")).toBe(0);
    expect(over.warnings[0]).toMatch(/more than the lot cost/);
  });
  it("rejects fractional cents", () => expect(() => allocateLotCost(1.5, [])).toThrow());
});

const order = (o: Partial<PnlSaleInput>): PnlSaleInput => ({
  platform: "ebay",
  kind: "order",
  date: "2026-01-10",
  itemCents: 0,
  shippingChargedCents: 0,
  salesTaxCents: 0,
  refundCents: 0,
  shippingLabelCents: 0,
  fees: [],
  cogsCents: null,
  ...o,
});

describe("buildPnl", () => {
  const report = buildPnl("2026-01-01", "2026-02-28", {
    sales: [
      order({
        itemCents: 4000,
        shippingChargedCents: 500,
        salesTaxCents: 330,
        shippingLabelCents: 0,
        fees: [
          { kind: "final_value", amountCents: 594 },
          { kind: "per_order", amountCents: 40 },
        ],
        cogsCents: 800,
      }),
      order({
        date: "2026-01-20",
        itemCents: 2000,
        fees: [{ kind: "final_value", amountCents: 260 }],
      }),
      order({
        platform: "poshmark",
        date: "2026-02-03",
        itemCents: 3000,
        shippingLabelCents: 199,
        fees: [{ kind: "marketplace_fee", amountCents: 600 }],
        cogsCents: 500,
      }),
      order({
        kind: "refund",
        date: "2026-02-02",
        refundCents: 4500,
        fees: [{ kind: "final_value", amountCents: -594 }],
      }),
      order({ date: "2026-03-01", itemCents: 99999 }), // outside the range
    ],
    charges: [
      { platform: "ebay", date: "2026-01-06", kind: "shipping_label", amountCents: 875 },
      { platform: "ebay", date: "2026-01-31", kind: "advertising", amountCents: 1240 },
      { platform: "ebay", date: "2026-02-01", kind: "subscription", amountCents: 2195 },
    ],
    expenses: [
      { platform: null, date: "2026-01-15", amountCents: 1500 },
      { platform: "poshmark", date: "2026-02-10", amountCents: 300 },
    ],
  });

  const cell = (platform: string, month: string) =>
    report.cells.find((c) => c.platform === platform && c.month === month);

  it("computes one platform-month exactly", () => {
    expect(cell("ebay", "2026-01")).toMatchObject({
      orders: 2,
      ordersWithoutCost: 1,
      itemSalesCents: 6000,
      shippingChargedCents: 500,
      revenueCents: 6500,
      feesCents: 594 + 40 + 260 + 1240,
      feesByKind: { final_value: 854, per_order: 40, advertising: 1240 },
      postageCents: 875,
      cogsCents: 800,
      grossProfitCents: 6500 - 2134 - 875 - 800,
      expensesCents: 0,
      salesTaxCollectedCents: 330,
    });
  });

  it("books refunds and fee credits in the month they happen", () => {
    expect(cell("ebay", "2026-02")).toMatchObject({
      refundsCents: 4500,
      revenueCents: -4500,
      feesCents: -594,
      expensesCents: 2195,
      netProfitCents: -4500 + 594 - 2195,
    });
  });

  it("puts expenses without a platform in a general row", () => {
    expect(cell("general", "2026-01")).toMatchObject({
      expensesCents: 1500,
      netProfitCents: -1500,
    });
    expect(cell("poshmark", "2026-02")?.netProfitCents).toBe(3000 - 600 - 199 - 500 - 300);
  });

  it("totals equal the sum of the cells, by platform and by month", () => {
    const sum = (k: "netProfitCents" | "revenueCents" | "feesCents") =>
      report.cells.reduce((s, c) => s + c[k], 0);
    for (const k of ["netProfitCents", "revenueCents", "feesCents"] as const) {
      expect(report.total[k]).toBe(sum(k));
      expect(report.byPlatform.reduce((s, c) => s + c[k], 0)).toBe(sum(k));
      expect(report.byMonth.reduce((s, c) => s + c[k], 0)).toBe(sum(k));
    }
    expect(report.total.itemSalesCents).toBe(9000);
    expect(report.byMonth.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
  });
});

describe("buildScheduleC", () => {
  const base: ScInput = {
    year: 2026,
    sales: [
      {
        kind: "order",
        date: "2026-01-05",
        itemCents: 10000,
        shippingChargedCents: 1000,
        refundCents: 0,
        shippingLabelCents: 700,
        fees: [
          { kind: "final_value", amountCents: 1400 },
          { kind: "advertising", amountCents: 300 },
        ],
      },
      {
        kind: "refund",
        date: "2026-02-01",
        itemCents: 0,
        shippingChargedCents: 0,
        refundCents: 2500,
        shippingLabelCents: 0,
        fees: [{ kind: "final_value", amountCents: -200 }],
      },
      {
        kind: "order",
        date: "2025-12-31",
        itemCents: 99999,
        shippingChargedCents: 0,
        refundCents: 0,
        shippingLabelCents: 0,
        fees: [],
      },
    ],
    charges: [
      { date: "2026-03-01", kind: "shipping_label", amountCents: 500 },
      { date: "2026-03-01", kind: "listing", amountCents: 20 },
      { date: "2026-03-01", kind: "subscription", amountCents: 2195 },
    ],
    expenses: [
      { date: "2026-04-01", category: "supplies", amountCents: 4000 },
      { date: "2026-04-02", category: "meals", amountCents: 3001 },
      { date: "2026-04-03", category: "shipping_postage", amountCents: 100 },
    ],
    items: [
      // On hand at the start, sold this year.
      { acquiredDate: "2025-06-01", costCents: 1000, status: "sold", disposedDate: "2026-01-05" },
      // On hand at start and end.
      { acquiredDate: "2025-07-01", costCents: 2000, status: "in_stock", disposedDate: null },
      // Sold last year: not in opening inventory.
      { acquiredDate: "2025-01-01", costCents: 5000, status: "sold", disposedDate: "2025-12-31" },
      // Bought and still held.
      { acquiredDate: "2026-02-01", costCents: 3000, status: "in_stock", disposedDate: null },
      // Bought and written off this year.
      {
        acquiredDate: "2026-02-01",
        costCents: 400,
        status: "written_off",
        disposedDate: "2026-06-01",
      },
      // Bought, taken for personal use.
      {
        acquiredDate: "2026-03-01",
        costCents: 700,
        status: "personal_use",
        disposedDate: "2026-03-15",
      },
      // Bought next year: ignored.
      { acquiredDate: "2027-01-02", costCents: 9999, status: "in_stock", disposedDate: null },
    ],
    unallocatedLots: [],
    businessMiles: 100.5,
    mileageRateCents: 70,
  };
  const ws = buildScheduleC(base);
  const line = (l: string) => ws.lines.find((x) => x.line === l)?.amountCents;
  const p3 = (l: string) => ws.partIII.find((x) => x.line === l)?.amountCents;

  it("gross receipts include shipping charged, exclude other years; refunds on line 2", () => {
    expect(line("1")).toBe(11000);
    expect(line("2")).toBe(2500);
    expect(line("3")).toBe(8500);
  });

  it("Part III: 35 + 36 − 41 = 42 and equals the cost of what left inventory for business", () => {
    expect(p3("35")).toBe(3000);
    expect(p3("36")).toBe(3000 + 400 + 700 - 700);
    expect(p3("41")).toBe(2000 + 3000);
    expect(p3("42")).toBe(1000 + 400); // sold + written off
    expect(line("4")).toBe(1400);
  });

  it("maps fees, ads, postage, subscriptions, mileage and 50% meals", () => {
    expect(line("10")).toBe(1400 - 200 + 20);
    expect(line("8")).toBe(300);
    expect(line("9")).toBe(7035);
    expect(line("22")).toBe(4000);
    expect(line("24b")).toBe(1501);
    expect(ws.otherExpenses.map((o) => [o.label, o.amountCents])).toEqual([
      ["Postage and shipping labels", 700 + 500 + 100],
      ["Software and platform subscriptions", 2195],
    ]);
    expect(line("27a")).toBe(1300 + 2195);
  });

  it("line 28 is the sum of the expense lines and 29 = 7 − 28", () => {
    const expenseLines = ws.lines.filter((l) =>
      /^(8|9|10|15|17|18|20b|21|22|23|24a|24b|25|27a)$/.test(l.line),
    );
    const total = expenseLines.reduce((s, l) => s + (l.amountCents ?? 0), 0);
    expect(line("28")).toBe(total);
    expect(line("29")).toBe((line("7") ?? 0) - total);
    expect(line("7")).toBe(8500 - 1400);
  });

  it("leaves line 9 blank without a mileage rate, and says so", () => {
    const noRate = buildScheduleC({ ...base, mileageRateCents: null });
    expect(noRate.lines.find((l) => l.line === "9")?.amountCents).toBeNull();
    expect(noRate.warnings.join(" ")).toMatch(/no standard mileage rate/);
  });

  it("counts unassigned lot cost as a purchase and warns", () => {
    const w = buildScheduleC({
      ...base,
      unallocatedLots: [{ acquiredDate: "2026-05-01", cents: 1234 }],
    });
    expect(w.partIII.find((l) => l.line === "36")?.amountCents).toBe(3400 + 1234);
    expect(w.warnings.join(" ")).toMatch(/not assigned to any item/);
  });

  it("always carries the worksheet disclaimer", () => {
    expect(ws.disclaimer).toMatch(/not a tax return and not tax advice/);
  });
});

describe("totalMiles", () => {
  it("doubles round trips and keeps one decimal", () => {
    expect(
      totalMiles([
        { milesTenths: 125, roundTrip: true },
        { milesTenths: 33, roundTrip: false },
      ]),
    ).toBe(28.3);
  });
});
