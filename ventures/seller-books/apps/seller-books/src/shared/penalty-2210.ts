// The underpayment-of-estimated-tax penalty (Form 2210, Part III) for a calendar-year Form 1040, figured
// to a given day: what the penalty is so far for paying less than the required installment by a due
// date, and what it grows to if the shortfall is left unpaid. An estimate, not tax advice: the IRS
// figures the real penalty from the return as filed.
//
// Ported from the ai-bookkeeper engine in oss-monorepo (ventures/ai-bookkeeper/penalty2210.mjs, same
// owner), where it is checked against the Instructions for Form 2210 (2025 and 2024), Examples 1 and 3
// to 5 and Table 2; the cases that apply here are repeated in test/unit/penalty-2210.test.ts.
//  - Section A (lines 10 to 18) finds each date's underpayment from the required installments and the
//    payments credited to each column (withholding a quarter on each date, "unless you can show
//    otherwise").
//  - Section B (the instructions' Penalty Worksheet) charges each underpayment at the IRS underpayment
//    rate for the days it stays unpaid, in four rate periods (Apr 16-Jun 30, Jul 1-Sep 30, Oct 1-Dec 31,
//    Jan 1-Apr 15), "underpayment x days / 365 x rate" (366 in a leap year), each payment's entry rounded
//    to the cent, later payments applied to the earliest unpaid installment first. Days count from the
//    printed dates (4/15, 6/15, 9/15, 1/15); a payment made by the date moved for a weekend or holiday
//    (IRC 7503) is on time.
//  - Rates: IRC 6621(a)(2), the IRS page irs.gov/payments/quarterly-interest-rates, re-read 2026-11-28
//    (2026: Q1 7%, Q2 6%, Q3 7%, Q4 7%, from Internal Revenue Bulletins 2025-48, 2026-8, 2026-22 and
//    2026-36; 2025: 7% every quarter; 2024: 8%). A quarter not on file takes the last one on file, and
//    the result says so.
// What this adds to the ai-bookkeeper engine: `through`, the day the count stops for anything still
// unpaid (today, while the year is open; never past April 15 of the next year, where the form stops).
// Left out: the January 31 file-and-pay rule, box D (withholding on its actual dates), waivers
// (casualty, disaster, retirement after 62), fiscal years, farmers and fishers.
// Amounts are integer cents.

import { estimatedDueDates } from "./due-dates.ts";

/** Underpayment rate per calendar quarter, "YYYY-Q" (individuals). */
export const UNDERPAYMENT_RATES: Record<string, number> = {
  "2024-1": 0.08,
  "2024-2": 0.08,
  "2024-3": 0.08,
  "2024-4": 0.08,
  "2025-1": 0.07,
  "2025-2": 0.07,
  "2025-3": 0.07,
  "2025-4": 0.07,
  "2026-1": 0.07,
  "2026-2": 0.06,
  "2026-3": 0.07,
  "2026-4": 0.07,
};
const LAST_ON_FILE = "2026-4";

export interface Payment {
  date: string;
  cents: number;
}

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const minIso = (a: string, b: string) => (a < b ? a : b);
const maxIso = (a: string, b: string) => (a > b ? a : b);

/** The worksheet's printed due dates: 4/15, 6/15, 9/15 and 1/15 of the next year. */
export function printedDueDates(year: number): string[] {
  return [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`];
}

export interface RatePeriod {
  /** Days count from `start` (exclusive) to `end` (inclusive). */
  start: string;
  end: string;
  rate: number;
  key: string;
  yearDays: number;
}

export function ratePeriods(
  year: number,
  rates: Record<string, number> = {},
): { periods: RatePeriod[]; warnings: string[] } {
  const warnings: string[] = [];
  const spec: [string, string, string][] = [
    [`${year}-04-15`, `${year}-06-30`, `${year}-2`],
    [`${year}-06-30`, `${year}-09-30`, `${year}-3`],
    [`${year}-09-30`, `${year}-12-31`, `${year}-4`],
    [`${year}-12-31`, `${year + 1}-04-15`, `${year + 1}-1`],
  ];
  const periods = spec.map(([start, end, key]) => {
    let rate = rates[key] ?? UNDERPAYMENT_RATES[key];
    if (rate === undefined) {
      rate = UNDERPAYMENT_RATES[LAST_ON_FILE] as number;
      warnings.push(
        `No IRS underpayment rate is on file for ${key.replace("-", " Q")}; ${+(rate * 100).toFixed(4)}% (the last one on file, ${LAST_ON_FILE.replace("-", " Q")}) is used.`,
      );
    }
    // Each period sits inside one calendar year and divides by that year's length (the 2024 worksheet
    // prints "÷ 366" for its 2024 periods and "÷ 365" for January to April 2025).
    const y = Number(end.slice(0, 4));
    const yearDays = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
    return { start, end, rate, key, yearDays };
  });
  return { periods, warnings };
}

export interface SectionAColumn {
  l10: number;
  l11: number;
  l12: number;
  l13: number;
  l14: number;
  l15: number;
  l16: number;
  l17: number;
  l18: number;
}

/** Section A, lines 10 to 18: `required` is line 10 and `credits` line 11, one per column. */
export function sectionA(required: number[], credits: number[]): SectionAColumn[] {
  const cols: SectionAColumn[] = [];
  for (let j = 0; j < 4; j++) {
    const l10 = required[j] ?? 0;
    const l11 = credits[j] ?? 0;
    const prev = cols[j - 1];
    const l12 = prev ? prev.l18 : 0;
    const l13 = l11 + l12;
    const l14 = prev ? prev.l16 + prev.l17 : 0;
    const l15 = j === 0 ? l11 : Math.max(0, l13 - l14);
    const l16 = j > 0 && l15 === 0 ? l14 - l13 : 0;
    const l17 = l10 >= l15 ? l10 - l15 : 0;
    const l18 = l15 > l10 ? l15 - l10 : 0;
    cols.push({ l10, l11, l12, l13, l14, l15, l16, l17, l18 });
  }
  return cols;
}

const positive = (xs: Payment[]) => xs.filter((p) => Number.isFinite(p.cents) && p.cents > 0);

/**
 * Line 11 of each column: estimated payments made by its due date and after the previous one's, plus a
 * quarter of the year's withholding on each date.
 */
export function creditsByColumn(year: number, payments: Payment[], withholding = 0): number[] {
  const due = estimatedDueDates(year);
  const wh = Math.max(0, withholding || 0);
  const quarter = (j: number) => Math.round((wh * (j + 1)) / 4) - Math.round((wh * j) / 4);
  return due.map((d, j) => {
    const prev = due[j - 1];
    const inCol = positive(payments).filter(
      (p) => p.date <= d && (prev === undefined || p.date > prev),
    );
    return inCol.reduce((s, p) => s + p.cents, 0) + quarter(j);
  });
}

export interface WorksheetLine {
  period: string;
  rate: number;
  days: number[];
  cents: number;
}

export interface WorksheetColumn {
  due: string;
  underpayment: number;
  paidBy: Payment[];
  unpaid: number;
  lines: WorksheetLine[];
  penalty: number;
}

/**
 * Section B, the penalty worksheet. `underpayments` are Section A line 17. Payments made after a
 * column's date pay its underpayment in the order made, earliest column first (line 1b). Whatever is
 * still unpaid runs to `through` (default April 15 of the next year, and never later).
 */
export function penaltyWorksheet(
  year: number,
  underpayments: number[],
  payments: Payment[] = [],
  opts: { rates?: Record<string, number>; through?: string } = {},
) {
  const { periods, warnings } = ratePeriods(year, opts.rates);
  const printed = printedDueDates(year);
  const due = estimatedDueDates(year);
  const stop = minIso(opts.through ?? `${year + 1}-04-15`, `${year + 1}-04-15`);
  const left = underpayments.map((u) => Math.max(0, u));
  const applied: Payment[][] = [[], [], [], []];
  const sorted = positive(payments)
    .filter((p) => p.date <= stop)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const p of sorted) {
    let amount = p.cents;
    for (let j = 0; j < 4 && amount > 0; j++) {
      const d = due[j] as string;
      if (!(p.date > d) || (left[j] ?? 0) <= 0) continue;
      const use = Math.min(left[j] as number, amount);
      applied[j]?.push({ date: p.date, cents: use });
      left[j] = (left[j] as number) - use;
      amount -= use;
    }
  }
  const columns: WorksheetColumn[] = underpayments.map((u, j) => {
    const pieces: { date: string; cents: number }[] = [...(applied[j] ?? [])];
    const unpaid = left[j] ?? 0;
    if (unpaid > 0) pieces.push({ date: stop, cents: unpaid });
    const from0 = printed[j] as string;
    const lines = periods.map((per) => {
      let cents = 0;
      const days: number[] = [];
      for (const piece of pieces) {
        const from = maxIso(from0, per.start);
        const to = minIso(piece.date, per.end);
        const n = Math.max(0, daysBetween(from, to));
        if (!n) continue;
        days.push(n);
        cents += Math.round((piece.cents * n * per.rate) / per.yearDays);
      }
      return { period: `${isoOf(ms(per.start) + DAY)} to ${per.end}`, rate: per.rate, days, cents };
    });
    return {
      due: from0,
      underpayment: Math.max(0, u),
      paidBy: applied[j] ?? [],
      unpaid,
      lines,
      penalty: lines.reduce((s, l) => s + l.cents, 0),
    };
  });
  return {
    columns,
    penalty: columns.reduce((s, c) => s + c.penalty, 0),
    rates: periods,
    through: stop,
    warnings,
  };
}

/** The whole of Part III for one set of required installments (25% each, or Schedule AI line 27). */
export function form2210Penalty(
  year: number,
  required: number[],
  opts: {
    payments?: Payment[];
    withholding?: number;
    rates?: Record<string, number>;
    through?: string;
  } = {},
) {
  const payments = opts.payments ?? [];
  const credits = creditsByColumn(year, payments, opts.withholding ?? 0);
  const a = sectionA(required, credits);
  const b = penaltyWorksheet(
    year,
    a.map((c) => c.l17),
    payments,
    { rates: opts.rates, through: opts.through },
  );
  return {
    required,
    credits,
    sectionA: a,
    worksheet: b.columns,
    penalty: b.penalty,
    through: b.through,
    rates: b.rates,
    warnings: b.warnings,
  };
}

/** `iso` plus `n` days. */
export function addDays(iso: string, n: number): string {
  return isoOf(ms(iso) + n * DAY);
}
