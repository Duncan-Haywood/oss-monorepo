import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { annualizedInstallments, annualizedSelfEmployment, FORM_2210 } from "./annualized.mjs";
import { creditsByColumn, form2210Penalty, printedDueDates } from "./penalty2210.mjs";
import { SS_WAGE_BASE, estimatedDueDates } from "./taxforms.mjs";

// Box D (withholding on the dates actually withheld) and the 2026 draft Form 2210
// (irs.gov/pub/irs-dft/f2210--dft.pdf, "Form 2210 (2026) Created 4/16/26", read 2026-11-11).
const D = (x) => Math.round(x * 100);
function books(rows) {
  const csv = "Date,Description,Amount\n" + rows.map(([d, a]) => `${d},CLIENT PAYMENT ACME,${a}`).join("\n") + "\n";
  const { books: b } = importStatement(newBooks(), csv, "1000");
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, "4000"])));
}

test("box D puts each withholding in the column whose window holds its date", () => {
  const withheld = [{ date: "2025-01-31", cents: D(3000) }, { date: "2025-06-16", cents: D(200) }, { date: "2025-12-15", cents: D(1000) }];
  // June 15, 2025 was a Sunday, so column (b) runs to June 16 (estimatedDueDates); June 16 withholding lands there.
  assert.deepEqual(creditsByColumn(2025, [], 0, withheld), [D(3000), D(200), 0, D(1000)]);
  // the default spreads the same total a quarter a date
  assert.deepEqual(creditsByColumn(2025, [], D(4200)), [D(1050), D(1050), D(1050), D(1050)]);
  // payments still count in their own window beside it
  assert.deepEqual(creditsByColumn(2025, [{ date: "2025-09-15", cents: D(500) }], 0, withheld), [D(3000), D(200), D(500), D(1000)]);
});

test("withholding late in the year: the default spread wins and box D would add a penalty", () => {
  const req = [D(1000), D(1000), D(1000), D(1000)];
  const even = form2210Penalty(2025, req, { withholding: D(4000) });
  const late = form2210Penalty(2025, req, { withheld: [{ date: "2025-12-20", cents: D(4000) }] });
  assert.equal(even.penalty, 0);
  assert.equal(late.boxD, true);
  assert.deepEqual(late.credits, [0, 0, 0, D(4000)]);
  // 1,000 unpaid from each of 4/15, 6/16, 9/15 until withholding pays nothing on line 1b, so it runs to April 15
  assert.ok(late.penalty > 0);
  assert.deepEqual(late.worksheet.map((c) => c.paidBy.length), [0, 0, 0, 0]); // withholding never goes on line 1b
});

test("withholding early in the year: box D removes a front-loaded shortfall", () => {
  const req = [D(3000), D(1000), 0, 0];
  const even = form2210Penalty(2025, req, { withholding: D(4000) });
  const early = form2210Penalty(2025, req, { withheld: [{ date: "2025-02-01", cents: D(4000) }] });
  assert.ok(even.penalty > 0);
  assert.equal(early.penalty, 0);
});

test("annualizedInstallments figures box D both ways and says which to check", () => {
  // 80,000 earned in January 2025, nothing after; 12,000 withheld in one go in February, no estimates.
  const b = books([["2025-01-10", "80000.00"]]);
  const early = annualizedInstallments(b, { year: 2025, withheld: [{ date: "2025-02-15", cents: D(12000) }] });
  assert.equal(early.withholding, D(12000));
  assert.ok(early.penalty.boxD);
  assert.equal(early.penalty.useBoxD, true);
  assert.ok(early.penalty.best.cents < Math.min(early.penalty.regular, early.penalty.annualized));
  assert.equal(early.penalty.best.cents, Math.min(early.penalty.boxD.regular, early.penalty.boxD.annualized));
  assert.ok(early.warnings.some((w) => /box D/.test(w) && /lowers/.test(w)));
  assert.equal(early.rows[0].creditsCounted, D(12000));
  // the same tax withheld in December: leave box D unchecked
  const late = annualizedInstallments(b, { year: 2025, withheld: [{ date: "2025-12-15", cents: D(12000) }] });
  assert.equal(late.penalty.useBoxD, false);
  assert.ok(late.penalty.boxD.regular >= late.penalty.regular);
  assert.ok(late.warnings.some((w) => /leave it unchecked/.test(w)));
  assert.equal(late.rows[0].creditsCounted, D(3000));
  // without dated withholding nothing changes
  const plain = annualizedInstallments(b, { year: 2025, withholding: D(12000) });
  assert.equal(plain.penalty.useBoxD, false);
  assert.equal(plain.penalty.boxD, undefined);
  assert.equal(plain.penalty.regular, late.penalty.regular);
});

test("dated withholding is checked: totals that disagree warn, dates outside the year throw", () => {
  const b = books([["2025-01-10", "80000.00"]]);
  const r = annualizedInstallments(b, { year: 2025, withholding: D(5000), withheld: [{ date: "2025-03-01", cents: D(6000) }] });
  assert.equal(r.withholding, D(6000));
  assert.ok(r.warnings.some((w) => /dated withholding adds up to 6000/.test(w)));
  assert.throws(() => annualizedInstallments(b, { year: 2025, withheld: [{ date: "2026-01-05", cents: D(100) }] }), /outside 2025/);
  assert.throws(() => annualizedInstallments(b, { year: 2025, withheld: [{ date: "March", cents: D(100) }] }), /date/);
});

test("2026 draft Form 2210: line 29 as printed, Part III dates, and the draft is named", () => {
  // line 29, "Prorated social security tax limit": $46,125, $76,875, $123,000, $184,500
  assert.deepEqual(FORM_2210[2026].line29, [D(46125), D(76875), D(123000), D(184500)]);
  assert.deepEqual([0, 1, 2, 3].map((i) => annualizedSelfEmployment(1e9, i, { year: 2026 }).line29), FORM_2210[2026].line29);
  assert.deepEqual([0, 1, 2, 3].map((i) => annualizedSelfEmployment(1e9, i, { year: 2025 }).line29), FORM_2210[2025].line29);
  assert.equal(SS_WAGE_BASE[2026], D(184500)); // the printed column (d) is the wage base itself
  // Part III, Section A headings: 4/15/26 6/15/26 9/15/26 1/15/27 (all weekdays, so no moved dates)
  assert.deepEqual(printedDueDates(2026), ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
  assert.deepEqual(estimatedDueDates(2026), printedDueDates(2026));
  const r = annualizedInstallments(books([["2026-10-01", "60000.00"]]), { year: 2026 });
  assert.ok(r.warnings.some((w) => /2026 Form 2210 early-release draft \(created 4\/16\/26/.test(w)));
  assert.ok(r.warnings.some((w) => /Schedule AI line 9b/.test(w)));
  const r25 = annualizedInstallments(books([["2025-10-01", "60000.00"]]), { year: 2025 });
  assert.ok(r25.warnings.some((w) => /^Worksheet\. Lines follow the 2025 Form 2210/.test(w)));
  assert.ok(r25.warnings.some((w) => /line 14 adjustment/.test(w)));
  const r27 = annualizedInstallments(books([["2027-10-01", "60000.00"]]), { year: 2027, brackets: [[null, 0.1]], standardDeduction: D(16000) });
  assert.ok(r27.warnings.some((w) => /no 2027 Form 2210 has been read/.test(w)));
});
