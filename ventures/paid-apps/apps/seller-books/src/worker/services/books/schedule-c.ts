// Schedule C (Form 1040) WORKSHEET for one calendar year. It gathers the seller's own numbers onto the
// lines where resellers commonly report them, so the seller or their preparer can check and copy them.
// It is not a tax return, not a filing and not tax advice: line placement (e.g. postage under "Other
// expenses", ad fees under "Advertising") is a convention the preparer may change.
//
// Cost of goods sold uses Part III with the seller's own inventory records (specific identification, at
// cost): 35 opening inventory + 36 purchases (less items withdrawn for personal use) − 41 closing
// inventory = 42 COGS.
import type { ExpenseCategory } from "@shared/enums";

export interface ScInput {
  year: number;
  sales: {
    kind: "order" | "refund";
    date: string;
    itemCents: number;
    shippingChargedCents: number;
    refundCents: number;
    shippingLabelCents: number;
    fees: { kind: string; amountCents: number }[];
  }[];
  charges: { date: string; kind: string; amountCents: number }[];
  expenses: { date: string; category: ExpenseCategory; amountCents: number }[];
  items: { acquiredDate: string; costCents: number; status: string; disposedDate: string | null }[];
  /** Lot cost not carried by any item (counted as a purchase so it is not lost; flagged). */
  unallocatedLots: { acquiredDate: string; cents: number }[];
  businessMiles: number;
  /** Cents per mile the user chose (IRS standard mileage rate for the year); null = not set. */
  mileageRateCents: number | null;
}

export interface ScLine {
  line: string;
  label: string;
  amountCents: number | null;
  note?: string;
}

export interface ScWorksheet {
  year: number;
  disclaimer: string;
  lines: ScLine[];
  partIII: ScLine[];
  otherExpenses: ScLine[];
  warnings: string[];
}

export const SCHEDULE_C_DISCLAIMER =
  "Worksheet only: these are your own records arranged by Schedule C line. It is not a tax return and not tax advice. Check every line with your tax preparer or the IRS instructions before you file.";

const EXPENSE_LINE: Record<ExpenseCategory, string> = {
  advertising: "8",
  commissions_fees: "10",
  insurance: "15",
  legal_professional: "17",
  office: "18",
  rent: "20b",
  repairs: "21",
  supplies: "22",
  taxes_licenses: "23",
  travel: "24a",
  meals: "24b",
  utilities: "25",
  shipping_postage: "27a:postage",
  software_subscriptions: "27a:software",
  other: "27a:other",
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function buildScheduleC(input: ScInput): ScWorksheet {
  const y = String(input.year);
  const start = `${y}-01-01`;
  const end = `${y}-12-31`;
  const inYear = (d: string) => d >= start && d <= end;
  const warnings: string[] = [];
  const bucket = new Map<string, number>();
  const add = (line: string, cents: number) => bucket.set(line, (bucket.get(line) ?? 0) + cents);

  let gross = 0;
  let returns = 0;
  for (const s of input.sales) {
    if (!inYear(s.date)) continue;
    if (s.kind === "order") gross += s.itemCents + s.shippingChargedCents;
    else returns += s.refundCents;
    add("27a:postage", s.shippingLabelCents);
    for (const f of s.fees) add(f.kind === "advertising" ? "8" : "10", f.amountCents);
  }
  for (const c of input.charges) {
    if (!inYear(c.date)) continue;
    if (c.kind === "shipping_label") add("27a:postage", c.amountCents);
    else if (c.kind === "subscription") add("27a:software", c.amountCents);
    else add(c.kind === "advertising" ? "8" : "10", c.amountCents);
  }
  let mealsFull = 0;
  for (const e of input.expenses) {
    if (!inYear(e.date)) continue;
    if (e.category === "meals") mealsFull += e.amountCents;
    else add(EXPENSE_LINE[e.category], e.amountCents);
  }
  if (mealsFull) {
    // Business meals are generally 50% deductible; the full amount is shown in the note.
    add("24b", Math.round(mealsFull / 2));
  }

  // Part III: inventory at cost.
  let opening = 0;
  let purchases = 0;
  let personalUse = 0;
  let closing = 0;
  for (const it of input.items) {
    const leftBy = (d: string) =>
      it.status !== "in_stock" && it.disposedDate != null && it.disposedDate <= d;
    if (it.acquiredDate < start && !leftBy(`${input.year - 1}-12-31`)) opening += it.costCents;
    if (inYear(it.acquiredDate)) purchases += it.costCents;
    if (it.status === "personal_use" && it.disposedDate && inYear(it.disposedDate))
      personalUse += it.costCents;
    if (it.acquiredDate <= end && !leftBy(end)) closing += it.costCents;
    if (it.status !== "in_stock" && !it.disposedDate) {
      warnings.push(
        "Some items are marked sold/written off without a date; they are treated as still on hand.",
      );
    }
  }
  for (const l of input.unallocatedLots) {
    if (inYear(l.acquiredDate)) {
      purchases += l.cents;
      warnings.push(
        "Some lot cost is not assigned to any item. It is counted as a purchase this year and, with no item to carry it, never sits in closing inventory. Add the lot's items to fix this.",
      );
    }
  }
  const line36 = purchases - personalUse;
  const line40 = opening + line36;
  const cogs = line40 - closing;

  let car: number | null = null;
  if (input.businessMiles > 0) {
    if (input.mileageRateCents == null) {
      warnings.push(
        "Mileage logged but no standard mileage rate chosen for this year: line 9 is left blank.",
      );
    } else {
      car = Math.round(input.businessMiles * input.mileageRateCents);
    }
  }
  if (car != null) add("9", car);

  const get = (l: string) => bucket.get(l) ?? 0;
  const otherExpenses: ScLine[] = [
    { line: "27a", label: "Postage and shipping labels", amountCents: get("27a:postage") },
    { line: "27a", label: "Software and platform subscriptions", amountCents: get("27a:software") },
    { line: "27a", label: "Other", amountCents: get("27a:other") },
  ].filter((l) => l.amountCents !== 0);
  const line27a = otherExpenses.reduce((s, l) => s + (l.amountCents ?? 0), 0);

  const expenseLines: [string, string][] = [
    ["8", "Advertising (incl. promoted / boosted listing fees)"],
    ["9", "Car and truck expenses (standard mileage)"],
    ["10", "Commissions and fees (marketplace fees)"],
    ["15", "Insurance (other than health)"],
    ["17", "Legal and professional services"],
    ["18", "Office expense"],
    ["20b", "Rent or lease: other business property"],
    ["21", "Repairs and maintenance"],
    ["22", "Supplies"],
    ["23", "Taxes and licenses"],
    ["24a", "Travel"],
    ["24b", "Deductible meals"],
    ["25", "Utilities"],
  ];
  const line3 = gross - returns;
  const line5 = line3 - cogs;
  const line7 = line5; // line 6 other income is not tracked here
  const expenses = expenseLines.reduce((s, [l]) => s + get(l), 0) + line27a;
  const lines: ScLine[] = [
    {
      line: "1",
      label: "Gross receipts or sales",
      amountCents: gross,
      note: "Item sales plus shipping charged to buyers. Sales tax collected by marketplaces is excluded.",
    },
    { line: "2", label: "Returns and allowances", amountCents: returns },
    { line: "3", label: "Subtract line 2 from line 1", amountCents: line3 },
    { line: "4", label: "Cost of goods sold (from line 42)", amountCents: cogs },
    { line: "5", label: "Gross profit", amountCents: line5 },
    {
      line: "7",
      label: "Gross income",
      amountCents: line7,
      note: "Line 6 (other income) is not tracked.",
    },
    ...expenseLines.map(([line, label]) => ({
      line,
      label,
      amountCents: line === "9" ? car : get(line),
      ...(line === "24b" && mealsFull ? { note: `50% of ${usd(mealsFull)} of meals entered` } : {}),
      ...(line === "9"
        ? { note: `${input.businessMiles.toFixed(1)} business miles (line 44a)` }
        : {}),
    })),
    { line: "27a", label: "Other expenses (see Part V list)", amountCents: line27a },
    { line: "28", label: "Total expenses", amountCents: expenses },
    {
      line: "29",
      label: "Tentative profit or (loss)",
      amountCents: line7 - expenses,
      note: "Line 30 (business use of home) is not computed here.",
    },
  ];
  const partIII: ScLine[] = [
    { line: "35", label: "Inventory at beginning of year", amountCents: opening },
    {
      line: "36",
      label: "Purchases less cost of items withdrawn for personal use",
      amountCents: line36,
      ...(personalUse ? { note: `${usd(personalUse)} withdrawn for personal use` } : {}),
    },
    { line: "40", label: "Add lines 35 through 39", amountCents: line40 },
    { line: "41", label: "Inventory at end of year", amountCents: closing },
    { line: "42", label: "Cost of goods sold", amountCents: cogs },
  ];
  return {
    year: input.year,
    disclaimer: SCHEDULE_C_DISCLAIMER,
    lines,
    partIII,
    otherExpenses,
    warnings: [...new Set(warnings)],
  };
}
