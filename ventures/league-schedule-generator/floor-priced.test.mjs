// A timetable search priced on the proved break floor (README "Pricing the break floor",
// carryover.mjs floorPricedSingleRounds) and the incremental floor it uses (orient.mjs floorTable).
import test from "node:test";
import assert from "node:assert/strict";
import { floorTable, leastBreaks, countBreaks } from "./orient.mjs";
import { floorPricedSingleRounds, carryOverTry, carryOver, circleOpp } from "./carryover.mjs";
import { mulberry32 } from "./calc.mjs";

const coeOf = (rounds, n) => carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds }).value;
function oppOf(rounds, n) {
  const N = n % 2 ? n + 1 : n;
  return rounds.map((rd) => {
    const o = new Int16Array(N).fill(N - 1);
    for (const [a, b] of rd.matches) { o[a] = b; o[b] = a; }
    return o;
  });
}

test("floorTable prices a changed timetable as the whole programme does, rounds swapped and kept or undone", () => {
  for (const N of [6, 10, 14]) for (const n of [N, N - 1]) {
    const opp = circleOpp(N).map((o) => Int16Array.from(o));
    const R = opp.length, tb = floorTable(opp, n), rand = mulberry32(N * 7 + n);
    assert.equal(tb.floor, leastBreaks(opp, n, { budget: 0 }).floor);
    for (let i = 0; i < 60; i++) {
      const r = Math.floor(rand() * R), s = Math.floor(rand() * R);
      if (r === s) continue;
      [opp[r], opp[s]] = [opp[s], opp[r]];
      assert.equal(tb.trial(Math.min(r, s)), leastBreaks(opp, n, { budget: 0 }).floor, `${n} teams, move ${i}`);
      if (rand() < 0.5) tb.commit(); else [opp[r], opp[s]] = [opp[s], opp[r]];
    }
  }
});

test("floorTable refuses a timetable too big for the programme", () => {
  assert.equal(floorTable(circleOpp(28), 28), null);
});

for (const n of [8, 9, 12, 13]) {
  test(`floorPricedSingleRounds: a valid ${n}-team single round robin within its cap, recounted`, () => {
    const start = carryOverTry(n, 0, { seed: 1, weighted: 8 });
    const cap = Math.max(0, start.breaks - 2);
    const r = floorPricedSingleRounds(n, start, { seed: 2, maxBreaks: cap, iterations: 400 });
    assert.ok(r && r.floorPriced);
    const N = n % 2 ? n + 1 : n;
    assert.equal(r.rounds.length, N - 1);
    const met = new Set();
    for (const rd of r.rounds) {
      const seen = new Set();
      for (const [h, a] of rd.matches) {
        assert.ok(!seen.has(h) && !seen.has(a), "nobody twice in a round");
        seen.add(h); seen.add(a);
        const k = `${Math.min(h, a)}-${Math.max(h, a)}`;
        assert.ok(!met.has(k), "every pair once"); met.add(k);
      }
    }
    assert.equal(met.size, (n * (n - 1)) / 2);
    const opp = oppOf(r.rounds, n);
    const venues = r.rounds.map((rd) => { const v = new Uint8Array(N); for (const [h] of rd.matches) v[h] = 1; return v; });
    for (let t = 0; t < n; t++) {
      let h = 0, g = 0;
      for (let x = 0; x < opp.length; x++) if (opp[x][t] < n) { g++; h += venues[x][t]; }
      assert.ok(Math.abs(2 * h - g) <= 1, `team ${t} balanced`);
    }
    assert.equal(countBreaks(venues, opp, n), r.breaks);
    assert.equal(coeOf(r.rounds, n), r.coe);
    assert.ok(r.floor <= r.breaks);
    // the grounds are the least this timetable allows
    assert.equal(leastBreaks(opp, n).least, r.breaks);
    assert.ok(r.breaks <= cap || r.breaks <= start.breaks, "within the cap, or no worse than the start");
  });
}

test("floorPricedSingleRounds is seeded, and refuses what it cannot take", () => {
  const start = carryOverTry(10, 0, { seed: 1, weighted: 8 });
  const a = floorPricedSingleRounds(10, start, { seed: 3, maxBreaks: 6, iterations: 300 });
  const b = floorPricedSingleRounds(10, start, { seed: 3, maxBreaks: 6, iterations: 300 });
  assert.deepEqual(a, b);
  assert.throws(() => floorPricedSingleRounds(10, start, { maxBreaks: -1 }));
  assert.throws(() => floorPricedSingleRounds(26, start, { maxBreaks: 10 }));
  assert.throws(() => floorPricedSingleRounds(12, start, { maxBreaks: 10 }));
});

test("floorPricedSingleRounds at 20 teams: 360 / 50 to a 48-break cap gives 410 / 48 (seed 1)", { timeout: 120000 }, () => {
  const start = carryOverTry(20, 0, { seed: 1, weighted: 8 });
  assert.equal(start.coe, 360);
  const r = floorPricedSingleRounds(20, start, { seed: 1, maxBreaks: 48, iterations: 6000 });
  assert.equal(`${r.coe}/${r.breaks}`, "410/48");
  assert.ok(r.leastProved);
});
