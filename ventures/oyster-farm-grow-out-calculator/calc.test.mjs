import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, sensitivity, seedFor, money, sampleInput, toCsv } from "./calc.mjs";

const base = { seedCount: 100000, seedCostPer1000: 30, survivalPct: 60, marketablePct: 100, pricePerOyster: 0.5, growMonths: 12, stockingPerBag: 100, bagCost: 40, gearLifeYears: 4, handlingsPerBag: 10, minutesPerHandling: 6, laborRate: 20, leasePerYear: 1200, boatPerMonth: 100, capitalRatePct: 10 };

test("hand-computed cost lines", () => {
  const r = analyze(base);
  // bags = 100000 * 1.6 / 2 / 100 = 800 ; seed = 100 * 30 = 3000 ; gear = 800*40*1/4 = 8000
  assert.equal(r.sold, 60000);
  assert.equal(r.bags, 800);
  assert.equal(r.seed, 3000);
  assert.equal(r.gear, 8000);
  // labor = 800*10*6/60 = 800 h * 20 = 16000 ; lease 1200 ; boat 1200 ; interest (3000+32000)*.10 = 3500
  assert.equal(r.labor, 16000);
  assert.equal(r.lease, 1200);
  assert.equal(r.boat, 1200);
  assert.equal(r.interest, 3500);
  assert.equal(r.total, 32900);
  assert.equal(r.revenue, 30000);
  assert.equal(r.profit, -2900);
  assert.equal(r.costPerOyster, 0.55);
  assert.equal(r.viable, false);
});

test("a higher price turns the cycle profitable", () => {
  const r = analyze({ ...base, pricePerOyster: 0.7 });
  assert.equal(r.profit, 9100);
  assert.equal(r.viable, true);
});

test("break-even survival sits where profit crosses zero", () => {
  const r = analyze({ ...base, pricePerOyster: 0.7 });
  assert.ok(r.breakEvenSurvival > 40 && r.breakEvenSurvival < 60);
  const edge = analyze({ ...base, pricePerOyster: 0.7, survivalPct: r.breakEvenSurvival + 1 });
  assert.ok(edge.profit > 0);
  const below = analyze({ ...base, pricePerOyster: 0.7, survivalPct: r.breakEvenSurvival - 3 });
  assert.ok(below.profit < 0);
});

test("unreachable break-even is null when even full survival loses", () => {
  const r = analyze({ ...base, pricePerOyster: 0.05 });
  assert.equal(r.breakEvenSurvival, null);
  assert.match(r.advice.join(" "), /every seed surviving/);
});

test("cost rises with grow-out length", () => {
  assert.ok(analyze({ ...base, growMonths: 24 }).total > analyze(base).total);
});

test("sensitivity grid has one row per survival and moves the right way", () => {
  const g = sensitivity(base);
  assert.equal(g.length, 5);
  assert.ok(g[4].cells[1].profit > g[0].cells[1].profit);
  assert.ok(g[2].cells[2].profit > g[2].cells[0].profit);
});

test("seedFor works backwards from a sales target", () => {
  assert.equal(seedFor(60000, base), 100000);
  assert.equal(seedFor(10000, { ...base, marketablePct: 50 }), 33334);
});

test("validation rejects nonsense", () => {
  assert.ok(analyze({ ...base, survivalPct: 0 }).error);
  assert.ok(analyze({ ...base, survivalPct: 101 }).error);
  assert.ok(analyze({ ...base, seedCount: 0 }).error);
  assert.ok(analyze({ ...base, bagCost: -1 }).error);
  assert.ok(analyze({ ...base, growMonths: 0 }).error);
});

test("sample and csv are well formed", () => {
  const r = analyze(sampleInput());
  assert.ok(!r.error);
  assert.match(toCsv(r), /cost per oyster/);
  assert.equal(money(-1234), "-$1,234");
});
