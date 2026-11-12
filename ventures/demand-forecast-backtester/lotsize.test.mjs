import { test } from "node:test";
import assert from "node:assert/strict";
import { wagnerWhitin, silverMeal, lotForLot, periodOrderQuantity, planCost, ordersFrom, scheduleSku } from "./lotsize.mjs";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Every feasible plan is a set of order periods that includes the first period with demand;
// enumerate all 2^(n-1) of them and keep the cheapest.
function bruteForce(d, setup, hold) {
  const n = d.length;
  let best = Infinity;
  for (let mask = 0; mask < 1 << n; mask++) {
    const periods = [];
    for (let t = 0; t < n; t++) if (mask & (1 << t)) periods.push(t);
    const p = planCost(d, ordersFrom(d, periods), setup, hold);
    if (p.feasible && p.cost < best) best = p.cost;
  }
  return best;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("Wagner-Whitin equals brute force over every order plan on 400 random instances", () => {
  const r = rng(20261112);
  for (let k = 0; k < 400; k++) {
    const n = 1 + Math.floor(r() * 10);
    const d = Array.from({ length: n }, () => (r() < 0.25 ? 0 : Math.round(r() * 200)));
    const setup = Math.round(r() * 500), hold = Math.round(r() * 300) / 100;
    const ww = wagnerWhitin(d, setup, hold);
    assert.ok(ww.feasible, JSON.stringify(d));
    near(ww.cost, bruteForce(d, setup, hold), 1e-6);
  }
});

test("every heuristic is feasible, covers all demand, and never beats the exact plan", () => {
  const r = rng(7);
  let smWorse = 0;
  for (let k = 0; k < 300; k++) {
    const n = 2 + Math.floor(r() * 18);
    const d = Array.from({ length: n }, () => (r() < 0.2 ? 0 : Math.round(r() * 120)));
    const setup = 10 + Math.round(r() * 400), hold = 0.1 + Math.round(r() * 200) / 100;
    const total = d.reduce((s, x) => s + x, 0);
    const ww = wagnerWhitin(d, setup, hold);
    for (const p of [silverMeal(d, setup, hold), periodOrderQuantity(d, setup, hold), lotForLot(d, setup, hold)]) {
      assert.ok(p.feasible, p.method);
      near(p.orders.reduce((s, o) => s + o.qty, 0), total);
      assert.ok(p.cost >= ww.cost - 1e-6, `${p.method} ${p.cost} < ww ${ww.cost} on ${d}`);
    }
    if (silverMeal(d, setup, hold).cost > ww.cost + 1e-6) smWorse++;
  }
  assert.ok(smWorse > 0, "Silver-Meal should be beaten somewhere, or the comparison is vacuous");
});

test("hand-checked cases, including one where Silver-Meal is not optimal", () => {
  // Demand 10, 10, 100 with order cost 100 and holding 1/unit/period.
  // Silver-Meal: order in period 0 for 0..1 (avg 55), then 100 alone: cost 100 + 10 + 100 = 210.
  // Covering all three from period 0 costs 100 + 10 + 200 = 310; ordering 0 and 2 apart costs 210;
  // ordering each period costs 300. So 210 is optimal here and both agree.
  near(silverMeal([10, 10, 100], 100, 1).cost, 210);
  near(wagnerWhitin([10, 10, 100], 100, 1).cost, 210);
  // Flat demand 30 a period over 4 periods, order cost 100, holding 1. Silver-Meal's average cost
  // per period covered is 100, 65, then 63.3 for three periods (100 + 30 + 60 over 3) and 70 for four,
  // so it orders 90 at period 0 and 30 at period 3: 190 + 100 = 290. Two orders of 60 at periods
  // 0 and 2 cost 130 + 130 = 260, which is optimal.
  const d = [30, 30, 30, 30];
  near(silverMeal(d, 100, 1).cost, 290);
  const ww = wagnerWhitin(d, 100, 1);
  near(ww.cost, 260);
  assert.deepEqual(ww.orders, [{ period: 0, qty: 60 }, { period: 2, qty: 60 }]);
});

test("limits: no order cost means lot-for-lot, no holding cost means one order", () => {
  const d = [5, 0, 7, 3];
  assert.deepEqual(wagnerWhitin(d, 0, 2).orders.map((o) => o.period), [0, 2, 3]);
  assert.deepEqual(wagnerWhitin(d, 50, 0).orders, [{ period: 0, qty: 15 }]);
  assert.deepEqual(wagnerWhitin([0, 0, 0], 50, 1).orders, []);
  near(wagnerWhitin([], 50, 1).cost, 0);
});

test("period order quantity follows the EOQ in periods", () => {
  // EOQ = sqrt(2*100*10/0.5) = 63.2 units = 6.3 periods of mean demand 10 -> 6 periods.
  const p = periodOrderQuantity(new Array(12).fill(10), 100, 0.5);
  assert.equal(p.periods, 6);
  assert.deepEqual(p.orders.map((o) => o.period), [0, 6]);
});

test("bad inputs are refused, not silently planned", () => {
  assert.throws(() => wagnerWhitin([1, -2], 1, 1), /non-negative/);
  assert.throws(() => wagnerWhitin([1, 2], NaN, 1), /order cost/);
  assert.throws(() => silverMeal([1, 2], 1, -1), /holding/);
});

test("scheduleSku freezes the lead time, nets stock above the safety floor and offsets orders", () => {
  // 2 periods of lead time, 30 on hand + 10 on order, safety stock 5, demand 10 a period.
  // Frozen periods use 20, leaving 15 above the floor, which covers period 2 and half of 3.
  const s = scheduleSku({ forecast: [10, 10, 10, 10, 10, 10], leadPeriods: 2, onHand: 30, onOrder: 10, safetyStock: 5, setup: 0, hold: 1 });
  assert.equal(s.gap, 0);
  assert.deepEqual(s.net, [0, 5, 10, 10]);
  assert.deepEqual(s.plans.ww.orders, [{ arrive: 3, place: 1, qty: 5 }, { arrive: 4, place: 2, qty: 10 }, { arrive: 5, place: 3, qty: 10 }]);
  // Too little stock to reach the first possible delivery: the shortfall is reported, not planned.
  const short = scheduleSku({ forecast: [10, 10, 10, 10], leadPeriods: 2, onHand: 4, safetyStock: 2, setup: 100, hold: 1 });
  assert.equal(short.gap, 18);
  assert.deepEqual(short.net, [10, 10]);
  assert.deepEqual(short.plans.ww.orders, [{ arrive: 2, place: 0, qty: 20 }]);
});

test("the benchmark never finds a rule of thumb below the exact plan", async () => {
  const { bench } = await import("./lotsize-bench.mjs");
  const rows = bench({ cases: 150, spreads: [0.3, 1] });
  assert.equal(rows.length, 6);
  for (const r of rows) assert.ok(r.mean >= 0 && r.max >= r.p90 && r.p90 >= 0 && r.optimal <= 1, JSON.stringify(r));
});
