import { allocateLotCost } from "@worker/services/books/lots";
import { buildPnl, type PnlSaleInput } from "@worker/services/books/pnl";
import { buildScheduleC, homeOfficeLine30, type ScInput } from "@worker/services/books/schedule-c";
import {
  homeOfficeThrough,
  maskFromMonths,
  monthsFromMask,
  totalMiles,
} from "@worker/services/books/service";
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

  it("splits by expected price: a $40 bin with one $200 jacket and four $5 shirts", () => {
    const r = allocateLotCost(
      4000,
      [
        { id: "jacket", manualCostCents: null, estimatedValueCents: 20000 },
        ...[1, 2, 3, 4].map((n) => ({
          id: `shirt${n}`,
          manualCostCents: null,
          estimatedValueCents: 500,
        })),
      ],
      "value",
    );
    // 40 x 200/220 = 36.3636..., 40 x 5/220 = 0.90909... each; remainders round to the shirts.
    expect(Object.fromEntries(r.costs)).toEqual({
      jacket: 3636,
      shirt1: 91,
      shirt2: 91,
      shirt3: 91,
      shirt4: 91,
    });
    expect(r.splitUsed).toBe("value");
    expect(r.warnings).toEqual([]);
  });
  it("matches the cost-of-goods guide's worked lot to the cent", () => {
    // ventures/ebay-fee-calculator/cost-of-goods-sold-for-resellers.html: $120.00 over 2 pieces at $60,
    // 8 at $20 and 10 at $5 ($330 expected) is $21.82, $7.27 and $1.82 a piece.
    const tiers = [
      ...Array.from({ length: 2 }, () => 6000),
      ...Array.from({ length: 8 }, () => 2000),
      ...Array.from({ length: 10 }, () => 500),
    ];
    const r = allocateLotCost(
      12000,
      tiers.map((v, k) => ({ id: `p${k}`, manualCostCents: null, estimatedValueCents: v })),
      "value",
    );
    const shares = [...r.costs.values()];
    expect(new Set(shares.slice(0, 2))).toEqual(new Set([2182]));
    expect(new Set(shares.slice(2, 10))).toEqual(new Set([727]));
    expect(new Set(shares.slice(10))).toEqual(new Set([182]));
    expect(shares.reduce((s, v) => s + v, 0)).toBe(12000);
  });
  it("splits by value only what typed-in costs leave", () => {
    const r = allocateLotCost(
      10000,
      [
        { id: "a", manualCostCents: 4000, estimatedValueCents: 1 },
        { id: "b", manualCostCents: null, estimatedValueCents: 3000 },
        { id: "c", manualCostCents: null, estimatedValueCents: 1000 },
      ],
      "value",
    );
    expect(Object.fromEntries(r.costs)).toEqual({ a: 4000, b: 4500, c: 1500 });
  });
  it("falls back to an even split, saying why, while an item has no expected price", () => {
    const r = allocateLotCost(
      900,
      [
        { id: "a", manualCostCents: null, estimatedValueCents: 5000 },
        { id: "b", manualCostCents: null, estimatedValueCents: null },
        { id: "c", manualCostCents: null },
      ],
      "value",
    );
    expect([...r.costs.values()]).toEqual([300, 300, 300]);
    expect(r.splitUsed).toBe("even");
    expect(r.warnings[0]).toMatch(/2 of 3 items .* have no expected price/);
  });
  it("by value always adds back up to the lot total, ties to the first items", () => {
    const tie = allocateLotCost(
      100,
      [1, 2, 3].map((n) => ({ id: `t${n}`, manualCostCents: null, estimatedValueCents: 700 })),
      "value",
    );
    expect([...tie.costs.values()]).toEqual([34, 33, 33]);
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return 1 + (seed % n);
    };
    for (const total of [0, 1, 99, 12345, 999_999, 1_000_000_000]) {
      for (let n = 1; n <= 9; n++) {
        const items = Array.from({ length: n }, (_, i) => ({
          id: `i${i}`,
          manualCostCents: null,
          estimatedValueCents: rand(1_000_000_000),
        }));
        const r = allocateLotCost(total, items, "value");
        const shares = [...r.costs.values()];
        expect(shares.reduce((s, v) => s + v, 0)).toBe(total);
        // Each share is within a cent of its exact proportion.
        const sum = items.reduce((s, i) => s + i.estimatedValueCents, 0);
        for (const [k, i] of items.entries()) {
          const exact = (total * i.estimatedValueCents) / sum;
          expect(Math.abs((shares[k] ?? 0) - exact)).toBeLessThan(1);
        }
      }
    }
  });
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

  describe("line 30, simplified method", () => {
    // A profitable year: one $10,000 sale on top of the base rows, so line 29 is well above $1,500.
    const profitable: ScInput = {
      ...base,
      sales: [
        ...base.sales,
        {
          kind: "order",
          date: "2026-06-01",
          itemCents: 1_000_000,
          shippingChargedCents: 0,
          refundCents: 0,
          shippingLabelCents: 0,
          fees: [],
        },
      ],
    };
    const l = (w: ReturnType<typeof buildScheduleC>, n: string) =>
      w.lines.find((x) => x.line === n);

    it("leaves 30 blank when nothing is entered, and 31 equals 29", () => {
      expect(l(ws, "30")?.amountCents).toBeNull();
      expect(l(ws, "30")?.note).toMatch(/Not entered/);
      expect(l(ws, "31")?.amountCents).toBe(line("29"));
    });

    it("is $5 a square foot for a full year, and 31 = 29 − 30", () => {
      const w = buildScheduleC({
        ...profitable,
        homeOffice: {
          officeSqft: 120,
          homeSqft: 1500,
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
      });
      expect(l(w, "30")?.amountCents).toBe(60000);
      expect(l(w, "30")?.note).toMatch(/\(a\) home 1500 sq ft, \(b\) business 120 sq ft/);
      expect(l(w, "31")?.amountCents).toBe((l(w, "29")?.amountCents ?? 0) - 60000);
    });

    it("counts at most 300 square feet, so at most $1,500 a year", () => {
      const w = buildScheduleC({
        ...profitable,
        homeOffice: {
          officeSqft: 450,
          homeSqft: null,
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
      });
      expect(l(w, "30")?.amountCents).toBe(150000);
      expect(w.warnings.join(" ")).toMatch(/Only 300 of the 450/);
    });

    it("averages over 12 months: 200 sq ft for July to December is $500", () => {
      const w = buildScheduleC({
        ...profitable,
        homeOffice: { officeSqft: 200, homeSqft: null, months: [7, 8, 9, 10, 11, 12] },
      });
      expect(l(w, "30")?.amountCents).toBe(50000);
    });

    it("never exceeds line 29 and never makes a loss, with no carryover", () => {
      // The base year is a loss, so line 30 is zero and the whole amount is lost, said in a warning.
      expect(line("29")).toBeLessThan(0);
      const w = buildScheduleC({
        ...base,
        homeOffice: {
          officeSqft: 100,
          homeSqft: null,
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
      });
      expect(l(w, "30")?.amountCents).toBe(0);
      expect(l(w, "31")?.amountCents).toBe(line("29"));
      expect(w.warnings.join(" ")).toMatch(
        /limited to line 29: \$500\.00 .* does not carry it forward/,
      );
    });

    it("ignores repeated or out-of-range months and flags an office larger than the home", () => {
      const r = homeOfficeLine30(
        { officeSqft: 300, homeSqft: 200, months: [3, 3, 0, 13, 2.5] },
        1e9,
      );
      expect(r.monthsCounted).toBe(1);
      expect(r.cents).toBe(12500);
      expect(r.warnings.join(" ")).toMatch(/larger than the whole home/);
    });
  });
});

describe("home office month mask", () => {
  it("round-trips months through the stored bits", () => {
    expect(maskFromMonths([1, 12, 12])).toBe(0b100000000001);
    expect(monthsFromMask(maskFromMonths([2, 7, 11]))).toEqual([2, 7, 11]);
    expect(monthsFromMask(0)).toEqual([]);
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

describe("homeOfficeThrough (line 30 months counted by a date)", () => {
  const ho = { officeSqft: 100, homeSqft: null, months: [1, 2, 3, 4, 6, 12] };
  it("counts a month once its 15th day has passed", () => {
    expect(homeOfficeThrough(ho, "2026-03-31").months).toEqual([1, 2, 3]);
    expect(homeOfficeThrough(ho, "2026-04-14").months).toEqual([1, 2, 3]);
    expect(homeOfficeThrough(ho, "2026-04-15").months).toEqual([1, 2, 3, 4]);
    expect(homeOfficeThrough(ho, "2026-08-31").months).toEqual([1, 2, 3, 4, 6]);
    expect(homeOfficeThrough(ho, "2026-12-31").months).toEqual([1, 2, 3, 4, 6, 12]);
    expect(homeOfficeThrough(ho, "2026-01-01").months).toEqual([]);
  });
  it("leaves the area alone", () => {
    expect(homeOfficeThrough(ho, "2026-05-31")).toMatchObject({ officeSqft: 100, homeSqft: null });
  });
});
