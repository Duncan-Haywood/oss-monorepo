import { test } from "node:test";
import assert from "node:assert/strict";
import { check, compare, money, sampleInput, toCsv } from "./calc.mjs";

const base = { seed: 10000, seedCostPerK: 40, mortalityPct: 20, growoutMonths: 12, oystersPerBag: 100, bagCost: 20, rackCostPerBag: 10, gearLifeYears: 5, premiumPct: 50, standardPct: 40, premiumPrice: 1, standardPrice: 0.5, cullPrice: 0.1, commissionPct: 0, hoursPerBagMonth: 0.1, laborRate: 20, boatCostPerMonth: 100, leasePerYear: 500, otherPerYear: 200, packPerOyster: 0.02, interestPct: 10 };

test("hand-computed net", () => {
  const r = check(base);
  // survivors 8000; bags 80; revenue 8000*(.5*1 + .4*.5 + .1*.1)=5680
  assert.equal(r.survivors, 8000);
  assert.equal(r.bags, 80);
  assert.equal(r.revenue, 5680);
  // seed 400; gear total 80*30=2400, wear 12/12/5 -> 480; labor 80*.1*12*20=1920; boat 1200; lease 500; other 200; pack 160; interest (400+2400)*.1=280
  assert.equal(r.costs.seed, 400);
  assert.equal(r.costs.gearWear, 480);
  assert.equal(r.costs.labor, 1920);
  assert.equal(r.costs.interest, 280);
  assert.equal(r.totalCost, 5140);
  assert.equal(r.net, 540);
  assert.equal(r.cashBeforeFirstSale, 400 + 2400 + 1920 + 1200 + 500 + 200 + 280);
});

test("break-even blended price makes net zero", () => {
  const r = check({ ...base, commissionPct: 10 });
  const scale = (r.breakEvenBlendedPrice * r.survivors) / r.revenue;
  const z = check({ ...base, commissionPct: 10, premiumPrice: base.premiumPrice * scale, standardPrice: base.standardPrice * scale, cullPrice: base.cullPrice * scale });
  assert.ok(Math.abs(z.net) < 45, `net ${z.net}`);
});

test("break-even survival makes net about zero", () => {
  const r = check(base);
  const z = check({ ...base, mortalityPct: 100 - r.breakEvenSurvivalPct });
  assert.ok(Math.abs(z.net) < 25, `net ${z.net}`);
});

test("higher mortality lowers net and a doomed crop says so", () => {
  assert.ok(check({ ...base, mortalityPct: 40 }).net < check(base).net);
  const r = check({ ...base, premiumPrice: 0.2, standardPrice: 0.1 });
  assert.equal(r.loses, true);
  assert.match(r.advice[0], /loses about/);
  assert.equal(r.breakEvenSurvivalPct, null);
});

test("gear life caps wear at the full cost", () => {
  const r = check({ ...base, growoutMonths: 120, gearLifeYears: 2 });
  assert.equal(r.costs.gearWear, 2400);
});

test("compare ranks options by net", () => {
  const out = compare(base, [{ name: "bags", overrides: {} }, { name: "high loss", overrides: { mortalityPct: 50 } }]);
  assert.equal(out[0].name, "bags");
});

test("validation", () => {
  assert.ok(check({ ...base, seed: 0 }).error);
  assert.ok(check({ ...base, seed: 1.5 }).error);
  assert.ok(check({ ...base, mortalityPct: 100 }).error);
  assert.ok(check({ ...base, premiumPct: 70, standardPct: 40 }).error);
  assert.ok(check({ ...base, commissionPct: 100 }).error);
  assert.ok(check({ ...base, laborRate: -1 }).error);
  assert.ok(check({ ...base, premiumPrice: 0 }).error);
  assert.ok(check({ ...base, gearLifeYears: 0 }).error);
});

test("sample, csv, money", () => {
  const r = check(sampleInput());
  assert.ok(!r.error);
  assert.match(toCsv(r), /break-even blended price/);
  assert.equal(money(-1234.4), "-$1,234");
});
