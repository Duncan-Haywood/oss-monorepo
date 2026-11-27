// Line 41 counts every item still in stock. A sale with no item linked may have sold one of them, so the
// worksheet names the sales and the stock that could be what they sold (bought on or before the last such
// sale), and never moves the figure itself.
import { buildScheduleC, type ScInput } from "@worker/services/books/schedule-c";
import { describe, expect, it } from "vitest";

const order = (date: string, extra: Partial<ScInput["sales"][number]> = {}) => ({
  kind: "order" as const,
  date,
  itemCents: 5000,
  shippingChargedCents: 0,
  refundCents: 0,
  shippingLabelCents: 0,
  fees: [],
  ...extra,
});

const base: ScInput = {
  year: 2026,
  sales: [],
  charges: [],
  expenses: [],
  items: [
    // Bought before the sales, still in stock: could be what sold.
    { acquiredDate: "2026-02-01", costCents: 1500, status: "in_stock", disposedDate: null },
    { acquiredDate: "2026-03-01", costCents: 2500, status: "in_stock", disposedDate: null },
    // Bought after the last unlinked sale: cannot be what it sold.
    { acquiredDate: "2026-09-01", costCents: 4000, status: "in_stock", disposedDate: null },
    // Sold and linked: not in line 41.
    { acquiredDate: "2026-01-10", costCents: 900, status: "sold", disposedDate: "2026-02-10" },
  ],
  unallocatedLots: [],
  businessMiles: 0,
  mileageRateCents: null,
};
const p3 = (w: ReturnType<typeof buildScheduleC>, n: string) => w.partIII.find((l) => l.line === n);

describe("sales with no item linked against line 41", () => {
  it("says nothing when every order is linked", () => {
    const w = buildScheduleC({
      ...base,
      sales: [order("2026-02-10", { cogsCents: 900, unitsWithoutCost: 0 })],
    });
    expect(w.unlinkedSales).toBeNull();
    expect(w.warnings.join(" ")).not.toMatch(/no stock item linked/);
    expect(p3(w, "41")?.note).toBeUndefined();
  });

  it("names the stock bought on or before the last unlinked sale, and leaves line 41 as it is", () => {
    const w = buildScheduleC({
      ...base,
      sales: [
        order("2026-02-10", { cogsCents: 900, unitsWithoutCost: 0 }),
        order("2026-04-15", { cogsCents: null }),
        order("2026-03-20", { cogsCents: null }),
      ],
    });
    expect(w.unlinkedSales).toEqual({
      orders: 2,
      lastDate: "2026-04-15",
      itemsOnHand: 2,
      itemsOnHandCents: 4000,
    });
    // The books' figure is not changed: 15 + 25 + 40 on hand.
    expect(p3(w, "41")?.amountCents).toBe(8000);
    expect(p3(w, "41")?.note).toMatch(/Includes \$40\.00 of stock .* 2 sales with no item linked/);
    expect(w.warnings.join(" ")).toMatch(
      /2 sales in 2026 have no stock item linked .* 2 items costing \$40\.00, bought on or before 2026-04-15, are still in stock on December 31, 2026 .*up to \$40\.00 in all/,
    );
  });

  it("counts an order with fewer items linked than units sold", () => {
    const w = buildScheduleC({
      ...base,
      sales: [order("2026-03-05", { cogsCents: 900, unitsWithoutCost: 1 })],
    });
    // The February and March 1 items were both bought by March 5.
    expect(w.unlinkedSales).toMatchObject({ orders: 1, itemsOnHand: 2, itemsOnHandCents: 4000 });
    expect(w.warnings.join(" ")).toMatch(/1 sale in 2026 has no stock item linked .* 2 items/);
  });

  it("does not suspect stock bought after the sale", () => {
    const w = buildScheduleC({ ...base, sales: [order("2026-02-15", { cogsCents: null })] });
    expect(w.unlinkedSales).toMatchObject({ orders: 1, itemsOnHand: 1, itemsOnHandCents: 1500 });
    expect(w.warnings.join(" ")).toMatch(
      /1 item costing \$15\.00, bought on or before 2026-02-15, is still/,
    );
  });

  it("records the sales but does not warn when no stock could be what they sold", () => {
    const w = buildScheduleC({ ...base, sales: [order("2026-01-05", { cogsCents: null })] });
    expect(w.unlinkedSales).toEqual({
      orders: 1,
      lastDate: "2026-01-05",
      itemsOnHand: 0,
      itemsOnHandCents: 0,
    });
    expect(w.warnings.join(" ")).not.toMatch(/no stock item linked/);
  });

  it("ignores sales outside the year, refunds, and callers that do not track links", () => {
    const w = buildScheduleC({
      ...base,
      sales: [
        order("2025-12-20", { cogsCents: null }),
        { ...order("2026-05-01"), kind: "refund", refundCents: 5000, cogsCents: null },
        order("2026-06-01"), // cogsCents omitted: links unknown
      ],
    });
    expect(w.unlinkedSales).toBeNull();
  });

  it("uses the period's end on a year-to-date worksheet", () => {
    const w = buildScheduleC({
      ...base,
      through: "2026-05-31",
      sales: [order("2026-04-15", { cogsCents: null })],
    });
    // The September item is not yet bought on May 31.
    expect(p3(w, "41")?.amountCents).toBe(4000);
    expect(w.warnings.join(" ")).toMatch(/still in stock on 2026-05-31/);
  });
});
