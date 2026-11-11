import test from "node:test";
import assert from "node:assert/strict";
import { carryOverFromOpponents, lowCarryOverRounds, lowCarryOverDoubleRounds, starterOpp, starterApplies, STARTERS, circleOpp } from "./carryover.mjs";

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
    assert.ok(now.start === "starter" || now.start === "circle");
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
