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
function carryOverTry(n, i, opts) {
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
