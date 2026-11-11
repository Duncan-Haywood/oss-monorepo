import test from "node:test";
import assert from "node:assert/strict";
import { carryOverFromOpponents, lowCarryOverRounds, lowCarryOverDoubleRounds, starterOpp, starterApplies, STARTERS, circleOpp, TIMETABLES, storedTimetable } from "./carryover.mjs";

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
    assert.ok(["starter", "timetable", "circle"].includes(now.start));
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
