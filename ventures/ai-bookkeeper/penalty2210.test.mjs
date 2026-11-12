import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionA, creditsByColumn, penaltyWorksheet, form2210Penalty, ratePeriods } from "./penalty2210.mjs";

// Every figure below is printed in "Instructions for Form 2210 (2025)" (irs.gov/pub/irs-pdf/i2210.pdf,
// read with pdftotext 2026-11-11) or on irs.gov/payments/quarterly-interest-rates the same day.
const D = (x) => Math.round(x * 100);

test("Example 1: line 11 is withholding a quarter a date, last year's overpayment on April 15, payments in their window", () => {
  // Filed 2024 on April 1, 2025 with a $1,000 overpayment applied; $4,000 withheld; $500 on 9/15/25 and 1/15/26.
  const credits = creditsByColumn(2025, [{ date: "2025-04-15", cents: D(1000) }, { date: "2025-09-15", cents: D(500) }, { date: "2026-01-15", cents: D(500) }], D(4000));
  assert.deepEqual(credits, [D(2000), D(1000), D(1500), D(1500)]); // "enter $2,000 ... $1,000 ... $1,500"
});

test("Example 3: line 1a is 4,000 then 3,000 in columns (b) to (d), and line 1b applies payments to the earliest column", () => {
  const payments = [{ date: "2025-04-30", cents: D(2000) }, { date: "2025-06-15", cents: D(3000) }, { date: "2025-09-15", cents: D(4000) }, { date: "2026-01-15", cents: D(4000) }];
  const r = form2210Penalty(2025, [D(4000), D(4000), D(4000), D(4000)], { payments });
  assert.deepEqual(r.sectionA.map((c) => c.l17), [D(4000), D(3000), D(3000), D(3000)]);
  const [a, b, c, d] = r.worksheet;
  assert.deepEqual(a.paidBy, [{ date: "2025-04-30", cents: D(2000) }, { date: "2025-06-15", cents: D(2000) }]); // "04/30 $2,000" and "06/15 $2,000"
  assert.deepEqual(b.paidBy, [{ date: "2025-09-15", cents: D(3000) }]); // "09/15 $3,000"
  assert.deepEqual(c.paidBy, [{ date: "2026-01-15", cents: D(3000) }]); // "01/15 $3,000"
  assert.deepEqual(d.paidBy, []); // "Do not enter any payment on line 1b, column (d)"
  // Example 4: line 3, column (a) is "15" (04/15 to 04/30) and "61" (04/15 to 06/15).
  assert.deepEqual(a.lines[0].days, [15, 61]);
  // Hand check of the worksheet at 7%: amount x days / 365 x 0.07, each line rounded to the cent.
  const amt = (cents, n) => Math.round((cents * n * 0.07) / 365);
  assert.equal(a.penalty, Math.round((D(2000) * 15 * 0.07) / 365 + (D(2000) * 61 * 0.07) / 365));
  assert.equal(b.penalty, amt(D(3000), 15) + amt(D(3000), 77));
  assert.equal(c.penalty, amt(D(3000), 15) + amt(D(3000), 92) + amt(D(3000), 15));
  assert.equal(d.penalty, amt(D(3000), 90));
  assert.equal(r.penalty, a.penalty + b.penalty + c.penalty + d.penalty);
  assert.equal(r.warnings.length, 0);
});

test("Table 2: total days per rate period when nothing is ever paid", () => {
  const w = penaltyWorksheet(2025, [D(100), D(100), D(100), D(100)], []);
  const grid = w.columns.map((c) => c.lines.map((l) => (l.days[0] ?? 0)));
  assert.deepEqual(grid, [[76, 92, 92, 105], [15, 92, 92, 105], [0, 15, 92, 105], [0, 0, 0, 90]]);
  assert.ok(w.rates.every((p) => p.rate === 0.07)); // the 2025 worksheet prints 0.07 in every period
});

test("Section A carries an overpayment forward and a short payment's leftover underpayment (line 16)", () => {
  const over = sectionA([100, 100, 100, 100], [250, 0, 0, 100]);
  assert.deepEqual(over.map((c) => c.l17), [0, 0, 50, 50]); // (d): 100 paid, 50 of it first covers (c)
  assert.deepEqual(over.map((c) => c.l18), [150, 50, 0, 0]);
  const short = sectionA([100, 100, 100, 100], [0, 30, 0, 0]);
  assert.equal(short[1].l16, 70); // 30 paid against column (a)'s 100: 70 still owed on it
  assert.deepEqual(short.map((c) => c.l17), [100, 100, 100, 100]);
});

test("a payment made on the Monday after a Sunday due date is on time", () => {
  // June 15, 2025 was a Sunday, so the second payment was due Monday June 16.
  const r = form2210Penalty(2025, [0, D(1000), 0, 0], { payments: [{ date: "2025-06-16", cents: D(1000) }] });
  assert.equal(r.penalty, 0);
});

test("2026 uses the IRS quarterly rates (6% in Q2) and flags the 2027 Q1 rate that is not out yet", () => {
  const { periods, warnings } = ratePeriods(2026);
  assert.deepEqual(periods.map((p) => p.rate), [0.06, 0.07, 0.07, 0.07]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2027 Q1/);
  // 0.07 * 100 is 7.000000000000001 in floating point; the warning must print "7%".
  assert.match(warnings[0], /; 7% \(the last one on file, 2026 Q4\)/);
  assert.equal(ratePeriods(2026, { "2027-1": 0.05 }).periods[3].rate, 0.05);
  assert.deepEqual(ratePeriods(2024).periods.map((p) => p.rate), [0.08, 0.08, 0.08, 0.07]);
});

test("a payment after April 15 of the next year stops the count at April 15", () => {
  const w = penaltyWorksheet(2025, [D(1000), 0, 0, 0], [{ date: "2026-06-01", cents: D(1000) }]);
  assert.deepEqual(w.columns[0].lines.map((l) => l.days[0]), [76, 92, 92, 105]);
});
