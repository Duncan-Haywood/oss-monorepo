// Import part 3: an existing POA&M spreadsheet (saved as CSV, or the chosen sheet of an .xlsx turned
// into CSV by sheet-import.ts) read into POA&M items, so a shop that has tracked its open items in
// Excel moves in without retyping them. Pure: the worker matches the rows against the org's items and
// applies them; the browser shows the same preview.
//
// Nothing is guessed. The requirement column is found by its contents (the ids csv-import.ts reads),
// the other columns by their headers. A row needs a weakness and a scheduled completion date the
// reader understands; without either it is listed with its line and left out. A date is read only in
// an unambiguous form (2026-12-31, 31 Dec 2026, Dec 31, 2026, or an Excel date number) or as a numeric
// date in one order for the whole column: month/day/year (12/31/2026) by default, day/month/year
// (31/12/2026, 31.12.2026) when the person picks it or when the column itself shows it (a first number
// over 12 and no second number over 12). A cell is never swapped on its own: a date that does not fit
// the column's order is listed and left out.

import type { PoamStatus } from "../enums";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportLevel,
  parseCsv,
  resolveControlId,
} from "./csv-import";

export const POAM_TEXT_MAX = 4000;
export const POAM_RESPONSIBLE_MAX = 200;

export type PoamColumnKind =
  | "id"
  | "weakness"
  | "remediation"
  | "milestones"
  | "responsible"
  | "scheduledCompletion"
  | "status";

export interface PoamImportRow {
  /** 1-based line in the file (the Excel row for a workbook). */
  line: number;
  controlId: string;
  weakness: string;
  scheduledCompletion: string;
  remediation?: string;
  milestones?: string;
  responsible?: string;
  status?: PoamStatus;
}

export interface PoamImportIssue {
  line: number | null;
  message: string;
}

/** How numeric dates (03/04/2026) are read: month first (US) or day first. */
export type DateOrder = "mdy" | "dmy";

export interface DateOrderRead {
  order: DateOrder;
  /** "chosen" by the person, "detected" from the column, or the month-first "default". */
  source: "chosen" | "detected" | "default";
  /** Numeric dates in the column (03/04/2026, 31.12.2026); the order matters only when there are some. */
  numeric: number;
  /** The first line whose date shows the order it was detected from (31/12/2026), if any. */
  evidenceLine: number | null;
}

export interface PoamImportPlan {
  level: ImportLevel;
  dates: DateOrderRead;
  /** Column header (or "column N") used for each kind, null if not found. */
  columns: Record<PoamColumnKind, string | null>;
  rows: PoamImportRow[];
  issues: PoamImportIssue[];
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same item: same requirement and the same weakness text, ignoring case, spacing and punctuation. */
export const poamKey = (controlId: string, weakness: string) =>
  `${controlId}\u0000${normalise(weakness)}`;

// ---- status ----

const STATUS: Record<string, PoamStatus> = {};
for (const p of ["open", "ongoing", "in progress", "pending", "delayed", "not started", "planned"])
  STATUS[p] = "open";
for (const p of ["closed", "complete", "completed", "done", "resolved", "remediated"])
  STATUS[p] = "closed";

/** open / closed from a status cell, or null for anything else ("risk accepted" is neither). */
export function parsePoamStatus(cell: string): PoamStatus | null {
  return STATUS[normalise(cell)] ?? null;
}

// ---- dates ----

const MONTHS: Record<string, number> = {};
[
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
].forEach((m, i) => {
  MONTHS[m] = i + 1;
  MONTHS[m.slice(0, 3)] = i + 1;
});
MONTHS.sept = 9;

function iso(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2199 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

// Excel's 1900 date system: serial 1 is 1900-01-01 and it counts a 29 Feb 1900 that never was, so
// from serial 61 on the day is 1899-12-30 + serial. Only serials from 1990 to 2199 are accepted.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const SERIAL_MIN = 32874; // 1990-01-01
const SERIAL_MAX = 109574; // 2199-12-31

const clean = (cell: string) => cell.trim().replace(/\s+/g, " ");

// A numeric date with the year last: 12/31/2026 or 31/12/2026 (slashes), 31.12.2026 or 31-12-2026 (the
// day-first forms Europe uses), with an optional time after it.
const NUMERIC_DATE =
  /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?: \d{1,2}:\d{2}(?::\d{2})?(?: ?[AP]M)?)?$/i;

/**
 * Which order a numeric date cell shows on its own: "dmy" when the first number cannot be a month
 * (31/12/2026) or it uses dots (31.12.2026, never month first), "mdy" when the second number cannot
 * be a month (12/31/2026), null when either reading is possible (03/04/2026) or it is no numeric date.
 */
export function numericDateOrder(cell: string): DateOrder | "either" | null {
  const m = NUMERIC_DATE.exec(clean(cell));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (a > 12 && b <= 12) return "dmy";
  if (b > 12 && a <= 12) return "mdy";
  if (m[2] === ".") return "dmy";
  return "either";
}

/**
 * YYYY-MM-DD from a date cell, or null when the cell is no date this reader trusts. A time after the
 * date (2026-12-31 00:00:00, or an Excel serial with a fraction) is dropped. Numeric dates with the
 * year last are read in `order`: month/day/year (with slashes only) by default, or day/month/year
 * (slashes, dots or dashes).
 */
export function parsePoamDate(cell: string, order: DateOrder = "mdy"): string | null {
  const s = clean(cell);
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/.exec(
    s,
  );
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = NUMERIC_DATE.exec(s);
  if (m) {
    if (order === "mdy") return m[2] === "/" ? iso(Number(m[4]), Number(m[1]), Number(m[3])) : null;
    return iso(Number(m[4]), Number(m[3]), Number(m[1]));
  }
  m = /^(\d{1,2})[ -]([A-Za-z]{3,9})\.?[ ,-]*(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[(m[2] ?? "").toLowerCase()];
    return month ? iso(Number(m[3]), month, Number(m[1])) : null;
  }
  m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[(m[1] ?? "").toLowerCase()];
    return month ? iso(Number(m[3]), month, Number(m[2])) : null;
  }
  m = /^(\d{5,6})(?:\.\d+)?$/.exec(s);
  if (m) {
    const serial = Number(m[1]);
    if (serial < SERIAL_MIN || serial > SERIAL_MAX) return null;
    return new Date(EXCEL_EPOCH + serial * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

// ---- columns ----

type FieldKind = Exclude<PoamColumnKind, "id">;

// Tried in this order, each taking the first free column whose header matches, so "Milestones" is
// not read as the remediation plan and "Scheduled completion date" not as a status.
const HEADER_HINTS: [FieldKind, RegExp][] = [
  ["status", /\bstatus\b/],
  ["milestones", /\bmilestones?\b/],
  [
    "scheduledCompletion",
    /\b(scheduled completion|completion date|planned completion|estimated completion|target (completion )?date|due date|deadline|completion|due)\b/,
  ],
  [
    "remediation",
    /\b(remediation|corrective actions?|planned actions?|action plan|mitigation|resolution|recommendation|actions?)\b/,
  ],
  ["responsible", /\b(responsible|owner|poc|point of contact|assigned( to)?)\b/],
  [
    "weakness",
    /\b(weakness(es)?|deficienc(y|ies)|findings?|gaps?|vulnerabilit(y|ies)|issues?|description|observations?)\b/,
  ],
];

const KIND_LABEL: Record<FieldKind, string> = {
  weakness: "weakness",
  remediation: "remediation plan",
  milestones: "milestones",
  responsible: "responsible",
  scheduledCompletion: "scheduled completion",
  status: "status",
};

const OTHER: Record<DateOrder, DateOrder> = { mdy: "dmy", dmy: "mdy" };
const ORDER_NAME: Record<DateOrder, string> = { mdy: "month/day/year", dmy: "day/month/year" };
const ORDER_EXAMPLE: Record<DateOrder, string> = {
  mdy: "12/31/2026 as month/day/year",
  dmy: "31/12/2026 as day/month/year",
};

/**
 * The order for a column of date cells: the person's choice when given; otherwise day first when
 * some cell can only be day first and none can only be month first; otherwise month first.
 */
export function readDateOrder(
  cells: { line: number; value: string }[],
  chosen?: DateOrder,
): DateOrderRead {
  let numeric = 0;
  let dmyLine: number | null = null;
  let mdyLine: number | null = null;
  for (const { line, value } of cells) {
    const o = numericDateOrder(value);
    if (!o) continue;
    numeric++;
    if (o === "dmy" && dmyLine === null) dmyLine = line;
    if (o === "mdy" && mdyLine === null) mdyLine = line;
  }
  if (chosen) return { order: chosen, source: "chosen", numeric, evidenceLine: null };
  if (dmyLine !== null && mdyLine === null)
    return { order: "dmy", source: "detected", numeric, evidenceLine: dmyLine };
  return { order: "mdy", source: "default", numeric, evidenceLine: mdyLine };
}

export function planPoamImport(
  csv: string,
  level: ImportLevel,
  dateOrder?: DateOrder,
): PoamImportPlan {
  const columns: Record<PoamColumnKind, string | null> = {
    id: null,
    weakness: null,
    remediation: null,
    milestones: null,
    responsible: null,
    scheduledCompletion: null,
    status: null,
  };
  const issues: PoamImportIssue[] = [];
  const plan: PoamImportPlan = {
    level,
    dates: {
      order: dateOrder ?? "mdy",
      source: dateOrder ? "chosen" : "default",
      numeric: 0,
      evidenceLine: null,
    },
    columns,
    rows: [],
    issues,
  };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({
      line: null,
      message: "The file is over 1 MB. Save only the POA&M sheet as CSV.",
    });
    return plan;
  }
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the POA&M sheet as CSV.`,
    });
    return plan;
  }
  const width = Math.max(0, ...table.map((r) => r.length));
  const cell = (r: number, c: number) => (table[r]?.[c] ?? "").trim();

  let idCol = -1;
  let idHits = 0;
  for (let c = 0; c < width; c++) {
    let hits = 0;
    for (let r = 0; r < table.length; r++) if (resolveControlId(cell(r, c), level)) hits++;
    if (hits > idHits) {
      idCol = c;
      idHits = hits;
    }
  }
  if (idCol < 0) {
    issues.push({
      line: null,
      message: `No column of requirement ids was found. Each POA&M row needs the requirement it is for, such as ${level === 2 ? "AC.L2-3.1.1 or 3.1.1" : "AC.L1-b.1.i or (b)(1)(i)"}.`,
    });
    return plan;
  }
  const firstIdRow = table.findIndex((_, r) => resolveControlId(cell(r, idCol), level));
  const filled = (r: number) => (table[r] ?? []).filter((v) => v.trim()).length;
  let headerRow = -1;
  for (let r = firstIdRow - 1; r >= 0; r--) {
    if (filled(r) >= 2) {
      headerRow = r;
      break;
    }
  }
  const header = (c: number) => (headerRow >= 0 ? cell(headerRow, c) : "");
  const label = (c: number) => header(c) || `column ${c + 1}`;
  columns.id = label(idCol);

  const col: Record<FieldKind, number> = {
    weakness: -1,
    remediation: -1,
    milestones: -1,
    responsible: -1,
    scheduledCompletion: -1,
    status: -1,
  };
  const taken = new Set([idCol]);
  for (const [kind, re] of HEADER_HINTS) {
    for (let c = 0; c < width; c++) {
      if (taken.has(c)) continue;
      const h = normalise(header(c));
      if (h && re.test(h)) {
        taken.add(c);
        col[kind] = c;
        columns[kind] = label(c);
        break;
      }
    }
  }
  const missing = (["weakness", "scheduledCompletion"] as const).filter((k) => col[k] < 0);
  if (missing.length) {
    issues.push({
      line: null,
      message: `No ${missing.map((k) => KIND_LABEL[k]).join(" or ")} column was found by its header. A POA&M item needs a weakness and a scheduled completion date; name the columns "Weakness" and "Scheduled completion" and import again.`,
    });
    return plan;
  }

  const dateCells: { line: number; value: string }[] = [];
  for (let r = firstIdRow; r < table.length; r++)
    if (resolveControlId(cell(r, idCol), level))
      dateCells.push({ line: r + 1, value: cell(r, col.scheduledCompletion) });
  plan.dates = readDateOrder(dateCells, dateOrder);
  const order = plan.dates.order;
  if (plan.dates.source === "detected")
    issues.push({
      line: null,
      message: `Dates such as 03/04/2026 are read as day/month/year (4 March 2026), because line ${plan.dates.evidenceLine}'s date can only be day first. Choose month/day/year if that is wrong.`,
    });

  const seen = new Map<string, number>();
  for (let r = firstIdRow; r < table.length; r++) {
    const line = r + 1;
    const id = resolveControlId(cell(r, idCol), level);
    if (!id) continue;
    if (!id.ok) {
      issues.push({ line, message: id.reason });
      continue;
    }
    const text = (kind: FieldKind, max: number) => {
      const c = col[kind];
      if (c < 0) return undefined;
      const raw = (table[r]?.[c] ?? "").replace(/\r\n?/g, "\n").trim();
      if (!raw) return undefined;
      if (raw.length > max) {
        issues.push({
          line,
          message: `The ${KIND_LABEL[kind]} is over ${max} characters; the first ${max} are imported.`,
        });
        return raw.slice(0, max);
      }
      return raw;
    };
    const weakness = text("weakness", POAM_TEXT_MAX);
    if (!weakness) {
      issues.push({ line, message: `${id.controlId} has no weakness, so the row is left out.` });
      continue;
    }
    const rawDate = cell(r, col.scheduledCompletion);
    const scheduledCompletion = parsePoamDate(rawDate, order);
    if (!scheduledCompletion) {
      issues.push({
        line,
        message: rawDate
          ? `"${rawDate.slice(0, 40)}" is not a date this import reads (2026-12-31, ${ORDER_EXAMPLE[order]}, 31 Dec 2026); the row is left out.${numericDateOrder(rawDate) === OTHER[order] ? ` It can only be ${ORDER_NAME[OTHER[order]]}; choose that order if the whole column is written that way.` : ""}`
          : `${id.controlId} has no scheduled completion date, so the row is left out.`,
      });
      continue;
    }
    const key = poamKey(id.controlId, weakness);
    const prior = seen.get(key);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `Same requirement and weakness as line ${prior}; only line ${prior} is imported.`,
      });
      continue;
    }
    seen.set(key, line);
    const row: PoamImportRow = { line, controlId: id.controlId, weakness, scheduledCompletion };
    const remediation = text("remediation", POAM_TEXT_MAX);
    if (remediation) row.remediation = remediation;
    const milestones = text("milestones", POAM_TEXT_MAX);
    if (milestones) row.milestones = milestones;
    const responsible = text("responsible", POAM_RESPONSIBLE_MAX);
    if (responsible) row.responsible = responsible;
    if (col.status >= 0) {
      const raw = cell(r, col.status);
      if (raw) {
        const status = parsePoamStatus(raw);
        if (status) row.status = status;
        else
          issues.push({
            line,
            message: `"${raw.slice(0, 60)}" is not a status this import reads (open, closed, completed, in progress); the item is imported as open, or keeps its status if it is already here.`,
          });
      }
    }
    plan.rows.push(row);
  }
  if (!plan.rows.length && !issues.length) {
    issues.push({ line: null, message: "No POA&M rows were found under the header." });
  }
  return plan;
}
