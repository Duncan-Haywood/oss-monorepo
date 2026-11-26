// A reseller's own sourcing sheet (one row per purchase) -> inventory items. Pure: no DB.
//
// Sellers keep these in a spreadsheet long before they find a books app: item, SKU, quantity, what they
// paid and when. Typing hundreds of rows in by hand is where onboarding stalls, so this reads the sheet
// saved as CSV. Columns are matched by name, as for the marketplace reports (parse.ts); the names are the
// ones in ventures/reseller-books/inventory.mjs in the public repository, which reads the same sheets.
//
// Rules:
// - A row needs a purchase date, a cost (per unit or for the row) and an item name or SKU.
// - Quantity N makes N items. A row total is split evenly; leftover cents go to the first items, so the
//   items always add back up to the row total (the same rule as a lot, services/books/lots.ts).
// - A cost is never guessed: a blank or unreadable cost skips the row with its line number.
// - A status saying the item was kept, donated, lost or thrown away imports it as taken for personal use
//   or written off, with the date it left from a "date removed" column. Without that date the row is
//   skipped, because Schedule C Part III needs to know which year it left.
// - A "date sold" column is not used: sales come from the marketplace reports, which link to items by SKU.
import { type ColumnSpec, ImportFormatError, parseDate, parseMoney, readTable } from "./parse";

export const MAX_SHEET_ITEMS = 5000;
const MAX_ROW_QUANTITY = 500;

export interface SheetItem {
  line: number;
  title: string;
  sku: string | null;
  acquiredDate: string;
  costCents: number;
  status: "in_stock" | "written_off" | "personal_use";
  disposedDate: string | null;
}

export interface SheetParseResult {
  items: SheetItem[];
  rowCount: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
  /** The header text matched for each field, so the page can show what was read. */
  matched: Record<string, string>;
}

type Field =
  | "title"
  | "sku"
  | "quantity"
  | "unitCost"
  | "totalCost"
  | "bought"
  | "status"
  | "removed"
  | "sold";

const SPEC: ColumnSpec<Field> = {
  bought: {
    required: true,
    names: [
      "date bought",
      "purchase date",
      "date purchased",
      "purchased",
      "bought",
      "buy date",
      "date acquired",
      "acquired",
      "acquired date",
      "sourced",
      "sourced date",
      "date sourced",
      "sourcing date",
    ],
  },
  title: {
    names: [
      "item",
      "item name",
      "item title",
      "title",
      "name",
      "description",
      "product",
      "product name",
      "listing title",
    ],
  },
  sku: {
    names: ["sku", "custom label", "item sku", "seller sku", "inventory id", "item code", "code"],
  },
  quantity: {
    names: ["quantity", "qty", "units", "count", "quantity bought", "qty bought"],
  },
  unitCost: {
    names: [
      "unit cost",
      "cost each",
      "cost per item",
      "cost per unit",
      "cost",
      "price paid",
      "purchase price",
      "paid",
      "cost basis",
      "cogs",
      "buy price",
      "bought for",
    ],
  },
  totalCost: {
    names: ["total cost", "total paid", "lot cost", "extended cost", "line total"],
  },
  status: { names: ["status", "disposition"] },
  removed: {
    names: [
      "date removed",
      "removed date",
      "removed",
      "date disposed",
      "disposed date",
      "disposed",
    ],
  },
  sold: { names: ["date sold", "sold date", "sold on", "sale date"] },
};

const PERSONAL = /^(personal|kept|keep|withdrawn)/i;
const WRITTEN_OFF =
  /^(donat|lost|stolen|damaged|trash|discard|written off|write-off|write off|destroyed|scrapped)/i;
const SOLD = /^sold/i;

/** Splits a row total over `n` items: equal shares, leftover cents to the first items. */
export function splitCents(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const extra = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

export function parseInventorySheet(text: string): SheetParseResult {
  const table = readTable(text, SPEC, "sourcing sheet");
  const m = table.matched;
  const missing: { field: string; expectedOneOf: readonly string[] }[] = [];
  if (m.title === undefined && m.sku === undefined)
    missing.push({
      field: "title or sku",
      expectedOneOf: [...SPEC.title.names, ...SPEC.sku.names],
    });
  if (m.unitCost === undefined && m.totalCost === undefined)
    missing.push({
      field: "cost",
      expectedOneOf: [...SPEC.unitCost.names, ...SPEC.totalCost.names],
    });
  if (missing.length)
    throw new ImportFormatError(
      "This doesn't look like a sourcing sheet: missing required columns.",
      missing,
    );

  const items: SheetItem[] = [];
  const skipped: SheetParseResult["skipped"] = [];
  const warnings: string[] = [];
  let soldStatusRows = 0;
  let truncated = false;

  for (const row of table.rows) {
    const skip = (reason: string) => skipped.push({ line: row.line, reason });
    const title = (row.get("title") ?? "").slice(0, 300);
    const sku = (row.get("sku") ?? "").slice(0, 100) || null;
    if (!title && !sku) {
      skip("No item name or SKU.");
      continue;
    }
    const acquiredDate = parseDate(row.get("bought"));
    if (!acquiredDate) {
      skip(`Purchase date not readable: ${JSON.stringify(row.get("bought") ?? "")}.`);
      continue;
    }

    let quantity = 1;
    const rawQty = row.get("quantity");
    if (rawQty) {
      const q = Number(rawQty.replace(/,/g, ""));
      if (!Number.isInteger(q) || q < 1) {
        skip(`Quantity must be a whole number of 1 or more: ${JSON.stringify(rawQty)}.`);
        continue;
      }
      if (q > MAX_ROW_QUANTITY) {
        skip(`Quantity ${q} is more than ${MAX_ROW_QUANTITY} on one row; add it as a lot instead.`);
        continue;
      }
      quantity = q;
    }

    let costs: number[];
    try {
      const unit = parseMoney(row.get("unitCost"));
      const total = parseMoney(row.get("totalCost"));
      if (total != null) {
        if (total < 0) throw new Error("negative");
        costs = splitCents(total, quantity);
      } else if (unit != null) {
        if (unit < 0) throw new Error("negative");
        costs = Array.from({ length: quantity }, () => unit);
      } else {
        skip("No cost on this row.");
        continue;
      }
    } catch {
      skip(
        `Cost not readable: ${JSON.stringify(row.get("totalCost") || row.get("unitCost") || "")}.`,
      );
      continue;
    }

    let status: SheetItem["status"] = "in_stock";
    let disposedDate: string | null = null;
    const rawStatus = (row.get("status") ?? "").trim();
    if (PERSONAL.test(rawStatus) || WRITTEN_OFF.test(rawStatus)) {
      disposedDate = parseDate(row.get("removed"));
      if (!disposedDate) {
        skip(
          `Status "${rawStatus}" needs the date it left inventory (a "date removed" column), so the right year's Schedule C counts it.`,
        );
        continue;
      }
      status = PERSONAL.test(rawStatus) ? "personal_use" : "written_off";
    } else if (SOLD.test(rawStatus)) {
      soldStatusRows++;
    }

    if (items.length + quantity > MAX_SHEET_ITEMS) {
      truncated = true;
      skip(`More than ${MAX_SHEET_ITEMS} items in one file; split the sheet.`);
      continue;
    }
    for (const costCents of costs) {
      items.push({
        line: row.line,
        title: title || (sku as string),
        sku,
        acquiredDate,
        costCents,
        status,
        disposedDate,
      });
    }
  }

  if (m.sold !== undefined || soldStatusRows > 0)
    warnings.push(
      'Sold dates and "sold" statuses in the sheet are not used. Import your marketplace reports: their orders link to these items by SKU and mark them sold on the sale date.',
    );
  if (m.sku === undefined)
    warnings.push(
      "The sheet has no SKU column, so imported sales cannot link to these items automatically; link them on the Sales page.",
    );
  if (truncated) warnings.push(`Only the first ${MAX_SHEET_ITEMS} items were read.`);

  const matched: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (v !== undefined) matched[k] = v;
  return { items, rowCount: table.rows.length, skipped, warnings, matched };
}
