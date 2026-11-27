// Estimate cost lines from a spreadsheet (ROADMAP "Estimates, part 2"): the bid sheet a contractor
// already keeps in Excel, a supplier's quote saved as CSV, a takeoff material list
// (apps/wall-framing-takeoff, `materialListCsv`: section, item, size, length, qty, unit, note, cost),
// or rows copied from any of those and pasted. Pure; the SPA reads the file in the browser (the file
// is never uploaded) and only the lines the user keeps are added to the estimate's editor, where
// they are saved with the rest.
//
// What is read: the bid item (a column, or the heading row above a group), the cost category, a
// description, the quantity, the unit, and the unit cost or the extended total. A bid sheet with a
// unit cost or total per category (material, labor, equipment, sub) gives one cost line per
// category with a cost. What is never guessed: a unit cost from nothing. A line with a quantity and
// no cost comes in at $0 a unit and is flagged so the estimator prices it; a unit cost worked out
// from a total and a quantity is flagged, and so is one whose extension is a cent off; a row whose
// quantity × unit cost does not match its printed total keeps the quantity and unit cost (the
// estimate's own math) and is flagged.

import { type EstimateLineInput, MAX_BID_ITEM_LENGTH, MAX_ESTIMATE_LINES } from "./estimate";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from "./job-cost";
import { normalizeHeader } from "./payroll-report";
import { parseCsv } from "./sov-import/csv";
import { type Grid, ImportError, readXlsx, UNCALCULATED } from "./sov-import/xlsx";
import {
  extendCents,
  MAX_QUANTITY_MILLI,
  MAX_UNIT_LENGTH,
  MAX_UNIT_PRICE_MICROS,
} from "./unit-price";

export const MAX_ESTIMATE_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_DESCRIPTION = 300;
/** Header rows are looked for in this many rows from the top (a bid sheet has a title block). */
const HEADER_SEARCH_ROWS = 25;

export interface ImportedEstimateLine extends EstimateLineInput {
  /** Where it was read: "row 7", or "Sheet1 row 7" in a workbook with more than one sheet. */
  source: string;
  /** What the estimator should look at before saving ("no unit cost in the file: price it"). */
  flags: string[];
}

export interface EstimateImportSkip {
  source: string;
  reason: string;
}

export type EstimateImportField =
  | "bidItem"
  | "category"
  | "description"
  | "size"
  | "length"
  | "quantity"
  | "unit"
  | "unitCost"
  | "total";

export interface EstimateImportOk {
  ok: true;
  lines: ImportedEstimateLine[];
  skipped: EstimateImportSkip[];
  /** The header text matched, per field, and per category for a sheet with category columns. */
  columns: string[];
  /** Things the user should know about the read as a whole. */
  notes: string[];
}
export interface EstimateImportFail {
  ok: false;
  error: string;
}
export type EstimateImportResult = EstimateImportOk | EstimateImportFail;

export interface EstimateImportOptions {
  /** Bid item for lines with no bid item column and no heading row above them. */
  defaultBidItem?: string;
  /** Category for lines with no category column (or a blank cell in it). */
  defaultCategory?: CostCategory;
  /** Worksheet name, prefixed to each source. */
  sheet?: string | null;
  /** Lines already in the estimate: the import stops at MAX_ESTIMATE_LINES in all. */
  existingLines?: number;
}

// Header names per field, after `normalizeHeader` (lower case, punctuation to spaces). Fields are
// matched in this order and a column is used once, so "item" is the description only when there
// is no "description" column, and a bid item only when neither "bid item" nor "section" is there.
const HEADERS: [EstimateImportField, readonly string[]][] = [
  [
    "bidItem",
    [
      "bid item",
      "bid item description",
      "proposal item",
      "proposal line",
      "sov item",
      "sov line",
      "schedule of values item",
      "section",
      "phase",
      "division",
      "group",
      "area",
      "system",
      "assembly",
      "scope",
    ],
  ],
  ["category", ["category", "cost category", "cost type", "type", "class", "cost class"]],
  [
    "description",
    [
      "description",
      "item description",
      "line description",
      "material",
      "material description",
      "product",
      "product description",
      "task",
      "work",
      "name",
      "item",
    ],
  ],
  ["size", ["size", "dimension", "dimensions", "spec", "specification"]],
  ["length", ["length"]],
  [
    "quantity",
    [
      "qty",
      "quantity",
      "count",
      "quan",
      "takeoff qty",
      "takeoff quantity",
      "est qty",
      "estimated quantity",
      "order qty",
      "order quantity",
    ],
  ],
  ["unit", ["unit", "units", "uom", "u m", "um", "unit of measure"]],
  [
    "unitCost",
    [
      "unit cost",
      "unit price",
      "cost each",
      "price each",
      "each",
      "cost ea",
      "price ea",
      "rate",
      "unit rate",
      "cost unit",
      "price unit",
      "cost per unit",
      "price per unit",
      "net price",
      "net unit price",
    ],
  ],
  [
    "total",
    [
      "total",
      "total cost",
      "extended",
      "extended cost",
      "extended price",
      "ext",
      "ext cost",
      "ext price",
      "extension",
      "amount",
      "line total",
      "cost",
      "net amount",
    ],
  ],
];

// A bid sheet with money per category: "Material unit", "Labor $/unit", "Mat'l total", "Sub".
const CATEGORY_WORDS: Record<CostCategory, readonly string[]> = {
  labor: ["labor", "labour", "lab"],
  material: ["material", "materials", "mat", "matl", "mat l"],
  equipment: ["equipment", "equip", "eq", "equip t"],
  subcontract: ["subcontract", "subcontractor", "subcontracts", "sub", "subs"],
  other: ["other"],
};
const UNIT_SUFFIXES = ["unit", "unit cost", "unit price", "per unit", "each", "ea", "rate", "u"];
const TOTAL_SUFFIXES = [
  "",
  "total",
  "cost",
  "amount",
  "ext",
  "extended",
  "extension",
  "total cost",
];

const TOTAL_ROW =
  /^(grand )?totals?:?$|^(grand )?totals? (bid|cost|estimate|price|amount|of|for|material|labor|labour|equipment|direct|this)\b|^totals? \(|^sum$|^sub-?\s?totals?\b|\bsubtotal\b|^total (for )?(division|div\.?|section|phase)\b/i;

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

interface Fixed {
  value: number;
  /** The cell had more decimals than are kept, by more than floating-point noise. */
  rounded: boolean;
}

/**
 * A number from a cell, in units of 10^-decimals: "1,200", "$145.50", "(12)", or the floating
 * value Excel saved ("12.500000000000002"). null for blank; an error string when it does not read.
 */
export function readFixed(cell: string, decimals: number): Fixed | null | string {
  const t = clean(cell);
  if (t === "" || t === "-" || t === "–" || t === "$-" || t === "$ -") return null;
  if (t === UNCALCULATED)
    return "is a formula with no saved result: open the file in Excel or Google Sheets, save it, and choose it again";
  if (t.startsWith("#")) return `shows the Excel error ${t}`;
  let x = t.replace(/[$\s]/g, "").replace(/^usd/i, "");
  let neg = false;
  if (/^\(.*\)$/.test(x)) {
    neg = true;
    x = x.slice(1, -1);
  }
  if (x.startsWith("-")) {
    neg = !neg;
    x = x.slice(1);
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.split(",").join("");
  let m = /^(\d+)(?:\.(\d*))?$/.exec(x);
  if (!m && /^\d+(\.\d+)?e[-+]?\d+$/i.test(x)) {
    // A float Excel wrote in exponent form: read it as a number, then as fixed-point text.
    const n = Number(x);
    if (Number.isFinite(n)) m = /^(\d+)(?:\.(\d*))?$/.exec(n.toFixed(Math.min(20, decimals + 6)));
  }
  if (!m) return `is not a number ("${t.slice(0, 30)}")`;
  const frac = m[2] ?? "";
  let value: number;
  let rounded = false;
  if (frac.length <= decimals) {
    value = Number(m[1]) * 10 ** decimals + Number(frac.padEnd(decimals, "0") || "0");
  } else {
    const exact = Number(`${m[1]}.${frac}`) * 10 ** decimals;
    value = Math.round(exact);
    rounded = Math.abs(exact - value) > 1e-6;
  }
  if (!Number.isSafeInteger(value)) return "is too large";
  return { value: neg && value !== 0 ? -value : value, rounded };
}

/** A category cell ("Labor", "MAT", "S", "Subs"); null when it does not read as one. */
export function readCategory(cell: string): CostCategory | null {
  const t = normalizeHeader(cell);
  for (const c of COST_CATEGORIES) {
    if (t === c || t === normalizeHeader(COST_CATEGORY_LABELS[c])) return c;
    if (CATEGORY_WORDS[c].includes(t)) return c;
  }
  if (/^(payroll|wages?|crew|l)$/.test(t)) return "labor";
  if (/^(supplies|supply|lumber|m)$/.test(t)) return "material";
  if (/^(rental|rentals|e)$/.test(t)) return "equipment";
  if (/^(s|subcontractors)$/.test(t)) return "subcontract";
  if (/^(misc|miscellaneous|general|o)$/.test(t)) return "other";
  return null;
}

interface Layout {
  headerRow: number;
  fields: Partial<Record<EstimateImportField, number>>;
  byCategory: Partial<Record<CostCategory, { unit?: number; total?: number }>>;
  labels: string[];
}

function layoutOf(header: string[]): Layout | null {
  const norm = header.map((h) => normalizeHeader(h));
  const used = new Set<number>();
  const fields: Layout["fields"] = {};
  const labels: string[] = [];
  const byCategory: Layout["byCategory"] = {};
  // Category money columns first: "Material" on a bid sheet with "Labor" beside it is a total, not
  // the description; "Material" alone (a supplier's list) is the description.
  const catCols: [CostCategory, "unit" | "total", number][] = [];
  norm.forEach((h, i) => {
    for (const c of COST_CATEGORIES)
      for (const w of CATEGORY_WORDS[c]) {
        if (UNIT_SUFFIXES.some((s) => h === `${w} ${s}` || h === `${s} ${w}`))
          catCols.push([c, "unit", i]);
        else if (TOTAL_SUFFIXES.some((s) => h === (s ? `${w} ${s}` : w)))
          catCols.push([c, "total", i]);
      }
  });
  if (new Set(catCols.map(([c]) => c)).size >= 2) {
    for (const [c, kind, i] of catCols) {
      const slot = byCategory[c] ?? {};
      if (slot[kind] !== undefined || used.has(i)) continue;
      slot[kind] = i;
      byCategory[c] = slot;
      used.add(i);
      labels.push(
        `${COST_CATEGORY_LABELS[c]} ${kind === "unit" ? "unit cost" : "total"}: "${header[i]?.trim()}"`,
      );
    }
  }
  for (const [field, names] of HEADERS) {
    if (
      Object.keys(byCategory).length &&
      (field === "unitCost" || field === "total" || field === "category")
    )
      continue;
    for (const name of names) {
      const i = norm.findIndex((h, k) => h === name && !used.has(k));
      if (i < 0) continue;
      fields[field] = i;
      used.add(i);
      labels.push(`${FIELD_LABELS[field]}: "${header[i]?.trim()}"`);
      break;
    }
  }
  const hasMoney =
    fields.quantity !== undefined ||
    fields.unitCost !== undefined ||
    fields.total !== undefined ||
    Object.keys(byCategory).length > 0;
  const hasText = fields.description !== undefined || fields.bidItem !== undefined;
  if (!hasMoney || !hasText) return null;
  return { headerRow: 0, fields, byCategory, labels };
}

const FIELD_LABELS: Record<EstimateImportField, string> = {
  bidItem: "Bid item",
  category: "Category",
  description: "Description",
  size: "Size",
  length: "Length",
  quantity: "Quantity",
  unit: "Unit",
  unitCost: "Unit cost",
  total: "Total",
};

/** The header row: the one in the first rows that matches the most fields. */
function findLayout(grid: Grid): Layout | null {
  let best: Layout | null = null;
  let bestScore = 0;
  for (let r = 0; r < Math.min(grid.length, HEADER_SEARCH_ROWS); r++) {
    const l = layoutOf(grid[r] ?? []);
    if (!l) continue;
    const score = l.labels.length;
    if (score > bestScore) {
      best = { ...l, headerRow: r };
      bestScore = score;
    }
  }
  return best;
}

type Cost =
  | { kind: "none" }
  | { kind: "error"; reason: string }
  | {
      kind: "ok";
      quantityMilli: number;
      unitCostMicros: number;
      unit: string | null;
      flags: string[];
    };

/**
 * One cost from a row's quantity, unit cost and total cells. A total with no quantity is a lump sum
 * (1 LS); a total with a quantity and no unit cost gives the unit cost (total ÷ quantity).
 */
function costOf(qCell: string, uCell: string, tCell: string, unitCell: string): Cost {
  const q = readFixed(qCell, 3);
  const u = readFixed(uCell, 6);
  const t = readFixed(tCell, 2);
  if (typeof q === "string") return { kind: "error", reason: `the quantity ${q}` };
  if (typeof u === "string") return { kind: "error", reason: `the unit cost ${u}` };
  if (typeof t === "string") return { kind: "error", reason: `the total ${t}` };
  if (q === null && u === null && t === null) return { kind: "none" };
  if ((q && q.value < 0) || (u && u.value < 0) || (t && t.value < 0))
    return { kind: "error", reason: "it is below $0 (enter credits on the estimate by hand)" };
  if ((q && q.value > MAX_QUANTITY_MILLI) || (u && u.value > MAX_UNIT_PRICE_MICROS))
    return { kind: "error", reason: "the quantity or unit cost is too large" };
  const flags: string[] = [];
  if (q?.rounded) flags.push("quantity rounded to 3 decimals");
  if (u?.rounded) flags.push("unit cost rounded to 6 decimals");
  const unit = clean(unitCell) || null;
  if (q === null) {
    if (u !== null && t === null)
      return { kind: "error", reason: "it has a unit cost and no quantity" };
    if (t === null) return { kind: "none" };
    if (u !== null && t.value !== 0 && extendCents(1000, u.value) !== t.value)
      return { kind: "error", reason: "it has a unit cost and a total and no quantity" };
    return {
      kind: "ok",
      quantityMilli: 1000,
      unitCostMicros: t.value * 10_000,
      unit: unit ?? "LS",
      flags: [...flags, "lump sum: no quantity in the file"],
    };
  }
  if (u !== null) {
    if (t !== null && extendCents(q.value, u.value) !== t.value)
      flags.push(
        `quantity × unit cost is ${usd(extendCents(q.value, u.value))}; the file's total is ${usd(t.value)}`,
      );
    return { kind: "ok", quantityMilli: q.value, unitCostMicros: u.value, unit, flags };
  }
  if (t !== null && t.value !== 0) {
    if (q.value === 0) return { kind: "error", reason: "it has a total and a quantity of 0" };
    // unit cost in micros = total cents × 10^4 × 1000 / quantity milli, rounded half up; a
    // rounding that changes the extension by a cent is flagged.
    const num = BigInt(t.value) * 10_000_000n;
    const den = BigInt(q.value);
    const micros = Number((num + den / 2n) / den);
    const extended = extendCents(q.value, micros);
    if (micros > MAX_UNIT_PRICE_MICROS)
      return { kind: "error", reason: "the unit cost worked out from the total is too large" };
    flags.push(
      extended === t.value
        ? "unit cost worked out from the total"
        : `unit cost worked out from the total, rounded: extends to ${usd(extended)}, the file says ${usd(t.value)}`,
    );
    return {
      kind: "ok",
      quantityMilli: q.value,
      unitCostMicros: micros,
      unit,
      flags,
    };
  }
  return {
    kind: "ok",
    quantityMilli: q.value,
    unitCostMicros: 0,
    unit,
    flags: [...flags, "no unit cost in the file: price it"],
  };
}

const usd = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Reads a grid (a sheet, a CSV, a paste) into cost lines to preview. */
export function readEstimateGrid(
  grid: Grid,
  options: EstimateImportOptions = {},
): EstimateImportResult {
  const layout = findLayout(grid);
  if (!layout)
    return {
      ok: false,
      error:
        "No header row found. The sheet needs a row naming its columns: a description (or bid item) and a quantity, unit cost or total, e.g. Description, Qty, Unit, Unit cost.",
    };
  const { fields, byCategory } = layout;
  const cell = (row: string[], f: EstimateImportField) =>
    fields[f] === undefined ? "" : clean(row[fields[f]]);
  const at = (row: string[], i: number | undefined) => (i === undefined ? "" : clean(row[i]));
  const defaultCategory = options.defaultCategory ?? "material";
  const defaultBidItem = clean(options.defaultBidItem) || "Base bid";
  const room = Math.max(0, MAX_ESTIMATE_LINES - (options.existingLines ?? 0));
  const prefix = options.sheet ? `${options.sheet} ` : "";

  const lines: ImportedEstimateLine[] = [];
  const skipped: EstimateImportSkip[] = [];
  const notes: string[] = [];
  let heading: string | null = null;
  let headingsUsed = 0;
  let over = 0;
  let unpriced = 0;
  let badCategories = 0;

  for (let r = layout.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const source = `${prefix}row ${r + 1}`;
    if (row.every((c) => clean(c) === "")) continue;
    const bidCell = cell(row, "bidItem");
    const desc = [cell(row, "description"), cell(row, "size"), cell(row, "length")]
      .filter(Boolean)
      .join(" ");
    const label = desc || bidCell;
    // The takeoff's material list leads with a Warning row when walls were left off.
    if (/^warning$/i.test(bidCell)) {
      const said = row.map(clean).filter(Boolean).slice(1).join(": ");
      notes.push(`The file warns: ${said.slice(0, 400)}`);
      skipped.push({ source, reason: "a warning row, not a cost" });
      continue;
    }
    if (TOTAL_ROW.test(label) || (!label && row.some((c) => TOTAL_ROW.test(clean(c))))) {
      skipped.push({ source, reason: "a total row (the estimate adds its own)" });
      continue;
    }

    const costs: { category: CostCategory; cost: Extract<Cost, { kind: "ok" }> }[] = [];
    let error: string | null = null;
    let categoryFlag: string | null = null;
    const unitCell = cell(row, "unit");
    const qCell = cell(row, "quantity");
    if (Object.keys(byCategory).length) {
      for (const c of COST_CATEGORIES) {
        const cols = byCategory[c];
        if (!cols) continue;
        const k = costOf(qCell, at(row, cols.unit), at(row, cols.total), unitCell);
        if (k.kind === "error") {
          error = `${COST_CATEGORY_LABELS[c]}: ${k.reason}`;
          break;
        }
        // In a bid sheet a quantity alone is not a cost in every category: keep only priced ones.
        if (k.kind === "ok" && k.unitCostMicros > 0) costs.push({ category: c, cost: k });
      }
      if (!error && costs.length === 0) {
        const k = costOf(qCell, "", "", unitCell);
        if (k.kind === "ok") costs.push({ category: defaultCategory, cost: k });
      }
    } else {
      const k = costOf(qCell, cell(row, "unitCost"), cell(row, "total"), unitCell);
      if (k.kind === "error") error = k.reason;
      else if (k.kind === "ok") {
        const catCell = cell(row, "category");
        let category = catCell ? readCategory(catCell) : defaultCategory;
        if (!category) {
          category = defaultCategory;
          categoryFlag = `category "${catCell.slice(0, 30)}" not read: set to ${COST_CATEGORY_LABELS[defaultCategory]}`;
          badCategories += 1;
        }
        costs.push({ category, cost: k });
      }
    }
    if (error) {
      skipped.push({ source, reason: error });
      continue;
    }
    if (costs.length === 0) {
      // Text and no numbers: a heading over a group of lines (the bid item, when there is no column),
      // in the description column or alone in a column of its own (a quote's line-number column).
      const filled = row.map(clean).filter(Boolean);
      const title = label || (filled.length === 1 ? (filled[0] ?? "") : "");
      if (fields.bidItem === undefined && title && !/^[\d.,$()\s-]+$/.test(title)) {
        heading = title.slice(0, MAX_BID_ITEM_LENGTH);
        headingsUsed += 1;
      } else if (label) skipped.push({ source, reason: "no quantity, unit cost or total" });
      continue;
    }
    const bidItem = (bidCell || heading || defaultBidItem).slice(0, MAX_BID_ITEM_LENGTH);
    for (const { category, cost } of costs) {
      if (lines.length >= room) {
        over += 1;
        continue;
      }
      const flags = [...cost.flags];
      if (categoryFlag) flags.push(categoryFlag);
      if (desc.length > MAX_DESCRIPTION) flags.push("description shortened to 300 characters");
      let unit = cost.unit;
      if (unit && unit.length > MAX_UNIT_LENGTH) {
        flags.push(`unit "${unit.slice(0, 30)}" shortened`);
        unit = unit.slice(0, MAX_UNIT_LENGTH);
      }
      if (cost.unitCostMicros === 0) unpriced += 1;
      lines.push({
        bidItem,
        category,
        description: (desc || (bidCell ? "" : label)).slice(0, MAX_DESCRIPTION),
        quantityMilli: cost.quantityMilli,
        unit,
        unitCostMicros: cost.unitCostMicros,
        source,
        flags,
      });
    }
  }

  if (lines.length === 0 && over === 0)
    return {
      ok: false,
      error:
        skipped.length > 0
          ? `No cost lines read: ${skipped.length} row${skipped.length === 1 ? " was" : "s were"} skipped (first, ${skipped[0]?.source}: ${skipped[0]?.reason}).`
          : "No cost lines under the header row.",
    };
  if (over > 0)
    notes.push(
      `${over} more line${over === 1 ? " was" : "s were"} left out: an estimate takes at most ${MAX_ESTIMATE_LINES} lines.`,
    );
  if (unpriced > 0)
    notes.push(
      `${unpriced} line${unpriced === 1 ? " has" : "s have"} no unit cost in the file and come in at $0: price ${unpriced === 1 ? "it" : "them"} before sending the proposal.`,
    );
  if (badCategories > 0)
    notes.push(
      `${badCategories} category cell${badCategories === 1 ? "" : "s"} did not read as labor, material, equipment, subcontract or other and ${badCategories === 1 ? "was" : "were"} set to ${COST_CATEGORY_LABELS[defaultCategory]}.`,
    );
  if (fields.bidItem === undefined) {
    notes.push(
      headingsUsed > 0
        ? "No bid item column: each heading row (text with no numbers) names the bid item for the lines under it."
        : `No bid item column: every line goes under "${defaultBidItem}".`,
    );
  }
  if (fields.category === undefined && Object.keys(byCategory).length === 0)
    notes.push(`No category column: every line is ${COST_CATEGORY_LABELS[defaultCategory]}.`);
  return { ok: true, lines, skipped, columns: layout.labels, notes };
}

/** Rows copied from a spreadsheet (tab-separated) or CSV text, header row included. */
export function readEstimatePaste(
  text: string,
  options: EstimateImportOptions = {},
): EstimateImportResult {
  if (!text.trim()) return { ok: false, error: "Paste rows copied from the spreadsheet first." };
  return readEstimateGrid(parseCsv(text), options);
}

/** Reads a file the user picked (.xlsx, .csv, .tsv, .txt) into a preview. Never throws. */
export async function importEstimateFile(
  name: string,
  bytes: Uint8Array,
  options: EstimateImportOptions = {},
): Promise<EstimateImportResult> {
  const fail = (error: string): EstimateImportFail => ({ ok: false, error });
  if (bytes.length > MAX_ESTIMATE_IMPORT_BYTES)
    return fail("This file is over 10 MB. Save just the bid sheet as CSV and choose that.");
  const lower = name.toLowerCase();
  const looksZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  try {
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || looksZip) {
      const sheets = await readXlsx(bytes);
      let first: EstimateImportResult | null = null;
      for (const s of sheets) {
        const r = readEstimateGrid(s.grid, {
          ...options,
          sheet: sheets.length > 1 ? s.name : null,
        });
        if (r.ok)
          return sheets.length > 1 ? { ...r, notes: [`Sheet "${s.name}".`, ...r.notes] } : r;
        first ??= r;
      }
      return first ?? fail("This workbook has no sheets.");
    }
    if (lower.endsWith(".xls") || lower.endsWith(".numbers") || lower.endsWith(".ods"))
      return fail("Save the sheet as .xlsx or CSV first (File → Save As), then choose that file.");
    if (lower.endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50))
      return fail("PDFs are not read here: export the bid sheet or quote as .xlsx or CSV.");
    return readEstimateGrid(parseCsv(new TextDecoder().decode(bytes)), options);
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    return fail("This file could not be read. Save it again as .xlsx or CSV and retry.");
  }
}
