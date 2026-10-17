import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, payment, schedule, costByMonth, breakEvenHelocRate, num, money, DEFAULTS } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("payment matches the standard amortization figure", () => {
  near(payment(400000, 6.75, 30), 2594.39, 0.01);
  near(payment(120000, 0, 10), 1000, 1e-9);
});

test("an interest-only draw period pays only interest, then amortizes to exactly zero", () => {
  const s = schedule(60000, 9, 30, 10);
  near(s.pay[1], 450, 1e-9);
  near(s.balance[120], 60000, 1e-6);
  assert.ok(s.pay[121] > s.pay[120]);
  assert.equal(s.balance[s.n], 0);
});

test("with zero rates, no return and no tax both routes cost the debt plus closing, so the gap is the closing difference", () => {
  const o = { ...DEFAULTS, oldRate: 0, helocRate: 0, refiRate: 0, investReturn: 0, taxRate: 0 };
  const r = analyze(o);
  near(r.advantage, r.refiClosing - r.helocClosing, 1e-6);
  near(r.costHeloc, o.balance + o.cash + o.helocCost, 1e-6);
});

test("same rate and term on both legs and no closing costs makes the routes identical", () => {
  const o = { ...DEFAULTS, oldRate: 6, refiRate: 6, helocRate: 6, oldYears: 30, helocYears: 30, refiYears: 30, interestOnlyYears: 0, refiCostPct: 0, helocCost: 0 };
  near(analyze(o).advantage, 0, 1e-4);
});

test("a low old rate makes the HELOC win and a high old rate makes the refinance win", () => {
  assert.equal(analyze(DEFAULTS).helocWins, true);
  assert.equal(analyze({ ...DEFAULTS, oldRate: 8.5, refiRate: 6.5, helocRate: 9.5 }).helocWins, false);
});

test("repricing cost is the old balance times the rate rise", () => {
  near(analyze(DEFAULTS).repricing, 220000 * 0.0375, 1e-6);
});

test("break-even HELOC rate is the rate at which the gap closes", () => {
  const o = { ...DEFAULTS, oldRate: 5.5, refiRate: 6.75, helocRate: 7 };
  const hm = 84;
  const be = breakEvenHelocRate(o, hm);
  assert.ok(be > 0);
  near(costByMonth({ ...o, helocRate: be }).rows[hm].diff, 0, 1);
  assert.ok(costByMonth({ ...o, helocRate: be - 1 }).rows[hm].diff > 0);
});

test("a higher HELOC rate only ever makes the HELOC route worse", () => {
  const r = analyze(DEFAULTS);
  for (const row of r.grid) for (let k = 1; k < row.values.length; k++) assert.ok(row.values[k] < row.values[k - 1]);
});

test("a paid-off home still works: the refinance is just a new loan of the cash", () => {
  const r = analyze({ ...DEFAULTS, balance: 0 });
  assert.deepEqual(r.warnings, []);
  assert.ok(r.payOld === 0 && r.repricing === 0);
});

test("missing cash returns a warning and no rows", () => {
  const r = analyze({ ...DEFAULTS, cash: 0 });
  assert.ok(r.warnings.length && r.rows.length === 0);
});

test("num and money handle typed input", () => {
  assert.equal(num("$1,234"), 1234);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("absurd loan terms are refused instead of exhausting memory", () => {
  for (const k of ["oldYears", "helocYears", "refiYears"]) {
    const r = analyze({ ...DEFAULTS, [k]: 1e12 });
    assert.equal(r.rows.length, 0, k);
    assert.ok(r.warnings.some((w) => /100 years or less/.test(w)), k);
  }
});
