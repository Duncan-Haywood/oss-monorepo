import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, parseEmployees, creditFor, analyze } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const O = DEFAULTS;

test("hand-worked: $2.13 cash wage, 1500 h, $24,000 tips", () => {
  // top-up = (5.15 - 2.13) x 1500 = 4,530; creditable = 19,470; credit = 19,470 x 7.65% = 1,489.455
  const r = creditFor({ name: "Maria", wage: 2.13, hours: 1500, tips: 24000 }, O);
  close(r.topUp, 4530);
  close(r.creditable, 19470);
  close(r.credit, 1489.455);
});

test("cash wage above $5.15: every tip dollar counts", () => {
  const r = creditFor({ name: "Priya", wage: 15, hours: 1800, tips: 9000 }, O);
  close(r.topUp, 0);
  close(r.credit, 9000 * 0.0765);
});

test("above the wage base only the Medicare part earns credit", () => {
  // wages 10,300; room = 184,500 - 10,300 = 174,200; credit = 174,200 x 6.2% + 200,000 x 1.45%
  const r = creditFor({ name: "Sam", wage: 5.15, hours: 2000, tips: 200000 }, O);
  close(r.ssTips, 174200);
  close(r.credit, 174200 * 0.062 + 200000 * 0.0145);
});

test("tips smaller than the top-up earn nothing, never a negative credit", () => {
  const r = creditFor({ name: "Low", wage: 2.13, hours: 1000, tips: 1000 }, O);
  close(r.creditable, 0);
  close(r.credit, 0);
});

test("parseEmployees keeps good lines and reports the rest", () => {
  const { rows, skipped } = parseEmployees("A, 2.13, 100, 500\nbad line\nB, x, 1, 1\n\nC;5.15;10;$1000");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].tips, 1000);
  assert.deepEqual(skipped, ["bad line", "B, x, 1, 1"]);
});

test("totals add up and the after-tax value takes the deduction offset off", () => {
  const a = analyze({ ...O, taxRate: 25, priorYears: 2 });
  close(a.totals.credit, a.staff.reduce((s, r) => s + r.credit, 0));
  close(a.totals.afterTax, a.totals.credit * 0.75);
  close(a.totals.priorYearsCredit, a.totals.credit * 2);
  assert.ok(a.totals.credit < a.totals.employerFicaOnTips + 1e-9, "credit cannot exceed the FICA paid on tips");
  assert.equal(a.ranked[0].credit, Math.max(...a.staff.map((r) => r.credit)));
});

test("num and money", () => {
  assert.equal(num("$1,234"), 1234);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

// Quality audit 2026-11-10 (portfolio/quality/audits/2026-11-10-tip-fica-credit-calculator.json):
// a thousands comma shifted the fields, and the wage-base straddle was untested.
test("a thousands comma in a comma-separated roster line is read as one number", () => {
  const { rows, skipped } = parseEmployees("Maria, 2.13, 1500, 24,000\nSam, 5.15, 2,000, 1,200,000.50\nLee,2.13,1500,24000");
  assert.deepEqual(skipped, []);
  assert.deepEqual(rows.map((r) => [r.hours, r.tips]), [[1500, 24000], [2000, 1200000.5], [1500, 24000]]);
});

test("tab and semicolon lines keep their thousands commas", () => {
  const { rows } = parseEmployees("Maria\t2.13\t1,500\t24,000\nJo; 2.13; 1500; $9,000");
  assert.deepEqual(rows.map((r) => [r.hours, r.tips]), [[1500, 24000], [1500, 9000]]);
});

test("extra or ambiguous fields are skipped, never read shifted", () => {
  // No spaces anywhere: 5,100 or 200,000 cannot be told apart, so the line is reported.
  const { rows, skipped } = parseEmployees("Bo,5,100,200,000\nAl, 2.13, 100, 500, note\nCy; 2.13; 100; 500; 9");
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 3);
});

test("tips used to reach $5.15 use up Social Security wage base before credit tips (hand-computed)", () => {
  // 2,000 h at $2.13: cash wages 4,260; top-up (5.15 - 2.13) x 2,000 = 6,040; tips 190,000.
  // Credit tips 183,960. SS room = 184,500 - 4,260 - 6,040 = 174,200.
  // Credit = 174,200 x 6.2% + 183,960 x 1.45% = 10,800.40 + 2,667.42 = 13,467.82.
  // Employer FICA on all tips = min(190,000, 184,500 - 4,260) x 6.2% + 190,000 x 1.45%
  //                           = 11,174.88 + 2,755.00 = 13,929.88.
  const o = { ...DEFAULTS, wageBase: 184500, ssRate: 6.2, medicareRate: 1.45, baselineWage: 5.15 };
  const r = creditFor({ name: "X", wage: 2.13, hours: 2000, tips: 190000 }, o);
  assert.ok(Math.abs(r.ssTips - 174200) < 1e-6);
  assert.ok(Math.abs(r.credit - 13467.82) < 1e-6);
  assert.ok(Math.abs(r.employerFicaOnTips - 13929.88) < 1e-6);
  assert.ok(r.credit <= r.employerFicaOnTips);
});

test("prior years are whole years and negative tips are rejected", () => {
  const a = analyze({ ...DEFAULTS, employees: "A, 2.13, 1000, 20000", priorYears: 2.7 });
  assert.equal(a.totals.years, 2);
  assert.equal(a.totals.priorYearsCredit, a.totals.credit * 2);
  const { rows, skipped } = parseEmployees("A, 2.13, 1000, -500");
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 1);
});
