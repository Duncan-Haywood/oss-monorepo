import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCutting, boundedKnapsack, solveLP, firstFitDecreasing } from './stock.mjs';

// Exact fewest bars for a small multiset, by exhaustive branch and bound.
export function exactBars(pieces, L, kerf = 0) {
  const items = pieces.flatMap(p => Array(p.count).fill(p.length)).sort((a, b) => b - a);
  let best = items.length;
  const bins = [];
  (function place(i) {
    if (bins.length >= best) return;
    if (i === items.length) { best = bins.length; return; }
    const seen = new Set();
    for (let b = 0; b < bins.length; b++) {
      const need = items[i] + kerf;
      if (bins[b] + need <= L + kerf && !seen.has(bins[b])) {
        seen.add(bins[b]); bins[b] += need; place(i + 1); bins[b] -= need;
      }
    }
    bins.push(items[i] + kerf); place(i + 1); bins.pop();
  })(0);
  return best;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('bounded knapsack matches brute force', () => {
  const r = rng(7);
  for (let t = 0; t < 40; t++) {
    const m = 1 + Math.floor(r() * 4);
    const v = Array.from({ length: m }, () => Math.round(r() * 20) / 4);
    const w = Array.from({ length: m }, () => 1 + Math.floor(r() * 9));
    const ub = Array.from({ length: m }, () => Math.floor(r() * 4));
    const cap = 5 + Math.floor(r() * 20);
    let best = 0;
    (function go(i, c, val) {
      if (i === m) { best = Math.max(best, val); return; }
      for (let n = 0; n <= ub[i] && n * w[i] <= c; n++) go(i + 1, c - n * w[i], val + n * v[i]);
    })(0, cap, 0);
    const k = boundedKnapsack(v, w, ub, cap);
    assert.ok(Math.abs(k.value - best) < 1e-9, `case ${t}`);
    assert.ok(k.counts.reduce((s, n, i) => s + n * w[i], 0) <= cap);
    assert.ok(Math.abs(k.counts.reduce((s, n, i) => s + n * v[i], 0) - best) < 1e-9);
  }
});

test('by hand: 4 x 6000 from 12 m is 2 bars; 3 x 4100 needs 2 bars (not 1)', () => {
  assert.equal(planCutting([{ length: 6000, count: 4 }], [{ length: 12000 }]).bars, 2);
  const p = planCutting([{ length: 4100, count: 3 }], [{ length: 12000 }]);
  assert.equal(p.bars, 2); assert.equal(p.proven, true);
});

test('by hand: kerf counts between cuts, not after the last', () => {
  // Two 6000 pieces fit a 12000 bar with no kerf, not with a 3 mm kerf.
  assert.equal(planCutting([{ length: 6000, count: 2 }], [{ length: 12000 }], { kerf: 0 }).bars, 1);
  assert.equal(planCutting([{ length: 6000, count: 2 }], [{ length: 12000 }], { kerf: 3 }).bars, 2);
  assert.equal(planCutting([{ length: 5998, count: 2 }], [{ length: 12000 }], { kerf: 3 }).bars, 1);
  assert.equal(planCutting([{ length: 5999, count: 2 }], [{ length: 12000 }], { kerf: 3 }).bars, 2);
});

test('a mixed schedule matches the exact optimum found by exhaustive search', () => {
  const pieces = [{ length: 7000, count: 3 }, { length: 5000, count: 3 }, { length: 3000, count: 2 }, { length: 2000, count: 5 }];
  const p = planCutting(pieces, [{ length: 12000 }]);
  assert.equal(p.bars, exactBars(pieces, 12000));
  assert.equal(p.bars, 5);
});

test('lower bound <= exact optimum <= plan, and the plan cuts exactly the demand, on 150 random small schedules', () => {
  const r = rng(2026);
  let equal = 0, ffdWorse = 0;
  for (let t = 0; t < 150; t++) {
    const m = 1 + Math.floor(r() * 4);
    const L = 12000;
    const kerf = r() < 0.3 ? 5 : 0;
    const pieces = Array.from({ length: m }, () => ({ length: 25 * (20 + Math.floor(r() * 380)), count: 1 + Math.floor(r() * 3) }));
    const exact = exactBars(pieces, L, kerf);
    const p = planCutting(pieces, [{ length: L }], { kerf });
    assert.ok(p.lowerBound / L <= exact, `case ${t}: bound ${p.lowerBound / L} > exact ${exact}`);
    assert.ok(p.bars >= exact, `case ${t}`);
    // Every piece cut, and every pattern fits its bar.
    const cut = new Map();
    for (const pat of p.patterns) {
      const n = pat.cuts.reduce((s, c) => s + c.count, 0);
      assert.ok(pat.cuts.reduce((s, c) => s + c.count * c.length, 0) + kerf * (n - 1) <= pat.stock);
      for (const c of pat.cuts) cut.set(c.length, (cut.get(c.length) || 0) + c.count * pat.times);
    }
    const want = new Map();
    for (const q of pieces) want.set(q.length, (want.get(q.length) || 0) + q.count);
    assert.deepEqual([...cut.entries()].sort(), [...want.entries()].sort());
    if (p.bars === exact) equal++;
    if (p.firstFit.bars > p.bars) ffdWorse++;
    if (p.proven) assert.equal(p.bars, exact);
  }
  assert.equal(equal, 150, `optimal in ${equal} of 150`);
});

test('LP optimum certified by duality: every pattern prices out, and dual value equals primal value', () => {
  const lens = [5400, 3650, 2250, 1900];
  const demand = [10, 7, 13, 21];
  const lp = solveLP(lens, demand, [{ length: 12000, cost: 12000 }]);
  assert.ok(lp.proven);
  // Enumerate every pattern that fits a 12 m bar.
  let worst = -Infinity;
  (function go(i, left, val) {
    if (i === lens.length) { worst = Math.max(worst, val - 12000); return; }
    for (let n = 0; n * lens[i] <= left && n <= demand[i]; n++) go(i + 1, left - n * lens[i], val + n * lp.duals[i]);
  })(0, 12000, 0);
  assert.ok(worst <= 1e-6, `a pattern has reduced cost ${-worst}`);
  const dualValue = lp.duals.reduce((s, y, i) => s + y * demand[i], 0);
  assert.ok(Math.abs(dualValue - lp.value) < 1e-6, `${dualValue} vs ${lp.value}`);
});

test('two stock lengths: buys the shorter bar when it wastes less', () => {
  // Pieces of 6100: a 12 m bar holds one (5900 offcut); a 7 m bar holds one (900 offcut).
  const p = planCutting([{ length: 6100, count: 4 }], [{ length: 12000 }, { length: 7000 }]);
  assert.equal(p.bought, 28000);
  assert.ok(p.patterns.every(x => x.stock === 7000));
});

test('pieces longer than the stock are refused with the lap advice', () => {
  assert.throws(() => planCutting([{ length: 12500, count: 1 }], [{ length: 12000 }]), /lap or order special lengths/);
});

test('first-fit decreasing is a valid plan', () => {
  const plan = firstFitDecreasing([7000, 5000], [2, 2], [{ length: 12000, cost: 12000 }]);
  assert.equal(plan.length, 2);
});
