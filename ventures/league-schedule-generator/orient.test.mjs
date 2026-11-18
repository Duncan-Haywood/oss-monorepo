// The exact break programme (orient.mjs): the least breaks a fixed timetable allows, in the page.
import test from "node:test";
import assert from "node:assert/strict";
import { leastBreaks, countBreaks, relaxedBreakFloor, minPlusStep, pairLeastBreaks } from "./orient.mjs";
import { mulberry32 } from "./calc.mjs";
import { carryOverTry as carryOverTryNow, polishSeasonVenues, circleOpp, TIMETABLES } from "./carryover.mjs";

// The 14-team seasons below were checked by MaxSAT (eval/orient-maxsat.txt) before the stored 14-team
// timetable (TIMETABLES[14], 2026-11-14) joined the search's starts, which changed some seeded tries
// (each to a better score on its own weight). They are rebuilt without that start so the proofs still
// apply to the same timetables.
//
// The tries are only inputs here (orient.mjs is the subject), and they are about 44 of this file's
// 47 s. Two tests share a try (14 teams try 3 double, 20 teams try 0), so each is searched once per
// file and every caller gets its own copy (docs/history/ci-perf-2026-11-16-orient-tries-memo.md).
const searched = new Map();
function carryOverTry(n, i, opts) {
  const key = `${n} ${i} ${JSON.stringify(opts)}`;
  if (!searched.has(key)) searched.set(key, searchTry(n, i, opts));
  return structuredClone(searched.get(key));
}
function searchTry(n, i, opts) {
  if (n !== 14) return carryOverTryNow(n, i, opts);
  const saved = TIMETABLES[14];
  delete TIMETABLES[14];
  try { return carryOverTryNow(n, i, opts); } finally { TIMETABLES[14] = saved; }
}

function oppOf(rounds, n) {
  const N = n % 2 ? n + 1 : n;
  return rounds.map((rd) => {
    const o = new Int16Array(N).fill(N - 1);
    for (const [a, b] of rd.matches) { o[a] = b; o[b] = a; }
    return o;
  });
}
function balanced(venues, opp, n, span = opp.length) {
  for (let t = 0; t < n; t++) {
    let h = 0, g = 0;
    for (let r = 0; r < span; r++) if (opp[r][t] < n) { g++; h += venues[r][t]; }
    if (Math.abs(2 * h - g) > 1) return false;
  }
  return true;
}
// every host choice of a small timetable, counted: the programme must agree with brute force
function brute(opp, n) {
  const ms = [];
  opp.forEach((o, r) => { for (let t = 0; t < n; t++) if (o[t] < n && t < o[t]) ms.push([r, t, o[t]]); });
  let floor = Infinity, least = Infinity;
  for (let x = 0; x < 1 << ms.length; x++) {
    const v = opp.map((o) => new Uint8Array(o.length));
    ms.forEach(([r, a, b], k) => { const h = (x >>> k) & 1; v[r][a] = h; v[r][b] = 1 - h; });
    const b = countBreaks(v, opp, n);
    if (b < floor) floor = b;
    if (b < least && balanced(v, opp, n)) least = b;
  }
  return { floor, least };
}

test("leastBreaks agrees with every host choice counted, 6 teams and 5 teams (byes)", () => {
  for (const n of [5, 6]) for (let i = 0; i < 6; i++) {
    const t = carryOverTry(n, i, { seed: 1 + i, weighted: 8 });
    const opp = oppOf(t.rounds, n);
    const r = leastBreaks(opp, n, { seed: i + 1 });
    const b = brute(opp, n);
    assert.equal(r.floor, b.floor, `${n}/${i} floor`);
    assert.equal(r.least, b.least, `${n}/${i} least`);
    assert.ok(r.proved);
    assert.equal(countBreaks(r.venues, opp, n), r.least);
    assert.ok(balanced(r.venues, opp, n));
  }
});

test("the circle method allows the textbook n - 2 breaks", () => {
  for (const n of [8, 10, 12]) {
    const r = leastBreaks(circleOpp(n), n);
    assert.equal(r.least, n - 2);
    assert.ok(r.proved && r.balanced);
  }
});

test("20 teams' 360 timetable: 50 breaks, as eval/orient-maxsat.py proved, in the page", () => {
  const t = carryOverTry(20, 0, { seed: 1, weighted: 8 });
  assert.equal(t.coe, 360);
  const opp = oppOf(t.rounds, 20);
  const r = leastBreaks(opp, 20);
  assert.equal(r.least, 50);
  assert.ok(r.proved && r.balanced);
  assert.equal(countBreaks(r.venues, opp, 20), 50);
  assert.ok(balanced(r.venues, opp, 20));
});

test("an unbalanced floor: the least balanced host choice is proved above it (14 teams, try 4)", () => {
  const t = carryOverTry(14, 4, { seed: 1, weighted: 8 });
  const r = leastBreaks(oppOf(t.rounds, 14), 14);
  assert.equal(r.floor, 18);
  assert.equal(r.least, 20); // eval/orient-maxsat.py: 20
  assert.ok(r.proved);
});

test("too big or out of budget: null, or the floor with least null", () => {
  assert.equal(leastBreaks(circleOpp(26), 26), null);
  const t = carryOverTry(20, 5, { seed: 1, weighted: 8 });
  const r = leastBreaks(oppOf(t.rounds, 20), 20, { budget: 1000 });
  assert.equal(r.floor, 34);
  assert.equal(r.least, null);
  assert.equal(r.proved, false);
  assert.equal(r.breaks, 34);
});

test("relaxedBreakFloor never exceeds a home-and-away season's breaks", () => {
  for (const n of [8, 9, 10]) {
    const t = carryOverTry(n, 0, { seed: 1, weighted: 8, double: true });
    const f = relaxedBreakFloor(oppOf(t.rounds, n), n);
    assert.ok(f <= t.breaks, `${n}: ${f} > ${t.breaks}`);
  }
});

test("polishSeasonVenues reaches 18 teams' 348 / 38 and 20 teams' 360 / 50, proved", () => {
  for (const [n, coe, least] of [[18, 348, 38], [20, 360, 50]]) {
    const t = carryOverTry(n, 0, { seed: 1, weighted: 8 });
    assert.equal(t.coe, coe);
    const p = polishSeasonVenues(n, t, { seed: 1 });
    assert.ok(p, `${n} regrounded`);
    assert.equal(p.breaks, least);
    assert.equal(p.coe, coe);
    assert.equal(p.leastProved, true);
  }
});

// the programme's step by the double loop it replaced (README "A faster break floor")
function stepByDoubleLoop(fr, A, B) {
  const masks = (ms) => Array.from({ length: 1 << ms.length }, (_, x) => ms.reduce((h, m, k) => h | (1 << ((x >>> k) & 1 ? m[0] : m[1])), 0));
  const HA = masks(A), HB = masks(B);
  const playsIn = (ms) => ms.reduce((p, [a, b]) => p | (1 << a) | (1 << b), 0);
  const both = playsIn(A) & playsIn(B);
  const g = new Int32Array(HB.length).fill(0x3fffffff);
  for (let x = 0; x < HA.length; x++) for (let y = 0; y < HB.length; y++) {
    let c = fr[x], s = ~(HA[x] ^ HB[y]) & both;
    while (s) { s &= s - 1; c++; }
    if (c < g[y]) g[y] = c;
  }
  return g;
}

test("minPlusStep equals the double loop: byes, repeated pairs, any table to come", () => {
  const rand = mulberry32(11);
  const roundOf = (n, sitOut) => {
    const ts = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ts[i], ts[j]] = [ts[j], ts[i]]; }
    const ms = [];
    for (let i = sitOut; i + 1 < n; i += 2) ms.push([Math.min(ts[i], ts[i + 1]), Math.max(ts[i], ts[i + 1])]);
    return ms;
  };
  for (let it = 0; it < 300; it++) {
    const n = 4 + Math.floor(rand() * 13);
    const A = roundOf(n, Math.floor(rand() * 3)), B = it % 7 === 0 ? A.slice() : roundOf(n, Math.floor(rand() * 3));
    const fr = Int32Array.from({ length: 1 << A.length }, () => Math.floor(rand() * 25));
    assert.deepEqual(minPlusStep(fr, A, B), stepByDoubleLoop(fr, A, B), `n ${n} A ${JSON.stringify(A)} B ${JSON.stringify(B)}`);
  }
});

test("minPlusStep in WebAssembly equals the JS loop, whole (int16 and int32) and priced tables, 2 to 16 matches", async () => {
  const { MINPLUS_WASM_ON } = await import("./orient.mjs");
  process.env.MINPLUS_JS = "1";
  const js = await import("./orient.mjs?js-only");
  delete process.env.MINPLUS_JS;
  assert.equal(js.MINPLUS_WASM_ON, false);
  if (!MINPLUS_WASM_ON) return; // no WebAssembly here: both are the JS loop
  const rand = mulberry32(29);
  const roundOf = (n, sitOut) => {
    const ts = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ts[i], ts[j]] = [ts[j], ts[i]]; }
    const ms = [];
    for (let i = sitOut; i + 1 < n; i += 2) ms.push([Math.min(ts[i], ts[i + 1]), Math.max(ts[i], ts[i + 1])]);
    return ms;
  };
  for (let it = 0; it < 240; it++) {
    const n = it < 8 ? 32 : 4 + Math.floor(rand() * 23);
    const A = roundOf(n, Math.floor(rand() * 3)), B = it % 9 === 0 ? A.slice() : roundOf(n, Math.floor(rand() * 3));
    const fi = Int32Array.from({ length: 1 << A.length }, () => Math.floor(rand() * 40));
    const ff = Float64Array.from({ length: 1 << A.length }, () => rand() * 40);
    const msg = `n ${n} A ${JSON.stringify(A)} B ${JSON.stringify(B)}`;
    // whole-break tables under 30,000 run as int16 in the module (README "Whole-break tables in
    // int16"); a wide one, negatives included, keeps the int32 loop: both must equal the JS loop
    const fw = Int32Array.from({ length: 1 << A.length }, () => Math.floor(rand() * 2000000) - 1000000);
    const wi = minPlusStep(fi, A, B), wf = minPlusStep(ff, A, B), ww = minPlusStep(fw, A, B);
    assert.ok(wi instanceof Int32Array && wf instanceof Float64Array && ww instanceof Int32Array, msg);
    assert.deepEqual(wi, js.minPlusStep(fi, A, B), msg);
    assert.deepEqual(wf, js.minPlusStep(ff, A, B), msg);
    assert.deepEqual(ww, js.minPlusStep(fw, A, B), msg);
    // at the int16 edge: entries up to 29,999 plus up to 2 a step still fit
    const fe = Int32Array.from({ length: 1 << A.length }, () => 29999 - Math.floor(rand() * 3));
    assert.deepEqual(minPlusStep(fe, A, B), js.minPlusStep(fe, A, B), msg);
  }
});

test("minPlusStep's symmetric step (sym) equals the JS loop on every table with f[x] = f[~x]: byes, int16 and int32, 2 to 16 matches", async () => {
  const { MINPLUS_WASM_ON } = await import("./orient.mjs");
  process.env.MINPLUS_JS = "1";
  const js = await import("./orient.mjs?js-only-sym");
  delete process.env.MINPLUS_JS;
  const rand = mulberry32(41);
  const roundOf = (n, sitOut) => {
    const ts = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ts[i], ts[j]] = [ts[j], ts[i]]; }
    const ms = [];
    for (let i = sitOut; i + 1 < n; i += 2) ms.push([Math.min(ts[i], ts[i + 1]), Math.max(ts[i], ts[i + 1])]);
    return ms;
  };
  const symOf = (k, val) => { const f = new Int32Array(1 << k); for (let x = 0; x < f.length; x++) { const y = (~x) & (f.length - 1); f[x] = x < y ? val() : f[y]; } return f; };
  for (let it = 0; it < 240; it++) {
    const n = it < 8 ? 32 : 4 + Math.floor(rand() * 23);
    const A = roundOf(n, Math.floor(rand() * 3)), B = it % 9 === 0 ? A.slice() : roundOf(n, Math.floor(rand() * 3));
    const msg = `n ${n} A ${JSON.stringify(A)} B ${JSON.stringify(B)}`;
    for (const val of [() => Math.floor(rand() * 40), () => 29997 + Math.floor(rand() * 3), () => Math.floor(rand() * 2000000) - 1000000]) {
      const f = symOf(A.length, val), want = js.minPlusStep(f, A, B);
      const got = minPlusStep(f, A, B, { sym: true });
      assert.deepEqual(got, want, msg);
      // the output is symmetric too, so the next step may take sym as well
      for (let y = 0; y < got.length; y++) assert.equal(got[y], got[(~y) & (got.length - 1)], msg);
    }
  }
  if (!MINPLUS_WASM_ON) return;
  // and floorTable, which steps with sym, gives the same floor and trials as with it off
  const { floorTable } = await import("./orient.mjs");
  process.env.FLOOR_SYM = "0";
  const off = await import("./orient.mjs?no-sym");
  delete process.env.FLOOR_SYM;
  for (const n of [9, 14, 20, 24]) {
    const opp = oppOf(carryOverTry(n, 1, { seed: 3, weighted: 8 }).rounds, n);
    const a = floorTable(opp, n), b = off.floorTable(opp, n);
    assert.equal(a.floor, b.floor, `${n}`);
    for (const [lo, hi] of [[0, 2], [3, 3], [opp.length - 3, opp.length - 1], [1, opp.length - 2]]) assert.equal(a.trial(lo, hi), b.trial(lo, hi), `${n} ${lo}..${hi}`);
  }
});

test("floorTable's chained trials (steps kept in the module) give the stepped trials' least, commits and walks, 9 to 30 teams", async () => {
  // README "A trial's steps kept in the module": a trial's steps run in WebAssembly from one to the
  // next, its tables rebuilt only for a commit or a walk; chain: false steps every table out as before
  const { floorTable, MINPLUS_WASM_ON } = await import("./orient.mjs");
  if (!MINPLUS_WASM_ON) return;
  for (const n of [9, 14, 20, 24, 27, 28, 30]) {
    const opp = oppOf(carryOverTry(n, 1, { seed: 3, weighted: 8 }).rounds, n), R = opp.length;
    const a = floorTable(opp, n, { maxMatches: 15 }), b = floorTable(opp, n, { maxMatches: 15, chain: false });
    assert.equal(a.floor, b.floor, `${n}`);
    for (let i = 0; i < 30; i++) {
      // swap two rounds, so every trial is a real move; keep a third of them
      const lo = (i * 7) % R, hi = Math.min(R - 1, lo + (i % 5) * 3);
      [opp[lo], opp[hi]] = [opp[hi], opp[lo]];
      assert.equal(a.trial(lo, hi), b.trial(lo, hi), `${n} ${lo}..${hi}`);
      if (i % 3 === 0) { a.commit(); b.commit(); } else [opp[lo], opp[hi]] = [opp[hi], opp[lo]];
      if (i % 7 === 0) {
        const cap = a.trial(0, 1) + 4;
        assert.equal(b.trial(0, 1) + 4, cap, `${n} walk trial`);
        assert.deepEqual(a.balanced(cap, { budget: 2000 }), b.balanced(cap, { budget: 2000 }), `${n} walk`);
        a.commit(); b.commit();
      }
    }
  }
});

test("a 24-team break floor in seconds, not minutes (12 matches a round)", () => {
  const tries = carryOverTry(24, 0, { seed: 1, weighted: 8 });
  const t = Date.now();
  const r = leastBreaks(oppOf(tries.rounds, 24), 24, { budget: 0 });
  assert.ok(r && Number.isInteger(r.floor) && r.floor >= 0);
  assert.ok(Date.now() - t < 5000, `took ${Date.now() - t} ms`);
});

test("the walk's kept predecessor lists change nothing: same least, proof, steps and hosts as scanning afresh", () => {
  // README "A walk that remembers its predecessors": nearOf keeps each (round, hosts) state's
  // predecessor list; filtering it by slack must give the fresh scan's choices in the same order,
  // so the seeded walk takes the same path. nearCache 0 keeps nothing (the old walk); 300 fills up
  // part-way through, so both kept and unkept states are visited in one walk.
  // timetables: the circle method with its rounds shuffled and its teams relabelled (odd n: the
  // last team of n + 1 is the bye), which leaves a walk real work at every size
  const rand = mulberry32(2026);
  const shuffled = (n) => {
    const N = n % 2 ? n + 1 : n, perm = [...Array(N).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const opp = circleOpp(N).map((o) => { const q = new Int16Array(N); for (let t = 0; t < N; t++) q[perm[t]] = perm[o[t]]; return q; });
    for (let i = opp.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opp[i], opp[j]] = [opp[j], opp[i]]; }
    return opp;
  };
  let cases = 0, walked = 0;
  for (const n of [7, 9, 10, 13, 14, 16]) for (let i = 0; i < 4; i++) {
    const opp = shuffled(n);
    for (const span of [opp.length, Math.ceil(opp.length / 2)]) {
      const opts = { seed: 3 + i, budget: 40000, span };
      const a = leastBreaks(opp, n, { ...opts, nearCache: 0 });
      for (const nearCache of [300, undefined]) {
        const b = leastBreaks(opp, n, { ...opts, nearCache });
        assert.equal(b.least, a.least, `${n}/${i}/${span} least`);
        assert.equal(b.proved, a.proved, `${n}/${i}/${span} proved`);
        assert.equal(b.steps, a.steps, `${n}/${i}/${span} steps`);
        assert.deepEqual(b.venues.map((v) => [...v]), a.venues.map((v) => [...v]), `${n}/${i}/${span} hosts`);
      }
      cases++; walked += a.steps;
    }
  }
  assert.equal(cases, 48);
  assert.ok(walked > 1000, `the walks did some work (${walked} steps)`);
});

test("the balance-guided walk: the old order's least and proof whenever both finish, balanced hosts with that many breaks", async () => {
  // README "Starting under the gap": balancedWalk first tries a round's equally cheap host choices in
  // order of how even they leave home and away (half the budget), then the old seeded order on the
  // rest from the first unfinished level. A finished walk's least is order-free, so when both finish
  // they agree; WALK_UNGUIDED = 1 loads the old order alone.
  process.env.WALK_UNGUIDED = "1";
  const old = await import("./orient.mjs?unguided");
  delete process.env.WALK_UNGUIDED;
  const rand = mulberry32(2027);
  const shuffled = (n) => {
    const N = n % 2 ? n + 1 : n, perm = [...Array(N).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const opp = circleOpp(N).map((o) => { const q = new Int16Array(N); for (let t = 0; t < N; t++) q[perm[t]] = perm[o[t]]; return q; });
    for (let i = opp.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opp[i], opp[j]] = [opp[j], opp[i]]; }
    return opp;
  };
  let both = 0, fewer = 0;
  for (const n of [7, 9, 10, 13, 14, 16]) for (let i = 0; i < 4; i++) {
    const opp = shuffled(n);
    for (const span of [opp.length, Math.ceil(opp.length / 2)]) {
      const opts = { seed: 3 + i, budget: 40000, span };
      const a = old.leastBreaks(opp, n, opts), b = leastBreaks(opp, n, opts);
      assert.equal(b.floor, a.floor);
      if (b.least != null) {
        assert.equal(countBreaks(b.venues, opp, n), b.least, `${n}/${i}/${span} breaks`);
        assert.ok(balanced(b.venues, opp, n, span), `${n}/${i}/${span} balanced`);
      }
      if (a.proved && b.proved) { assert.equal(b.least, a.least, `${n}/${i}/${span} least`); both++; }
      if (a.least != null && b.least != null) assert.equal(b.least, a.least, `${n}/${i}/${span} found`);
      if (b.steps < a.steps) fewer++;
    }
  }
  assert.ok(both >= 24, `both proved in ${both} of 48`);
  assert.ok(fewer >= 24, `the guided walk took fewer steps in ${fewer} of 48`);
  // a budget the guided half cannot finish in: the old order runs on, and a proof still means the least
  const opp = shuffled(14), full = old.leastBreaks(opp, 14, { seed: 1, budget: 200000 });
  for (const budget of [30, 60, 200, 2000]) {
    const b = leastBreaks(opp, 14, { seed: 1, budget });
    assert.ok(b.steps <= budget, `${b.steps} steps on ${budget}`);
    if (b.proved) assert.equal(b.least, full.least);
  }
});

// every pair-host choice of a small home-and-away timetable, counted: the pair keeps one host (at
// home in its first game, away in its return), balance over leg one
function brutePairs(opp, n) {
  const first = new Map();
  opp.forEach((o, r) => { for (let t = 0; t < n; t++) if (o[t] < n && t < o[t] && !first.has(t * 64 + o[t])) first.set(t * 64 + o[t], r); });
  const keys = [...first.keys()];
  let least = Infinity;
  for (let x = 0; x < 1 << keys.length; x++) {
    const v = opp.map((o) => new Uint8Array(o.length));
    keys.forEach((key, k) => {
      const a = key >> 6, b = key & 63, h = (x >>> k) & 1;
      opp.forEach((o, r) => { if (o[a] === b) { const hh = r === first.get(key) ? h : 1 - h; v[r][a] = hh; v[r][b] = 1 - hh; } });
    });
    const b = countBreaks(v, opp, n);
    if (b < least && balanced(v, opp, n, opp.length / 2)) least = b;
  }
  return least;
}
function keepsPairs(venues, opp, n) {
  const seen = new Map();
  for (let r = 0; r < opp.length; r++) for (let t = 0; t < n; t++) {
    const u = opp[r][t];
    if (u >= n || t > u) continue;
    if (!seen.has(t * 64 + u)) seen.set(t * 64 + u, venues[r][t]);
    else if (seen.get(t * 64 + u) === venues[r][t]) return false;
  }
  return true;
}

test("pairLeastBreaks agrees with every pair-host choice counted, 4 to 6 teams home and away", () => {
  let checked = 0;
  for (const n of [4, 5, 6]) for (let i = 0; i < 6; i++) {
    const t = carryOverTry(n, i, { seed: 1 + i, weighted: 8, double: true });
    const opp = oppOf(t.rounds, n);
    const want = brutePairs(opp, n);
    const r = pairLeastBreaks(opp, n);
    assert.ok(r, `${n}/${i}`);
    assert.equal(r.proved, true, `${n}/${i} proved`);
    assert.equal(r.least, want, `${n}/${i}: ${r.least} vs brute ${want}`);
    assert.ok(r.floor <= want && r.relaxed <= r.floor, `${n}/${i} floors ${r.relaxed} <= ${r.floor} <= ${want}`);
    assert.equal(countBreaks(r.venues, opp, n), want);
    assert.ok(keepsPairs(r.venues, opp, n) && balanced(r.venues, opp, n, opp.length / 2));
    checked++;
  }
  assert.equal(checked, 18);
});

test("pairLeastBreaks: 14 teams' 1,014 / 46 needs 44 and 1,118 / 44 needs 42 (the MaxSAT proofs), seeded", () => {
  for (const [i, coe, before, least] of [[3, 1014, 46, 44], [7, 1118, 44, 42]]) {
    const t = carryOverTry(14, i, { seed: 1, weighted: 8, double: true });
    assert.equal(t.coe, coe);
    assert.equal(t.breaks, before);
    const opp = oppOf(t.rounds, 14);
    const r = pairLeastBreaks(opp, 14, { upperHint: t.breaks });
    assert.equal(r.least, least);
    assert.equal(r.proved, true);
    assert.equal(countBreaks(r.venues, opp, 14), least);
    assert.ok(keepsPairs(r.venues, opp, 14) && balanced(r.venues, opp, 14, opp.length / 2));
    assert.deepEqual(pairLeastBreaks(opp, 14, { upperHint: t.breaks }).venues, r.venues);
  }
});

test("pairLeastBreaks with a season already at its least proves it and returns no grounds", () => {
  const t = carryOverTry(12, 0, { seed: 1, weighted: 8, double: true }); // 602 / 40, MaxSAT 40
  const r = pairLeastBreaks(oppOf(t.rounds, 12), 12, { upperHint: t.breaks });
  assert.equal(r.least, 40);
  assert.equal(r.proved, true);
  assert.equal(r.venues, null);
});

test("pairLeastBreaks out of nodes: not proved, never worse than the hint", () => {
  const t = carryOverTry(12, 11, { seed: 1, weighted: 8, double: true });
  const r = pairLeastBreaks(oppOf(t.rounds, 12), 12, { upperHint: t.breaks, maxNodes: 3 });
  assert.equal(r.proved, false);
  assert.ok(r.least <= t.breaks);
});

test("polishSeasonVenues regrounds 14 teams' home-and-away 1,014 / 46 to 44, proved", () => {
  const t = carryOverTry(14, 3, { seed: 1, weighted: 8, double: true });
  const p = polishSeasonVenues(14, t, { seed: 1 });
  assert.ok(p);
  assert.equal(p.coe, 1014);
  assert.equal(p.breaks, 44);
  assert.equal(p.leastProved, true);
});
