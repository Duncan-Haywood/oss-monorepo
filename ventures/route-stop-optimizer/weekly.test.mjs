import { test } from "node:test";
import assert from "node:assert/strict";
import { patternsFor, planWeek, verifyWeek, summarize } from "./weekly.mjs";
import { rng } from "./vrptw.mjs";

function randomInst(seed, n, D, K, { freqs = [1], H = Infinity } = {}) {
  const r = rng(seed);
  const pts = Array.from({ length: n + 1 }, (_, i) => (i === 0 ? [50, 50] : [r() * 100, r() * 100]));
  const dist = pts.map((a) => pts.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
  const service = pts.map((_, i) => (i === 0 ? 0 : 5 + Math.floor(r() * 20)));
  const dow = Array.from({ length: D }, (_, d) => d);
  const all = Array.from({ length: D }, (_, d) => d);
  const patterns = [[]];
  for (let c = 1; c <= n; c++) patterns.push(patternsFor(freqs[c % freqs.length], all, dow));
  return { n, dist, service, days: D, vehicles: K, maxMinutes: H, patterns };
}

const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const tour = (inst, r) => { let t = 0, p = 0; for (const c of r) { t += inst.dist[p][c]; p = c; } return r.length ? t + inst.dist[p][0] : 0; };
const bestTour = (inst, set) => Math.min(...perms(set).map((p) => tour(inst, p)));

// Exact optimum by enumeration: a pattern per customer, then for each day
// every split of its customers across the vehicles, each route in its best
// order. The objective matches planWeek's (travel + 100 x overtime).
function bruteForce(inst) {
  const { n, days: D, vehicles: K } = inst;
  const H = inst.maxMinutes;
  const dayCost = new Map();
  const costOfDay = (set) => {
    const key = set.join(",");
    if (dayCost.has(key)) return dayCost.get(key);
    let best = Infinity;
    const m = set.length;
    for (let code = 0; code < K ** m; code++) {
      const groups = Array.from({ length: K }, () => []);
      let x = code;
      for (const c of set) { groups[x % K].push(c); x = Math.floor(x / K); }
      let s = 0;
      for (const g of groups) {
        const t = bestTourWithOt(g);
        s += t;
      }
      best = Math.min(best, s);
    }
    dayCost.set(key, best);
    return best;
  };
  const bestTourWithOt = (g) => {
    if (!g.length) return 0;
    const svc = g.reduce((a, c) => a + inst.service[c], 0);
    return Math.min(...perms(g).map((p) => { const t = tour(inst, p); return t + 100 * Math.max(0, t + svc - H); }));
  };
  let best = Infinity;
  const choice = new Array(n + 1).fill(0);
  const rec = (c) => {
    if (c > n) {
      const sets = Array.from({ length: D }, () => []);
      for (let i = 1; i <= n; i++) for (const d of inst.patterns[i][choice[i]]) sets[d].push(i);
      best = Math.min(best, sets.reduce((a, s) => a + costOfDay(s), 0));
      return;
    }
    for (let p = 0; p < inst.patterns[c].length; p++) { choice[c] = p; rec(c + 1); }
  };
  rec(1);
  return best;
}

test("patterns spread visits across the week", () => {
  const mf = [0, 1, 2, 3, 4];
  assert.equal(patternsFor(1, mf, mf).length, 5);
  assert.deepEqual(patternsFor(2, mf, mf), [[0, 3], [0, 4], [1, 4]]); // Mon+Thu, Mon+Fri, Tue+Fri
  assert.deepEqual(patternsFor(3, mf, mf), [[0, 2, 4]]); // Mon/Wed/Fri
  assert.deepEqual(patternsFor(5, mf, mf), [[0, 1, 2, 3, 4]]);
  // allowed days that cannot meet the spread fall back to the widest gap
  assert.deepEqual(patternsFor(2, [0, 1], mf), [[0, 1]]);
  assert.deepEqual(patternsFor(2, [1], mf), []);
});

test("one vehicle a day: equals brute force on 30 small weeks", () => {
  for (let s = 1; s <= 30; s++) {
    const inst = randomInst(s, 6, 3, 1);
    const plan = planWeek(inst, { seed: s, iterations: 1500 });
    assert.equal(verifyWeek(inst, plan), null);
    const opt = bruteForce(inst);
    assert.ok(plan.objective <= opt + 1e-6, `seed ${s}: ${plan.objective} vs optimum ${opt}`);
  }
});

test("two vehicles, a shift cap and twice-weekly customers: equals brute force", () => {
  for (let s = 1; s <= 15; s++) {
    const inst = randomInst(100 + s, 6, 5, 2, { freqs: [1, 2], H: 160 });
    const plan = planWeek(inst, { seed: s, iterations: 2500 });
    assert.equal(verifyWeek(inst, plan), null);
    const opt = bruteForce(inst);
    assert.ok(plan.objective <= opt + 1e-6, `seed ${s}: ${plan.objective} vs optimum ${opt}`);
  }
});

test("fixed days: a single pattern per customer is kept", () => {
  const inst = randomInst(7, 12, 5, 1);
  inst.patterns = inst.patterns.map((p, c) => (c === 0 ? p : [p[c % p.length]]));
  const plan = planWeek(inst, { seed: 3, iterations: 800 });
  assert.equal(verifyWeek(inst, plan), null);
  for (let c = 1; c <= inst.n; c++) assert.equal(plan.pattern[c], 0);
});

test("a move penalty keeps customers on their current day unless it pays", () => {
  const inst = randomInst(11, 20, 5, 1);
  inst.current = inst.patterns.map((p, c) => (c === 0 ? -1 : c % 5));
  const free = planWeek({ ...inst, movePenalty: 0 }, { seed: 1, iterations: 3000 });
  const sticky = planWeek({ ...inst, movePenalty: 1e6 }, { seed: 1, iterations: 3000 });
  assert.equal(sticky.moved, 0);
  assert.ok(free.moved > 0);
  assert.ok(free.travel < sticky.travel);
  const keep = summarize(inst, sticky.routes, sticky.pattern);
  assert.equal(keep.moved, 0);
});

test("choosing days beats keeping a scattered schedule", () => {
  const inst = randomInst(21, 60, 5, 2);
  const scattered = { ...inst, patterns: inst.patterns.map((p, c) => (c === 0 ? p : [p[c % 5]])) };
  const kept = planWeek(scattered, { seed: 1, iterations: 4000 });
  const chosen = planWeek(inst, { seed: 1, iterations: 4000 });
  assert.equal(verifyWeek(inst, chosen), null);
  assert.ok(chosen.travel < 0.8 * kept.travel, `${chosen.travel} vs ${kept.travel}`);
});
