// Hours by day for the certified payroll (WH-347) from a time or payroll report (pure): a CSV the
// payroll or time-tracking service exports with one row per employee and work date (QuickBooks time
// activities, Gusto or ADP time-card detail, a payroll-by-job report with a work date column), read
// into each worker's straight-time and overtime hours for the seven days of the week. Runs in the
// browser: the certified payroll page keeps its "nothing stored on our servers" promise, so the file
// never leaves it.
//
// What is read: the header (found under any report title lines) and the rows under it. Columns are
// matched by name and can be changed by hand: the work date, the employee (one name column, or last
// and first name columns), the job (to keep only this job's rows), hours (total, or regular), overtime
// hours, a pay type (regular / overtime / holiday ...) and the labor classification.
//
// What is never guessed: hours by day need a date per day. A report whose date is the pay date, check
// date or period end (one date per pay period) is refused with the reason, since spreading a week's
// hours over days would be inventing them. Pay types that are not hours worked (holiday, vacation,
// PTO, sick, bonus) are left out and counted. Rates, deductions and gross pay are not read: those stay
// typed on the form, where the checks against the wage determination run.

import { MAX_DAY_HUNDREDTHS, weekDays } from "./certified-payroll";
import { normalizeHeader, parseCsv, parseHours, parsePayrollDate } from "./payroll-report";

export const TIMESHEET_FIELDS = [
  "date",
  "employee",
  "lastName",
  "firstName",
  "job",
  "hours",
  "otHours",
  "payType",
  "classification",
] as const;
export type TimesheetField = (typeof TIMESHEET_FIELDS)[number];
export type TimesheetColumns = Record<TimesheetField, number | null>;

export const TIMESHEET_FIELD_LABELS: Record<TimesheetField, string> = {
  date: "Work date",
  employee: "Employee",
  lastName: "Last name",
  firstName: "First name",
  job: "Job",
  hours: "Hours (total or regular)",
  otHours: "Overtime hours",
  payType: "Pay type",
  classification: "Classification",
};

/** Date headers that are one date per day worked. */
const DAY_DATE_NAMES = [
  "work date",
  "date worked",
  "date",
  "day",
  "txn date",
  "activity date",
  "service date",
  "shift date",
  "clock in date",
  "time card date",
  "timesheet date",
];
/** Date headers that are one date per pay period: hours by day cannot be read from them. */
const PERIOD_DATE_NAMES = [
  "week ending",
  "week ending date",
  "period ending",
  "period end",
  "period end date",
  "pay period end",
  "pay period end date",
  "pay period",
  "pay date",
  "check date",
  "payment date",
  "paycheck date",
];

const HEADER_NAMES: Record<Exclude<TimesheetField, "date">, readonly string[]> = {
  employee: ["employee", "employee name", "name", "worker", "team member", "full name"],
  lastName: ["last name", "last", "surname", "employee last name"],
  firstName: ["first name", "first", "given name", "employee first name"],
  job: [
    "job",
    "job name",
    "job number",
    "job no",
    "job code",
    "customer job",
    "customer",
    "project",
    "project name",
    "class",
    "department",
    "location",
  ],
  hours: [
    "hours",
    "total hours",
    "hours worked",
    "hrs",
    "duration",
    "regular hours",
    "reg hours",
    "regular",
    "straight time hours",
    "st hours",
  ],
  otHours: ["overtime hours", "ot hours", "overtime", "ot", "overtime hrs", "ot hrs"],
  payType: [
    "pay type",
    "earnings type",
    "earning type",
    "earnings",
    "earning",
    "payroll item",
    "pay item",
    "pay code",
    "earnings code",
    "hour type",
    "time type",
  ],
  classification: [
    "classification",
    "labor classification",
    "craft",
    "trade",
    "work class",
    "worker class",
    "labor class",
    "job title",
    "position",
    "service item",
    "service",
  ],
};

/** Total-hours headers: overtime hours in another column are taken out of these. */
const TOTAL_HOURS_NAMES = new Set(["hours", "total hours", "hours worked", "hrs", "duration"]);

const HEADER_SEARCH_ROWS = 25;
export const MAX_TIMESHEET_ROWS = 50_000;

/** Which column each field is in, matched by header name; null where none matches. */
export function guessTimesheetColumns(headers: readonly string[]): TimesheetColumns {
  const norm = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const out = Object.fromEntries(TIMESHEET_FIELDS.map((f) => [f, null])) as TimesheetColumns;
  const pick = (field: TimesheetField, names: readonly string[]) => {
    for (const name of names) {
      const i = norm.findIndex((h, idx) => h === name && !taken.has(idx));
      if (i >= 0) {
        out[field] = i;
        taken.add(i);
        return;
      }
    }
  };
  // Overtime before hours, so "overtime hours" is not read as total hours; names before "name".
  pick("date", [...DAY_DATE_NAMES, ...PERIOD_DATE_NAMES]);
  pick("otHours", HEADER_NAMES.otHours);
  pick("hours", HEADER_NAMES.hours);
  pick("lastName", HEADER_NAMES.lastName);
  pick("firstName", HEADER_NAMES.firstName);
  pick("employee", HEADER_NAMES.employee);
  pick("payType", HEADER_NAMES.payType);
  pick("classification", HEADER_NAMES.classification);
  pick("job", HEADER_NAMES.job);
  return out;
}

export interface TimesheetReport {
  headers: string[];
  rows: { row: number; cells: string[] }[];
  /** 1-based row number of the header in the file. */
  headerRow: number;
}

/**
 * The header row (the first in the top rows naming a date, an employee and an hours column) and the
 * rows under it; null when there is none.
 */
export function readTimesheetReport(text: string): TimesheetReport | null {
  const all = parseCsv(text);
  for (let i = 0; i < Math.min(all.length, HEADER_SEARCH_ROWS); i++) {
    const headers = all[i] ?? [];
    const c = guessTimesheetColumns(headers);
    const named = c.employee !== null || c.lastName !== null;
    const hours = c.hours !== null || c.otHours !== null;
    if (c.date !== null && named && hours) {
      const rows = all
        .slice(i + 1, i + 1 + MAX_TIMESHEET_ROWS)
        .map((cells, k) => ({ row: i + 2 + k, cells }))
        .filter((r) => r.cells.some((x) => x !== ""));
      return { headers, rows, headerRow: i + 1 };
    }
  }
  return null;
}

/**
 * Why hours by day cannot be read with this date column, or null when they can: the header names a
 * pay period (pay date, check date, period end), not the day worked.
 */
export function periodDateProblem(
  report: TimesheetReport,
  columns: TimesheetColumns,
): string | null {
  if (columns.date === null) return "Pick the work date column";
  const h = normalizeHeader(report.headers[columns.date] ?? "");
  if (PERIOD_DATE_NAMES.includes(h)) {
    return `"${report.headers[columns.date]}" is one date per pay period, so the hours cannot be put on the days they were worked. Export a report with the date of each day worked (time activities or time-card detail), or type the hours.`;
  }
  return null;
}

export type PayKind = "st" | "ot" | "dt" | "skip";

/**
 * A pay type as straight time, overtime, double time, or not hours worked (left out); blank is
 * straight time. Double time is its own kind: the form's overtime row has one rate (usually 1.5x),
 * so double-time hours on it would be priced, and 7A computed, at the overtime rate. They are left
 * out and listed, to enter on a row of their own at the double-time rate.
 */
export function payKind(value: string): PayKind {
  const v = value.trim().toLowerCase();
  if (v === "") return "st";
  if (/\b(double ?time|double overtime|dt)\b|\b2(\.0)?x\b/.test(v)) return "dt";
  if (/\b(overtime|ot|o\/t|time and a half)\b|1\.5x?/.test(v)) {
    return "ot";
  }
  if (/\b(regular|reg|straight|hourly|st)\b/.test(v)) return "st";
  return "skip";
}

/** "Lopez, Ana M." / "Ana M Lopez" / "Ana Lopez" to its parts. */
export function splitName(full: string): { lastName: string; firstName: string; mi: string } {
  const s = full.trim().replace(/\s+/g, " ");
  const initial = (t: string) => (/^[a-z]\.?$/i.test(t) ? t.replace(".", "").toUpperCase() : "");
  if (s.includes(",")) {
    const [last = "", rest = ""] = s.split(",", 2).map((x) => x.trim());
    const parts = rest.split(" ").filter(Boolean);
    const lastPart = parts[parts.length - 1] ?? "";
    const mi = parts.length > 1 ? initial(lastPart) : "";
    const first = mi ? parts.slice(0, -1).join(" ") : rest;
    return { lastName: last, firstName: first, mi };
  }
  const parts = s.split(" ").filter(Boolean);
  if (parts.length <= 1) return { lastName: s, firstName: "", mi: "" };
  const last = parts[parts.length - 1] ?? "";
  const middle = parts.length > 2 ? initial(parts[parts.length - 2] ?? "") : "";
  const first = parts.slice(0, middle ? -2 : -1).join(" ");
  return { lastName: last, firstName: first, mi: middle };
}

/** How a worker is matched between the report and the form: last and first name, any case. */
export const workerKey = (lastName: string, firstName: string) =>
  `${lastName.trim().toLowerCase()}|${firstName.trim().toLowerCase().split(" ")[0] ?? ""}`;

export interface TimesheetEntry {
  lastName: string;
  firstName: string;
  mi: string;
  /** The classification column's value; "" when there is none. */
  classification: string;
  /** Hundredths of an hour per day, oldest first (the seven days ending on the week-ending date). */
  st: number[];
  ot: number[];
  rows: number;
}

export interface TimesheetResult {
  entries: TimesheetEntry[];
  errors: { row: number; message: string }[];
  /** Rows dated outside the week, left out. */
  outsideWeek: number;
  /** Rows of other jobs, left out. */
  otherJobRows: number;
  /** Rows with no date (subtotals, totals, notes), left out. */
  skippedRows: number;
  /** Rows whose pay type is not hours worked (holiday, vacation, sick ...), with the types seen. */
  notWorked: { rows: number; types: string[] };
  /** Double-time rows left out (see `payKind`): hours per worker, to enter on a row of their own. */
  doubleTime: { name: string; hundredths: number }[];
  /** Every row in the week is on one date: likely a per-period report under a plain "Date" header. */
  oneDateOnly: boolean;
}

export interface TimesheetOptions {
  columns: TimesheetColumns;
  weekEnding: string;
  /** The job column's values that are this job; null reads every row (a report for this job only). */
  jobValues: readonly string[] | null;
}

const cell = (cells: readonly string[], i: number | null) =>
  i === null ? "" : (cells[i] ?? "").trim();

/** The jobs named in the report's job column, with how many rows each has. */
export function timesheetJobs(
  report: TimesheetReport,
  columns: TimesheetColumns,
): { value: string; rows: number }[] {
  if (columns.job === null) return [];
  const by = new Map<string, number>();
  for (const r of report.rows) {
    if (!parsePayrollDate(cell(r.cells, columns.date))) continue;
    const v = cell(r.cells, columns.job);
    by.set(v, (by.get(v) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([value, rows]) => ({ value, rows }))
    .sort((a, b) => b.rows - a.rows);
}

/** The report's rows for this job and week, summed per worker, classification and day. */
export function timesheetHours(report: TimesheetReport, opts: TimesheetOptions): TimesheetResult {
  const { columns } = opts;
  const result: TimesheetResult = {
    entries: [],
    errors: [],
    outsideWeek: 0,
    otherJobRows: 0,
    skippedRows: 0,
    notWorked: { rows: 0, types: [] },
    doubleTime: [],
    oneDateOnly: false,
  };
  const problem = periodDateProblem(report, columns);
  if (problem) {
    result.errors.push({ row: report.headerRow, message: problem });
    return result;
  }
  if (columns.employee === null && columns.lastName === null) {
    result.errors.push({
      row: report.headerRow,
      message: "Pick the employee (or last name) column",
    });
    return result;
  }
  if (columns.hours === null && columns.otHours === null) {
    result.errors.push({ row: report.headerRow, message: "Pick the hours column" });
    return result;
  }
  const days = weekDays(opts.weekEnding).map((d) => d.iso);
  if (days.length !== 7) {
    result.errors.push({ row: report.headerRow, message: "Set the week ending date first" });
    return result;
  }
  const hoursIsTotal = TOTAL_HOURS_NAMES.has(
    normalizeHeader(columns.hours === null ? "" : (report.headers[columns.hours] ?? "")),
  );
  const jobSet = opts.jobValues ? new Set(opts.jobValues) : null;
  const notWorkedTypes = new Set<string>();
  const doubleTime = new Map<string, number>();
  const datesSeen = new Set<string>();
  const byKey = new Map<string, TimesheetEntry>();

  for (const r of report.rows) {
    const dateCell = cell(r.cells, columns.date);
    if (dateCell === "" || /\btotals?\b/i.test(dateCell)) {
      result.skippedRows++;
      continue;
    }
    if (jobSet && !jobSet.has(cell(r.cells, columns.job))) {
      result.otherJobRows++;
      continue;
    }
    const iso = parsePayrollDate(dateCell);
    if (!iso) {
      result.errors.push({
        row: r.row,
        message: `"${dateCell}" is not a date (use YYYY-MM-DD or M/D/YYYY)`,
      });
      continue;
    }
    const day = days.indexOf(iso);
    if (day < 0) {
      result.outsideWeek++;
      continue;
    }
    let name: { lastName: string; firstName: string; mi: string };
    if (columns.lastName !== null) {
      // Separate columns; a trailing initial in the first-name column ("Ana M.") is the MI.
      const parts = cell(r.cells, columns.firstName).split(/\s+/).filter(Boolean);
      const lastPart = parts[parts.length - 1] ?? "";
      const hasMi = parts.length > 1 && /^[a-z]\.?$/i.test(lastPart);
      name = {
        lastName: cell(r.cells, columns.lastName),
        firstName: (hasMi ? parts.slice(0, -1) : parts).join(" "),
        mi: hasMi ? lastPart.replace(".", "").toUpperCase() : "",
      };
    } else name = splitName(cell(r.cells, columns.employee));
    if (name.lastName === "" || /\btotals?\b/i.test(name.lastName)) {
      result.skippedRows++;
      continue;
    }

    const kind = payKind(cell(r.cells, columns.payType));
    if (kind === "skip") {
      result.notWorked.rows++;
      notWorkedTypes.add(cell(r.cells, columns.payType));
      continue;
    }
    const read = (col: number | null): number | null => {
      if (col === null) return 0;
      const raw = cell(r.cells, col);
      const h = parseHours(raw);
      if (h === null || h < 0) {
        result.errors.push({ row: r.row, message: `"${raw}" is not a number of hours` });
        return null;
      }
      return h;
    };
    const hours = read(columns.hours);
    const otCol = read(columns.otHours);
    if (hours === null || otCol === null) continue;
    if (kind === "dt") {
      const who = [name.firstName, name.lastName].filter(Boolean).join(" ");
      const e = doubleTime.get(who) ?? 0;
      doubleTime.set(who, e + hours + otCol);
      continue;
    }
    let st: number;
    let ot: number;
    if (kind === "ot") {
      st = 0;
      ot = hours + otCol;
    } else if (hoursIsTotal && columns.otHours !== null) {
      if (otCol > hours) {
        result.errors.push({
          row: r.row,
          message: `Overtime hours (${otCol / 100}) are more than the total hours (${hours / 100})`,
        });
        continue;
      }
      st = hours - otCol;
      ot = otCol;
    } else {
      st = hours;
      ot = otCol;
    }
    if (st === 0 && ot === 0) {
      result.skippedRows++;
      continue;
    }
    datesSeen.add(iso);
    const classification = cell(r.cells, columns.classification);
    const key = `${workerKey(name.lastName, name.firstName)}|${classification.toLowerCase()}`;
    let e = byKey.get(key);
    if (!e) {
      e = {
        ...name,
        classification,
        st: [0, 0, 0, 0, 0, 0, 0],
        ot: [0, 0, 0, 0, 0, 0, 0],
        rows: 0,
      };
      byKey.set(key, e);
    }
    e.st[day] = (e.st[day] ?? 0) + st;
    e.ot[day] = (e.ot[day] ?? 0) + ot;
    if (!e.mi && name.mi) e.mi = name.mi;
    e.rows++;
  }

  for (const e of byKey.values()) {
    e.st.forEach((h, d) => {
      const total = h + (e.ot[d] ?? 0);
      if (total > MAX_DAY_HUNDREDTHS) {
        result.errors.push({
          row: report.headerRow,
          message: `${e.firstName} ${e.lastName} has ${total / 100} hours on ${days[d]}: more than 24 in a day. Is the date column the day worked?`,
        });
      }
    });
  }
  result.entries = [...byKey.values()].sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName) ||
      a.classification.localeCompare(b.classification),
  );
  result.notWorked.types = [...notWorkedTypes];
  result.doubleTime = [...doubleTime.entries()]
    .filter(([, h]) => h > 0)
    .map(([name, hundredths]) => ({ name, hundredths }));
  result.oneDateOnly = datesSeen.size === 1 && result.entries.length > 0;
  return result;
}

/** The parts of a form worker and row this fills (the page's draft types carry more). */
export interface FillRow {
  classification: string;
  st: number[];
  ot: number[];
  grossProjectCents: number | null;
}
export interface FillWorker<R extends FillRow> {
  lastName: string;
  firstName: string;
  middleInitial?: string;
  rows: R[];
}

export interface FillSummary {
  matched: number;
  added: number;
  rowsAdded: number;
  /** Workers on the form with no hours in the report: kept, their hours cleared. */
  noHours: string[];
}

const isBlankWorker = <R extends FillRow>(w: FillWorker<R>) =>
  w.lastName.trim() === "" &&
  w.firstName.trim() === "" &&
  w.rows.every((r) => [...r.st, ...r.ot].every((h) => h === 0));

/**
 * The form's workers with the report's hours put in. A worker is matched by last and first name;
 * within a worker, the row of the same classification (any case), else the first row when the report
 * has no classification or the worker's only row has none typed yet, else a new row. Workers in the
 * report and not on the form are added with their names (ID, rates and classification to type).
 * Hours replace what was typed on every worker this touches, and a typed gross for this project is
 * cleared on rows whose hours changed (it would no longer match). Workers on the form with no hours
 * in the report keep their rows with hours set to zero, and are listed so they can be removed.
 */
export function fillFromTimesheet<R extends FillRow, W extends FillWorker<R>>(
  workers: readonly W[],
  entries: readonly TimesheetEntry[],
  make: { worker: () => W; row: () => R },
): { workers: W[]; summary: FillSummary } {
  const out: W[] = workers
    .filter((w) => !isBlankWorker(w))
    .map((w) => ({
      ...w,
      rows: w.rows.map((r) => ({
        ...r,
        st: [0, 0, 0, 0, 0, 0, 0],
        ot: [0, 0, 0, 0, 0, 0, 0],
        grossProjectCents: [...r.st, ...r.ot].some((h) => h !== 0) ? null : r.grossProjectCents,
      })),
    }));
  const summary: FillSummary = { matched: 0, added: 0, rowsAdded: 0, noHours: [] };
  const touched = new Set<number>();
  for (const e of entries) {
    const key = workerKey(e.lastName, e.firstName);
    let wi = out.findIndex((w) => workerKey(w.lastName, w.firstName) === key);
    if (wi < 0) {
      const w = make.worker();
      const row = { ...make.row() };
      out.push({
        ...w,
        lastName: e.lastName,
        firstName: e.firstName,
        middleInitial: e.mi,
        rows: [row],
      });
      wi = out.length - 1;
      summary.added++;
    } else if (!touched.has(wi)) summary.matched++;
    touched.add(wi);
    const w = out[wi] as W;
    const cls = e.classification.trim().toLowerCase();
    let ri =
      cls === "" ? 0 : w.rows.findIndex((r) => r.classification.trim().toLowerCase() === cls);
    if (ri < 0) {
      const onlyBlank = w.rows.length === 1 && (w.rows[0]?.classification.trim() ?? "") === "";
      if (onlyBlank) ri = 0;
      else if (w.rows.length < 6) {
        w.rows = [...w.rows, { ...make.row() }];
        ri = w.rows.length - 1;
        summary.rowsAdded++;
      } else ri = 0;
    }
    const row = w.rows[ri] as R;
    w.rows[ri] = {
      ...row,
      classification: row.classification.trim() === "" ? e.classification : row.classification,
      st: row.st.map((h, d) => h + (e.st[d] ?? 0)),
      ot: row.ot.map((h, d) => h + (e.ot[d] ?? 0)),
      grossProjectCents: null,
    };
  }
  out.forEach((w, i) => {
    if (!touched.has(i)) summary.noHours.push(`${w.firstName} ${w.lastName}`.trim());
  });
  return { workers: out, summary };
}
