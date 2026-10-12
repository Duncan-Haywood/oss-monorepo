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
