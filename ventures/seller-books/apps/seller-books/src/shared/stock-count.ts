// Stock count: checking the shelves against the books before a year end (or any day), so the closing
// inventory on Schedule C line 41 counts only what is really there.
//
// The books say an item is on hand on a day when it was bought on or before it and has not left
// (`onHandAt` in services/books/schedule-c.ts). A count lists the items that are still in stock now and
// were bought on or before the count's date, the seller ticks each one found (by hand, by typing or
// scanning its SKU, or from the count sheet filled in on paper or in a spreadsheet), and the ones not
// found leave inventory on the count's date as written off (lost, damaged, thrown away, donated) or taken
// for personal use. An item that left on day D is not on hand on D, so a count dated December 31 takes
// them out of that year's line 41. Nothing here decides what the seller found; it only keeps the sums.
//
// Pure functions shared by the Inventory page (the count, the sheet download and reading it back) and the
// server's checks (routes/org/inventory.ts, "count").
import { parseCsv, toCsv } from "./csv";

export interface CountItem {
  id: string;
  title: string;
  sku: string | null;
  acquiredDate: string;
  costCents: number;
  lotName: string | null;
  source: string | null;
}

/** Why an item can leave inventory on a count: the two statuses besides "sold". */
export const COUNT_OUTCOMES = ["written_off", "personal_use"] as const;
export type CountOutcome = (typeof COUNT_OUTCOMES)[number];

/** Most items one count can write off or put back in one request (D1 batches are sliced below it). */
export const MAX_COUNT_ITEMS = 5000;

/** Items the count expects: still in stock now and bought on or before the count's date. */
export function expectedOnCount<T extends { status: string; acquiredDate: string }>(
  items: T[],
  asOf: string,
): T[] {
  return items.filter((i) => i.status === "in_stock" && i.acquiredDate <= asOf);
}

const normSku = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The item a typed or scanned code ticks: the first one not yet found whose SKU matches (case and spacing
 * ignored), so three items with one SKU tick one per scan. `already` when every match is found, `none`
 * when no item has that SKU.
 */
export function matchCode(
  items: CountItem[],
  found: ReadonlySet<string>,
  code: string,
): { kind: "found"; item: CountItem } | { kind: "already"; sku: string } | { kind: "none" } {
  const want = normSku(code);
  if (!want) return { kind: "none" };
  const matches = items.filter((i) => i.sku != null && normSku(i.sku) === want);
  if (matches.length === 0) return { kind: "none" };
  const next = matches.find((i) => !found.has(i.id));
  return next ? { kind: "found", item: next } : { kind: "already", sku: matches[0]?.sku ?? code };
}

export interface CountSummary {
  expected: number;
  expectedCents: number;
  found: number;
  foundCents: number;
  missing: number;
  missingCents: number;
  /** Items not found, oldest first: the order a seller checks a back room in. */
  missingItems: CountItem[];
}

export function summariseCount(items: CountItem[], found: ReadonlySet<string>): CountSummary {
  let foundN = 0;
  let foundCents = 0;
  let expectedCents = 0;
  const missingItems: CountItem[] = [];
  for (const i of items) {
    expectedCents += i.costCents;
    if (found.has(i.id)) {
      foundN++;
      foundCents += i.costCents;
    } else missingItems.push(i);
  }
  missingItems.sort(
    (a, b) => a.acquiredDate.localeCompare(b.acquiredDate) || a.title.localeCompare(b.title),
  );
  return {
    expected: items.length,
    expectedCents,
    found: foundN,
    foundCents,
    missing: missingItems.length,
    missingCents: expectedCents - foundCents,
    missingItems,
  };
}

export const COUNT_SHEET_HEADER = [
  "Item ID",
  "SKU",
  "Item",
  "Lot",
  "Where bought",
  "Bought",
  "Cost",
  "Found (Y/N)",
] as const;

/**
 * The count sheet: one row per expected item, sorted by SKU then title so it reads like a shelf, with a
 * blank "Found (Y/N)" column to fill in on paper or in a spreadsheet. The Item ID column is what reads it
 * back; the rest is for the person counting. Cells are formula-safe (csvCell).
 */
export function countSheetCsv(items: CountItem[], found: ReadonlySet<string> = new Set()): string {
  const sorted = [...items].sort(
    (a, b) =>
      (a.sku ?? "￿").localeCompare(b.sku ?? "￿") ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
  return toCsv([
    [...COUNT_SHEET_HEADER],
    ...sorted.map((i) => [
      i.id,
      i.sku,
      i.title,
      i.lotName,
      i.source,
      i.acquiredDate,
      (i.costCents / 100).toFixed(2),
      found.has(i.id) ? "Y" : "",
    ]),
  ]);
}

export interface CountSheetRead {
  /** Item ids marked found. */
  found: string[];
  /** Item ids marked not found. */
  notFound: string[];
  /** Rows left blank: neither found nor not, so they stay as they are on the page. */
  blank: number;
  /** Row problems, each with its line number in the file (the header is line 1). */
  problems: string[];
}

const YES = /^(y|yes|x|1|true|found|ok|✓|✔)$/i;
const NO = /^(n|no|0|false|missing|not found|gone)$/i;

/**
 * Reads a count sheet back (the CSV above after it was filled in, saved as CSV again). Rows are matched by
 * Item ID only; an id that is not on this count (sold since, or from another shop's sheet) is a problem
 * named by its line, never guessed from the title. Columns are found by header name, so a spreadsheet
 * that moved or added columns still reads.
 */
export function readCountSheet(csv: string, expected: CountItem[]): CountSheetRead {
  const rows = parseCsv(csv);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idCol = header.indexOf("item id");
  const foundCol = header.findIndex((h) => h.startsWith("found"));
  const out: CountSheetRead = { found: [], notFound: [], blank: 0, problems: [] };
  if (idCol < 0 || foundCol < 0) {
    out.problems.push(
      'This is not a count sheet: it needs the "Item ID" and "Found (Y/N)" columns of the sheet downloaded here.',
    );
    return out;
  }
  const ids = new Set(expected.map((i) => i.id));
  const seen = new Set<string>();
  rows.slice(1).forEach((row, n) => {
    const line = n + 2;
    if (row.every((c) => c.trim() === "")) return;
    const id = (row[idCol] ?? "").trim();
    const mark = (row[foundCol] ?? "").trim();
    if (!id) {
      out.problems.push(`Line ${line}: no Item ID, so it cannot be matched to an item.`);
      return;
    }
    if (!ids.has(id)) {
      out.problems.push(
        `Line ${line}: ${id} is not on this count (sold or removed since the sheet was made, or a sheet from another day).`,
      );
      return;
    }
    if (seen.has(id)) {
      out.problems.push(`Line ${line}: ${id} is on the sheet twice; the first row counts.`);
      return;
    }
    seen.add(id);
    if (mark === "") out.blank++;
    else if (YES.test(mark)) out.found.push(id);
    else if (NO.test(mark)) out.notFound.push(id);
    else
      out.problems.push(
        `Line ${line}: "${mark}" is not Y or N, so ${id} is left as it is on the page.`,
      );
  });
  return out;
}

/** What the count does to the year's Schedule C, in words for the confirm step. */
export function countEffect(asOf: string, outcome: CountOutcome, missingCents: number): string {
  const dollars = `$${(missingCents / 100).toFixed(2)}`;
  const year = asOf.slice(0, 4);
  const yearEnd = asOf.endsWith("-12-31");
  const closing = yearEnd
    ? `They leave line 41 (closing inventory) for ${year}, so ${dollars} more goes into cost of goods sold (line 42).`
    : `They are no longer counted on hand from ${asOf}, so ${year}'s closing inventory (line 41) is ${dollars} lower than the books had it.`;
  return outcome === "personal_use"
    ? `${closing} Taken for personal use, the same ${dollars} comes off line 36 (purchases), so it is not deducted.`
    : closing;
}
