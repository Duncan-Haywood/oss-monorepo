import test from "node:test";
import assert from "node:assert/strict";
import { planPreorder, poissonAtLeast } from "./preorder.mjs";

test("poisson tail: hand values", () => {
  assert.equal(poissonAtLeast(0, 5), 1);
  assert.ok(Math.abs(poissonAtLeast(1, 1) - (1 - Math.exp(-1))) < 1e-12);
  // P(X>=2 | 2) = 1 - e^-2 (1 + 2) = 0.5939941...
  assert.ok(Math.abs(poissonAtLeast(2, 2) - (1 - 3 * Math.exp(-2))) < 1e-12);
  // large mean must not underflow: mean 2000, need 1500 is certain; need 2600 is not
  assert.ok(poissonAtLeast(1500, 2000) > 0.999999);
  assert.ok(poissonAtLeast(2600, 2000) < 1e-6);
});

const base = { price: 48, landed: 14, moq: 100, taxPct: 20, feePct: 3, feeFixed: 0.3, cancelPct: 5, conversionPct: 2, visitorsPerDay: 200, days: 30, cpc: 0, fixedCosts: 300 };

test("orders and visitors needed by hand", () => {
  const r = planPreorder(base);
  assert.equal(r.ordersNeeded, 106); // ceil(100 / 0.95) = 105.26 -> 106
  assert.equal(r.visitorsNeeded, 5300); // 106 / 0.02
  // net per order: 48/1.2 = 40 - (1.44 + 0.3) = 38.26
  assert.equal(r.netPerOrder, 38.26);
  assert.equal(r.piecesMade, 100); // floor(106*.95)=100
  // profit: 100 * (38.26 - 14) - 300 = 2126
  assert.equal(r.profitIfFunded, 2126);
  assert.equal(r.lossIfFails, 300);
  // expected orders 200*30*.02 = 120 > 106
  assert.equal(r.ordersExpected, 120);
  assert.ok(r.pFunded > 0.85 && r.pFunded < 0.95, String(r.pFunded)); // P(Pois(120)>=106) ~ 0.90
  assert.equal(r.dayReached, 27); // ceil(106 / 4)
  assert.equal(r.verdict, "go");
});

test("paid traffic raises the cost of failing and lowers profit", () => {
  const r = planPreorder({ ...base, cpc: 0.4 });
  assert.equal(r.adCost, 2120); // 5300 * .4
  assert.equal(r.lossIfFails, 300 + 200 * 30 * 0.4);
  assert.equal(r.profitIfFunded, 100 * 24.26 - 300 - 2120);
});

test("a campaign that loses money per order is a stop", () => {
  const r = planPreorder({ ...base, price: 15 });
  assert.equal(r.verdict, "stop");
  assert.ok(r.notes.some(n => /less than a piece costs/.test(n)));
});

test("thin traffic is unlikely and says the day it would pass", () => {
  const r = planPreorder({ ...base, visitorsPerDay: 50 });
  assert.equal(r.ordersExpected, 30);
  assert.equal(r.verdict, "unlikely");
  assert.equal(r.dayReached, 106);
  assert.ok(r.notes.some(n => /after your 30-day window/.test(n)));
});

test("a test bounds the visitors needed; zero orders cannot", () => {
  const r = planPreorder({ ...base, test: { visitors: 400, orders: 8 } });
  assert.ok(r.range.conversionLowPct < 2 && r.range.conversionHighPct > 2);
  assert.ok(r.range.visitorsNeededWorst > r.range.visitorsNeededBest);
  const z = planPreorder({ ...base, test: { visitors: 100, orders: 0 } });
  assert.ok(z.range.conversionLowPct === 0 && z.range.visitorsNeededWorst === null);
  assert.ok(z.notes.some(n => /no orders/.test(n)));
});

test("break-even price makes the funded campaign exactly break even", () => {
  const r = planPreorder(base);
  const again = planPreorder({ ...base, price: r.breakEvenPrice });
  assert.ok(Math.abs(again.profitIfFunded) < 1.5, String(again.profitIfFunded));
});

test("bad inputs are refused in words", () => {
  assert.match(planPreorder({ ...base, moq: 0 }).error, /minimum order/);
  assert.match(planPreorder({ ...base, cancelPct: 100 }).error, /Cancellations/);
  assert.match(planPreorder({ ...base, conversionPct: 0 }).error, /Conversion/);
});
