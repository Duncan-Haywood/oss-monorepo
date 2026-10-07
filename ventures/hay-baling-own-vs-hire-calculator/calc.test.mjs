import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, balesPerAcre, fixedCost, variablePerAcre, compare, breakEven, enterprise, outsideRate, acreageSensitivity, hirePriceSensitivity, delaySensitivity, priceSensitivity } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("num parses money and rejects junk", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num(undefined)));
});

test("bales per acre is tons x cuts x 2000 / bale weight", () => {
  close(balesPerAcre(DEFAULTS), (1.5 * 2 * 2000) / 850);
  assert.equal(balesPerAcre({ ...DEFAULTS, baleWeightLb: 0 }), 6000);
});

test("fixed cost: depreciation, interest on average investment, insurance", () => {
  const f = fixedCost({ equipPrice: 100000, salvagePct: 20, lifeYears: 10, interestPct: 6, insHousingPct: 1 });
  close(f.dep, 8000);
  close(f.interest, 60000 * 0.06);
  close(f.insurance, 1000);
  close(f.total, 8000 + 3600 + 1000);
});

test("variable cost per acre adds fuel, repairs, labour per cut and wrap per bale", () => {
  const o = { ...DEFAULTS, cuts: 2, fuelPerAcre: 5, repairsPerAcre: 4, hoursPerAcre: 1, wage: 20, wrapPerBale: 2 };
  const v = variablePerAcre(o);
  close(v.fuel, 10); close(v.repairs, 8); close(v.labour, 40);
  close(v.wrap, balesPerAcre(o) * 2);
  close(v.total, 58 + balesPerAcre(o) * 2);
});

test("compare matches a hand calculation", () => {
  const o = { ...DEFAULTS, acres: 100, hireExtraPerAcre: 3, delayLossPct: 10 };
  const c = compare(o);
  const bales = 100 * balesPerAcre(o);
  close(c.bales, bales);
  close(c.own, fixedCost(o).total + 100 * variablePerAcre(o).total);
  close(c.hirePrice, bales * 14 + 100 * 2 * 3);
  close(c.delay, bales * 60 * 0.1);
  close(c.hire, c.hirePrice + c.delay);
  assert.equal(c.winner, c.own <= c.hire ? "own" : "hire");
});

test("at the break-even acreage own and hire cost the same", () => {
  const be = breakEven(DEFAULTS);
  assert.ok(be.acres > 0);
  const c = compare(DEFAULTS, be.acres);
  close(c.own, c.hire, 1e-4);
  const below = compare(DEFAULTS, be.acres * 0.5);
  assert.equal(below.winner, "hire");
  const above = compare(DEFAULTS, be.acres * 2);
  assert.equal(above.winner, "own");
});

test("break-even is null when hiring is cheaper per acre at any size", () => {
  const be = breakEven({ ...DEFAULTS, hireBalePrice: 0, delayLossPct: 0, hireExtraPerAcre: 0 });
  assert.equal(be.acres, null);
});

test("enterprise: needed price covers own cost at the target margin", () => {
  const e = enterprise({ ...DEFAULTS, targetMarginPct: 25 });
  close(e.neededPrice * 0.75, e.ownPerBale);
  close(e.revenue, e.bales * 60);
  close(e.profit, e.revenue - e.own);
});

test("outside bales lower your own cost per bale and the rate covers cost plus margin", () => {
  const without = outsideRate({ ...DEFAULTS, outsideBales: 0 });
  const withOut = outsideRate({ ...DEFAULTS, outsideBales: 500 });
  assert.ok(withOut.cost < without.cost);
  close(withOut.rate * 0.8, withOut.cost);
  close(withOut.outsideProfit, 500 * (withOut.rate - withOut.cost));
  close(withOut.ownCostPerBaleWithout, without.cost);
});

test("zero acres and bad input never produce NaN", () => {
  const c = compare({ ...DEFAULTS, acres: 0 });
  assert.equal(c.ownPerBale, null);
  assert.equal(outsideRate({ ...DEFAULTS, acres: 0, outsideBales: 0 }), null);
  const bad = { ...DEFAULTS, tonsPerAcreCut: NaN, cuts: NaN };
  assert.ok(Number.isFinite(compare(bad).own));
});

test("sensitivity tables move the right way", () => {
  const a = acreageSensitivity(DEFAULTS);
  assert.ok(a[a.length - 1].ownPerBale < a[0].ownPerBale);
  const h = hirePriceSensitivity(DEFAULTS);
  assert.ok(h[4].hire > h[0].hire);
  const d = delaySensitivity(DEFAULTS);
  assert.ok(d[4].hire > d[0].hire);
  const p = priceSensitivity(DEFAULTS);
  assert.ok(p[4].profit > p[0].profit);
});
