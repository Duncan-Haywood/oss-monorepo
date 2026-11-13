import { test } from "node:test";
import assert from "node:assert/strict";
import { solveBandedLP } from "./lp.mjs";
import { onPeakFlags, jointLP, planMonth, monthBill, greedyCaps, bestCaps } from "./tou.mjs";

let seed = 3;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

test("hand-sized LPs: box bounds and a dense column", () => {
  // min -x1 - 2 x2  s.t. x1 + x2 + s = 4, x1 <= 3, x2 <= 2.5  ->  x2 = 2.5, x1 = 1.5, obj -6.5
  let r = solveBandedLP({ nRows: 1, b: Float64Array.from([4]), cols: [
    { rows: [0], vals: [1], cost: -1, upper: 3 }, { rows: [0], vals: [1], cost: -2, upper: 2.5 }, { rows: [0], vals: [1], cost: 0, upper: Infinity }] });
  assert.ok(r.ok);
  assert.ok(Math.abs(r.obj + 6.5) < 1e-6, String(r.obj));
  // min C  s.t. C >= 1, C >= 3 (as -C + slack = -1, -C + slack = -3)  ->  C = 3; C is a dense column
  r = solveBandedLP({ nRows: 2, b: Float64Array.from([-1, -3]), cols: [
    { rows: [0], vals: [1], cost: 0, upper: Infinity }, { rows: [1], vals: [1], cost: 0, upper: Infinity },
    { rows: [0, 1], vals: [-1, -1], cost: 1, upper: Infinity, dense: true }] });
  assert.ok(r.ok);
  assert.ok(Math.abs(r.obj - 3) < 1e-6, String(r.obj));
});

test("random banded LPs: the answer carries an optimality certificate (feasible, dual feasible, zero gap)", () => {
  for (let k = 0; k < 20; k++) {
    // a chain: rows i, columns touch rows i and i+1, every row has its own slack; plus one dense column
    const m = 30 + Math.floor(rnd() * 40);
    const cols = [];
    const x0 = [];
    for (let i = 0; i < m; i++) {
      const rows = i + 1 < m ? [i, i + 1] : [i];
      const vals = rows.map(() => rnd() * 2 - 1);
      const upper = rnd() < 0.5 ? 1 + rnd() * 3 : Infinity;
      // negative costs only on bounded columns, so the LP is bounded below
      cols.push({ rows, vals, cost: Number.isFinite(upper) ? rnd() * 2 - 1 : rnd(), upper });
      x0.push(Number.isFinite(upper) ? rnd() * upper : rnd() * 3);
      cols.push({ rows: [i], vals: [1], cost: rnd(), upper: Infinity }); x0.push(rnd() * 2); // slack keeps it feasible
    }
    cols.push({ rows: Array.from({ length: m }, (_, i) => i), vals: Array.from({ length: m }, () => -rnd()), cost: 1 + rnd(), upper: Infinity, dense: true });
    x0.push(rnd() * 2);
    const b = new Float64Array(m);
    cols.forEach((c, j) => c.rows.forEach((r, q) => { b[r] += c.vals[q] * x0[j]; }));
    const res = solveBandedLP({ nRows: m, b, cols });
    assert.ok(res.ok, `case ${k}: ${res.primalRes} ${res.dualRes} ${res.relGap}`);
    // primal feasibility
    const Ax = new Float64Array(m);
    cols.forEach((c, j) => c.rows.forEach((r, q) => { Ax[r] += c.vals[q] * res.x[j]; }));
    for (let i = 0; i < m; i++) assert.ok(Math.abs(Ax[i] - b[i]) < 1e-5 * (1 + Math.abs(b[i])));
    cols.forEach((c, j) => assert.ok(res.x[j] >= -1e-7 && res.x[j] <= c.upper + 1e-7));
    // dual: reduced cost d_j = c_j - a_j.y ; at a lower bound d >= 0, at an upper bound d <= 0, strictly inside d = 0
    let dualObj = 0;
    for (let i = 0; i < m; i++) dualObj += b[i] * res.y[i];
    cols.forEach((c, j) => {
      let d = c.cost;
      c.rows.forEach((r, q) => { d -= c.vals[q] * res.y[r]; });
      const atUp = Number.isFinite(c.upper) && res.x[j] > c.upper - 1e-5;
      const atLo = res.x[j] < 1e-5;
      if (atUp) { assert.ok(d < 1e-5, `reduced cost ${d} at upper bound`); dualObj += c.upper * d; } else if (!atLo) assert.ok(Math.abs(d) < 1e-5, `reduced cost ${d} inside`);
      else assert.ok(d > -1e-5, `reduced cost ${d} at lower bound`);
    });
    assert.ok(Math.abs(dualObj - res.obj) < 1e-5 * (1 + Math.abs(res.obj)), `gap ${dualObj} vs ${res.obj}`);
  }
});

// One 30-day month of 15-minute readings.
function monthOf(fn) {
  const t = [], load = [];
  for (let d = 1; d <= 30; d++) for (let q = 0; q < 96; q++) { t.push(Date.UTC(2026, 5, d, Math.floor(q / 4), (q % 4) * 15)); load.push(fn(d, q)); }
  return { t, load };
}
const tariff = { onStart: 16, onEnd: 21, weekdaysOnly: true };

test("joint optimum: physical dispatch, never above any other candidate, and it trades demand for energy when that pays", () => {
  // a working-hours load with noise and an afternoon peak, as in the example data
  const { t, load } = monthOf((d, q) => 12 + (q >= 24 && q < 80 ? 18 : 0) + (q >= 52 && q < 68 ? 12 : 0) + rnd() * 6);
  const on = onPeakFlags(t, tariff);
  const price = on.map((x) => (x ? 0.35 : 0.1));
  const bat = { kw: 12, kwh: 24 * 0.9, roundTrip: 0.88 };
  const eta = Math.sqrt(bat.roundTrip);
  const lp = jointLP(load, on, price, 0.25, bat, 4, 4);
  // forward-simulate the grid draw it returns: inverter and energy limits, no export
  let soc = bat.kwh;
  for (let i = 0; i < load.length; i++) {
    const p = lp.grid[i] - load[i];
    assert.ok(lp.grid[i] >= -1e-9 && Math.abs(p) <= bat.kw + 1e-9);
    soc += p >= 0 ? p * 0.25 * eta : (p * 0.25) / eta;
    assert.ok(soc >= -1e-6 && soc <= bat.kwh + 1e-6);
  }
  const score = (g, end) => { const b = monthBill(g, on, price, 0.25, 4, (bat.kwh - end) / eta, 0.1); return 4 * b.facKw + b.onDemand + b.energy; };
  const joint = score(lp.grid, lp.endKwh);
  const caps = bestCaps(load, on, 0.25, bat, 4, 4);
  const gr = greedyCaps(load, on, 0.25, caps.capF, caps.capP, bat);
  assert.ok(joint <= score(gr.grid, gr.endKwh) + 1e-6);
  const two = planMonth(load, on, price, 0.25, bat, 4, 4, { joint: false });
  const one = planMonth(load, on, price, 0.25, bat, 4, 4);
  assert.equal(one.method, "joint optimum");
  assert.ok(one.score <= two.score + 1e-6, `${one.score} vs ${two.score}`);
  assert.ok(two.score - one.score > 1, `expected the joint plan to beat the two-step plan here: ${two.score} vs ${one.score}`);
});

test("joint optimum with only a facility demand charge and flat energy equals the greedy lowest cap", () => {
  const { t, load } = monthOf((d, q) => 20 + (q === 60 ? 15 : 0) + rnd() * 4);
  const on = onPeakFlags(t, tariff);
  const price = on.map(() => 0.12);
  const bat = { kw: 10, kwh: 10, roundTrip: 0.9 };
  const one = planMonth(load, on, price, 0.25, bat, 15, 0);
  const caps = bestCaps(load, on, 0.25, bat, 15, 0);
  assert.ok(Math.abs(one.after.facKw - caps.capF) < 0.02, `${one.after.facKw} vs ${caps.capF}`);
});
