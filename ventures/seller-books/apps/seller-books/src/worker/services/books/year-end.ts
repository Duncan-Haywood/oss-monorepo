// Year-end records: the lists behind three Schedule C worksheet figures, as CSV rows for the seller's files or
// their preparer. Pure functions; the routes load the shop's rows and pass them in.
//
// - The closing inventory list: every item on hand at the end of December 31, at cost. Its total is
//   worksheet Part III line 41 (both use `onHandAt`), so the list is the count behind that line.
// - The mileage log: every trip in the year, with the miles counted (a round trip twice). Its total is the
//   worksheet's business miles (Part IV line 44a), and each trip carries the IRS rate in force on its date (or
//   the one rate the seller typed in), so its amounts total to line 9. IRS Publication
//   463 asks for a record of each business use: date, destination, purpose and miles.
// - The expense list: every expense typed in or imported for the year, with the worksheet line it lands on.
//   Meals show the full amount paid; line 24b counts half.
//
// These are the seller's own records, not a filing and not tax advice.
import type { ExpenseCategory } from "@shared/enums";
import {
  describeMileagePricing,
  irsBusinessRateOn,
  priceMileage,
} from "@shared/reference/mileage-rates";
import {
  DE_MINIMIS_ELECTION_TITLE,
  DE_MINIMIS_LIMIT_CENTS,
  expenseLine,
  FORM_4562_LINE,
  onHandAt,
} from "./schedule-c";

export type CsvRow = (string | number | null)[];

const dollars = (cents: number) => (cents / 100).toFixed(2);

export const YEAR_END_NOTE =
  "From your own records in Seller Books. Not a tax return, not a filing and not tax advice.";

export interface InventoryListItem {
  sku: string | null;
  title: string;
  acquiredDate: string;
  costCents: number;
  costIsManual: boolean;
  status: string;
  disposedDate: string | null;
  lotName: string | null;
}

export interface InventoryList {
  rows: CsvRow[];
  count: number;
  totalCents: number;
}

function statusAtYearEnd(it: InventoryListItem): string {
  if (it.status === "in_stock") return "In stock";
  if (it.disposedDate == null) return "Marked gone with no date";
  // Sold, written off or taken after the year end: on hand on December 31, gone since.
  return `On hand; left ${it.disposedDate}`;
}

/** Items on hand at the end of December 31 of `year`, oldest first. The total is worksheet line 41. */
export function closingInventoryList(year: number, items: InventoryListItem[]): InventoryList {
  const end = `${year}-12-31`;
  const onHand = items
    .filter((it) => onHandAt(it, end))
    .sort(
      (a, b) =>
        a.acquiredDate.localeCompare(b.acquiredDate) ||
        (a.sku ?? "").localeCompare(b.sku ?? "") ||
        a.title.localeCompare(b.title),
    );
  const totalCents = onHand.reduce((s, it) => s + it.costCents, 0);
  const undated = onHand.filter((it) => it.status !== "in_stock" && it.disposedDate == null).length;
  const rows: CsvRow[] = [
    [`Closing inventory at ${end} (at cost)`],
    [YEAR_END_NOTE],
    [],
    ["Acquired", "SKU", "Item", "Lot", "Cost (USD)", "Cost basis", `Status on ${end}`],
    ...onHand.map((it) => [
      it.acquiredDate,
      it.sku ?? "",
      it.title,
      it.lotName ?? "",
      dollars(it.costCents),
      it.costIsManual || !it.lotName ? "Typed in" : "Share of lot cost",
      statusAtYearEnd(it),
    ]),
    ["Total", "", `${onHand.length} item(s)`, "", dollars(totalCents), "", ""],
    [],
    [
      `The total is Schedule C Part III line 41 (inventory at end of year) on the ${year} worksheet.`,
    ],
  ];
  if (undated > 0) {
    rows.push([
      `${undated} item(s) are marked sold, written off or personal use with no date, so they are counted as on hand. Add the date to correct line 41.`,
    ]);
  }
  return { rows, count: onHand.length, totalCents };
}

export interface MileageLogTrip {
  date: string;
  purpose: string;
  startPlace: string | null;
  endPlace: string | null;
  milesTenths: number;
  roundTrip: boolean;
}

/**
 * Every trip in the year, by date. Miles counted: a round trip counts twice. Total = business miles. Each trip
 * is priced at `rateCents` when the seller typed one in, else at the IRS rate in force on its date; the total
 * is rounded once, as line 9 is, so it is the worksheet's line 9 to the cent.
 */
export function mileageLog(
  year: number,
  trips: MileageLogTrip[],
  rateCents: number | null,
): { rows: CsvRow[]; count: number; miles: number; line9Cents: number | null } {
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));
  const countedTenths = (t: MileageLogTrip) => t.milesTenths * (t.roundTrip ? 2 : 1);
  const totalTenths = sorted.reduce((s, t) => s + countedTenths(t), 0);
  const miles = totalTenths / 10;
  const rateOf = (date: string) => rateCents ?? irsBusinessRateOn(date)?.cents ?? null;
  const priced = priceMileage(
    sorted.map((t) => ({ date: t.date, miles: countedTenths(t) / 10 })),
    rateCents,
  );
  let summary: string;
  if (!sorted.length) summary = "No trips logged: line 9 is not worked out here.";
  else if (priced.cents == null)
    summary =
      "No standard mileage rate for these dates yet: type in the IRS rate on the Schedule C page to work out line 9.";
  else
    summary = `Line 9 (car and truck expenses) is $${dollars(priced.cents)}: ${describeMileagePricing(priced)}.${
      priced.unpricedMiles > 0
        ? ` ${priced.unpricedMiles.toFixed(1)} miles have no rate yet and are left out.`
        : ""
    }`;
  const rows: CsvRow[] = [
    [`Business mileage log ${year}`],
    [YEAR_END_NOTE],
    [],
    [
      "Date",
      "Purpose",
      "From",
      "To",
      "Miles (one way)",
      "Round trip",
      "Miles counted",
      "Rate (cents/mile)",
      "Amount (USD)",
    ],
    ...sorted.map((t) => {
      const r = rateOf(t.date);
      return [
        t.date,
        t.purpose,
        t.startPlace ?? "",
        t.endPlace ?? "",
        (t.milesTenths / 10).toFixed(1),
        t.roundTrip ? "Yes" : "No",
        (countedTenths(t) / 10).toFixed(1),
        r ?? "",
        r == null ? "" : dollars(Math.round((countedTenths(t) / 10) * r)),
      ];
    }),
    [
      "Total",
      `${sorted.length} trip(s)`,
      "",
      "",
      "",
      "",
      miles.toFixed(1),
      "",
      priced.cents == null ? "" : dollars(priced.cents),
    ],
    [],
    [`The miles total is the business miles on the ${year} worksheet (Part IV line 44a).`],
    [summary],
    [
      rateCents == null
        ? "Rates: the IRS standard mileage rate for business in force on each trip's date (irs.gov, Standard mileage rates). Each row's amount is rounded on its own; the total is rounded once."
        : `Rate: the ${rateCents} cents a mile you chose, for every trip.`,
    ],
  ];
  return { rows, count: sorted.length, miles, line9Cents: priced.cents };
}

export interface ExpenseListRow {
  date: string;
  category: ExpenseCategory;
  amountCents: number;
  vendor: string | null;
  memo: string | null;
  platform: string | null;
}

/** Every expense in the year, by date, with the worksheet line it lands on. */
export function expenseList(
  year: number,
  expenses: ExpenseListRow[],
  labels: { category: (c: ExpenseCategory) => string; platform: (p: string) => string },
): { rows: CsvRow[]; count: number; totalCents: number; mealsCents: number } {
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  const totalCents = sorted.reduce((s, e) => s + e.amountCents, 0);
  const mealsCents = sorted
    .filter((e) => e.category === "meals")
    .reduce((s, e) => s + e.amountCents, 0);
  const lineOf = (c: ExpenseCategory, cents: number) => {
    const line = expenseLine(c, cents);
    return line === FORM_4562_LINE ? "13 (Form 4562)" : (line.split(":")[0] ?? "");
  };
  const rows: CsvRow[] = [
    [`Business expenses ${year}`],
    [YEAR_END_NOTE],
    [],
    ["Date", "Vendor", "Category", "Schedule C line", "Amount (USD)", "Platform", "Memo"],
    ...sorted.map((e) => [
      e.date,
      e.vendor ?? "",
      labels.category(e.category),
      lineOf(e.category, e.amountCents),
      dollars(e.amountCents),
      e.platform ? labels.platform(e.platform) : "",
      e.memo ?? "",
    ]),
    ["Total", `${sorted.length} expense(s)`, "", "", dollars(totalCents), "", ""],
    [],
    [
      "Marketplace fees, postage labels and ads that came in the platforms' own reports are in the sales ledger, not here.",
    ],
  ];
  if (mealsCents > 0) {
    rows.push([
      `Meals are listed at the full $${dollars(mealsCents)} paid; line 24b on the worksheet counts half ($${dollars(Math.round(mealsCents / 2))}).`,
    ]);
  }
  const equipment = sorted.filter((e) => e.category === "equipment");
  if (equipment.length > 0) {
    const over = equipment.filter((e) => e.amountCents > DE_MINIMIS_LIMIT_CENTS);
    const overCents = over.reduce((sum, e) => sum + e.amountCents, 0);
    rows.push([
      `Equipment of $${dollars(DE_MINIMIS_LIMIT_CENTS)} or less an item is on line 27a under the de minimis safe harbor, which needs a statement titled "${DE_MINIMIS_ELECTION_TITLE}" with the return.${
        over.length > 0
          ? ` ${over.length} over that ($${dollars(overCents)}) ${over.length === 1 ? "is" : "are"} for Form 4562 (depreciation or section 179), whose result is line 13; the worksheet leaves ${over.length === 1 ? "it" : "them"} out.`
          : ""
      }`,
    ]);
  }
  return { rows, count: sorted.length, totalCents, mealsCents };
}

// The year-end package (GET /reports/year-end.zip): the files above plus the worksheet, the sales ledger and
// the QuickBooks journal for one tax year, with a README that says what each file is and which worksheet
// figure it totals to, so a preparer opening the ZIP cold knows where to look.

export function yearEndPackageFiles(year: number) {
  return {
    readme: "README.txt",
    worksheet: `schedule-c-worksheet-${year}.csv`,
    ledger: `sales-ledger-${year}-01-01-to-${year}-12-31.csv`,
    inventory: `closing-inventory-${year}.csv`,
    mileage: `mileage-log-${year}.csv`,
    expenses: `expenses-${year}.csv`,
    journal: `quickbooks-journal-${year}.csv`,
  } as const;
}

interface ReadmeLine {
  line: string;
  label: string;
  amountCents: number | null;
}

export interface YearEndReadmeInput {
  year: number;
  /** ISO timestamp the package was built. */
  generatedAt: string;
  worksheet: {
    disclaimer: string;
    lines: ReadmeLine[];
    partIII: ReadmeLine[];
    warnings: string[];
    businessMiles: number;
  };
  mileageRate: number | null;
  counts: {
    ledgerRows: number;
    revenueCents: number;
    inventoryItems: number;
    inventoryCents: number;
    trips: number;
    miles: number;
    line9Cents: number | null;
    expenses: number;
    expensesCents: number;
  };
}

const usd = (cents: number | null | undefined) => {
  if (cents == null) return "not entered";
  const s = (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cents < 0 ? `($${s})` : `$${s}`;
};

/** The package's README.txt: plain text with CRLF line ends, so Notepad shows it as written. */
export function yearEndReadme(r: YearEndReadmeInput): string {
  const f = yearEndPackageFiles(r.year);
  const pick = (lines: ReadmeLine[], n: string) =>
    lines.filter((l) => l.line === n).at(-1)?.amountCents ?? null;
  const line = (n: string) => pick(r.worksheet.lines, n);
  const part3 = (n: string) => pick(r.worksheet.partIII, n);
  const c = r.counts;
  const out: string[] = [
    `Seller Books: year-end records for ${r.year}`,
    `Built ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC from the shop's books as they stood then.`,
    "",
    YEAR_END_NOTE,
    r.worksheet.disclaimer,
    "",
    "THE WORKSHEET'S HEADLINE FIGURES",
    `  Line 1    Gross receipts               ${usd(line("1"))}`,
    `  Line 4    Cost of goods sold           ${usd(line("4"))}`,
    `  Line 28   Total expenses               ${usd(line("28"))}`,
    `  Line 31   Net profit or (loss)         ${usd(line("31"))}`,
    `  Line 41   Inventory at end of year     ${usd(part3("41"))}`,
    `  Line 44a  Business miles               ${r.worksheet.businessMiles.toFixed(1)}`,
    "",
    "THE FILES",
    `  ${f.worksheet}`,
    "    The Schedule C worksheet, line by line, with each line's note and the warnings below.",
    `  ${f.ledger}`,
    `    Every sale, refund and fee behind lines 1 to 7: ${c.ledgerRows} row(s), revenue ${usd(c.revenueCents)}.`,
    `  ${f.inventory}`,
    `    Every item on hand on December 31 at cost: ${c.inventoryItems} item(s), ${usd(c.inventoryCents)}, which is line 41.`,
    `  ${f.mileage}`,
    `    Every trip with its date, purpose and miles: ${c.trips} trip(s), ${c.miles.toFixed(1)} mile(s), which is line 44a;${
      c.line9Cents == null ? " no line 9 amount." : ` line 9 ${usd(c.line9Cents)}.`
    }`,
    r.mileageRate == null
      ? "    Each trip is priced at the IRS standard mileage rate in force on its date."
      : `    Each trip is priced at ${r.mileageRate} cents a mile, the rate typed in when the package was built.`,
    "    The standard mileage rate applies only if you use it for this car rather than actual expenses.",
    `  ${f.expenses}`,
    `    Every expense for the year with the worksheet line it lands on: ${c.expenses} expense(s), ${usd(c.expensesCents)} paid`,
    "    (meals at the full amount paid; line 24b counts half).",
    `  ${f.journal}`,
    "    The same sales as QuickBooks Online journal entries, one per platform per month, with the default",
    "    account names (the app's QuickBooks export lets you rename them). Cost of goods is not posted.",
    "",
  ];
  if (r.worksheet.warnings.length > 0) {
    out.push("WARNINGS TO READ BEFORE USING THESE FIGURES");
    for (const w of r.worksheet.warnings) out.push(`  - ${w}`);
    out.push("");
  }
  out.push(
    "The CSV files open in Excel, Numbers, Google Sheets or LibreOffice. Amounts are US dollars.",
    "Keep these with your other tax records: the IRS asks for records that support each figure you report.",
    "",
  );
  return out.join("\r\n");
}
