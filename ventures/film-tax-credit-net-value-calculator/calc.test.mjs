import { test } from "node:test";
import assert from "node:assert/strict";
import { credit, marginalDollar, breakEvenQualifiedPct, analyze, num, money, pct, DEFAULTS } from "./calc.mjs";

const flat = { ...DEFAULTS, budget: 1000000, qualifiedPct: 50, baseRatePct: 20, upliftSharePct: 0, upliftRatePct: 0, minSpend: 0, capAmount: 0, salePricePct: 100, feePct: 0, fixedCost: 0, monthsToCash: 0, bridgeAdvancePct: 0, bridgeRatePct: 0, costOfCapitalPct: 0 };

test("a plain credit is qualified spend times the rate", () => {
  const r = credit(flat);
  assert.equal(r.qualified, 500000);
  assert.equal(r.granted, 100000);
  assert.equal(r.received, 100000);
  assert.equal(r.grantedPctBudget, 0.1);
});

test("uplift applies only to its share of qualified spend", () => {
  const r = credit({ ...flat, upliftSharePct: 40, upliftRatePct: 10 });
  assert.equal(r.gross, 100000 + 500000 * 0.4 * 0.1);
});

test("below the programme minimum the credit is zero, and one dollar over it pays", () => {
  assert.equal(credit({ ...flat, minSpend: 500001 }).granted, 0);
  assert.equal(credit({ ...flat, minSpend: 500000 }).granted, 100000);
});

test("the cap binds and extra spend adds nothing", () => {
  const o = { ...flat, capAmount: 80000 };
  assert.equal(credit(o).granted, 80000);
  assert.equal(credit(o).capped, true);
  assert.equal(marginalDollar(o), 0);
});

test("selling below face value, fees and bridge interest all reduce the net", () => {
  const r = credit({ ...flat, salePricePct: 90, feePct: 2, fixedCost: 1000, monthsToCash: 12, bridgeAdvancePct: 50, bridgeRatePct: 10 });
  assert.equal(r.cash, 90000);
  assert.equal(r.fees, 2000 + 1000);
  assert.equal(r.bridgeCost, 50000 * 0.1);
  assert.equal(r.received, 90000 - 3000 - 5000);
});

test("waiting longer lowers the present value but not the nominal cash", () => {
  const a = credit({ ...flat, monthsToCash: 6, costOfCapitalPct: 10 });
  const b = credit({ ...flat, monthsToCash: 24, costOfCapitalPct: 10 });
  assert.ok(b.netPv < a.netPv);
  assert.equal(a.received, b.received);
});

test("marginal dollar is the rate net of the sale discount and fee share", () => {
  const m = marginalDollar({ ...flat, salePricePct: 90, feePct: 5 });
  assert.ok(Math.abs(m - 0.2 * (0.9 - 0.05)) < 1e-9);
});

test("break-even qualified share finds the fixed-cost hurdle, null when it never pays", () => {
  const o = { ...flat, fixedCost: 10000 };
  const be = breakEvenQualifiedPct(o);
  assert.ok(Math.abs(credit({ ...o, qualifiedPct: be + 0.01 }).received) < 100 || credit({ ...o, qualifiedPct: be + 0.01 }).received > 0);
  assert.ok(Math.abs(be - 5) < 0.01);
  assert.equal(breakEvenQualifiedPct({ ...flat, baseRatePct: 0 }), null);
});

test("analyze warns on empty budget, floors and over-100 inputs", () => {
  assert.ok(analyze({ ...DEFAULTS, budget: 0 }).warnings.some((x) => /budget/.test(x)));
  assert.ok(analyze({ ...DEFAULTS, qualifiedPct: 120 }).warnings.some((x) => /over 100/.test(x)));
  assert.ok(analyze({ ...DEFAULTS, minSpend: 9e9 }).warnings.some((x) => /minimum/.test(x)));
  assert.ok(analyze({ ...DEFAULTS, capAmount: 1000 }).warnings.some((x) => /cap binds/.test(x)));
});

test("the grid is monotone in qualified share and in sale price", () => {
  const a = analyze({ ...DEFAULTS, minSpend: 0 });
  for (const row of a.grid) for (let i = 1; i < row.values.length; i++) assert.ok(row.values[i] >= row.values[i - 1]);
  for (let j = 0; j < a.grid[0].values.length; j++) for (let i = 1; i < a.grid.length; i++) assert.ok(a.grid[i].values[j] >= a.grid[i - 1].values[j]);
});

test("example defaults produce a positive net credit below the headline credit", () => {
  const r = credit(DEFAULTS);
  assert.ok(r.received > 0 && r.received < r.headline + 1e9);
  assert.ok(r.leak > 0 && r.leak < 1);
});

test("formatters tolerate bad input", () => {
  assert.ok(Number.isNaN(num("")));
  assert.equal(num("$1,200"), 1200);
  assert.equal(money(NaN), "n/a");
  assert.equal(pct(0.125), "12.5%");
});
