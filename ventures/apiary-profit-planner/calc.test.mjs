import { test } from "node:test";
import assert from "node:assert/strict";
import { yearModel, project, lossSensitivity, scenarios, breakEvenHives, holdSteadyLossPct, DEFAULTS, num, money } from "./calc.mjs";

const o = { ...DEFAULTS };

test("survivors, splits and room cap", () => {
  const r = yearModel(10, { ...o, lossPct: 30, splitRate: 1, splitFailPct: 0, cap: 12 });
  assert.equal(r.survivors, 7);
  assert.equal(r.made, 7);
  assert.equal(r.kept, 5);
  assert.equal(r.surplus, 2);
  assert.equal(r.end, 12);
});

test("surplus splits are sold as nucs only up to the sold share", () => {
  const r = yearModel(10, { ...o, lossPct: 0, splitRate: 1, splitFailPct: 0, cap: 10, nucsSoldShare: 50, nucPrice: 100 });
  assert.equal(r.surplus, 10);
  assert.equal(r.nucsSold, 5);
  assert.equal(r.nucRev, 500);
});

test("honey revenue mixes retail and bulk and charges jars on retail only", () => {
  const r = yearModel(10, { ...o, lossPct: 0, honeyLb: 50, retailSharePct: 20, retailPrice: 10, bulkPrice: 4, jarCostPerLb: 1, nucsSoldShare: 0, splitRate: 0 });
  assert.equal(r.honeyLb, 500);
  assert.equal(r.honeyRev, 100 * 10 + 400 * 4);
});

test("pollination counts only surviving colonies", () => {
  const r = yearModel(10, { ...o, lossPct: 50, pollHives: 8, pollFee: 100 });
  assert.equal(r.pollRev, 500);
});

test("profit subtracts depreciation, cash profit subtracts new equipment", () => {
  const r = yearModel(10, o);
  assert.ok(Math.abs(r.profit - (r.revenue - r.cash - r.depreciation)) < 1e-9);
  assert.ok(Math.abs(r.cashProfit - (r.revenue - r.cash - r.newEquip)) < 1e-9);
});

test("projection never exceeds the cap and tracks payback", () => {
  const p = project({ ...o, years: 8 });
  assert.equal(p.rows.length, 8);
  for (const r of p.rows) assert.ok(r.end <= o.cap + 1e-9);
  assert.equal(p.invest, 10 * o.hiveEquip + o.startupEquip);
  if (p.paybackYear) assert.ok(p.rows[p.paybackYear - 1].cumulative >= 0);
});

test("higher winter loss never improves the outcome", () => {
  const s = lossSensitivity(o);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].totalProfit <= s[i - 1].totalProfit + 1e-6);
});

test("scenarios: all three is at least as good as honey only when nucs and pollination are priced above cost", () => {
  const s = scenarios({ ...o, pollHives: 10 });
  assert.equal(s.length, 4);
  assert.ok(s[3].totalProfit >= s[0].totalProfit);
});

test("break-even hives is null when a hive loses money", () => {
  assert.equal(breakEvenHives({ ...o, honeyLb: 0, nucsSoldShare: 0, pollHives: 0 }), null);
  const n = breakEvenHives(o);
  assert.ok(Number.isInteger(n) && n > 0);
});

test("hold-steady loss matches the model", () => {
  const L = holdSteadyLossPct({ ...o, splitRate: 1, splitFailPct: 0 });
  assert.equal(L, 50);
  const r = yearModel(10, { ...o, lossPct: 50, splitRate: 1, splitFailPct: 0, cap: 1000 });
  assert.ok(Math.abs(r.end - 10) < 1e-9);
});

test("num and money parse and format", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("x")));
  assert.equal(money(-1234.4), "-$1,234");
});
