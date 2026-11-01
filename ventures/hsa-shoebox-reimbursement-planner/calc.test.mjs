import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, parseReceipts, toCsv, num } from "./calc.mjs";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = { ...DEFAULTS, balance: 10000, annualReturnPct: 10, years: 2, annualContribution: 0, annualNewReceipts: 0, cgRatePct: 20, hsaOpenDate: "2020-01-01", receiptsText: "2021-01-01, 1000, a" };

test("receipt parsing: both date styles, header skipped, bad lines named", () => {
  const { rows, errors } = parseReceipts("Date,Amount,Note\n2021-03-04, $1,2\n03/05/2022; 50; x\n2021-13-40, 5\n2021-01-01, -3\n2021-02-02, abc");
  assert.equal(rows.length, 2);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Line 4/);
});

test("slash dates and notes parse; reimbursed flag is read from the note", () => {
  const { rows, errors } = parseReceipts("03/05/2022, 50, dentist\n2022-04-01, 20, Cab, reimbursed");
  assert.equal(errors.length, 0);
  assert.equal(rows[0].date, "2022-03-05");
  assert.equal(rows[0].reimbursed, false);
  assert.equal(rows[1].reimbursed, true);
});

test("receipts before the HSA opened or already reimbursed are not eligible", () => {
  const a = analyze({ ...base, receiptsText: "2019-06-01, 100, old\n2021-01-01, 200, ok\n2021-02-01, 50, x, reimbursed" });
  near(a.before, 100);
  near(a.eligible, 200);
  near(a.done, 50);
  assert.ok(a.warnings.some((w) => /before the HSA was opened/.test(w)));
});

test("edge equals capital-gains tax on the growth of the reimbursed dollars (hand calculation)", () => {
  const a = analyze(base);
  // B reimburses 1000 now: taxable 1000 -> 1210 after 2 years, gains 210, tax 42.
  near(a.edge, 42, 1e-9);
  near(a.end.hsaA, 12100, 1e-9);
  near(a.end.hsaB, 9000 * 1.21, 1e-9);
  near(a.end.taxableAfterTax, 1210 - 42, 1e-9);
});

test("a zero return or a zero tax rate leaves no edge", () => {
  near(analyze({ ...base, annualReturnPct: 0 }).edge, 0, 1e-9);
  near(analyze({ ...base, cgRatePct: 0 }).edge, 0, 1e-9);
});

test("new receipts each year grow the tax-free pile", () => {
  const a = analyze({ ...base, annualNewReceipts: 500 });
  near(a.end.pile, 1000 + 1000);
  near(a.taxFreeRoom, 2000);
});

test("when the HSA cannot cover the receipts, the shortfall is carried not lost", () => {
  const a = analyze({ ...base, balance: 400, annualContribution: 300 });
  assert.ok(a.warnings.some((w) => /exceed the current HSA balance/.test(w)));
  assert.ok(a.end.hsaB >= 0);
  near(a.table[0].taxable, 400);
});

test("excess over the receipts pile is taxed, with a penalty under 65", () => {
  const young = analyze({ ...base, ageAtWithdrawal: 55, ordinaryRatePct: 20 });
  const older = analyze({ ...base, ageAtWithdrawal: 66, ordinaryRatePct: 20 });
  near(young.excess, 12100 - 1000);
  near(older.excessCost, (12100 - 1000) * 0.2);
  near(young.excessCost, (12100 - 1000) * 0.4);
});

test("csv has a header and one row per year", () => {
  const lines = toCsv(analyze(base)).split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^year,/);
});

test("defaults analyze without warnings other than the expected ones", () => {
  const a = analyze(DEFAULTS);
  assert.ok(a.edge > 0);
  assert.equal(a.table.length, 21);
  assert.ok(Number.isFinite(num("1,234.5")));
});

test("a note with commas keeps every part after the amount", () => {
  const { rows } = parseReceipts("2020-01-01,10,a,b,c");
  assert.equal(rows[0].note, "a, b, c");
});

test("zero years analyzes the start year only; one year adds a row", () => {
  const a0 = analyze({ ...DEFAULTS, years: 0 });
  const a1 = analyze({ ...DEFAULTS, years: 1 });
  assert.equal(a0.table.length, 1);
  assert.equal(a1.table.length, 2);
});
