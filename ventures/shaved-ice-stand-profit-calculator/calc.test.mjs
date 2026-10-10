import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cupEconomics, sampleInput, toCsv } from "./calc.mjs";

const flat = { ...sampleInput(), wastePct: 0, cardFeePct: 0, strawSpoonCost: 0, cupCost: 0, iceCostPerLb: 0, syrupCostPerOz: 0.5, boothPctOfSales: 0 };

test("cup cost = ice + syrup + cup, with waste on top", () => {
  const c = cupEconomics({ ...flat, mediumSyrupOz: 2, wastePct: 10, mediumPrice: 6 })[1];
  assert.ok(Math.abs(c.make - 1.1) < 1e-9);
  assert.ok(Math.abs(c.margin - 4.9) < 1e-9);
});

test("card fee applies only to the card share", () => {
  const c = cupEconomics({ ...flat, cardFeePct: 3, cardSharePct: 50, smallPrice: 10 })[0];
  assert.ok(Math.abs(c.card - 0.15) < 1e-9);
});

test("zero size mix is an error", () => {
  assert.match(analyze({ ...flat, smallShare: 0, mediumShare: 0, largeShare: 0 }).error, /mix/);
});

test("break-even cups cover fixed costs exactly", () => {
  const r = analyze({ ...flat, smallShare: 0, mediumShare: 100, largeShare: 0, mediumPrice: 5, mediumSyrupOz: 2, staff: 0, boothFee: 100, fuelAndSupplies: 0, otherFixed: 0 });
  assert.equal(r.avgPrice, 5);
  assert.equal(r.breakEvenCups, 25); // margin 4 per cup, $100 fixed
});

test("a percent-of-sales fee raises break-even", () => {
  const a = analyze(flat), b = analyze({ ...flat, boothPctOfSales: 20 });
  assert.ok(b.breakEvenCups > a.breakEvenCups);
});

test("a cup that earns nothing has no break-even", () => {
  const r = analyze({ ...flat, mediumPrice: 0.1, smallPrice: 0.1, largePrice: 0.1 });
  assert.equal(r.breakEvenCups, null);
  assert.match(r.advice[0], /earns nothing/);
});

test("scenarios scale with weather and profit falls on a rainy day", () => {
  const r = analyze(sampleInput());
  assert.ok(r.scenarios[0].sold > r.scenarios[1].sold && r.scenarios[1].sold > r.scenarios[2].sold);
  assert.ok(r.scenarios[0].profit > r.scenarios[2].profit);
});

test("max flat fee leaves the target profit on a normal day", () => {
  const i = sampleInput();
  const r = analyze(i);
  const again = analyze({ ...i, boothFee: r.maxFlatFee });
  assert.ok(Math.abs(again.scenarios[1].profit - i.targetProfit) < 1e-6);
});

test("sample runs and exports a CSV", () => {
  const r = analyze(sampleInput());
  assert.equal(r.error, undefined);
  assert.equal(toCsv(r).split("\n").length, 4);
});
