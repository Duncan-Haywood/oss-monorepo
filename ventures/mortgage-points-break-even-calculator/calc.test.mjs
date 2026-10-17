import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, payment, schedule, advantageByMonth, expectedAdvantage, num, money, DEFAULTS } from "./calc.mjs";

test("payment matches the standard amortization figure", () => {
  assert.ok(Math.abs(payment(400000, 6.75, 30) - 2594.39) < 0.01);
  assert.ok(Math.abs(payment(120000, 0, 10) - 1000) < 1e-9);
});

test("schedule pays the loan to exactly zero and interest falls", () => {
  const s = schedule(300000, 6, 30);
  assert.equal(s.balance[s.n], 0);
  assert.ok(s.interest[1] > s.interest[300]);
  assert.ok(Math.abs(s.interest[1] - 1500) < 1e-9);
});

test("with no investment return and no tax, advantage is interest saved minus the points", () => {
  const o = { ...DEFAULTS, investReturn: 0, taxRate: 0 };
  const { rows, a, b, points } = advantageByMonth(o);
  const saved = b.interest.slice(1, 85).reduce((s, x) => s + x, 0) - a.interest.slice(1, 85).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(rows[84].advantage - (saved - points)) < 1e-6);
});

test("simple break-even is points over monthly saving and the true one is close to it", () => {
  const r = analyze(DEFAULTS);
  assert.ok(Math.abs(r.simpleBreakEven - r.points / r.monthlySaving) < 1e-9);
  assert.ok(r.trueBreakEven > 0 && r.trueBreakEven <= r.simpleBreakEven);
});

test("a higher return on cash pushes the break-even later", () => {
  const lo = analyze({ ...DEFAULTS, investReturn: 0 }).trueBreakEven;
  const hi = analyze({ ...DEFAULTS, investReturn: 12 }).trueBreakEven;
  assert.ok(hi > lo);
});

test("tax on the interest deduction reduces the saving", () => {
  assert.ok(analyze({ ...DEFAULTS, taxRate: 24 }).atHorizon < analyze({ ...DEFAULTS, taxRate: 0 }).atHorizon);
});

test("selling before break-even leaves the buyer behind", () => {
  const r = analyze({ ...DEFAULTS, horizon: 2 });
  assert.ok(r.atHorizon < 0);
  assert.ok(analyze({ ...DEFAULTS, horizon: 10 }).atHorizon > 0);
});

test("a higher chance of moving lowers the expected advantage and the chance of winning", () => {
  const lo = analyze({ ...DEFAULTS, moveChance: 3 });
  const hi = analyze({ ...DEFAULTS, moveChance: 30 });
  assert.ok(hi.expected < lo.expected);
  assert.ok(hi.pWin < lo.pWin);
});

test("end-month probabilities sum to one", () => {
  const { rows, a } = advantageByMonth(DEFAULTS);
  const ones = rows.map(() => ({ advantage: 1 }));
  assert.ok(Math.abs(expectedAdvantage(ones, a.n, 12).expected - 1) < 1e-9);
});

test("implied return on the points is positive when the points pay back", () => {
  const r = analyze(DEFAULTS);
  assert.ok(r.irr > 0);
  assert.equal(analyze({ ...DEFAULTS, horizon: 1 }).irr < 0, true);
});

test("a rate with points that is not lower is flagged and returns no rows", () => {
  const r = analyze({ ...DEFAULTS, pointsRate: 7 });
  assert.ok(r.warnings.length && r.rows.length === 0);
});

test("horizon beyond the term is capped with a warning", () => {
  const r = analyze({ ...DEFAULTS, term: 15, horizon: 20 });
  assert.ok(r.warnings.some((w) => /capped/.test(w)));
  assert.equal(r.horizon, 15);
});

test("num and money parse and format", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("an absurd loan term is refused instead of looping over billions of months", () => {
  const r = analyze({ ...DEFAULTS, loan: 400000, term: 1e12 });
  assert.equal(r.rows.length, 0);
  assert.ok(r.warnings.some((w) => /100 years or less/.test(w)));
});
