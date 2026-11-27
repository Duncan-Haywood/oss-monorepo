import {
  buildStockReport,
  dayBefore,
  daysBetween,
  median,
  type StockItemInput,
  type StockSaleInput,
  saleProceeds,
} from "@worker/services/books/stock";
import { describe, expect, it } from "vitest";

const item = (o: Partial<StockItemInput> & { id: string }): StockItemInput => ({
  title: o.id,
  sku: null,
  lotId: null,
  acquiredDate: "2026-01-01",
  costCents: 1000,
  status: "in_stock",
  disposedDate: null,
  ...o,
});

const order = (o: Partial<StockSaleInput> & { itemId: string }): StockSaleInput => ({
  platform: "ebay",
  kind: "order",
  date: "2026-03-01",
  itemCents: 0,
  shippingChargedCents: 0,
  refundCents: 0,
  shippingLabelCents: 0,
  feesCents: 0,
  ...o,
});

describe("date helpers", () => {
  it("counts whole calendar days across month ends and leap days", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-03-01", "2026-02-28")).toBe(-1);
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
  it("takes the median of odd and even counts", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("proceeds are price + shipping − refunds − fees − postage", () => {
    expect(
      saleProceeds(
        order({
          itemId: "a",
          itemCents: 4000,
          shippingChargedCents: 500,
          feesCents: 634,
          shippingLabelCents: 450,
        }),
      ),
    ).toBe(3416);
    // A refund row: money back to the buyer, a fee credit (negative fees).
    expect(
      saleProceeds(order({ itemId: "a", kind: "refund", refundCents: 4000, feesCents: -520 })),
    ).toBe(-3480);
  });
});

describe("buildStockReport", () => {
  const items: StockItemInput[] = [
    // Bought 2025-06-01 in the lot, still unsold: 304 days held on 2026-04-01 (181–365).
    item({ id: "old", lotId: "lot1", acquiredDate: "2025-06-01", costCents: 500 }),
    // Lot items sold in the window, one on eBay and one on Poshmark.
    item({
      id: "s1",
      lotId: "lot1",
      acquiredDate: "2025-06-01",
      costCents: 500,
      status: "sold",
      disposedDate: "2026-02-15",
    }),
    item({
      id: "s2",
      lotId: "lot1",
      acquiredDate: "2025-06-01",
      costCents: 1000,
      status: "sold",
      disposedDate: "2026-03-10",
    }),
    // Bought in the window and sold 10 days later, no linked order.
    item({
      id: "s3",
      acquiredDate: "2026-02-01",
      costCents: 300,
      status: "sold",
      disposedDate: "2026-02-11",
    }),
    // Bought in the window, still in stock: 20 days (0–30).
    item({ id: "new", acquiredDate: "2026-03-12", costCents: 2000 }),
    // Sold before the window: not in start stock, not sold in window.
    item({
      id: "gone",
      acquiredDate: "2025-01-01",
      status: "sold",
      disposedDate: "2025-12-01",
    }),
    // Written off in the window: in start stock, never counted as sold.
    item({
      id: "wo",
      acquiredDate: "2025-11-01",
      status: "written_off",
      disposedDate: "2026-02-20",
    }),
    // Held over a year.
    item({ id: "ancient", acquiredDate: "2024-12-01", costCents: 700 }),
    // Bought after asOf.
    item({ id: "future", acquiredDate: "2026-05-01" }),
  ];
  const sales: StockSaleInput[] = [
    order({
      itemId: "s1",
      date: "2026-02-15",
      itemCents: 2500,
      feesCents: 300,
      shippingLabelCents: 200,
    }),
    order({
      itemId: "s2",
      platform: "poshmark",
      date: "2026-03-10",
      itemCents: 3000,
      feesCents: 600,
    }),
    // A sale after asOf is ignored.
    order({ itemId: "old", date: "2026-04-15", itemCents: 9999 }),
  ];
  const r = buildStockReport({
    asOf: "2026-04-01",
    from: "2026-01-01",
    to: "2026-04-01",
    items,
    sales,
    lots: [{ id: "lot1", name: "Bin", acquiredDate: "2025-06-01", totalCostCents: 2000 }],
  });

  it("buckets stock in hand by days held and lists the oldest first", () => {
    expect(r.inStock).toEqual({ items: 3, costCents: 3200 });
    expect(Object.fromEntries(r.aging.map((b) => [b.key, [b.items, b.costCents]]))).toEqual({
      "0-30": [1, 2000],
      "31-90": [0, 0],
      "91-180": [0, 0],
      "181-365": [1, 500],
      "365+": [1, 700],
    });
    expect(r.oldest.map((i) => [i.id, i.daysHeld])).toEqual([
      ["ancient", 486],
      ["old", 304],
      ["new", 20],
    ]);
  });

  it("sell-through counts only sold items over start stock plus buys", () => {
    // Start stock on 2025-12-31: old, s1, s2, wo, ancient = 5. Bought in window: s3, new = 2.
    expect(r.sellThrough).toEqual({ startItems: 5, acquiredItems: 2, soldItems: 3, percent: 43 });
  });

  it("gives days to sell by platform from the linked order", () => {
    const byP = Object.fromEntries(r.speed.map((s) => [s.platform, s]));
    expect(byP.ebay).toMatchObject({
      sold: 1,
      medianDays: 259,
      proceedsCents: 2000,
      costCents: 500,
    });
    expect(byP.poshmark).toMatchObject({ sold: 1, medianDays: 282, proceedsCents: 2400 });
    expect(byP.unlinked).toMatchObject({ sold: 1, medianDays: 10, proceedsCents: 0 });
    expect(r.speedTotal).toMatchObject({ sold: 3, medianDays: 259, meanDays: 183.7 });
    expect(r.warnings.join(" ")).toMatch(/1 item\(s\) sold in the period have no linked order/);
    expect(r.warnings.join(" ")).toMatch(/bought after 2026-04-01/);
  });

  it("shows how much of each lot's cost its sales have paid back", () => {
    expect(r.lots).toEqual([
      {
        id: "lot1",
        name: "Bin",
        acquiredDate: "2025-06-01",
        totalCostCents: 2000,
        items: 3,
        sold: 2,
        inStock: 1,
        removed: 0,
        proceedsCents: 4400,
        paybackCents: 2400,
        recoveredPercent: 220,
        inStockCostCents: 500,
      },
    ]);
  });

  it("leaves out items with no date they left, and says so", () => {
    const r2 = buildStockReport({
      asOf: "2026-04-01",
      from: "2026-01-01",
      to: "2026-04-01",
      items: [item({ id: "x", status: "sold", disposedDate: null })],
      sales: [],
      lots: [],
    });
    expect(r2.inStock.items).toBe(0);
    expect(r2.sellThrough.percent).toBeNull();
    expect(r2.speedTotal.medianDays).toBeNull();
    expect(r2.warnings[0]).toMatch(/no date they left/);
  });

  it("skips a sale dated before its purchase from days to sell", () => {
    const r3 = buildStockReport({
      asOf: "2026-04-01",
      from: "2026-01-01",
      to: "2026-04-01",
      items: [
        item({ id: "x", acquiredDate: "2026-03-01", status: "sold", disposedDate: "2026-02-01" }),
      ],
      sales: [],
      lots: [],
    });
    expect(r3.speedTotal.sold).toBe(0);
    expect(r3.sellThrough.soldItems).toBe(1);
    expect(r3.warnings.join(" ")).toMatch(/sale date before the date they were bought/);
  });

  it("a lot that cost nothing has no recovered percent", () => {
    const r4 = buildStockReport({
      asOf: "2026-04-01",
      from: "2026-01-01",
      to: "2026-04-01",
      items: [],
      sales: [],
      lots: [{ id: "free", name: "Curb find", acquiredDate: "2026-01-05", totalCostCents: 0 }],
    });
    expect(r4.lots[0]).toMatchObject({ recoveredPercent: null, paybackCents: 0, items: 0 });
  });
});
