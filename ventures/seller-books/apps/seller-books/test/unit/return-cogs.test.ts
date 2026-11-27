// Part III and the P&L with a buyer's return (services/books/returns.ts): the returned row is on hand from
// the refund date and never a purchase, so the cost the sale booked comes back once.
import { buildPnl } from "@worker/services/books/pnl";
import { buildScheduleC, type ScInput } from "@worker/services/books/schedule-c";
import { describe, expect, it } from "vitest";

const p3 = (w: ReturnType<typeof buildScheduleC>, n: string) =>
  w.partIII.find((l) => l.line === n)?.amountCents;

const ws = (year: number, items: ScInput["items"]) =>
  buildScheduleC({
    year,
    sales: [],
    charges: [],
    expenses: [],
    items,
    unallocatedLots: [],
    businessMiles: 0,
    mileageRateCents: null,
  });

// Bought March 2025 for $30, sold December 2025, returned January 2026 and still on hand.
const original = {
  acquiredDate: "2025-03-01",
  costCents: 3000,
  status: "sold",
  disposedDate: "2025-12-20",
};
const copy = {
  acquiredDate: "2026-01-10",
  costCents: 3000,
  status: "in_stock",
  disposedDate: null,
  returnSaleId: "sal_refund",
};

describe("a return in Part III", () => {
  it("leaves the year of the sale as filed and lowers the next year's line 42", () => {
    const y2025 = ws(2025, [original, copy]);
    expect(p3(y2025, "36")).toBe(3000);
    expect(p3(y2025, "41")).toBe(0);
    expect(p3(y2025, "42")).toBe(3000);

    const y2026 = ws(2026, [original, copy]);
    expect(p3(y2026, "35")).toBe(0);
    expect(p3(y2026, "36")).toBe(0); // the return is not a purchase
    expect(p3(y2026, "41")).toBe(3000);
    expect(p3(y2026, "42")).toBe(-3000);
  });

  it("counts a returned row bought in the year once, not as a second purchase", () => {
    const sameYear = ws(2026, [
      { ...original, acquiredDate: "2026-02-01", disposedDate: "2026-03-01" },
      { ...copy, acquiredDate: "2026-03-15" },
    ]);
    expect(p3(sameYear, "36")).toBe(3000);
    expect(p3(sameYear, "41")).toBe(3000);
    expect(p3(sameYear, "42")).toBe(0);
  });
});

describe("a return in the P&L", () => {
  it("books the cost back in the refund's month", () => {
    const sale = {
      platform: "ebay",
      itemCents: 5000,
      shippingChargedCents: 0,
      salesTaxCents: 0,
      shippingLabelCents: 0,
      fees: [],
      unitsWithoutCost: 0,
    };
    const r = buildPnl("2026-01-01", "2026-12-31", {
      sales: [
        { ...sale, kind: "order", date: "2026-03-01", refundCents: 0, cogsCents: 3000 },
        {
          ...sale,
          kind: "refund",
          date: "2026-04-02",
          itemCents: 0,
          refundCents: 5000,
          cogsCents: -3000,
        },
        // A refund whose goods stayed with the buyer reverses nothing.
        {
          ...sale,
          kind: "refund",
          date: "2026-04-03",
          itemCents: 0,
          refundCents: 100,
          cogsCents: null,
        },
      ],
      charges: [],
      expenses: [],
    });
    const month = (m: string) => r.cells.find((c) => c.month === m);
    expect(month("2026-03")?.cogsCents).toBe(3000);
    expect(month("2026-04")?.cogsCents).toBe(-3000);
    expect(month("2026-04")?.ordersWithoutCost).toBe(0);
    expect(r.total.cogsCents).toBe(0);
    expect(r.total.grossProfitCents).toBe(5000 - 5100);
  });
});
