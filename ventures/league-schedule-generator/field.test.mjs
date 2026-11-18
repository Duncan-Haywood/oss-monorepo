import test from "node:test";
import assert from "node:assert/strict";
import { carryOverFromOpponents, lowCarryOverRounds, lowCarryOverDoubleRounds, fieldOpp, fieldGenerators, fieldApplies } from "./carryover.mjs";

const seqs = (opp, n) => Array.from({ length: n }, (_, t) => opp.map((o) => o[t]).filter((u) => u < n));

function checkTimetable(opp, N) {
  const met = new Set();
  for (const o of opp) for (let t = 0; t < N; t++) {
    const u = o[t];
    assert.ok(u !== t && o[u] === t, "each round pairs every team");
    met.add(Math.min(t, u) * 1000 + Math.max(t, u));
  }
  assert.equal(met.size, (N * (N - 1)) / 2, "every pair meets once");
}

test("field construction applies to powers of two from 4 to 128 only", () => {
  for (const N of [4, 8, 16, 32, 64, 128]) assert.ok(fieldApplies(N));
  for (const N of [2, 6, 10, 12, 18, 20, 24, 256]) assert.ok(!fieldApplies(N));
  assert.throws(() => fieldOpp(12), /power of two/);
  // the generator counts are Euler's phi(N - 1)
  assert.deepEqual([4, 8, 16, 32, 64].map((N) => fieldGenerators(N).length), [2, 6, 8, 30, 36]);
});

test("every field timetable is a round robin with every carry-over count 0 or 1", () => {
  for (const N of [4, 8, 16, 32]) {
    for (const generator of fieldGenerators(N)) for (const start of [0, 1, N - 2]) {
      const opp = fieldOpp(N, { generator, start });
      checkTimetable(opp, N);
      const cyc = carryOverFromOpponents(seqs(opp, N), { cyclic: true });
      assert.equal(cyc.value, N * (N - 1), "Russell's cyclic bound");
      assert.equal(cyc.max, 1);
      const flat = carryOverFromOpponents(seqs(opp, N));
      assert.equal(flat.value, flat.lowerBound);
      // with one team as the bye (7, 15, 31 teams) the floor is reached too
      const odd = carryOverFromOpponents(seqs(opp, N - 1));
      assert.equal(odd.value, odd.lowerBound);
      assert.equal(odd.max, 1);
    }
  }
});

test("the search reaches the floor at 15, 16, 31 and 32 teams (it fell short before)", () => {
  // before the field start (seed 1): 15 teams 259, 16 teams 316, 31 teams 1,459, 32 teams 1,538
  for (const n of [15, 16, 31, 32]) {
    const r = lowCarryOverRounds(n, { seed: 1, effort: 0.2 });
    assert.equal(r.coe, r.lowerBound, `${n} teams`);
  }
});

test("a break weight never scores worse than the field timetable itself", () => {
  for (const n of [15, 16]) {
    const plain = lowCarryOverRounds(n, { seed: 1, effort: 0.3 });
    const w = lowCarryOverRounds(n, { seed: 1, effort: 0.3, breakWeight: 10 });
    assert.ok(w.coe + 10 * w.breaks <= plain.coe + 10 * plain.breaks, `${n} teams`);
  }
});

test("16-team home-and-away season reaches its floor", () => {
  const d = lowCarryOverDoubleRounds(16, { seed: 1, effort: 0.3 });
  assert.equal(d.coe, d.lowerBound);
  assert.equal(d.coe, 912);
});
