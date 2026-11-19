// Pins the faster search path (typed-array flow, profit bound that skips
// masks which cannot win, one seating for the baseline) to the code it
// replaced: oldSeat below is the earlier array-of-arrays solver, verbatim, and
// oldBest re-runs the earlier unpruned search loops over the same evalMask.
import { test } from "node:test";
import assert from "node:assert/strict";
import { search, analyze } from "./calc.mjs";

const BIG = 1e7;
const EPS = 1e-9;

function oldSeat(open, slots, students, idx) {
  // open: array of slot indices; idx: Map(normalised slot name -> slot index)
  const n = students.length, m = open.length;
  const S = 0, T = 1 + n + m;
  const to = [], cap = [], cost = [], adj = Array.from({ length: T + 1 }, () => []);
  const add = (u, v, c, w) => {
    adj[u].push(to.length); to.push(v); cap.push(c); cost.push(w);
    adj[v].push(to.length); to.push(u); cap.push(0); cost.push(-w);
  };
  const pos = new Map(open.map((s, k) => [s, k]));
  const stuEdges = students.map(() => []);
  students.forEach((st, i) => {
    add(S, 1 + i, 1, -st.price);
    for (const a of st.availIdx) {
      if (pos.has(a)) { stuEdges[i].push([to.length, a]); add(1 + i, 1 + n + pos.get(a), 1, 0); }
    }
  });
  open.forEach((s, k) => {
    const sl = slots[s];
    add(1 + n + k, T, sl.min, -BIG);
    if (sl.capacity > sl.min) add(1 + n + k, T, sl.capacity - sl.min, 0);
  });
  const N = T + 1;
  for (;;) {
    const dist = new Array(N).fill(Infinity), prevE = new Array(N).fill(-1), inQ = new Array(N).fill(false);
    dist[S] = 0;
    const q = [S];
    inQ[S] = true;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      inQ[u] = false;
      for (const e of adj[u]) {
        if (cap[e] > 0 && dist[u] + cost[e] < dist[to[e]] - EPS) {
          dist[to[e]] = dist[u] + cost[e];
          prevE[to[e]] = e;
          if (!inQ[to[e]]) { inQ[to[e]] = true; q.push(to[e]); }
        }
      }
    }
    if (!(dist[T] < -EPS)) break;
    for (let v = T; v !== S; v = to[prevE[v] ^ 1]) { cap[prevE[v]] -= 1; cap[prevE[v] ^ 1] += 1; }
  }
  const seatOf = new Array(n).fill(-1);
  const load = new Map(open.map((s) => [s, 0]));
  stuEdges.forEach((es, i) => {
    for (const [e, a] of es) if (cap[e] === 0) { seatOf[i] = a; load.set(a, load.get(a) + 1); }
  });
  let feasible = true, revenue = 0, runCost = 0;
  for (const s of open) {
    if (load.get(s) < slots[s].min) feasible = false;
    runCost += slots[s].cost;
  }
  seatOf.forEach((a, i) => { if (a >= 0) revenue += students[i].price; });
  return { feasible, profit: feasible ? revenue - runCost : -Infinity, revenue, runCost, seatOf, load };
}

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function instance(seed, nSlots, nStu) {
  const r = rng(seed);
  const slots = Array.from({ length: nSlots }, (_, i) => {
    const capacity = 1 + Math.floor(r() * 7);
    return { name: `S${i}`, capacity, min: 1 + Math.floor(r() * capacity), cost: Math.floor(r() * 60) + (r() < 0.2 ? 0.5 : 0) };
  });
  const students = Array.from({ length: nStu }, (_, i) => {
    const avail = slots.filter(() => r() < 0.35).map((s) => s.name);
    if (r() < 0.1) avail.push("Nowhere");
    return { name: `P${i}`, price: 1 + Math.floor(r() * 30) + (r() < 0.2 ? 0.25 : 0), avail };
  });
  return { slots, students };
}

// the earlier search loops, every mask solved, given the same seeded starts
function oldBest(m, evalMask, { seed = 7, restarts = 12, exactLimit = 10 } = {}) {
  let best = 0;
  if (m <= exactLimit) {
    for (let mask = 0; mask < 1 << m; mask++) if (evalMask(mask).profit > evalMask(best).profit + EPS) best = mask;
    return best;
  }
  let a = seed;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const climb = (start) => {
    let mask = start, cur = evalMask(mask).profit;
    for (;;) {
      let bm = mask, bv = cur;
      for (let i = 0; i < m; i++) {
        const v = evalMask(mask ^ (1 << i)).profit;
        if (v > bv + EPS) { bv = v; bm = mask ^ (1 << i); }
      }
      if (bm === mask) {
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
          if (!(mask & (1 << i)) || (mask & (1 << j))) continue;
          const t = (mask ^ (1 << i)) | (1 << j);
          const v = evalMask(t).profit;
          if (v > bv + EPS) { bv = v; bm = t; }
        }
      }
      if (bm === mask) return mask;
      mask = bm; cur = bv;
    }
  };
  const starts = [(1 << m) - 1, 0];
  for (let r = 0; r < restarts; r++) { let k = 0; for (let i = 0; i < m; i++) if (rnd() < 0.5) k |= 1 << i; starts.push(k); }
  for (const s of starts) {
    const mask = climb(evalMask(s).feasible ? s : 0);
    if (evalMask(mask).profit > evalMask(best).profit + EPS) best = mask;
  }
  return best;
}

test("each seating matches the earlier flow solver exactly", () => {
  let compared = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const { slots, students } = instance(seed, 1 + (seed % 9), seed % 40);
    const { evalMask, stu } = search(slots, students);
    const m = slots.length;
    for (let mask = 1; mask < 1 << m; mask += 1 + (seed % 5)) {
      const open = [];
      for (let i = 0; i < m; i++) if (mask & (1 << i)) open.push(i);
      assert.deepEqual(evalMask(mask), oldSeat(open, slots, stu, null), `seed ${seed} mask ${mask}`);
      compared++;
    }
  }
  assert.ok(compared > 1000, String(compared));
});

test("pruned search picks the same plan as solving every mask", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const m = seed % 2 ? 6 + (seed % 5) : 11 + (seed % 3);
    const { slots, students } = instance(1000 + seed, m, 15 + 2 * seed);
    const opts = seed % 3 ? {} : { seed, restarts: 4 };
    const r = search(slots, students, opts);
    assert.equal(r.best, oldBest(m, r.evalMask, opts), `seed ${seed}`);
  }
});

test("baseline still prices every slot open with minimums relaxed", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { slots, students } = instance(2000 + seed, 3 + (seed % 10), 4 + 2 * seed);
    const r = analyze(slots, students);
    const relaxed = slots.map((s) => ({ ...s, min: 1 }));
    const all = search(relaxed, students, { exactLimit: 0, restarts: 0 }).evalMask((1 << slots.length) - 1);
    assert.equal(r.baseline, all.revenue - all.runCost);
  }
});
