import test from "node:test";
import assert from "node:assert/strict";
import { carryOverFromOpponents, lowCarryOverRounds, lowCarryOverDoubleRounds, starterOpp, starterApplies, STARTERS, STARTERS_WEIGHTED, STARTERS_SHIFT, circleOpp, assignVenues, venueCost, TIMETABLES, storedTimetable, starterPartner, shiftOrientation, shiftVenues, starterShiftVenues, pairHostsOf, venuesFromHosts } from "./carryover.mjs";

// pinned values of the stored timetables (carryover.mjs TIMETABLES)
const STORED_VALUES = { "12/even": 136, "10/odd": 69 };

const seqs = (opp, n) => Array.from({ length: n }, (_, t) => opp.map((o) => o[t]).filter((u) => u < n));
const decode = ([step, ...flat]) => ({ step, pairs: Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]) });

function checkTimetable(opp, N) {
  assert.equal(opp.length, N - 1);
  const met = new Set();
  for (const o of opp) for (let t = 0; t < N; t++) {
    const u = o[t];
    assert.ok(u !== t && o[u] === t, "each round pairs every team");
    met.add(Math.min(t, u) * 1000 + Math.max(t, u));
  }
  assert.equal(met.size, (N * (N - 1)) / 2, "every pair meets once");
}

test("every built-in starter, at every start, is a round robin", () => {
  for (const [key, entry] of Object.entries(STARTERS)) {
    const N = Number(key);
    assert.ok(starterApplies(N) && N % 2 === 0);
    for (const kind of ["even", "odd"]) {
      const { step, pairs } = decode(entry[kind]);
      for (const start of [0, 1, N - 2]) checkTimetable(starterOpp(N, pairs, { step, start }), N);
    }
  }
  assert.ok(!starterApplies(16) && !starterApplies(8) && !starterApplies(42));
});

test("the circle method is the starter {i, -i}", () => {
  const N = 12, p = N - 1;
  const pairs = Array.from({ length: (p - 1) / 2 }, (_, i) => [i + 1, p - i - 1]);
  const s = starterOpp(N, pairs);
  const c = circleOpp(N);
  // same rounds up to the order: the set of matchings is the same
  const key = (o) => Array.from(o).join(",");
  assert.deepEqual(s.map(key).sort(), c.map(key).sort());
});

test("starterOpp refuses a non-starter or a step that shares a factor with N - 1", () => {
  assert.throws(() => starterOpp(10, [[1, 2], [3, 4], [5, 6], [7, 8]]), /share a difference/);
  assert.throws(() => starterOpp(10, [[1, 4], [2, 6], [3, 5]]), /once/);
  const { pairs } = decode(STARTERS[10].even);
  assert.throws(() => starterOpp(10, pairs, { step: 3 }), /coprime/);
  assert.throws(() => starterOpp(11, pairs), /even/);
});

test("20 teams (and 19 with a bye): the starter reaches the floor, every count 0 or 1", () => {
  const { step, pairs } = decode(STARTERS[20].even);
  const opp = starterOpp(20, pairs, { step });
  const cyc = carryOverFromOpponents(seqs(opp, 20), { cyclic: true });
  assert.equal(cyc.value, 20 * 19, "Russell's cyclic bound");
  assert.equal(cyc.max, 1);
  for (const n of [20, 19]) {
    const r = lowCarryOverRounds(n, { effort: 0.2 });
    assert.equal(r.coe, r.lowerBound);
    assert.equal(r.start, "starter");
  }
  // the old circle start stopped well above it
  assert.ok(lowCarryOverRounds(20, { effort: 0.2, field: false }).coe > 400);
});

test("with a starter built in, the search never scores worse than the circle start alone", () => {
  for (const n of [11, 12, 13, 18, 22]) for (const breakWeight of [0, 10]) {
    const now = lowCarryOverRounds(n, { effort: 0.2, breakWeight });
    const old = lowCarryOverRounds(n, { effort: 0.2, breakWeight, field: false });
    assert.ok(now.coe + breakWeight * now.breaks <= old.coe + breakWeight * old.breaks, `${n} teams, weight ${breakWeight}`);
    assert.ok(["starter", "timetable", "circle", "weighted starter", "shift starter"].includes(now.start.replace(/, shift venues(, capped)?$/, "")));
  }
  for (const n of [12, 20]) {
    const now = lowCarryOverDoubleRounds(n, { effort: 0.2 });
    const old = lowCarryOverDoubleRounds(n, { effort: 0.2, field: false });
    assert.ok(now.coe <= old.coe, `${n}-team season`);
    assert.equal(now.repeats, 0);
  }
});

test("22 teams (and 21 with a bye): the climbed starter reaches the floor too, every count 0 or 1", () => {
  for (const [kind, n] of [["even", 22], ["odd", 21]]) {
    const { step, pairs } = decode(STARTERS[22][kind]);
    let best = Infinity;
    for (let start = 0; start < 21; start++) {
      const flat = carryOverFromOpponents(seqs(starterOpp(22, pairs, { step, start }), n));
      assert.equal(flat.max, 1);
      best = Math.min(best, flat.value);
      if (start === 0) {
        const cyc = carryOverFromOpponents(seqs(starterOpp(22, pairs, { step, start }), n), { cyclic: true });
        assert.equal(cyc.value, cyc.lowerBound, "Russell's cyclic bound");
      }
    }
    assert.equal(best, n === 22 ? 440 : 399);
  }
  for (const n of [22, 21]) {
    const r = lowCarryOverRounds(n, { effort: 0.2 });
    assert.equal(r.coe, r.lowerBound);
    assert.equal(r.start, "starter");
  }
});

test("the O(p) cyclic score (eval/starter-climb.mjs) equals the full carry-over count", async () => {
  const { cyclicScore } = await import("./eval/starter-climb.mjs");
  for (const [key, entry] of Object.entries(STARTERS)) {
    const N = Number(key), p = N - 1;
    for (const kind of ["even", "odd"]) {
      const { step, pairs } = decode(entry[kind]);
      // step k with S is step 1 with S / k up to relabelling; score the relabelled starter
      let inv = 1;
      while ((inv * step) % p !== 1) inv++;
      const f = new Int16Array(p);
      for (const [x, y] of pairs) { const a = (x * inv) % p, b = (y * inv) % p; f[a] = b; f[b] = a; }
      const n = kind === "even" ? N : N - 1;
      const counted = carryOverFromOpponents(seqs(starterOpp(N, pairs, { step }), n), { cyclic: true }).value;
      assert.equal(p * cyclicScore(f, p, kind === "odd") + (kind === "odd" ? 0 : 2 * p), counted, `${N} ${kind}`);
    }
  }
});

test("climbed starters (eval/starter-climb.mjs) where they beat the annealed ones: 24, 30, 36, 38, 40 teams", () => {
  const best = (N, n) => {
    const { step, pairs } = decode(STARTERS[N][n === N ? "even" : "odd"]);
    let v = Infinity;
    for (let start = 0; start < N - 1; start++) v = Math.min(v, carryOverFromOpponents(seqs(starterOpp(N, pairs, { step, start }), n)).value);
    return v;
  };
  for (const [N, even, odd] of [[24, 570, 565], [26, 716, 665], [30, 948, 891], [34, 1274, 1269], [36, 1422, 1419], [38, 1648, 1575], [40, 1816, 1813]]) {
    assert.equal(best(N, N), even, `${N} teams`);
    assert.equal(best(N, N - 1), odd, `${N - 1} teams`);
  }
});

test("stored timetables (eval/round-refill.mjs) are round robins and beat the starters they replace", () => {
  for (const [key, entry] of Object.entries(TIMETABLES)) {
    const N = Number(key);
    assert.ok(starterApplies(N));
    for (const kind of Object.keys(entry)) {
      const n = kind === "even" ? N : N - 1;
      const opp = storedTimetable(N, n);
      checkTimetable(opp, N);
      const stored = carryOverFromOpponents(seqs(opp, n)).value;
      assert.equal(stored, STORED_VALUES[`${N}/${kind}`], `${N} ${kind}`);
      if (STARTERS[N]) {
        const { step, pairs } = decode(STARTERS[N][kind]);
        let best = Infinity;
        for (let start = 0; start < N - 1; start++) best = Math.min(best, carryOverFromOpponents(seqs(starterOpp(N, pairs, { step, start }), n)).value);
        assert.ok(stored < best, `${N} ${kind}: stored ${stored} vs starter ${best}`);
      }
      // the search starts from it and keeps it or better
      const r = lowCarryOverRounds(n, { effort: 0.2 });
      assert.ok(r.coe <= stored, `${n} teams: ${r.coe} > ${stored}`);
    }
  }
});

test("every break-weighted starter (STARTERS_WEIGHTED) is a round robin, for a size STARTERS has", () => {
  for (const [key, entry] of Object.entries(STARTERS_WEIGHTED)) {
    const N = Number(key);
    assert.ok(starterApplies(N), `${N} has a STARTERS entry too`);
    for (const kind of Object.keys(entry)) {
      assert.ok(kind === "even" || kind === "odd");
      const { step, pairs } = decode(entry[kind]);
      checkTimetable(starterOpp(N, pairs, { step }), N);
    }
  }
});

test("a starter's start is a relabelling: carry-over is the same at every start", () => {
  for (const N of [12, 18, 26]) for (const kind of ["even", "odd"]) {
    const n = kind === "even" ? N : N - 1;
    const { step, pairs } = decode(STARTERS[N][kind]);
    const vals = new Set();
    for (let start = 0; start < N - 1; start++) vals.add(carryOverFromOpponents(seqs(starterOpp(N, pairs, { step, start }), n)).value);
    assert.equal(vals.size, 1, `${n} teams`);
  }
});

test("26 teams: the weighted starter has STARTERS' carry-over with far fewer breaks (716 / 74 against 716 / 104)", () => {
  const breaks = (opp, n) => {
    const v = assignVenues(opp, n, 1, 4);
    let b = 0;
    for (let t = 0; t < n; t++) { let last = null; for (let r = 0; r < opp.length; r++) { if (last === v[r][t]) b++; last = v[r][t]; } }
    return b;
  };
  const a = decode(STARTERS[26].even), w = decode(STARTERS_WEIGHTED[26].even);
  const oa = starterOpp(26, a.pairs, { step: a.step }), ow = starterOpp(26, w.pairs, { step: w.step });
  assert.equal(carryOverFromOpponents(seqs(oa, 26)).value, 716);
  assert.equal(carryOverFromOpponents(seqs(ow, 26)).value, 716);
  assert.ok(breaks(ow, 26) <= 80 && breaks(oa, 26) >= 96, `${breaks(ow, 26)} vs ${breaks(oa, 26)}`);
});

test("with a break weight, the weighted-starter run is kept only when strictly better", () => {
  for (const n of [12, 18]) for (const double of [false, true]) {
    const run = (weightedStarter) => (double ? lowCarryOverDoubleRounds : lowCarryOverRounds)(n, { effort: 0.2, breakWeight: 10, weightedStarter });
    const score = (r) => r.coe + 10 * r.breaks + 1000 * (r.repeats || 0);
    const now = run(true), old = run(false);
    assert.ok(score(now) <= score(old), `${n} teams${double ? ", season" : ""}`);
    if (now.start !== "weighted starter") assert.equal(score(now), score(old));
  }
  // carry-over only: the weighted table is not used
  assert.notEqual(lowCarryOverRounds(12, { effort: 0.2 }).start, "weighted starter");
});

// --- shift venues (carryover.mjs shiftOrientation, shiftVenues; eval/starter-orient.mjs) ---

function breaksOf(venues, opp, n) {
  let b = 0;
  for (let t = 0; t < n; t++) {
    let last = null;
    for (let r = 0; r < opp.length; r++) {
      if (opp[r][t] >= n) { last = null; continue; }
      const v = venues[r][t] ? 1 : 0;
      if (last === v) b++;
      last = v;
    }
  }
  return b;
}
const pairsOfF = (f, p) => { const out = []; for (let x = 1; x < p; x++) if (x < f[x]) out.push([x, f[x]]); return out; };

test("shift venues: breaks are (p - 1)(E + 1), or (p - 1) E with a bye, and every team is balanced", () => {
  for (const table of [STARTERS, STARTERS_WEIGHTED, STARTERS_SHIFT]) for (const [key, entry] of Object.entries(table)) {
    const N = Number(key), p = N - 1;
    for (const kind of Object.keys(entry)) {
      const n = kind === "even" ? N : N - 1;
      const f = starterPartner(N, entry[kind]);
      const opp = starterOpp(N, pairsOfF(f, p), { step: 1 });
      checkTimetable(opp, N);
      // the step-1 timetable is the stored one renamed: same carry-over
      const { step, pairs } = decode(entry[kind]);
      assert.equal(carryOverFromOpponents(seqs(opp, n)).value, carryOverFromOpponents(seqs(starterOpp(N, pairs, { step }), n)).value, `${N} ${kind}`);
      const { E, H } = shiftOrientation(f, p);
      const venues = shiftVenues(N, f, H);
      for (let r = 0; r < p; r++) for (let t = 0; t < N; t++) assert.notEqual(venues[r][t], venues[r][opp[r][t]], "one host per match");
      const b = breaksOf(venues, opp, n);
      assert.equal(b, (p - 1) * (E + (n === N ? 1 : 0)), `${N} ${kind}`);
      assert.equal(venueCost(venues, opp, n), b, `${N} ${kind}: balanced`);
    }
  }
});

test("shift venues: the circle starter has E = 0 (N - 2 breaks, none with a bye); E is the least over every orientation", () => {
  for (const N of [8, 12, 20]) {
    const p = N - 1, f = new Int16Array(p);
    for (let i = 1; i < p; i++) f[i] = p - i;
    assert.equal(shiftOrientation(f, p).E, 0);
  }
  // brute force at 12 teams: every orientation of every built-in 12-team starter
  for (const table of [STARTERS, STARTERS_WEIGHTED]) for (const kind of ["even", "odd"]) {
    const entry = table[12]?.[kind];
    if (!entry) continue;
    const p = 11, f = starterPartner(12, entry), xs = pairsOfF(f, p).map(([x]) => x);
    let least = Infinity;
    for (let bits = 0; bits < 1 << xs.length; bits++) {
      const H = new Uint8Array(p);
      xs.forEach((x, i) => { H[x] = (bits >> i) & 1; H[f[x]] = 1 - H[x]; });
      let E = 0;
      for (let u = 2; u < p; u++) if (H[u] === H[u - 1]) E++;
      least = Math.min(least, E);
    }
    assert.equal(shiftOrientation(f, p).E, least);
  }
});

test("with a break weight, shift venues are kept only when strictly better, and halve odd leagues' breaks", () => {
  for (const n of [11, 13, 17, 23]) {
    const on = lowCarryOverRounds(n, { effort: 0.2, breakWeight: 10 });
    const off = lowCarryOverRounds(n, { effort: 0.2, breakWeight: 10, shift: false });
    assert.ok(on.coe + 10 * on.breaks <= off.coe + 10 * off.breaks, `${n} teams`);
    if (on.start.endsWith("shift venues")) assert.ok(on.coe + 10 * on.breaks < off.coe + 10 * off.breaks);
    const met = new Set();
    for (const rd of on.rounds) for (const [h, a] of rd.matches) met.add(Math.min(h, a) * 100 + Math.max(h, a));
    assert.equal(met.size, (n * (n - 1)) / 2);
  }
  // 23 teams: the 24-team starter as it is, 565 carry-over and 44 breaks (the venue search: 127)
  const r = lowCarryOverRounds(23, { effort: 0.2, breakWeight: 10 });
  assert.equal(r.start, "starter, shift venues");
  assert.equal(r.coe, 565);
  assert.equal(r.breaks, 44);
  // carry-over only: unchanged
  assert.ok(!lowCarryOverRounds(23, { effort: 0.2 }).start.endsWith("shift venues"));
});

test("home-and-away season: shift-venue leg ones are kept only when strictly better, and give a valid season", () => {
  const SCORE = (r) => r.coe + 1000 * r.repeats + 10 * r.breaks;
  for (const n of [11, 13]) {
    const on = lowCarryOverDoubleRounds(n, { effort: 0.2, breakWeight: 10 });
    const off = lowCarryOverDoubleRounds(n, { effort: 0.2, breakWeight: 10, shift: false });
    assert.ok(SCORE(on) <= SCORE(off), `${n} teams`);
    if (on.start.endsWith("shift venues")) assert.ok(SCORE(on) < SCORE(off));
    // each ordered pair once, legs opposite, every team n - 1 home games
    const legOf = new Map(), home = new Array(n).fill(0);
    for (const rd of on.rounds) for (const [h, a] of rd.matches) { assert.ok(!legOf.has(`${h}>${a}`)); legOf.set(`${h}>${a}`, rd.leg); home[h]++; }
    assert.equal(legOf.size, n * (n - 1));
    for (const [k, leg] of legOf) { const [h, a] = k.split(">"); assert.notEqual(legOf.get(`${a}>${h}`), leg); }
    assert.ok(home.every((x) => x === n - 1));
  }
  // carry-over only: unchanged
  assert.ok(!String(lowCarryOverDoubleRounds(11, { effort: 0.2 }).start).endsWith("shift venues"));
});

test("starter shift venues at any step and start: valid, (p - 1)(E + 1) breaks, and the pair hosts reproduce them", () => {
  for (const [N, e] of Object.entries(STARTERS).map(([k, v]) => [Number(k), v])) for (const kind of ["even", "odd"]) {
    const entry = e[kind];
    if (!entry) continue;
    const p = N - 1, n = kind === "even" ? N : N - 1;
    const { step, pairs } = decode(entry);
    const { E } = shiftOrientation(starterPartner(N, entry), p);
    for (const start of [0, 1, p - 1]) {
      const opp = starterOpp(N, pairs, { step, start });
      const v = starterShiftVenues(N, entry, start);
      for (let r = 0; r < p; r++) for (let t = 0; t < N; t++) assert.notEqual(v[r][t], v[r][opp[r][t]], "the two sides of a match disagree");
      assert.equal(venueCost(v, opp, n), n === N ? (p - 1) * (E + 1) : (p - 1) * E, `${N} ${kind} start ${start}`);
      assert.deepEqual(venuesFromHosts(opp, pairHostsOf(opp, v)), v);
    }
  }
});

test("carried pair hosts: valid venues after moves, the seeded venue search never worse, and the search never worse with them", () => {
  const N = 24, entry = STARTERS[N].odd, n = 23;
  const { step, pairs } = decode(entry);
  const opp = starterOpp(N, pairs, { step });
  const hosts = pairHostsOf(opp, starterShiftVenues(N, entry));
  const moved = opp.map((o) => o.slice()).reverse(); // a round permutation keeps every pair
  [moved[0], moved[5]] = [moved[5], moved[0]];
  const v = venuesFromHosts(moved, hosts);
  for (let r = 0; r < moved.length; r++) for (let t = 0; t < N; t++) assert.notEqual(v[r][t], v[r][moved[r][t]]);
  assert.ok(venueCost(assignVenues(moved, n, 1, 8, { hosts }), moved, n) <= venueCost(assignVenues(moved, n, 1), moved, n));
  for (const size of [19, 23]) {
    const off = lowCarryOverRounds(size, { breakWeight: 10, shiftCapped: false, effort: 0.3 });
    const on = lowCarryOverRounds(size, { breakWeight: 10, shiftCapped: false, carryHosts: "seed", effort: 0.3 });
    assert.ok(on.coe + 10 * on.breaks <= off.coe + 10 * off.breaks, `${size} teams`);
  }
});

test("capped shift candidates: kept only when strictly better; 11 and 13 teams gain, and the season is valid", () => {
  for (const n of [11, 13]) {
    const off = lowCarryOverRounds(n, { breakWeight: 10, shiftCapped: false });
    const on = lowCarryOverRounds(n, { breakWeight: 10 });
    assert.ok(on.coe + 10 * on.breaks < off.coe + 10 * off.breaks, `${n} teams`);
    assert.match(on.start, /shift venues, capped$/);
    const met = new Set(), home = new Array(n).fill(0);
    for (const r of on.rounds) for (const [h, a] of r.matches) { met.add(Math.min(h, a) * 100 + Math.max(h, a)); home[h]++; }
    assert.equal(met.size, (n * (n - 1)) / 2, "every pair meets once");
    for (const h of home) assert.ok(Math.abs(2 * h - (n - 1)) <= 1, "balanced");
    assert.equal(carryOverFromOpponents(seqs(on.rounds.map((r) => { const o = new Int16Array(n + 1).fill(n); for (const [h, a] of r.matches) { o[h] = a; o[a] = h; } return o; }), n)).value, on.coe);
  }
});

test("field sizes with a bye: 15 and 31 teams take a shift starter with a break weight; 16 and carry-over only unchanged", () => {
  for (const [n, breaksBelow] of [[15, 35], [31, 100]]) {
    const off = lowCarryOverRounds(n, { breakWeight: 10, shift: false, effort: 0.3 });
    const on = lowCarryOverRounds(n, { breakWeight: 10, effort: 0.3 });
    assert.ok(on.coe + 10 * on.breaks < off.coe + 10 * off.breaks, `${n} teams`);
    assert.ok(on.breaks < breaksBelow, `${n} teams: ${on.breaks} breaks`);
    assert.equal(on.start, "shift starter, shift venues");
    const met = new Set();
    for (const r of on.rounds) for (const [h, a] of r.matches) met.add(Math.min(h, a) * 100 + Math.max(h, a));
    assert.equal(met.size, (n * (n - 1)) / 2);
  }
  assert.deepEqual(lowCarryOverRounds(15, { effort: 0.3 }).rounds, lowCarryOverRounds(15, { effort: 0.3, shift: false }).rounds);
  assert.equal(lowCarryOverRounds(16, { breakWeight: 10, effort: 0.3 }).start, undefined);
});
