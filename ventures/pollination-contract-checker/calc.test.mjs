import { test } from "node:test";
import assert from "node:assert/strict";
import { check, grower, money, sampleInput, toCsv } from "./calc.mjs";

const base = { hives: 100, feePerHive: 200, failPct: 0, brokerPct: 0, miles: 100, truckCostPerMile: 2, hivesPerLoad: 100, laborHoursPerHive: 0.1, laborRate: 20, feedPerHive: 10, lossPct: 5, replaceCostPerHive: 150, forgoneIncomePerHive: 30, extraFixed: 100 };

test("hand-computed net", () => {
  const r = check(base);
  // gross 20000; trucking 1 load * 2 * 100 * 2 = 400; labor 100*.1*2*20 = 400; feed 1000; losses 100*.05*150 = 750; forgone 3000; other 100
  assert.equal(r.gross, 20000);
  assert.equal(r.costs.trucking, 400);
  assert.equal(r.costs.labor, 400);
  assert.equal(r.costs.losses, 750);
  assert.equal(r.totalCost, 5650);
  assert.equal(r.net, 14350);
  assert.equal(r.netPerHive, 143.5);
});

test("break-even fee makes net zero", () => {
  const r = check({ ...base, failPct: 10, brokerPct: 5 });
  const z = check({ ...base, failPct: 10, brokerPct: 5, feePerHive: r.breakEvenFee });
  assert.ok(Math.abs(z.net) < 1, `net ${z.net}`);
});

test("failed inspection hives are unpaid but still cost", () => {
  const a = check(base), b = check({ ...base, failPct: 20 });
  assert.equal(b.paidHives, 80);
  assert.ok(b.net < a.net);
  assert.equal(b.costs.trucking, a.costs.trucking);
});

test("long haul can sink a contract and says so", () => {
  const r = check({ ...base, miles: 3000, feePerHive: 120, hivesPerLoad: 50 });
  assert.equal(r.loses, true);
  assert.match(r.advice[0], /loses about/);
});

test("trucks round up", () => assert.equal(check({ ...base, hives: 401, hivesPerLoad: 400 }).loads, 2));

test("validation", () => {
  assert.ok(check({ ...base, hives: 0 }).error);
  assert.ok(check({ ...base, hives: 1.5 }).error);
  assert.ok(check({ ...base, feePerHive: 0 }).error);
  assert.ok(check({ ...base, failPct: 100 }).error);
  assert.ok(check({ ...base, miles: -1 }).error);
});

test("grower side break-even yield lift", () => {
  const g = grower({ acres: 100, hivesPerAcre: 2, feePerHive: 190, yieldPerAcre: 2500, pricePerUnit: 2.5 });
  assert.equal(g.hives, 200);
  assert.equal(g.costPerAcre, 380);
  assert.equal(g.total, 38000);
  assert.equal(g.breakEvenYieldLiftUnits, 152);
  assert.equal(g.breakEvenYieldLiftPct, 6.08);
  assert.ok(grower({ acres: 0, feePerHive: 1 }).error);
});

test("sample, csv, money", () => {
  const r = check(sampleInput());
  assert.ok(!r.error);
  assert.match(toCsv(r), /break-even fee per hive/);
  assert.equal(money(-1234.4), "-$1,234");
});
