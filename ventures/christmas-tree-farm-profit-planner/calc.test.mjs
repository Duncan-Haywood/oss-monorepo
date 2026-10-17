import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, project, steadyAcre, breakEvenPrice, priceSensitivity, survivalSensitivity, channelScenarios, sellableTreesPerAcre, blendedPrice, num, money } from "./calc.mjs";

const base = { ...DEFAULTS };

test("sellable trees and blended price", () => {
  assert.equal(sellableTreesPerAcre({ ...base, treesPerAcre: 1000, survivalPct: 80, cullPct: 10 }), 720);
  assert.equal(blendedPrice({ ...base, retailSharePct: 25, retailPrice: 80, wholesalePrice: 40 }), 50);
});

test("no revenue until the first block reaches harvest age", () => {
  const p = project(base);
  for (const r of p.rows.slice(0, base.harvestAge)) assert.equal(r.revenue, 0);
  assert.ok(p.rows[base.harvestAge].revenue > 0);
  assert.equal(p.firstHarvestYear, base.harvestAge + 1);
});

test("one acre, one block: harvest count matches acres planted", () => {
  const p = project({ ...base, acresPerYear: 3, plantYears: 4 });
  const harvested = p.rows.reduce((a, r) => a + r.harvested, 0);
  assert.equal(harvested, 12);
  assert.equal(p.rows.reduce((a, r) => a + r.planted, 0), 12);
});

test("a single acre's cash equals the closed-form cycle", () => {
  const o = { ...base, acresPerYear: 1, plantYears: 1, years: 12, fixedYear: 0, startupEquip: 0, discountPct: 0 };
  const p = project(o);
  const s = steadyAcre(o);
  assert.ok(Math.abs(p.totalCash - s.perCycle) < 1e-6, `${p.totalCash} vs ${s.perCycle}`);
});

test("break-even price sets NPV to about zero and scales up with cost", () => {
  const be = breakEvenPrice(base);
  const m = be / blendedPrice(base);
  const npv = project({ ...base, retailPrice: base.retailPrice * m, wholesalePrice: base.wholesalePrice * m }).npv;
  assert.ok(Math.abs(npv) < 1, String(npv));
  assert.ok(breakEvenPrice({ ...base, matureCostPerAcre: 1400 }) > be);
});

test("more survival and higher price both raise NPV", () => {
  const s = survivalSensitivity(base);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].npv > s[i - 1].npv);
  const p = priceSensitivity(base);
  for (let i = 1; i < p.length; i++) assert.ok(p[i].npv > p[i - 1].npv);
});

test("channel scenarios: retail beats wholesale when its price is higher", () => {
  const [w, , r] = channelScenarios(base);
  assert.ok(r.npv > w.npv);
});

test("zero-price plan cannot break even", () => {
  assert.equal(breakEvenPrice({ ...base, retailPrice: 0, wholesalePrice: 0 }), null);
});

test("hostile inputs do not produce NaN rows", () => {
  const p = project({ ...base, years: 0, acresPerYear: -3, survivalPct: 400, cullPct: -5 });
  for (const r of p.rows) assert.ok(Number.isFinite(r.cash));
});

test("num and money", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-1234.4), "-$1,234");
});
