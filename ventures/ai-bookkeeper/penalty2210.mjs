// The underpayment-of-estimated-tax penalty (Form 2210, Part III) for an individual who files a
// calendar-year Form 1040. Section A (lines 10 to 18) finds each date's underpayment from the
// required installments and the payments credited by each date; Section B (the "Penalty
// Worksheet" in the instructions) charges each underpayment at the IRS underpayment rate for the
// days it stays unpaid, through April 15 of the next year, applying later payments to the earliest
// unpaid installment first.
//
// Source, read 2026-11-11 (pdftotext of irs.gov/pub/irs-pdf/f2210.pdf, "Form 2210 (2025) Created
// 10/21/25", and i2210.pdf, "Instructions for Form 2210 (2025)"): the line wording below, the
// worksheet's four rate periods (Apr 16-Jun 30, Jul 1-Sep 30, Oct 1-Dec 31, Jan 1-Apr 15) each
// multiplying "underpayment x days / 365 x 0.07", Table 2 (total days per period) and Examples 1,
// 3 and 4, all reproduced in penalty2210.test.mjs. The quarterly underpayment rates are the IRS
// page irs.gov/payments/quarterly-interest-rates, read the same day: 8% through 2024, 7% for every
// quarter of 2025, 2026 Q1 7%, Q2 6%, Q3 7%, Q4 7%. A rate for a quarter not on file is taken as
// the last one on file, and the result says so; pass `rates` to replace it.
//
// Not modelled: box D (withholding on the dates actually withheld; here it is one quarter on each
// date, the form's default), the January 31 return-and-pay rule for column (d), waivers, fiscal
// years, farmers and fishers, Form 1040-NR's two-column variant. Day counts use the printed dates
// (4/15, 6/15, 9/15, 1/15) as the worksheet does; a payment made by the date moved for a weekend
// or holiday (IRC 7503, `estimatedDueDates`) counts as on time. Amounts are cents.
import { estimatedDueDates } from "./taxforms.mjs";

// Underpayment rate per calendar quarter, "YYYY-Q" (IRC 6621(a)(2) for individuals).
export const UNDERPAYMENT_RATES = {
  "2024-1": 0.08, "2024-2": 0.08, "2024-3": 0.08, "2024-4": 0.08,
  "2025-1": 0.07, "2025-2": 0.07, "2025-3": 0.07, "2025-4": 0.07,
  "2026-1": 0.07, "2026-2": 0.06, "2026-3": 0.07, "2026-4": 0.07,
};
const LAST_ON_FILE = "2026-4";

const DAY = 86400000;
const t = (iso) => Date.parse(iso + "T00:00:00Z");
const days = (a, b) => Math.round((t(b) - t(a)) / DAY);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// The worksheet's printed due dates: 4/15, 6/15, 9/15 and 1/15 of the next year.
export function printedDueDates(year) {
  return [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`];
}

// The rate periods a tax year's penalty runs over: the rest of Q2 from April 16, Q3, Q4 and the
// next year's Q1 extended to April 15 (the worksheet's Rate Periods 1 to 4). Each is
// { start, end, rate, key } where days are counted from `start` (exclusive) to `end` (inclusive).
export function ratePeriods(year, rates = {}) {
  const warnings = [];
  const spec = [
    [`${year}-04-15`, `${year}-06-30`, `${year}-2`],
    [`${year}-06-30`, `${year}-09-30`, `${year}-3`],
    [`${year}-09-30`, `${year}-12-31`, `${year}-4`],
    [`${year}-12-31`, `${year + 1}-04-15`, `${year + 1}-1`],
  ];
  const periods = spec.map(([start, end, key]) => {
    let rate = rates[key] ?? UNDERPAYMENT_RATES[key];
    if (rate === undefined) {
      rate = UNDERPAYMENT_RATES[LAST_ON_FILE];
      warnings.push(`No IRS underpayment rate on file for ${key.replace("-", " Q")}; ${rate * 100}% (the last one on file, ${LAST_ON_FILE.replace("-", " Q")}) is used. Check irs.gov/payments/quarterly-interest-rates or pass rates.`);
    }
    return { start, end, rate, key };
  });
  // The 2025 worksheet divides by 365; a leap day inside a period is not checked against a form.
  if (periods.some((p) => { const y = +p.end.slice(0, 4); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; })) warnings.push("A rate period falls in a leap year; this uses 365 days as the 2025 worksheet does, and that year's worksheet may divide by 366.");
  return { periods, warnings };
}

// Section A, lines 10 to 18. required[4] are line 10, credits[4] line 11 (payments and withholding
// credited to each column). Returns one object per column with the form's line numbers.
export function sectionA(required, credits) {
  const cols = [];
  for (let j = 0; j < 4; j++) {
    const l10 = required[j], l11 = credits[j];
    const prev = cols[j - 1];
    const l12 = j === 0 ? 0 : prev.l18;
    const l13 = l11 + l12;
    const l14 = j === 0 ? 0 : prev.l16 + prev.l17;
    const l15 = j === 0 ? l11 : Math.max(0, l13 - l14);
    const l16 = j > 0 && l15 === 0 ? l14 - l13 : 0;
    const l17 = l10 >= l15 ? l10 - l15 : 0;
    const l18 = l15 > l10 ? l15 - l10 : 0;
    cols.push({ l10, l11, l12, l13, l14, l15, l16, l17, l18 });
  }
  return cols;
}

// Line 11 of each column: estimated payments made by that column's due date and after the
// previous one's, plus a quarter of the year's withholding on each date. Payments are
// [{ date: "YYYY-MM-DD", cents }]; an overpayment from last year's return is a payment dated
// April 15 (instructions, Table 1).
export function creditsByColumn(year, payments = [], withholding = 0) {
  const due = estimatedDueDates(year);
  const wh = Math.max(0, withholding || 0);
  const quarter = (j) => Math.round((wh * (j + 1)) / 4) - Math.round((wh * j) / 4);
  return due.map((d, j) => payments.filter((p) => p.date <= d && (j === 0 || p.date > due[j - 1])).reduce((s, p) => s + Math.max(0, p.cents || 0), 0) + quarter(j));
}

// Section B, the penalty worksheet. underpayments[4] are Section A line 17. Payments made after a
// column's date pay its underpayment in the order made, earliest column first (line 1b); withheld
// tax is never applied there. Returns each column's line 1b entries and its four rate-period
// amounts (lines 4, 7, 10, 13) and the total (line 14).
export function penaltyWorksheet(year, underpayments, payments = [], opts = {}) {
  const { periods, warnings } = ratePeriods(year, opts.rates);
  const printed = printedDueDates(year);
  const due = estimatedDueDates(year);
  const stop = `${year + 1}-04-15`;
  const left = underpayments.map((u) => Math.max(0, u));
  const applied = [[], [], [], []];
  const sorted = payments.filter((p) => (p.cents || 0) > 0).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const p of sorted) {
    let amount = p.cents;
    for (let j = 0; j < 4 && amount > 0; j++) {
      if (!(p.date > due[j]) || left[j] <= 0) continue;
      const use = Math.min(left[j], amount);
      applied[j].push({ date: p.date, cents: use });
      left[j] -= use;
      amount -= use;
    }
  }
  const cols = underpayments.map((u, j) => {
    const pieces = [...applied[j]];
    if (left[j] > 0) pieces.push({ date: null, cents: left[j] }); // unpaid: runs to April 15
    const lines = periods.map((per) => {
      let amount = 0;
      const dayCounts = [];
      for (const piece of pieces) {
        const paid = piece.date && piece.date < stop ? piece.date : stop;
        const from = printed[j] > per.start ? printed[j] : per.start;
        const to = paid < per.end ? paid : per.end;
        const n = Math.max(0, days(from, to));
        if (!n) continue;
        dayCounts.push(n);
        amount += (piece.cents * n * per.rate) / 365;
      }
      return { period: `${iso(t(per.start) + DAY)} to ${per.end}`, rate: per.rate, days: dayCounts, cents: Math.round(amount) };
    });
    return { due: printed[j], underpayment: Math.max(0, u), paidBy: applied[j], unpaid: left[j], lines, penalty: lines.reduce((s, l) => s + l.cents, 0) };
  });
  return { columns: cols, penalty: cols.reduce((s, c) => s + c.penalty, 0), rates: periods, warnings };
}

// The whole of Part III for one set of required installments (25% each, or Schedule AI line 27).
export function form2210Penalty(year, required, { payments = [], withholding = 0, rates } = {}) {
  const credits = creditsByColumn(year, payments, withholding);
  const a = sectionA(required, credits);
  const b = penaltyWorksheet(year, a.map((c) => c.l17), payments, { rates });
  return { required, credits, sectionA: a, worksheet: b.columns, penalty: b.penalty, rates: b.rates, warnings: b.warnings };
}
