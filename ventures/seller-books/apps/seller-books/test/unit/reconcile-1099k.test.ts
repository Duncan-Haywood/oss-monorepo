// A Form 1099-K checked against the books: every expected figure is worked by hand beside it.
import {
  type Reconcile1099kMonthBooks,
  reconcile1099k,
  toleranceFor,
} from "@shared/reconcile-1099k";
import { describe, expect, it } from "vitest";

const m = (
  month: string,
  orders: number,
  items: number,
  shipping = 0,
  tax = 0,
  refunds = 0,
): Reconcile1099kMonthBooks => ({
  month,
  orders,
  itemSalesCents: items,
  shippingChargedCents: shipping,
  salesTaxCollectedCents: tax,
  refundsCents: refunds,
});

describe("toleranceFor", () => {
  it("is a dollar, or half a percent of box 1a when that is more", () => {
    expect(toleranceFor(10_000)).toBe(100); // $100 form: 0.5% is 50 cents, so $1
    expect(toleranceFor(2_000_000)).toBe(10_000); // $20,000 form: 0.5% is $100
  });
});

describe("reconcile1099k", () => {
  const books = [
    m("2025-01", 10, 100_000, 10_000, 8_000, 5_000), // $1,000 items, $100 shipping, $80 tax, $50 refunds
    m("2025-02", 5, 50_000, 5_000, 4_000),
    m("2024-12", 3, 99_999), // another year: ignored
  ];

  it("names the closest of the three totals and calls it a match within tolerance", () => {
    // items 150,000; + shipping 165,000; + tax 177,000. Box 1a $1,770.40 is 40 cents off the third.
    const r = reconcile1099k({ year: 2025, platform: "ebay", box1aCents: 177_040, books });
    expect(r.bases.map((b) => [b.key, b.booksCents, b.differenceCents])).toEqual([
      ["items", 150_000, 27_040],
      ["items_shipping", 165_000, 12_040],
      ["items_shipping_tax", 177_000, 40],
    ]);
    expect(r.closest).toBe("items_shipping_tax");
    expect(r.matches).toBe(true);
    expect(r.booksOrders).toBe(15);
    expect(r.refundsCents).toBe(5_000);
    expect(r.findings[0]).toMatch(/within \$8\.85 of box 1a/); // 0.5% of $1,770.40 = $8.852
    expect(r.findings[1]).toMatch(/Refunds of \$50\.00/);
    expect(r.months).toBeNull();
  });

  it("says the form is higher when a month is missing, and points at the month", () => {
    const months = [101_800, 55_200, 0, 0, 0, 30_000, 0, 0, 0, 0, 0, 0];
    // Box 1a 187,000 = 177,000 in the books + a June the books lack.
    const r = reconcile1099k({
      year: 2025,
      platform: "ebay",
      box1aCents: 187_000,
      monthsCents: months,
      books,
    });
    expect(r.closest).toBe("items_shipping_tax");
    expect(r.matches).toBe(false);
    expect(r.findings[0]).toMatch(/form shows \$100\.00 more/);
    expect(r.months?.[5]).toEqual({
      month: "2025-06",
      booksOrders: 0,
      booksCents: 0,
      formCents: 30_000,
      differenceCents: 30_000,
    });
    expect(r.findings.some((f) => /^June: the form shows \$300\.00/.test(f))).toBe(true);
    // Jan books 118,000 vs form 101,800 (-16,200); Feb books 59,000 vs 55,200 (-3,800): same sign, no shift note.
    expect(r.findings.some((f) => /opposite directions/.test(f))).toBe(false);
  });

  it("spots a month-end shift: two months off by the same amount in opposite directions", () => {
    const shifted = [m("2025-03", 4, 40_000), m("2025-04", 4, 40_000)];
    const months = [null, null, 30_000, 50_000, null, null, null, null, null, null, null, null];
    const r = reconcile1099k({
      year: 2025,
      platform: "poshmark",
      box1aCents: 80_000,
      monthsCents: months,
      books: shifted,
    });
    expect(r.matches).toBe(true);
    expect(r.closest).toBe("items"); // no shipping or tax: the simplest basis wins the tie
    expect(r.findings.some((f) => /^March and April differ by \$100\.00/.test(f))).toBe(true);
  });

  it("flags months that do not add to box 1a, books higher than the form, and box 3", () => {
    const months = Array(12).fill(10_000);
    const r = reconcile1099k({
      year: 2025,
      platform: "mercari",
      box1aCents: 100_000, // the twelve boxes add to 120,000
      monthsCents: months,
      box3Transactions: 40,
      books,
    });
    expect(
      r.findings.some((f) => /Boxes 5a-5l add to \$1,200\.00, not the \$1,000\.00/.test(f)),
    ).toBe(true);
    // Closest is items (150,000): the books are $500 higher.
    expect(r.closest).toBe("items");
    expect(r.findings[0]).toMatch(/books show \$500\.00 more than the form/);
    expect(
      r.findings.some((f) => /Box 3 counts 40 payment transactions; the books hold 15/.test(f)),
    ).toBe(true);
  });
});
