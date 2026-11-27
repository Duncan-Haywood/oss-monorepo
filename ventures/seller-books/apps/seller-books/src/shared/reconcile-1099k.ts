// Check a platform's Form 1099-K against the books: what the books say buyers paid on that platform in the
// year, month by month, next to the figures the seller types from the form (box 1a, and boxes 5a-5l if they
// want the months compared). Pure function: the route feeds it the P&L cells for one platform and year.
//
// What it does not do: decide which amounts a platform puts in box 1a. The IRS defines box 1a as the gross
// amount "without regard to any adjustments for credits" (with refunds, fees and shipping named among those
// adjustments; source in FORM_1099K_GROSS below), but whether a marketplace's figure includes the sales tax it
// collected varies and is not stated on a page we could check. So the books are summed three ways and the
// closest one is shown as the closest, never as "what the platform includes". Nothing here is tax advice.

export interface Reconcile1099kMonthBooks {
  /** YYYY-MM */
  month: string;
  orders: number;
  itemSalesCents: number;
  shippingChargedCents: number;
  salesTaxCollectedCents: number;
  refundsCents: number;
}

export interface Reconcile1099kInput {
  year: number;
  platform: string;
  /** Box 1a, gross amount of payment card/third party network transactions. */
  box1aCents: number;
  /** Boxes 5a-5l, January to December; null for a box left blank. Omit to skip the monthly comparison. */
  monthsCents?: (number | null)[] | null;
  /** Box 3, number of payment transactions, if typed. */
  box3Transactions?: number | null;
  books: Reconcile1099kMonthBooks[];
}

export type BasisKey = "items" | "items_shipping" | "items_shipping_tax";

export interface Basis {
  key: BasisKey;
  label: string;
  booksCents: number;
  /** Form minus books: positive means the form shows more than the books. */
  differenceCents: number;
}

export interface MonthRow {
  month: string;
  booksOrders: number;
  /** The books on the closest basis. */
  booksCents: number;
  formCents: number | null;
  differenceCents: number | null;
}

export interface Reconcile1099kResult {
  year: number;
  platform: string;
  box1aCents: number;
  bases: Basis[];
  closest: BasisKey;
  /** Whether the closest basis is within the tolerance below. */
  matches: boolean;
  toleranceCents: number;
  refundsCents: number;
  booksOrders: number;
  box3Transactions: number | null;
  months: MonthRow[] | null;
  findings: string[];
  disclaimer: string;
}

export const RECONCILE_DISCLAIMER =
  "A comparison of your books with the figures you typed from the form, to find what is missing or dated differently. It is not tax advice and does not say what to report.";

/** The IRS definition of box 1a, checked from search-engine excerpts of the official page (irs.gov is not reachable from the build environment). */
export const FORM_1099K_GROSS = {
  url: "https://www.irs.gov/instructions/i1099k",
  quote: "without regard to any adjustments for credits",
  summary:
    "Box 1a is the gross amount of the year's payment transactions, before refunds, fees, shipping adjustments, credits or discounts are taken off.",
  status: "official-excerpt" as const,
  checkedOn: "2026-11-26",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const usd = (cents: number) => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
};

/** A dollar, or half a percent of box 1a, whichever is larger: rounding on the platform's side stays a match. */
export function toleranceFor(box1aCents: number) {
  return Math.max(100, Math.round(Math.abs(box1aCents) * 0.005));
}

function basisCents(key: BasisKey, m: Reconcile1099kMonthBooks) {
  const items = m.itemSalesCents;
  if (key === "items") return items;
  if (key === "items_shipping") return items + m.shippingChargedCents;
  return items + m.shippingChargedCents + m.salesTaxCollectedCents;
}

const BASIS_LABELS: Record<BasisKey, string> = {
  items: "Item sales",
  items_shipping: "Item sales + shipping buyers paid",
  items_shipping_tax: "Item sales + shipping + sales tax the platform collected",
};

export function reconcile1099k(input: Reconcile1099kInput): Reconcile1099kResult {
  const prefix = `${input.year}-`;
  const books = input.books.filter((b) => b.month.startsWith(prefix));
  const byMonth = new Map<string, Reconcile1099kMonthBooks>();
  for (const b of books) {
    const prev = byMonth.get(b.month);
    if (!prev) byMonth.set(b.month, { ...b });
    else {
      prev.orders += b.orders;
      prev.itemSalesCents += b.itemSalesCents;
      prev.shippingChargedCents += b.shippingChargedCents;
      prev.salesTaxCollectedCents += b.salesTaxCollectedCents;
      prev.refundsCents += b.refundsCents;
    }
  }
  const monthKey = (i: number) => `${input.year}-${String(i + 1).padStart(2, "0")}`;
  const monthBooks = (i: number): Reconcile1099kMonthBooks =>
    byMonth.get(monthKey(i)) ?? {
      month: monthKey(i),
      orders: 0,
      itemSalesCents: 0,
      shippingChargedCents: 0,
      salesTaxCollectedCents: 0,
      refundsCents: 0,
    };
  const all = Array.from({ length: 12 }, (_, i) => monthBooks(i));

  const keys: BasisKey[] = ["items", "items_shipping", "items_shipping_tax"];
  const bases: Basis[] = keys.map((key) => {
    const booksCents = all.reduce((s, m) => s + basisCents(key, m), 0);
    return {
      key,
      label: BASIS_LABELS[key],
      booksCents,
      differenceCents: input.box1aCents - booksCents,
    };
  });
  // On a tie (no shipping or tax in the books) the simplest basis stays the closest.
  let closest = bases[0] as Basis;
  for (const b of bases)
    if (Math.abs(b.differenceCents) < Math.abs(closest.differenceCents)) closest = b;
  const toleranceCents = toleranceFor(input.box1aCents);
  const matches = Math.abs(closest.differenceCents) <= toleranceCents;
  const refundsCents = all.reduce((s, m) => s + m.refundsCents, 0);
  const booksOrders = all.reduce((s, m) => s + m.orders, 0);
  const findings: string[] = [];

  if (matches) {
    findings.push(
      `${closest.label} in the books comes to ${usd(closest.booksCents)}, within ${usd(toleranceCents)} of box 1a.`,
    );
  } else if (closest.differenceCents > 0) {
    findings.push(
      `The form shows ${usd(closest.differenceCents)} more than the books' closest total (${closest.label.toLowerCase()}, ${usd(closest.booksCents)}). Usual causes: a month or a second account not imported yet, or orders the report left out.`,
    );
  } else {
    findings.push(
      `The books show ${usd(-closest.differenceCents)} more than the form, even on the closest total (${closest.label.toLowerCase()}, ${usd(closest.booksCents)}). Usual causes: the same sale imported from two reports, cancelled orders kept in the books, or the books holding a year the platform counts differently (order date against payment date).`,
    );
  }
  if (refundsCents > 0)
    findings.push(
      `Refunds of ${usd(refundsCents)} are in the books for this year. The IRS defines box 1a before refunds, so they make the books' revenue lower than the form; they do not explain a form that is lower than the books.`,
    );

  let months: MonthRow[] | null = null;
  const given = input.monthsCents;
  if (given?.some((v) => v != null)) {
    months = all.map((m, i) => {
      const formCents = given[i] ?? null;
      const booksCents = basisCents(closest.key, m);
      return {
        month: m.month,
        booksOrders: m.orders,
        booksCents,
        formCents,
        differenceCents: formCents == null ? null : formCents - booksCents,
      };
    });
    const typed = given.filter((v): v is number => v != null);
    if (typed.length === 12) {
      const sum = typed.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - input.box1aCents) > 1)
        findings.push(
          `Boxes 5a-5l add to ${usd(sum)}, not the ${usd(input.box1aCents)} typed for box 1a. Check both against the form before reading the months.`,
        );
    }
    for (let i = 0; i < 12; i++) {
      const row = months[i] as MonthRow;
      if (row.formCents != null && row.formCents > 0 && row.booksOrders === 0)
        findings.push(
          `${MONTH_NAMES[i]}: the form shows ${usd(row.formCents)} and the books have no ${input.year} orders for this platform that month. Import that month's report.`,
        );
    }
    // A sale near a month end that the books date in one month and the platform in the next shows up as
    // two differences of opposite sign that cancel.
    for (let i = 0; i < 11; i++) {
      const a = months[i]?.differenceCents;
      const b = months[i + 1]?.differenceCents;
      if (a == null || b == null) continue;
      const tol = toleranceFor(Math.max(Math.abs(a), Math.abs(b)));
      if (
        Math.abs(a) > tol &&
        Math.abs(b) > tol &&
        Math.sign(a) !== Math.sign(b) &&
        Math.abs(a + b) <= tol
      )
        findings.push(
          `${MONTH_NAMES[i]} and ${MONTH_NAMES[i + 1]} differ by ${usd(Math.abs(a))} in opposite directions: likely orders the books date by order or completion day and the platform by the day it paid out. The year's total is not affected.`,
        );
    }
  }

  const box3 = input.box3Transactions ?? null;
  if (box3 != null && box3 !== booksOrders)
    findings.push(
      `Box 3 counts ${box3.toLocaleString("en-US")} payment transactions; the books hold ${booksOrders.toLocaleString("en-US")} order lines. A bundle of several items can be one payment, so the counts need not match; a much larger box 3 points to missing orders.`,
    );

  return {
    year: input.year,
    platform: input.platform,
    box1aCents: input.box1aCents,
    bases,
    closest: closest.key,
    matches,
    toleranceCents,
    refundsCents,
    booksOrders,
    box3Transactions: box3,
    months,
    findings,
    disclaimer: RECONCILE_DISCLAIMER,
  };
}
