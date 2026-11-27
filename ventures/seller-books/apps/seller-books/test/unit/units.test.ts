import { describe, expect, it } from "vitest";
import { buildSalesLedger } from "../../src/worker/services/books/ledger";
import { buildPnl } from "../../src/worker/services/books/pnl";
import { splitCents, takeUnits } from "../../src/worker/services/books/units";

describe("takeUnits", () => {
  const free = () => [
    { id: "a", acquiredDate: "2026-01-02" },
    { id: "b", acquiredDate: "2026-01-10" },
    { id: "c", acquiredDate: "2026-03-01" },
  ];

  it("takes as many units as the order's quantity, oldest first", () => {
    const list = free();
    expect(takeUnits(list, "2026-02-01", 2).map((u) => u.id)).toEqual(["a", "b"]);
    expect(list.map((u) => u.id)).toEqual(["c"]);
  });

  it("never takes an item bought after the sale, and leaves it for a later one", () => {
    const list = free();
    expect(takeUnits(list, "2026-01-05", 3).map((u) => u.id)).toEqual(["a"]);
    expect(takeUnits(list, "2026-01-01", 1)).toEqual([]);
    expect(takeUnits(list, "2026-03-01", 1).map((u) => u.id)).toEqual(["b"]);
    expect(takeUnits(list, "2026-03-01", 1).map((u) => u.id)).toEqual(["c"]);
  });

  it("treats a missing or odd quantity as one unit", () => {
    expect(takeUnits(free(), "2026-12-31", 0).length).toBe(1);
    expect(takeUnits(free(), "2026-12-31", Number.NaN).length).toBe(1);
    expect(takeUnits(free(), "2026-12-31", 2.7).length).toBe(2);
  });
});

describe("splitCents", () => {
  it("splits to parts that sum to the total, leftover cents first", () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(-1001, 2)).toEqual([-501, -500]);
    expect(splitCents(5, 1)).toEqual([5]);
    for (const [t, n] of [
      [125000, 2],
      [7, 4],
      [-13, 5],
    ] as const)
      expect(splitCents(t, n).reduce((a, b) => a + b, 0)).toBe(t);
  });
});

describe("multi-unit orders in the P&L and the ledger", () => {
  const base = {
    platform: "ebay",
    kind: "order" as const,
    date: "2026-01-18",
    itemCents: 125000,
    shippingChargedCents: 0,
    salesTaxCents: 0,
    refundCents: 0,
    shippingLabelCents: 0,
    fees: [],
  };

  it("counts the cost of every linked unit and flags an order with units missing", () => {
    const pnl = buildPnl("2026-01-01", "2026-12-31", {
      sales: [
        { ...base, cogsCents: 2000, unitsWithoutCost: 0 },
        { ...base, cogsCents: 1000, unitsWithoutCost: 1 },
        { ...base, cogsCents: null },
      ],
      charges: [],
      expenses: [],
    });
    expect(pnl.total.cogsCents).toBe(3000);
    expect(pnl.total.ordersWithoutCost).toBe(2);
  });

  it("names the partly linked order in the ledger", () => {
    const ledger = buildSalesLedger("2026-01-01", "2026-12-31", {
      sales: [
        {
          ...base,
          orderId: "02-33333-44444",
          title: "Pyrex bowls",
          sku: "SKU-PYREX-2",
          quantity: 2,
          netCents: null,
          item: { title: "Pyrex bowl", costCents: 1000 },
          unitsWithoutItem: 1,
        },
      ],
      charges: [],
    });
    expect(ledger.totals.ordersWithoutCost).toBe(1);
    expect(ledger.rows[0]?.cogsCents).toBe(1000);
    expect(ledger.rows[0]?.note).toContain("1 unit(s) sold with no item linked");
  });
});
