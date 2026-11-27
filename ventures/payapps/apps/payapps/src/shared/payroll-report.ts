// Labor costs from a payroll report (pure): a CSV a payroll service exports (QuickBooks Payroll,
// Gusto, ADP, Paychex and the like), read into one labor cost per pay date and schedule-of-values
// line on the job-cost page. Runs in the browser and the Worker.
//
// What is read: a header row (found in the first rows, after any report title lines), then one row
// per employee, check or job line. The columns are matched by their header names and can be changed
// by hand: the date, the job (customer, project, class or department the payroll service tags each
// line with), the employee, hours, gross wages, employer taxes, employer benefit contributions, and
// optionally a cost code or schedule-of-values item number.
//
// What a cost is: gross wages + employer taxes + employer contributions + the contractor's own labor
// burden percent on wages (workers' comp, liability insurance and the like that the report does not
// carry). The burden is only ever the percent the contractor types; nothing is assumed. Rows for
// other jobs are left out. Rows with no date (subtotals, totals, blank separators) are counted and
// skipped, never read as costs; a date or amount that does not read is an error with its row number,
// never a guess.
//
// Never twice: every cost carries a reference "Payroll <date>" (plus " item <n>" when it is on a
// line read from the item column, or " line <n>" when it is on the line picked for the whole
// report), and the Worker skips any whose reference the job already has (services/payapps/job-cost.ts,
// `skipExistingReferences`), so importing the same report again adds nothing.

import { parseCostDate } from "./job-cost";

export const PAYROLL_FIELDS = [
  "date",
  "job",
  "employee",
  "hours",
  "wages",
  "employerTaxes",
  "employerBenefits",
  "item",
] as const;
export type PayrollField = (typeof PAYROLL_FIELDS)[number];
export type PayrollColumns = Record<PayrollField, number | null>;

export const PAYROLL_FIELD_LABELS: Record<PayrollField, string> = {
  date: "Date",
  job: "Job",
  employee: "Employee",
  hours: "Hours",
  wages: "Gross wages",
  employerTaxes: "Employer taxes",
  employerBenefits: "Employer contributions",
  item: "Cost code / item",
};

/** Header names each column is found by, in order of preference (normalized: lowercase words). */
const HEADER_NAMES: Record<PayrollField, readonly string[]> = {
  date: [
    "work date",
    "date worked",
    "date",
    "week ending",
    "week ending date",
    "period ending",
    "period end",
    "pay period end",
    "pay period end date",
    "period end date",
    "pay date",
    "check date",
    "payment date",
    "paycheck date",
    "txn date",
  ],
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
  employee: ["employee", "employee name", "name", "worker", "team member"],
  hours: ["hours", "total hours", "hours worked", "hrs"],
  wages: [
    "gross pay",
    "gross wages",
    "gross earnings",
    "total gross pay",
    "gross",
    "total earnings",
    "earnings",
    "wages",
    "total pay",
    "amount",
  ],
  employerTaxes: [
    "employer taxes",
    "employer tax",
    "total employer taxes",
    "company taxes",
    "er taxes",
    "employer payroll taxes",
  ],
  employerBenefits: [
    "employer contributions",
    "company contributions",
    "total employer contributions",
    "employer benefits",
    "er contributions",
    "employer benefit contributions",
  ],
  item: ["cost code", "item", "item number", "item no", "sov item", "phase", "phase code"],
};

/** Header rows are looked for in this many rows from the top. */
const HEADER_SEARCH_ROWS = 25;

/** A payroll report has at most this many rows read (a long job's year of weekly lines is far less). */
export const MAX_PAYROLL_ROWS = 50_000;

export const normalizeHeader = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Rows of a CSV (or tab-separated) text: quoted fields may hold commas, doubled quotes and line
 * breaks. The delimiter is a tab when the first line has one, else a comma.
 */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^\uFEFF/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (ch === delim) {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cur.trim());
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

/** Which column each field is in, matched by header name; null where none matches. */
export function guessPayrollColumns(headers: readonly string[]): PayrollColumns {
  const norm = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const out = Object.fromEntries(PAYROLL_FIELDS.map((f) => [f, null])) as PayrollColumns;
  // Money columns first, so "employer taxes" is not taken by a looser match elsewhere.
  const order: PayrollField[] = [
    "employerTaxes",
    "employerBenefits",
    "wages",
    "date",
    "job",
    "employee",
    "hours",
    "item",
  ];
  for (const field of order) {
    for (const name of HEADER_NAMES[field]) {
      const i = norm.findIndex((h, idx) => h === name && !taken.has(idx));
      if (i >= 0) {
        out[field] = i;
        taken.add(i);
        break;
      }
    }
  }
  return out;
}

export interface PayrollReport {
  headers: string[];
  /** The data rows under the header, with their 1-based row number in the file. */
  rows: { row: number; cells: string[] }[];
  /** 1-based row number of the header in the file. */
  headerRow: number;
}

/**
 * The header row (the first in the top rows that names both a date and a wages column) and the rows
 * under it. Null when no such row is found.
 */
export function readPayrollReport(text: string): PayrollReport | null {
  const all = parseCsv(text);
  for (let i = 0; i < Math.min(all.length, HEADER_SEARCH_ROWS); i++) {
    const headers = all[i] ?? [];
    const cols = guessPayrollColumns(headers);
    if (cols.date !== null && cols.wages !== null) {
      const rows = all
        .slice(i + 1, i + 1 + MAX_PAYROLL_ROWS)
        .map((cells, k) => ({ row: i + 2 + k, cells }))
        .filter((r) => r.cells.some((c) => c !== ""));
      return { headers, rows, headerRow: i + 1 };
    }
  }
  return null;
}

/** A date as the payroll exports write it: YYYY-MM-DD, M/D/YYYY or M/D/YY (20YY). */
export function parsePayrollDate(s: string): string | null {
  const t = s.trim().replace(/\s.*$/, ""); // "11/14/2026 12:00 AM" -> the date part
  const short = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(t);
  if (short) return parseCostDate(`${short[1]}/${short[2]}/20${short[3]}`);
  return parseCostDate(t);
}

/** "$1,234.50", "1234.5", "(12.00)", "-12" to cents; "" and "-" to 0; null when it does not read. */
export function parsePayrollMoney(s: string): number | null {
  let t = s.trim().replace(/[$,\s]/g, "");
  if (t === "" || t === "-" || t === "—") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    neg = !neg;
    t = t.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return neg && cents !== 0 ? -cents : cents;
}

/** Hours to hundredths ("40", "7.5", "38.25"); "" to 0; null when it does not read. */
export function parseHours(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "" || t === "-") return 0;
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(t);
  if (!m) return null;
  const v = Math.round(Number(`${m[2]}.${m[3] ?? "0"}`) * 100);
  return m[1] === "-" ? -v : v;
}

const cell = (cells: readonly string[], i: number | null) =>
  i === null ? "" : (cells[i] ?? "").trim();

/** A subtotal or total line: reports put "Total", "Total for <name>" or "Grand total" in the first column. */
const isTotalCell = (dateCell: string) => /\btotals?\b/i.test(dateCell);

/** The jobs named in the report's job column, with how many rows and how much gross pay each has. */
export function payrollJobs(
  report: PayrollReport,
  columns: PayrollColumns,
): { value: string; rows: number; wagesCents: number }[] {
  if (columns.job === null) return [];
  const by = new Map<string, { value: string; rows: number; wagesCents: number }>();
  for (const r of report.rows) {
    if (!parsePayrollDate(cell(r.cells, columns.date))) continue;
    const value = cell(r.cells, columns.job);
    const e = by.get(value) ?? { value, rows: 0, wagesCents: 0 };
    e.rows++;
    e.wagesCents += parsePayrollMoney(cell(r.cells, columns.wages)) ?? 0;
    by.set(value, e);
  }
  return [...by.values()].sort((a, b) => b.wagesCents - a.wagesCents);
}

export interface PayrollImportOptions {
  columns: PayrollColumns;
  /** The job column's values that are this job; null reads every row (a report for this job only). */
  jobValues: readonly string[] | null;
  /** The contractor's labor burden on wages, basis points (2500 = 25%); null or 0 for none. */
  burdenBps: number | null;
  /** Schedule-of-values item numbers (trimmed, lowercase) to line ids, for the item column. */
  lineByItem: ReadonlyMap<string, string>;
  /** The line for rows with no item (or every row when no item column is picked); null for none. */
  defaultLine: { sovLineId: string; itemNumber: string } | null;
}

export interface PayrollCost {
  incurredOn: string;
  sovLineId: string | null;
  /** The schedule-of-values item number the cost is on; null for none. */
  itemNumber: string | null;
  wagesCents: number;
  employerTaxesCents: number;
  employerBenefitsCents: number;
  burdenCents: number;
  /** wages + employer taxes + employer contributions + burden. */
  amountCents: number;
  /** Hundredths of an hour; null when no hours column is picked. */
  hoursHundredths: number | null;
  employees: number;
  rows: number;
  /** "Payroll 2026-11-14", " item 3" when read from the item column, " line 3" from the picked line. */
  reference: string;
  description: string;
}

export interface PayrollImportResult {
  costs: PayrollCost[];
  errors: { row: number; message: string }[];
  /** Item numbers in the item column that are not lines on the job. */
  unknownItems: string[];
  /** Rows of other jobs, left out. */
  otherJobRows: number;
  /** Rows with no date (subtotals, totals, notes), left out. */
  skippedRows: number;
}

export function payrollReference(
  incurredOn: string,
  line: { itemNumber: string; from: "item" | "line" } | null,
): string {
  const base = `Payroll ${incurredOn}`;
  return (line ? `${base} ${line.from} ${line.itemNumber}` : base).slice(0, 100);
}

function hoursText(h: number): string {
  const v = h / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
}

/** The report's rows for this job, as one labor cost per date and line. */
export function payrollCosts(
  report: PayrollReport,
  opts: PayrollImportOptions,
): PayrollImportResult {
  const { columns } = opts;
  const errors: { row: number; message: string }[] = [];
  const unknown = new Set<string>();
  const jobSet = opts.jobValues ? new Set(opts.jobValues) : null;
  let otherJobRows = 0;
  let skippedRows = 0;
  type Acc = PayrollCost & { employeeSet: Set<string> };
  const groups = new Map<string, Acc>();
  if (columns.date === null || columns.wages === null) {
    return {
      costs: [],
      errors: [{ row: report.headerRow, message: "Pick the date and gross wages columns" }],
      unknownItems: [],
      otherJobRows: 0,
      skippedRows: 0,
    };
  }
  const burdenBps = opts.burdenBps && opts.burdenBps > 0 ? opts.burdenBps : 0;

  for (const r of report.rows) {
    const dateCell = cell(r.cells, columns.date);
    if (dateCell === "" || isTotalCell(dateCell)) {
      skippedRows++;
      continue;
    }
    if (jobSet && !jobSet.has(cell(r.cells, columns.job))) {
      otherJobRows++;
      continue;
    }
    const incurredOn = parsePayrollDate(dateCell);
    if (!incurredOn) {
      errors.push({
        row: r.row,
        message: `"${dateCell}" is not a date (use YYYY-MM-DD or M/D/YYYY)`,
      });
      continue;
    }
    const money: Record<"wages" | "employerTaxes" | "employerBenefits", number> = {
      wages: 0,
      employerTaxes: 0,
      employerBenefits: 0,
    };
    let bad = false;
    for (const f of ["wages", "employerTaxes", "employerBenefits"] as const) {
      const raw = cell(r.cells, columns[f]);
      const v = parsePayrollMoney(raw);
      if (v === null) {
        errors.push({
          row: r.row,
          message: `"${raw}" in ${PAYROLL_FIELD_LABELS[f].toLowerCase()} is not an amount`,
        });
        bad = true;
        break;
      }
      money[f] = v;
    }
    if (bad) continue;
    let hours: number | null = null;
    if (columns.hours !== null) {
      const raw = cell(r.cells, columns.hours);
      hours = parseHours(raw);
      if (hours === null) {
        errors.push({ row: r.row, message: `"${raw}" is not a number of hours` });
        continue;
      }
    }
    if (money.wages === 0 && money.employerTaxes === 0 && money.employerBenefits === 0) {
      skippedRows++;
      continue;
    }

    let line: { sovLineId: string; itemNumber: string; from: "item" | "line" } | null = null;
    const item = cell(r.cells, columns.item);
    if (item !== "") {
      const id = opts.lineByItem.get(item.toLowerCase());
      if (!id) {
        unknown.add(item);
        continue;
      }
      line = { sovLineId: id, itemNumber: item, from: "item" };
    } else if (opts.defaultLine) {
      line = { ...opts.defaultLine, from: "line" };
    }

    const key = `${incurredOn}|${line?.sovLineId ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        incurredOn,
        sovLineId: line?.sovLineId ?? null,
        itemNumber: line?.itemNumber ?? null,
        wagesCents: 0,
        employerTaxesCents: 0,
        employerBenefitsCents: 0,
        burdenCents: 0,
        amountCents: 0,
        hoursHundredths: columns.hours === null ? null : 0,
        employees: 0,
        rows: 0,
        reference: payrollReference(incurredOn, line),
        description: "",
        employeeSet: new Set(),
      };
      groups.set(key, g);
    }
    g.wagesCents += money.wages;
    g.employerTaxesCents += money.employerTaxes;
    g.employerBenefitsCents += money.employerBenefits;
    if (g.hoursHundredths !== null && hours !== null) g.hoursHundredths += hours;
    const emp = cell(r.cells, columns.employee);
    if (emp !== "") g.employeeSet.add(emp.toLowerCase());
    g.rows++;
  }

  const costs: PayrollCost[] = [...groups.values()]
    .map(({ employeeSet, ...g }) => {
      const burdenCents = Math.round((g.wagesCents * burdenBps) / 10_000);
      const amountCents =
        g.wagesCents + g.employerTaxesCents + g.employerBenefitsCents + burdenCents;
      const employees = employeeSet.size;
      const parts = [
        columns.employee === null
          ? `${g.rows} row${g.rows === 1 ? "" : "s"}`
          : `${employees} employee${employees === 1 ? "" : "s"}`,
      ];
      if (g.hoursHundredths !== null) parts.push(`${hoursText(g.hoursHundredths)} h`);
      if (burdenBps > 0) parts.push(`burden ${burdenBps / 100}% of wages`);
      return {
        ...g,
        burdenCents,
        amountCents,
        employees,
        description: `Payroll report: ${parts.join(", ")}`.slice(0, 300),
      };
    })
    .filter((c) => c.amountCents !== 0)
    .sort(
      (a, b) =>
        a.incurredOn.localeCompare(b.incurredOn) ||
        (a.itemNumber ?? "").localeCompare(b.itemNumber ?? "", undefined, { numeric: true }),
    );

  return { costs, errors, unknownItems: [...unknown], otherJobRows, skippedRows };
}
