// Finds a schedule of values in a grid read from a contractor's own spreadsheet: a bid breakdown ("Item, Description,
// Amount"), the SOV tab of an estimate, or a continuation sheet with a title block, two- or three-row headers, a row
// of column letters, division headings, subtotals, a change-order section and a totals row. Out come the lines to add
// to a project's original schedule (item number, description, scheduled value), what was left out and why, and
// checks on the sheet's own arithmetic. Pure: no I/O, the same code in the browser and in tests.
//
// Header rules and money reading follow the public pay-application generator's reader (sheet.mjs, MIT, same owner).
import { findSummary, type G702Summary } from "./summary";
import { colName, type Grid, type Sheet, UNCALCULATED } from "./xlsx";

export const MAX_IMPORT_LINES = 500; // bulkSovSchema's limit
const ITEM_MAX = 20;
const DESC_MAX = 300;

export interface ImportedSovLine {
  itemNumber: string;
  description: string;
  originalCents: number;
  /** Where it came from: "cell C9" (workbook) or "line 9" (CSV). */
  source: string;
  /** The row's billing columns, when the sheet is a continuation sheet (null: no such column). */
  billing?: ImportedBilling;
}
/** One row's billing columns on a continuation sheet (G703 letters). A cell that could not be read is null and named in `errors`. */
export interface ImportedBilling {
  /** D, work completed from previous application. */
  previousCents: number | null;
  /** E, work completed this period. */
  thisPeriodCents: number | null;
  /** F, materials presently stored. */
  storedCents: number | null;
  /** G, total completed and stored to date. */
  toDateCents: number | null;
  /** Retainage held on the line. */
  retainageCents: number | null;
  /** D + E, work completed to date without stored materials (from D and E, else G less F). */
  completedCents: number | null;
  /** H, balance to finish (C - G), when the sheet has the column. Only a cross-check: never imported. */
  balanceCents?: number | null;
  /** The % (G / C) column as printed, when the sheet has it. Only a cross-check: never imported. */
  percent?: PrintedPercent | null;
  /** Cells in the row that are not dollar amounts, each naming its cell. */
  errors: string[];
}
export interface SkippedRow {
  source: string;
  label: string;
  reason: "total" | "subtotal" | "change_order";
}
export interface ImportCheck {
  severity: "high" | "medium";
  message: string;
}
export interface SovImportOk {
  ok: true;
  lines: ImportedSovLine[];
  skipped: SkippedRow[];
  checks: ImportCheck[];
  notes: string[];
  /** e.g. `sheet "SOV", row 5-6`. */
  header: string;
  totalCents: number;
  /** The sheet's own total of the scheduled-value column, when it has a calculated totals row. */
  sheetTotalCents: number | null;
  /** Where the totals row's scheduled value is ("page 1, line 40"), when `sheetTotalCents` is read. */
  sheetTotalSource?: string;
  /** The PDF is a scan read through its OCR text layer: a figure may be a misread. */
  scanned?: boolean;
  /** Billed to date on the imported lines, when the sheet is a continuation sheet with billing columns. */
  billedToDateCents: number | null;
  /** Rows left out as change orders, with their billing columns (a mid-job start needs their work too). */
  changeOrderLines: ImportedSovLine[];
  /** Which billing columns the sheet has: "D", "E", "F", "G", "retainage". */
  billingColumns: string[];
  /** From the title block above the table, when it says so ("Application No: 7", "Period to: 10/31/2026"). */
  applicationNumber: number | null;
  periodTo: string | null;
  /** Retainage rates in the title block ("Retainage on work, %"), in basis points; null when not stated. */
  retainageWorkBps: number | null;
  retainageStoredBps: number | null;
  /**
   * A workbook's application summary sheet (G702), read next to the continuation sheet, or a page of a PDF other
   * than the continuation sheet's; absent for CSV.
   */
  summary?: G702Summary | null;
}
export interface SovImportFail {
  ok: false;
  error: string;
  errors: string[];
}
export type SovImportResult = SovImportOk | SovImportFail;

type Col =
  | "pct"
  | "retRate"
  | "retainage"
  | "toDate"
  | "balance"
  | "stored"
  | "thisPeriod"
  | "previous"
  | "scheduled"
  | "desc"
  | "item"
  | "type";

// Order matters: "total completed and stored to date" mentions stored, "from previous application (d+e)" mentions
// previous, so the to-date and balance columns are claimed before the scheduled value.
const RULES: [Col, (h: string) => boolean][] = [
  ["pct", (h) => /^%|percent|% complete|\(g ?[÷/] ?c\)|^% \(|^pct\b/.test(h) && !/retain/.test(h)],
  [
    "retRate",
    (h) =>
      /retain|retention/.test(h) && /%|percent|\brate\b/.test(h) && !/if variable rate/.test(h),
  ],
  ["retainage", (h) => /retain|retention/.test(h)],
  [
    "toDate",
    (h) =>
      /to date|total completed|completed and stored|\(d ?\+ ?e ?\+ ?f\)|billed/.test(h) &&
      !/previous/.test(h),
  ],
  ["balance", (h) => /balance|to finish|remaining/.test(h)],
  ["stored", (h) => /stored/.test(h)],
  [
    "thisPeriod",
    (h) =>
      /this (period|application|month|billing|draw)|current (period|billing|application|month)|^current$/.test(
        h,
      ),
  ],
  ["previous", (h) => /previous|prior/.test(h)],
  [
    "scheduled",
    (h) =>
      /scheduled value|schedule of values|contract (value|amount|sum)|original (value|amount|contract)|revised (value|amount)|^sov( amount| value)?$|^(line )?value$|^(total )?amount$|^budget$|^price$|^bid( amount)?$|^cost$|^total( price| cost)?$/.test(
        h,
      ),
  ],
  ["desc", (h) => /description|scope|work item|^task$|^name$|^activity$/.test(h)],
  [
    "item",
    (h) =>
      /^(item|line|code|cost code|no\.?|#|item no\.?|item #|line no\.?|item number|line #|sov line|csi|division|div\.?)\b/.test(
        h,
      ),
  ],
  ["type", (h) => /^type\b|^kind$/.test(h)],
];
const classify = (h: string): Col | null => {
  for (const [k, f] of RULES) if (f(h)) return k;
  return null;
};

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
const low = (s: unknown) => clean(s).toLowerCase();
const isLetterRow = (row: string[] | undefined) => {
  const v = (row ?? []).map(clean).filter(Boolean);
  return v.length >= 3 && v.every((x) => /^[A-Z]$/i.test(x));
};
const isBlank = (row: string[] | undefined) => !row || row.every((x) => clean(x) === "");
// A row holding a sentence (instructions, a note) is never part of a header.
const isNoteRow = (row: string[] | undefined) => (row ?? []).some((x) => clean(x).length > 80);

type ColMap = Partial<Record<Col, number>>;
interface Header {
  row: number;
  depth: number;
  map: ColMap;
  hits: number;
}

function headerAt(grid: Grid, r: number, depth: number): { map: ColMap; hits: number } {
  const rows = grid.slice(r, r + depth);
  const width = Math.max(0, ...rows.map((x) => (x ?? []).length));
  const map: ColMap = {};
  let hits = 0;
  // The column letters printed above the labels of a G703 come out of a PDF in the label's cell ("A Item No.",
  // "J Retainage"); when three or more cells of a row start that way, the letter is dropped.
  const lettered = (x: string[] | undefined) =>
    (x ?? []).filter((v) => /^[A-Z] \S/.test(clean(v))).length >= 3;
  for (let c = 0; c < width; c++) {
    const h = low(
      rows
        .map((x) => {
          const v = (x ?? [])[c] ?? "";
          return lettered(x) ? clean(v).replace(/^[A-Z] (?=\S)/, "") : v;
        })
        .filter((x) => !/^[A-Z]$/i.test(clean(x)))
        .join(" "),
    );
    if (!h) continue;
    const k = classify(h);
    if (k && map[k] === undefined) {
      map[k] = c;
      hits++;
    }
  }
  return { map, hits };
}

function findHeader(grid: Grid): Header | null {
  let best: Header | null = null;
  const limit = Math.min(grid.length, 60);
  for (let r = 0; r < limit; r++) {
    if (isBlank(grid[r]) || isLetterRow(grid[r])) continue;
    for (let depth = 1; depth <= 3; depth++) {
      const last = grid[r + depth - 1];
      if (depth > 1 && (isLetterRow(last) || isBlank(last))) break;
      if (isNoteRow(last)) break;
      const { map, hits } = headerAt(grid, r, depth);
      if (map.scheduled === undefined || (map.desc === undefined && map.item === undefined))
        continue;
      // On a tie the shallower block wins, so a title-block label above the header ("Retainage on stored
      // materials, %") is never glued onto the Item column (the public template's layout; see its test).
      if (!best || hits > best.hits || (hits === best.hits && depth < best.depth))
        best = { row: r, depth, map, hits };
    }
  }
  return best;
}

type Money = { cents: number; rounded?: boolean } | { error: string };

/** A percentage as printed: "45%", "45.25 %" or a bare "45.25" / "0.45". */
export interface PrintedPercent {
  /** The printed digits as an integer: "45.25%" is 4525. */
  scaled: number;
  /** Digits after the point: "45.25%" is 2. */
  decimals: number;
  /** Printed with a % sign. Without one, "0.45" may be a fraction (45%) rather than 0.45%. */
  sign: boolean;
}

/** A percentage cell as printed, or null when it is not one (blank, a dash, text). Never an error: the column is only a cross-check. */
export function readPercent(s: string): PrintedPercent | null {
  const m = /^(\d{1,3})(?:\.(\d{1,4}))?\s*(%?)$/.exec(clean(s).replace(/\s+/g, " "));
  if (!m) return null;
  const frac = m[2] ?? "";
  return { scaled: Number(`${m[1]}${frac}`), decimals: frac.length, sign: m[3] === "%" };
}

/** A dollar amount from a cell. Commas are read by shape: 1,234.50 thousands; 1.234,50 or 29,99 a decimal comma. */
export function readMoney(s: string): Money {
  const t = clean(s);
  if (t === "" || t === "-" || t === "–" || t === "$ -" || t === "$-") return { cents: 0 };
  let neg = false;
  let x = t;
  if (/^\(.*\)$/.test(x)) {
    neg = true;
    x = x.slice(1, -1);
  }
  x = x.replace(/[$\s]/g, "").replace(/^usd/i, "");
  if (x.startsWith("-")) {
    neg = !neg;
    x = x.slice(1);
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.split(",").join("");
  else if (/^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/.test(x)) x = x.split(".").join("").replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(x)) {
    const exact = Number(x) * 100;
    const cents = Math.round(exact);
    if (!Number.isSafeInteger(cents)) return { error: "is too large to be a dollar amount" };
    return { cents: neg && cents !== 0 ? -cents : cents, rounded: Math.abs(exact - cents) > 1e-6 };
  }
  if (t === UNCALCULATED)
    return {
      error:
        "is a formula with no saved result (the file was written by a program that does not calculate). Open it in Excel, LibreOffice or Google Sheets, save it, and choose it again",
    };
  if (/^#/.test(t)) return { error: `shows the Excel error ${t}` };
  return { error: `is not a dollar amount ("${t.slice(0, 30)}")` };
}

const usd = (c: number) =>
  `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TOTAL =
  /^(grand )?totals?\b|^total (contract|this|amount|billed|to date|of|sov|schedule)|^totals? \(|^sum$/i;
const SUBTOTAL = /^sub-?\s?totals?\b|\bsubtotal\b|^total (for )?(division|div\.?|section|phase)\b/i;
const CO_HEADING = /^(approved )?change orders?\b|^c\.?o\.?s?\s*$|^changes$/i;
const CO_LINE = /^(co|pco|cor)[-\s#.]*\d+|^change order\b/i;

export interface FindOptions {
  /** Worksheet name for a workbook (sources say "cell C9"); omitted for a CSV (sources say "line 9"). */
  sheet?: string | null;
  /** Names row r (0-based) for a grid that is neither a worksheet nor a CSV ("page 2, line 14" for a PDF). */
  rowLabel?: ((r: number) => string) | null;
  /** Prefix for the header note with `rowLabel` ("PDF" gives "PDF page 1, line 8"). */
  origin?: string | null;
}

export function findSov(
  grid: Grid,
  { sheet = null, rowLabel = null, origin = null }: FindOptions = {},
): SovImportResult {
  const h = findHeader(grid);
  if (!h) {
    const error =
      "Could not find the table header. Looked in the first 60 rows for a column named like Scheduled value (or Amount, Value, Contract amount) next to a Description or Item column.";
    return { ok: false, error, errors: [error] };
  }
  const m = h.map;
  const at = (row: string[] | undefined, k: Col) => {
    const c = m[k];
    return c === undefined ? "" : clean((row ?? [])[c]);
  };
  const where = (r: number, k: Col) => {
    if (rowLabel) return rowLabel(r);
    const c = m[k];
    return sheet && c !== undefined
      ? `cell ${colName(c)}${r + 1}`
      : sheet
        ? `row ${r + 1}`
        : `line ${r + 1}`;
  };
  const rowWhere = (r: number) =>
    rowLabel ? rowLabel(r) : sheet ? `row ${r + 1}` : `line ${r + 1}`;

  const lines: (ImportedSovLine & { r: number; billed: number | null; itemCell: string })[] = [];
  const changeOrderLines: ImportedSovLine[] = [];
  const skipped: SkippedRow[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const checks: ImportCheck[] = [];
  let total: { r: number; row: string[] } | null = null;
  let inCo = false;
  let rounded = 0;
  let truncated = 0;
  let zero = 0;
  let coCents = 0;
  const hasBilling =
    m.toDate !== undefined || m.previous !== undefined || m.thisPeriod !== undefined;
  const billingColumns = (
    [
      ["previous", "D"],
      ["thisPeriod", "E"],
      ["stored", "F"],
      ["toDate", "G"],
      ["retainage", "retainage"],
    ] as const
  )
    .filter(([k]) => m[k] !== undefined)
    .map(([, name]) => name);
  const billingOf = (row: string[] | undefined, r: number): ImportedBilling | undefined => {
    if (!hasBilling && m.retainage === undefined) return undefined;
    const errs: string[] = [];
    const read = (k: Col) => {
      if (m[k] === undefined) return null;
      const v = readMoney(at(row, k));
      if ("error" in v) {
        errs.push(`${where(r, k)} ${v.error}`);
        return null;
      }
      return v.cents;
    };
    const previousCents = read("previous");
    const thisPeriodCents = read("thisPeriod");
    const storedCents = read("stored");
    const toDateCents = read("toDate");
    const retainageCents = read("retainage");
    // H and % are read leniently: a cell that is not a figure is left out, never an import error.
    // A blank H is left out too (not read as $0.00), so a form that leaves it empty raises nothing.
    const hCell = m.balance === undefined ? undefined : at(row, "balance");
    const balance =
      hCell === undefined ? undefined : clean(hCell) === "" ? { error: "blank" } : readMoney(hCell);
    const pct = m.pct === undefined ? undefined : readPercent(at(row, "pct"));
    let completedCents: number | null = null;
    if (previousCents !== null && thisPeriodCents !== null)
      completedCents = previousCents + thisPeriodCents;
    else if (
      toDateCents !== null &&
      m.previous === undefined &&
      m.thisPeriod === undefined &&
      (storedCents !== null || m.stored === undefined)
    )
      completedCents = toDateCents - (storedCents ?? 0);
    return {
      previousCents,
      thisPeriodCents,
      storedCents,
      toDateCents,
      retainageCents,
      completedCents,
      ...(balance ? { balanceCents: "cents" in balance ? balance.cents : null } : {}),
      ...(pct !== undefined ? { percent: pct } : {}),
      errors: errs,
    };
  };

  let r = h.row + h.depth;
  while (r < grid.length && (isBlank(grid[r]) || isLetterRow(grid[r]))) r++;
  for (; r < grid.length; r++) {
    const row = grid[r];
    if (isBlank(row) || isLetterRow(row)) continue;
    const desc = at(row, "desc");
    const item = at(row, "item");
    const label = desc || item;
    const firstText = clean((row ?? []).find((x) => clean(x) !== "") ?? "");
    const valueCell = at(row, "scheduled");
    if (TOTAL.test(label) || (!label && TOTAL.test(firstText))) {
      total = { r, row: row ?? [] };
      break;
    }
    if (SUBTOTAL.test(label) || (!label && SUBTOTAL.test(firstText))) {
      skipped.push({ source: rowWhere(r), label: label || firstText, reason: "subtotal" });
      continue;
    }
    if (valueCell === "") {
      if (CO_HEADING.test(label || firstText)) inCo = true;
      continue; // a division heading or a note
    }
    const v = readMoney(valueCell);
    if ("error" in v) {
      errors.push(`${label || "A line"} (${where(r, "scheduled")}) ${v.error}.`);
      continue;
    }
    if (!label && v.cents === 0) continue;
    const typeCell = at(row, "type");
    const isCo =
      inCo ||
      /^(co|change|change order)$/i.test(typeCell) ||
      CO_LINE.test(item) ||
      CO_LINE.test(desc);
    if (isCo) {
      coCents += v.cents;
      changeOrderLines.push({
        itemNumber: item.slice(0, ITEM_MAX),
        description: (desc || item || `Line ${r + 1}`).slice(0, DESC_MAX),
        originalCents: v.cents,
        source: where(r, "scheduled"),
        billing: billingOf(row, r),
      });
      skipped.push({ source: rowWhere(r), label: label || firstText, reason: "change_order" });
      continue;
    }
    if (v.cents < 0) {
      errors.push(
        `${label || "A line"} (${where(r, "scheduled")}) is negative (${usd(v.cents)}). An original schedule of values has no deductions; enter a deduction as a change order after the import.`,
      );
      continue;
    }
    if (v.rounded) rounded++;
    if (v.cents === 0) zero++;
    let description = desc || item || `Line ${r + 1}`;
    let itemNumber = item;
    if (description.length > DESC_MAX) {
      description = `${description.slice(0, DESC_MAX - 1)}…`;
      truncated++;
    }
    if (itemNumber.length > ITEM_MAX) {
      itemNumber = itemNumber.slice(0, ITEM_MAX);
      truncated++;
    }
    let billed: number | null = null;
    if (hasBilling) {
      const toDate = m.toDate !== undefined ? readMoney(at(row, "toDate")) : null;
      if (toDate && !("error" in toDate)) billed = toDate.cents;
      else {
        const parts = (["previous", "thisPeriod", "stored"] as const).map((k) =>
          m[k] !== undefined ? readMoney(at(row, k)) : { cents: 0 },
        );
        billed = parts.every((p) => !("error" in p))
          ? parts.reduce((a, p) => a + ("cents" in p ? p.cents : 0), 0)
          : null;
      }
    }
    const billing = billingOf(row, r);
    lines.push({
      r,
      itemNumber,
      itemCell: item,
      description,
      originalCents: v.cents,
      source: where(r, "scheduled"),
      billed,
      ...(billing ? { billing } : {}),
    });
  }

  if (errors.length) return { ok: false, error: errors[0] ?? "", errors };
  if (!lines.length) {
    const error = skipped.length
      ? "Found the header, but every row under it is a subtotal, total or change order. The original schedule of values is the contract's own lines."
      : "Found the header but no lines with a scheduled value under it. Is this a blank template?";
    return { ok: false, error, errors: [error] };
  }
  if (lines.length > MAX_IMPORT_LINES) {
    const error = `The sheet has ${lines.length} lines; one import takes up to ${MAX_IMPORT_LINES}. Split the sheet and import it in parts.`;
    return { ok: false, error, errors: [error] };
  }

  // Lines with no item number get the next number after the last one seen, so the continuation sheet stays ordered.
  let next = 1;
  for (const l of lines) {
    if (l.itemNumber) {
      const n = Number(l.itemNumber);
      if (Number.isInteger(n) && n >= next) next = n + 1;
    } else {
      l.itemNumber = String(next++);
    }
  }
  const autoNumbered = lines.filter((l) => !l.itemCell).length;
  const seen = new Map<string, number>();
  for (const l of lines) seen.set(l.itemNumber, (seen.get(l.itemNumber) ?? 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupes.length)
    checks.push({
      severity: "medium",
      message: `Item number${dupes.length === 1 ? "" : "s"} ${dupes.slice(0, 5).join(", ")}${dupes.length > 5 ? "…" : ""} appear${dupes.length === 1 ? "s" : ""} more than once in the sheet. They are imported as they are; renumber them on the project if your GC needs unique items.`,
    });

  const totalCents = lines.reduce((a, l) => a + l.originalCents, 0);
  let sheetTotalCents: number | null = null;
  let sheetTotalSource: string | undefined;
  if (total) {
    const cell = at(total.row, "scheduled");
    if (cell === UNCALCULATED)
      notes.push(
        "The totals row is a formula with no saved result (the file was written by a program that does not calculate), so the sheet's own total was not checked.",
      );
    else if (cell !== "") {
      const v = readMoney(cell);
      if ("error" in v)
        checks.push({
          severity: "high",
          message: `Totals row (${where(total.r, "scheduled")}) ${v.error}.`,
        });
      else {
        sheetTotalCents = v.cents;
        sheetTotalSource = where(total.r, "scheduled");
        const slack = lines.length + skipped.length;
        const matches = (x: number) => Math.abs(v.cents - x) <= slack;
        if (!matches(totalCents) && !matches(totalCents + coCents))
          checks.push({
            severity: "high",
            message: `The sheet's own total (${where(total.r, "scheduled")}) is ${usd(v.cents)}, but the ${lines.length} lines above it add up to ${usd(totalCents)}, ${usd(totalCents - v.cents)} apart. Check that the SUM covers every line, or that no line is a subtotal under another name.`,
          });
      }
    }
  } else notes.push("No totals row found; every line down to the end of the sheet was read.");

  const subs = skipped.filter((s) => s.reason === "subtotal").length;
  const cos = skipped.filter((s) => s.reason === "change_order").length;
  if (subs)
    notes.push(
      `${subs} subtotal row${subs === 1 ? " was" : "s were"} left out so nothing is counted twice.`,
    );
  if (cos)
    notes.push(
      `${cos} change-order line${cos === 1 ? " was" : "s were"} left out: the original schedule is the contract as signed. Add change orders under Change orders, where they get an approval date.`,
    );
  if (rounded)
    notes.push(
      `${rounded} amount${rounded === 1 ? " was" : "s were"} carried to more than two decimals in the sheet (a formula result) and rounded to the cent.`,
    );
  if (autoNumbered)
    notes.push(
      `${autoNumbered} line${autoNumbered === 1 ? " had" : "s had"} no item number and ${autoNumbered === 1 ? "was" : "were"} numbered in order.`,
    );
  if (truncated)
    notes.push(
      `${truncated} item number${truncated === 1 ? " or description was" : "s or descriptions were"} longer than PayApps keeps (${ITEM_MAX} and ${DESC_MAX} characters) and ${truncated === 1 ? "was" : "were"} shortened.`,
    );
  if (zero)
    notes.push(
      `${zero} line${zero === 1 ? " has" : "s have"} a scheduled value of $0.00 and ${zero === 1 ? "is" : "are"} imported as $0.00.`,
    );

  const billedLines = lines.map((l) => l.billed);
  const billedToDateCents =
    hasBilling && billedLines.every((b) => b !== null)
      ? billedLines.reduce<number>((a, b) => a + (b ?? 0), 0)
      : null;

  const header = rowLabel
    ? `${origin ? `${origin} ` : ""}${rowLabel(h.row)}${h.depth > 1 ? ` to ${rowLabel(h.row + h.depth - 1)}` : ""}`
    : `${sheet ? `sheet "${sheet}", ` : ""}${sheet ? "row" : "line"} ${h.row + 1}${h.depth > 1 ? `-${h.row + h.depth}` : ""}`;
  return {
    ok: true,
    lines: lines.map(({ itemNumber, description, originalCents, source, billing }) => ({
      itemNumber,
      description,
      originalCents,
      source,
      ...(billing ? { billing } : {}),
    })),
    skipped,
    checks,
    notes,
    header,
    totalCents,
    sheetTotalCents,
    ...(sheetTotalSource ? { sheetTotalSource } : {}),
    billedToDateCents,
    changeOrderLines,
    billingColumns,
    ...titleBlock(grid, h.row),
  };
}

const APP_LABEL = /^(pay )?application (no\.?|number|#)\s*:?$|^app(lication)?\.? ?(no\.?|#)\s*:?$/i;
const PERIOD_LABEL = /^period( to| ending| end)?\s*:?$|^for (the )?period ending\s*:?$/i;

/** A date cell as YYYY-MM-DD: ISO, US month/day/year, or an Excel serial day number (1900 date system). */
export function readDate(cell: string): string | null {
  const t = clean(cell);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  let y: number;
  let mo: number;
  let d: number;
  if (iso) [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, mo, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Math.floor(Number(t));
    if (n < 36_526 || n > 73_050) return null; // 2000-01-01 .. 2099-12-31
    const dt = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
    return dt.toISOString().slice(0, 10);
  } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return null;
  return dt.toISOString().slice(0, 10);
}

/** The application number and period end from labels in the rows above the table header. */
function titleBlock(grid: Grid, headerRow: number) {
  let applicationNumber: number | null = null;
  let periodTo: string | null = null;
  let retainageWorkBps: number | null = null;
  let retainageStoredBps: number | null = null;
  for (let r = 0; r < headerRow; r++) {
    const row = (grid[r] ?? []).map(clean);
    for (let c = 0; c < row.length; c++) {
      const label = row[c] ?? "";
      if (!label) continue;
      // The value is the next filled cell to the right, or after the colon in the same cell.
      const inline = /:\s*(.+)$/.exec(label)?.[1] ?? "";
      const labelOnly = inline ? label.slice(0, label.indexOf(":") + 1) : label;
      const next = inline || (row.slice(c + 1).find((x) => x !== "") ?? "");
      if (applicationNumber === null && APP_LABEL.test(labelOnly)) {
        const n = Number(next.replace(/^#/, ""));
        if (Number.isInteger(n) && n >= 1 && n <= 999) applicationNumber = n;
      } else if (periodTo === null && PERIOD_LABEL.test(labelOnly)) periodTo = readDate(next);
      else if (retainageWorkBps === null && RATE_WORK.test(labelOnly))
        retainageWorkBps = readRateBps(next);
      else if (retainageStoredBps === null && RATE_STORED.test(labelOnly))
        retainageStoredBps = readRateBps(next);
    }
  }
  return { applicationNumber, periodTo, retainageWorkBps, retainageStoredBps };
}

// "Retainage on work, %" / "Retainage on stored materials, %" (the free template's title block), or "... rate".
const RATE_WORK = /^retain(age|ed)? on (completed )?work\b.*(%|rate|percent)/i;
const RATE_STORED = /^retain(age|ed)? on (stored )?materials?\b.*(%|rate|percent)/i;

/** A retainage rate as the sheet shows it: "10", "10%", or 0.1 from a percent-formatted cell. Basis points. */
export function readRateBps(s: string): number | null {
  const t = clean(s);
  const m = /^(\d+(?:\.\d+)?)\s*(%?)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const pct = m[2] || n >= 1 ? n : n * 100;
  const bps = Math.round(pct * 100);
  return bps <= 10_000 ? bps : null;
}

const SOV_NAME = /sov|schedule|values|g703|continuation|breakdown|bid|budget|detail/i;

/** Picks the worksheet to read: one named like a schedule of values first, then the first one that has a table. */
export function pickSov(sheets: Sheet[]): SovImportResult {
  const order = [...sheets].sort(
    (a, b) => Number(SOV_NAME.test(b.name)) - Number(SOV_NAME.test(a.name)),
  );
  let firstError: string | null = null;
  for (const s of order) {
    const r = findSov(s.grid, { sheet: s.name });
    if (r.ok) return { ...r, summary: findSummary(sheets.filter((x) => x !== s)) };
    firstError ??= `Sheet "${s.name}": ${r.error}`;
  }
  const error =
    sheets.length > 1
      ? `None of the ${sheets.length} sheets has a schedule of values this can read. ${firstError ?? ""}`
      : (firstError ?? "The workbook is empty.");
  return { ok: false, error, errors: [error] };
}
