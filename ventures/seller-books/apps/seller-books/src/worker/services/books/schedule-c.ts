// Schedule C (Form 1040) WORKSHEET for one calendar year. It gathers the seller's own numbers onto the
// lines where resellers commonly report them, so the seller or their preparer can check and copy them.
// It is not a tax return, not a filing and not tax advice: line placement (e.g. postage under "Other
// expenses", ad fees under "Advertising") is a convention the preparer may change.
//
// Cost of goods sold uses Part III with the seller's own inventory records (specific identification, at
// cost): 35 opening inventory + 36 purchases (less items withdrawn for personal use) − 41 closing
// inventory = 42 COGS. Line 35 is last year's line 41: when the seller has entered the figure from the
// return they filed, that figure is line 35 and the books' own count on December 31 is shown beside it, with
// a warning when they differ (a return's opening inventory has to match the prior closing inventory, and
// the gap would otherwise pass unnoticed into line 42).
//
// Line 30 (business use of the home) is the simplified method only, from the seller's own figures: $5 a
// square foot, at most 300 square feet in any month, averaged over the 12 months (a month counts only with
// 15 or more days of business use), and never more than line 29, with no carryover (Rev. Proc. 2013-13;
// IRS "Simplified Option for Home Office Deduction"; Publication 587, "Simplified Amount"). Whether the
// space qualifies is the seller's or their preparer's call. The regular method (Form 8829) is not built.
//
// Line 41 counts every item still marked in stock. A sale with no item linked (or fewer items than units
// sold) took something out of stock that the books still count, unless what it sold was never entered as an
// item. The worksheet cannot tell which, so it never moves the figure: it names the sales and the items that
// could have been the ones sold (in stock at the end of the period, bought on or before the last such sale),
// whose cost is the most line 41 can be overstated by (and line 42 understated).
//
// Equipment (a camera, a label printer, shelving, a laptop: kept and used, not sold) is split by price. A
// purchase of $2,500 or less goes on line 27a as its own row, the amount a taxpayer without an applicable
// financial statement may deduct at once under the de minimis safe harbor (Treas. Reg. 1.263(a)-1(f);
// $2,500 per invoice or item since 2016, IRS Notice 2015-82), which needs an election statement with each
// year's return. A purchase over it is depreciated, or expensed by election (section 179, bonus
// depreciation), on Form 4562, whose result is line 13. The worksheet does not work out Form 4562: line 13
// stays blank and names those purchases, and lines 28 to 31 leave them out, with a warning saying so. Each
// expense row is taken as one item; a row that adds up several items on one invoice may be split by the
// preparer.
import type { ExpenseCategory } from "@shared/enums";
import {
  describeMileagePricing,
  type PricedMileage,
  priceMileage,
} from "@shared/reference/mileage-rates";

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
    /**
     * Cost of the linked items; null = an order with no item linked. Omitted (undefined) = the caller does
     * not track links, and the unlinked-sales check is skipped.
     */
    cogsCents?: number | null;
    /** Units of a linked order left without an item (an order for three with one item linked: 2). */
    unitsWithoutCost?: number;
  }[];
  charges: { date: string; kind: string; amountCents: number }[];
  expenses: { date: string; category: ExpenseCategory; amountCents: number }[];
  items: {
    acquiredDate: string;
    costCents: number;
    status: string;
    disposedDate: string | null;
    /**
     * Set when the item is a copy of a sold item that came back on a refund: it is on hand from that date
     * (its `acquiredDate`) but was bought before, so it is not a purchase (line 36). Its cost was in cost of
     * goods sold when it sold; being on hand again at year end takes it back out through line 41.
     */
    returnSaleId?: string | null;
  }[];
  /** Lot cost not carried by any item (counted as a purchase so it is not lost; flagged). */
  unallocatedLots: { acquiredDate: string; cents: number }[];
  businessMiles: number;
  /**
   * Cents per mile the seller typed in to use for every trip; null = price each trip at the IRS rate in force on
   * its date (`mileage` below). Without `mileage`, null leaves line 9 blank (callers that only count miles).
   */
  mileageRateCents: number | null;
  /** Each trip's date and counted miles (a round trip twice), for line 9 by the IRS rate on its date. */
  mileage?: { date: string; miles: number }[];
  /**
   * Last day counted (YYYY-MM-DD, inside `year`): the year to date, with closing inventory on that day.
   * The quarterly estimated-tax periods (Form 2210 Schedule AI) use it. Omitted = December 31.
   */
  through?: string;
  /** Business use of the home for line 30 (simplified method); omitted or null = not entered. */
  homeOffice?: HomeOfficeInput | null;
  /**
   * Line 41 of the return the seller filed for the year before, as they typed it in; omitted or null = not
   * entered, and line 35 comes from the books alone.
   */
  filedOpeningCents?: number | null;
}

export interface HomeOfficeInput {
  /** Square feet used for the business. */
  officeSqft: number;
  /** Square feet of the whole home, shown as line 30 (a); null = not entered. */
  homeSqft: number | null;
  /** Months (1 = January) with 15 or more days of business use. */
  months: number[];
}

/** Simplified method: $5 a square foot (Rev. Proc. 2013-13). */
export const HOME_OFFICE_RATE_CENTS = 500;
/** At most 300 square feet count in any one month. */
export const HOME_OFFICE_MAX_SQFT = 300;

export interface HomeOfficeResult {
  /** Square feet counted per month (the business area, at most 300). */
  allowedSqft: number;
  monthsCounted: number;
  /** Before the line 29 limit. */
  fullCents: number;
  /** Line 30: the smaller of fullCents and line 29 (never below zero). */
  cents: number;
  /** What the limit cut, which the simplified method does not carry forward. */
  disallowedCents: number;
  warnings: string[];
}

/** Line 30 by the simplified method, limited by `line29Cents` (tentative profit). */
export function homeOfficeLine30(ho: HomeOfficeInput, line29Cents: number): HomeOfficeResult {
  const warnings: string[] = [];
  const months = new Set(ho.months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12));
  const office = Math.max(0, Math.floor(ho.officeSqft));
  const allowedSqft = Math.min(office, HOME_OFFICE_MAX_SQFT);
  if (office > HOME_OFFICE_MAX_SQFT) {
    warnings.push(
      `Only ${HOME_OFFICE_MAX_SQFT} of the ${office} business square feet count under the simplified method.`,
    );
  }
  if (ho.homeSqft != null && office > ho.homeSqft) {
    warnings.push("The business area entered is larger than the whole home; check both figures.");
  }
  // The average monthly allowable square footage (each month's, summed, over 12) times the rate.
  const fullCents = Math.round((allowedSqft * months.size * HOME_OFFICE_RATE_CENTS) / 12);
  const cents = Math.min(fullCents, Math.max(0, line29Cents));
  if (cents < fullCents) {
    warnings.push(
      `Line 30 is limited to line 29: ${usd(fullCents - cents)} of the simplified home office amount is not deductible this year, and the simplified method does not carry it forward.`,
    );
  }
  return {
    allowedSqft,
    monthsCounted: months.size,
    fullCents,
    cents,
    disallowedCents: fullCents - cents,
    warnings,
  };
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
  /** Line 35's two sources: the books' count on December 31 of the year before, and the filed figure. */
  openingInventory: { booksCents: number; filedCents: number | null };
  /**
   * Orders in the period with no item (or too few items) linked, and the items in line 41 that could be what
   * they sold. Null when every order is linked or the caller does not track links.
   */
  unlinkedSales: UnlinkedSales | null;
  /** How line 9 was priced (miles per rate, miles with no rate); null when the caller gave no trips. */
  mileagePricing: PricedMileage | null;
  /** Equipment on line 27a and left for Form 4562; null when there is none and nothing looks like it. */
  equipment: EquipmentSummary | null;
}

export interface UnlinkedSales {
  /** Orders in the period with no item linked, or fewer items than units sold. */
  orders: number;
  /** The last such order's date. */
  lastDate: string;
  /** Items counted in line 41 that were bought on or before `lastDate`. */
  itemsOnHand: number;
  /** Their cost: the most line 41 can be overstated by. */
  itemsOnHandCents: number;
}

export const SCHEDULE_C_DISCLAIMER =
  "Worksheet only: these are your own records arranged by Schedule C line. It is not a tax return and not tax advice. Check every line with your tax preparer or the IRS instructions before you file.";

/**
 * Whether an item is in inventory at the end of `day` (YYYY-MM-DD): bought by then and not yet sold, written
 * off or taken for personal use. An item marked as gone without a date counts as still on hand (the worksheet
 * warns). Lines 35 and 41 and the year-end inventory list all use this one rule.
 */
export function onHandAt(
  it: { acquiredDate: string; status: string; disposedDate: string | null },
  day: string,
): boolean {
  if (it.acquiredDate > day) return false;
  return !(it.status !== "in_stock" && it.disposedDate != null && it.disposedDate <= day);
}

/** The Schedule C line each expense category lands on ("27a:postage" is line 27a, the postage row). */
export const EXPENSE_LINE: Record<ExpenseCategory, string> = {
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
  equipment: "27a:equipment",
  other: "27a:other",
};

/**
 * The most a taxpayer without an applicable financial statement may deduct at once per invoice or item under
 * the de minimis safe harbor (Treas. Reg. 1.263(a)-1(f)(1)(ii)(D), $2,500 since 2016 by IRS Notice 2015-82).
 */
export const DE_MINIMIS_LIMIT_CENTS = 250_000;
/** The title the regulation gives the election statement attached to the return (1.263(a)-1(f)(5)). */
export const DE_MINIMIS_ELECTION_TITLE = "Section 1.263(a)-1(f) de minimis safe harbor election";
/** The worksheet bucket for equipment over the de minimis limit: Form 4562, then line 13 (not summed here). */
export const FORM_4562_LINE = "13:form4562";

/**
 * The worksheet line one expense lands on. Every category has one line, except equipment: at or under the de
 * minimis limit it is a line 27a row, over it it is for Form 4562 (line 13), which the worksheet leaves out.
 */
export function expenseLine(category: ExpenseCategory, amountCents: number): string {
  if (category === "equipment" && amountCents > DE_MINIMIS_LIMIT_CENTS) return FORM_4562_LINE;
  return EXPENSE_LINE[category];
}

/** Categories where one purchase over the de minimis limit is more likely equipment than a running cost. */
const MAYBE_EQUIPMENT: readonly ExpenseCategory[] = ["office", "supplies", "other"];

export interface EquipmentSummary {
  /** Equipment at or under the limit, on line 27a. */
  deMinimisCount: number;
  deMinimisCents: number;
  /** Equipment over the limit, left for Form 4562 and line 13. */
  form4562Count: number;
  form4562Cents: number;
  /** Office, supplies or other expenses over the limit: possibly equipment filed as a running cost. */
  largeOtherCount: number;
  largeOtherCents: number;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function buildScheduleC(input: ScInput): ScWorksheet {
  const y = String(input.year);
  const start = `${y}-01-01`;
  const end = input.through ?? `${y}-12-31`;
  if (end < start || end > `${y}-12-31`) throw new Error(`through must fall inside ${y}`);
  const inYear = (d: string) => d >= start && d <= end;
  const warnings: string[] = [];
  const bucket = new Map<string, number>();
  const add = (line: string, cents: number) => bucket.set(line, (bucket.get(line) ?? 0) + cents);

  let gross = 0;
  let returns = 0;
  let unlinkedOrders = 0;
  let lastUnlinked = "";
  for (const s of input.sales) {
    if (!inYear(s.date)) continue;
    if (s.kind === "order") {
      gross += s.itemCents + s.shippingChargedCents;
      if (s.cogsCents === null || (s.cogsCents !== undefined && (s.unitsWithoutCost ?? 0) > 0)) {
        unlinkedOrders++;
        if (s.date > lastUnlinked) lastUnlinked = s.date;
      }
    } else returns += s.refundCents;
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
  const eq: EquipmentSummary = {
    deMinimisCount: 0,
    deMinimisCents: 0,
    form4562Count: 0,
    form4562Cents: 0,
    largeOtherCount: 0,
    largeOtherCents: 0,
  };
  for (const e of input.expenses) {
    if (!inYear(e.date)) continue;
    if (e.category === "meals") {
      mealsFull += e.amountCents;
      continue;
    }
    const line = expenseLine(e.category, e.amountCents);
    if (line === FORM_4562_LINE) {
      eq.form4562Count++;
      eq.form4562Cents += e.amountCents;
      continue;
    }
    if (e.category === "equipment") {
      eq.deMinimisCount++;
      eq.deMinimisCents += e.amountCents;
    } else if (MAYBE_EQUIPMENT.includes(e.category) && e.amountCents > DE_MINIMIS_LIMIT_CENTS) {
      eq.largeOtherCount++;
      eq.largeOtherCents += e.amountCents;
    }
    add(line, e.amountCents);
  }
  const limit = usd(DE_MINIMIS_LIMIT_CENTS);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (eq.deMinimisCount > 0) {
    warnings.push(
      `${n(eq.deMinimisCount, "equipment purchase", "equipment purchases")} of ${limit} or less (${usd(eq.deMinimisCents)} in all) ${eq.deMinimisCount === 1 ? "is" : "are"} on line 27a under the de minimis safe harbor. That needs an election each year: a statement titled "${DE_MINIMIS_ELECTION_TITLE}" with your name, address and taxpayer identification number, attached to your timely filed original return. Without it, equipment is depreciated on Form 4562 instead. The ${limit} limit is per invoice or per item on an invoice; ask your preparer.`,
    );
  }
  if (eq.form4562Count > 0) {
    warnings.push(
      `${n(eq.form4562Count, "equipment purchase", "equipment purchases")} over ${limit} (${usd(eq.form4562Cents)} in all) ${eq.form4562Count === 1 ? "is" : "are"} not on this worksheet: equipment over the de minimis limit is depreciated, or expensed by election (section 179 or bonus depreciation), on Form 4562, and the result goes on line 13. Lines 28, 29 and 31 here leave ${eq.form4562Count === 1 ? "it" : "them"} out, so they read higher than your return will. Work out Form 4562 with your preparer; the expense list names each purchase.`,
    );
  }
  if (eq.largeOtherCount > 0) {
    warnings.push(
      `${n(eq.largeOtherCount, "expense", "expenses")} over ${limit} (${usd(eq.largeOtherCents)} in all) ${eq.largeOtherCount === 1 ? "is" : "are"} filed as office, supplies or other. If one is equipment you keep and use (a computer, camera, printer or shelving), change its category to Equipment: over ${limit} it is depreciated on Form 4562, not deducted on this line.`,
    );
  }
  if (mealsFull) {
    // Business meals are generally 50% deductible; the full amount is shown in the note.
    add("24b", Math.round(mealsFull / 2));
  }

  // Part III: inventory at cost.
  let opening = 0;
  let purchases = 0;
  let personalUse = 0;
  let restocked = 0;
  let closing = 0;
  let suspectItems = 0;
  let suspectCents = 0;
  for (const it of input.items) {
    if (onHandAt(it, `${input.year - 1}-12-31`)) opening += it.costCents;
    if (inYear(it.acquiredDate)) {
      if (it.returnSaleId) restocked += it.costCents;
      else purchases += it.costCents;
    }
    if (it.status === "personal_use" && it.disposedDate && inYear(it.disposedDate))
      personalUse += it.costCents;
    if (onHandAt(it, end)) {
      closing += it.costCents;
      if (unlinkedOrders > 0 && it.acquiredDate <= lastUnlinked) {
        suspectItems++;
        suspectCents += it.costCents;
      }
    }
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
  const unlinkedSales: UnlinkedSales | null =
    unlinkedOrders > 0
      ? {
          orders: unlinkedOrders,
          lastDate: lastUnlinked,
          itemsOnHand: suspectItems,
          itemsOnHandCents: suspectCents,
        }
      : null;
  const endLabel = input.through ? end : `December 31, ${y}`;
  let closingNote: string | undefined;
  if (unlinkedSales && suspectItems > 0) {
    const sales = unlinkedOrders === 1 ? "1 sale" : `${unlinkedOrders} sales`;
    const items = suspectItems === 1 ? "1 item" : `${suspectItems} items`;
    warnings.push(
      `${sales} in ${y} ${unlinkedOrders === 1 ? "has" : "have"} no stock item linked (or fewer items than units sold), while ${items} costing ${usd(suspectCents)}, bought on or before ${lastUnlinked}, ${suspectItems === 1 ? "is" : "are"} still in stock on ${endLabel} and counted in line 41. If any of them is what sold, line 41 is overstated and line 42 understated by its cost (up to ${usd(suspectCents)} in all). Link those sales to their items on the Sales page ("Only orders without an item") before you use Part III; a sale of something never entered as an item needs no change.`,
    );
    closingNote = `Includes ${usd(suspectCents)} of stock that could be what ${sales} with no item linked sold.`;
  }
  const booksOpening = opening;
  const filedOpening = input.filedOpeningCents ?? null;
  const prior = input.year - 1;
  let openingNote: string | undefined;
  if (filedOpening != null) {
    opening = filedOpening;
    openingNote = `Line 41 of your ${prior} return, as you entered it. Your books show ${usd(booksOpening)} on hand at December 31, ${prior}.`;
    const gap = filedOpening - booksOpening;
    if (gap !== 0) {
      warnings.push(
        `Line 35 uses the ${usd(filedOpening)} you entered from your ${prior} return, but your books show ${usd(booksOpening)} of stock on hand at December 31, ${prior}: ${usd(Math.abs(gap))} ${gap > 0 ? "more on the return" : "less on the return"}. The difference ${gap > 0 ? "raises" : "lowers"} cost of goods sold (line 42) this year. If stock bought before ${input.year} is missing from your items (or is marked sold too early), fix the items; if the ${prior} return was wrong, ask your preparer how to correct it.`,
      );
    }
  }
  const line36 = purchases - personalUse;
  const line40 = opening + line36;
  const cogs = line40 - closing;

  let car: number | null = null;
  let carNote = `${input.businessMiles.toFixed(1)} business miles (line 44a)`;
  let mileagePricing: PricedMileage | null = null;
  if (input.mileage) {
    mileagePricing = priceMileage(
      input.mileage.filter((t) => inYear(t.date)),
      input.mileageRateCents,
    );
    car = mileagePricing.cents;
    if (mileagePricing.byRate.length) carNote += `: ${describeMileagePricing(mileagePricing)}`;
    if (mileagePricing.unpricedRange) {
      const r = mileagePricing.unpricedRange;
      warnings.push(
        `${mileagePricing.unpricedMiles.toFixed(1)} business miles driven ${r.from === r.to ? `on ${r.from}` : `from ${r.from} to ${r.to}`} have no IRS standard mileage rate in this app yet (the IRS announces each year's rate near its start), so they are left out of line 9. Type in the rate from irs.gov to price every trip at it.`,
      );
    }
  } else if (input.businessMiles > 0) {
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
    {
      line: "27a",
      label: `Equipment expensed under the de minimis safe harbor (${limit} or less an item)`,
      amountCents: get("27a:equipment"),
    },
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
  const line29 = line7 - expenses;
  const ho = input.homeOffice ?? null;
  const home = ho ? homeOfficeLine30(ho, line29) : null;
  if (home) warnings.push(...home.warnings);
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
    ...expenseLines.flatMap(([line, label]): ScLine[] => [
      {
        line,
        label,
        amountCents: line === "9" ? car : get(line),
        ...(line === "24b" && mealsFull
          ? { note: `50% of ${usd(mealsFull)} of meals entered` }
          : {}),
        ...(line === "9" ? { note: carNote } : {}),
      },
      ...(line === "10" && eq.form4562Count > 0
        ? [
            {
              line: "13",
              label: "Depreciation and section 179 expense (from Form 4562)",
              amountCents: null,
              note: `Not worked out here: ${n(eq.form4562Count, "equipment purchase", "equipment purchases")} over ${limit}, ${usd(eq.form4562Cents)} of cost, go on Form 4562. Left out of lines 28 to 31.`,
            },
          ]
        : []),
    ]),
    { line: "27a", label: "Other expenses (see Part V list)", amountCents: line27a },
    { line: "28", label: "Total expenses", amountCents: expenses },
    {
      line: "29",
      label: "Tentative profit or (loss)",
      amountCents: line29,
    },
    ho && home
      ? {
          line: "30",
          label: "Business use of home (simplified method)",
          amountCents: home.cents,
          note: `${home.allowedSqft} sq ft × $${HOME_OFFICE_RATE_CENTS / 100} × ${home.monthsCounted}/12 months${
            ho.homeSqft != null
              ? `; (a) home ${ho.homeSqft} sq ft, (b) business ${Math.floor(ho.officeSqft)} sq ft`
              : ""
          }`,
        }
      : {
          line: "30",
          label: "Business use of home",
          amountCents: null,
          note: "Not entered: add the space you use below (simplified method), or work out Form 8829 with your preparer.",
        },
    {
      line: "31",
      label: "Net profit or (loss)",
      amountCents: line29 - (home?.cents ?? 0),
    },
  ];
  const partIII: ScLine[] = [
    {
      line: "35",
      label: "Inventory at beginning of year",
      amountCents: opening,
      ...(openingNote ? { note: openingNote } : {}),
    },
    {
      line: "36",
      label: "Purchases less cost of items withdrawn for personal use",
      amountCents: line36,
      ...(personalUse || restocked
        ? {
            note: [
              personalUse ? `${usd(personalUse)} withdrawn for personal use` : "",
              restocked
                ? `Leaves out ${usd(restocked)} of items that came back on refunds: they were bought before, so they are not purchases`
                : "",
            ]
              .filter(Boolean)
              .join(". "),
          }
        : {}),
    },
    { line: "40", label: "Add lines 35 through 39", amountCents: line40 },
    {
      line: "41",
      label: "Inventory at end of year",
      amountCents: closing,
      ...(closingNote ? { note: closingNote } : {}),
    },
    { line: "42", label: "Cost of goods sold", amountCents: cogs },
  ];
  return {
    year: input.year,
    disclaimer: SCHEDULE_C_DISCLAIMER,
    lines,
    partIII,
    otherExpenses,
    warnings: [...new Set(warnings)],
    openingInventory: { booksCents: booksOpening, filedCents: filedOpening },
    unlinkedSales,
    mileagePricing,
    equipment: eq.deMinimisCount + eq.form4562Count + eq.largeOtherCount > 0 ? eq : null,
  };
}
