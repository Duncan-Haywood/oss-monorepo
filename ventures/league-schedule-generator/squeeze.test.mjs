import test from "node:test";
import assert from "node:assert/strict";
import { squeezeDoubleRounds, squeezeSingleRounds, lowCarryOverRounds, squeezeTargets, carryOverSqueeze, carryOverSqueezes, carryOverTry, lowCarryOverDoubleRounds, bestCarryOverRounds, carryOver } from "./carryover.mjs";

function breaksOf(n, rounds) {
  const last = Array(n).fill(null);
  let b = 0;
  for (const r of rounds) {
    const seen = new Set();
    for (const [h, a] of r.matches) {
      if (last[h] === "H") b++;
      if (last[a] === "A") b++;
      last[h] = "H"; last[a] = "A"; seen.add(h); seen.add(a);
    }
    for (let t = 0; t < n; t++) if (!seen.has(t)) last[t] = null;
  }
  return b;
}

// every pair meets once a leg, the return game at the other ground; leg one balanced within one
function checkSeason(rounds, n) {
  const N = n % 2 ? n + 1 : n, R = N - 1;
  assert.equal(rounds.length, 2 * R);
  const hostOf = new Map();
  for (let leg = 0; leg < 2; leg++) {
    const seen = new Set();
    for (const r of rounds.slice(leg * R, leg * R + R)) {
      assert.equal(r.leg, leg);
      const used = new Set();
      for (const [h, a] of r.matches) {
        assert.ok(h !== a && h >= 0 && a >= 0 && h < n && a < n);
        assert.ok(!used.has(h) && !used.has(a), "a team plays twice in a round");
        used.add(h); used.add(a);
        const k = `${Math.min(h, a)}-${Math.max(h, a)}`;
        assert.ok(!seen.has(k), `${k} meets twice in leg ${leg + 1}`);
        seen.add(k);
        if (leg === 0) hostOf.set(k, h); else assert.equal(hostOf.get(k), a, `${k} returns at the same ground`);
      }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
  }
  const home = Array(n).fill(0), games = Array(n).fill(0);
  for (const r of rounds.slice(0, R)) for (const [h, a] of r.matches) { home[h]++; games[h]++; games[a]++; }
  for (let t = 0; t < n; t++) assert.ok(Math.abs(2 * home[t] - games[t]) <= 1, `team ${t} unbalanced in leg one`);
}

for (const n of [8, 9, 12]) {
  test(`squeeze at ${n} teams: a valid season, within the cap, never more carry-over than its start`, () => {
    const start = lowCarryOverDoubleRounds(n, { seed: 2, effort: 0.2, breakWeight: 20 });
    for (const cap of [start.breaks, start.breaks + 6]) {
      const s = squeezeDoubleRounds(n, start, { seed: 3, effort: 0.3, maxBreaks: cap });
      checkSeason(s.rounds, n);
      assert.equal(s.breaks, breaksOf(n, s.rounds), "the reported breaks are the schedule's own");
      assert.equal(carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds: s.rounds }).value, s.coe, "the reported carry-over is the schedule's own");
      assert.ok(s.breaks <= cap, `${s.breaks} breaks over the cap ${cap}`);
      assert.ok(s.coe <= start.coe, `${s.coe} carry-over above the start's ${start.coe}`);
      assert.deepEqual(squeezeDoubleRounds(n, start, { seed: 3, effort: 0.3, maxBreaks: cap }).rounds, s.rounds, "seeded");
    }
  });
}

test("squeeze refuses a start of the wrong size or a missing cap", () => {
  const start = lowCarryOverDoubleRounds(8, { seed: 1, effort: 0.1 });
  assert.throws(() => squeezeDoubleRounds(10, start, { maxBreaks: 20 }), /start/);
  assert.throws(() => squeezeDoubleRounds(8, start, {}), /maxBreaks/);
});

test("squeezeTargets: widest frontier gaps first, capped halfway and started below; then the frontier itself", () => {
  const r = [[1460, 116], [1916, 92], [2396, 72], [3802, 66], [4884, 54], [2000, 100]].map(([coe, breaks]) => ({ coe, breaks }));
  const t = squeezeTargets(r, { count: 5, even: true });
  // 2000/100 is dominated by 1916/92; gaps: 116-92 (24), 92-72 (20), 72-66 (6, under minGap), 66-54 (12)
  assert.deepEqual(t.slice(0, 3), [{ from: 1, maxBreaks: 104 }, { from: 2, maxBreaks: 82 }, { from: 4, maxBreaks: 60 }]);
  assert.deepEqual(t.slice(3), [{ from: 0, maxBreaks: 116 }, { from: 1, maxBreaks: 92 }], "then the frontier seasons at their own breaks, lowest carry-over first");
  assert.equal(squeezeTargets(r, { count: 2 }).length, 2);
});

test("carryOverSqueeze numbers its season after the results, aims at a new target each time, and is a function of them", () => {
  const tries = [0, 1, 2, 3, 4, 5].map((i) => carryOverTry(8, i, { double: true, seed: 1, effort: 0.2, weighted: 4 }));
  const all = carryOverSqueezes(8, tries, 3, { seed: 1, effort: 0.2 });
  const sq = all.slice(tries.length);
  assert.ok(sq.length >= 1);
  sq.forEach((t, j) => { assert.equal(t.index, tries.length + j); checkSeason(t.rounds, 8); assert.ok(t.breaks <= t.maxBreaks || t.breaks <= all[t.squeezedFrom].breaks); });
  assert.equal(new Set(sq.map((t) => `${t.squeezedFrom}@${t.maxBreaks}`)).size, sq.length, "no target twice");
  assert.deepEqual(carryOverSqueezes(8, tries, 3, { seed: 1, effort: 0.2 }).map((t) => t.rounds), all.map((t) => t.rounds), "seeded");
  assert.deepEqual(carryOverSqueeze(8, all.slice(0, tries.length + 1), { seed: 1, effort: 0.2 })?.rounds, sq[1]?.rounds, "the next squeeze reads only the results before it");
});

test("bestCarryOverRounds: squeezes join the frontier but never move the four choices", () => {
  const plain = bestCarryOverRounds(8, { double: true, seed: 2, tries: 4, capped: 2, effort: 0.2 });
  const sq = bestCarryOverRounds(8, { double: true, seed: 2, tries: 4, capped: 2, squeeze: 2, effort: 0.2 });
  assert.equal(sq.chosen, plain.chosen);
  assert.deepEqual(sq.rounds, plain.rounds);
  assert.ok(sq.tries.length > plain.tries.length);
  const single = bestCarryOverRounds(8, { seed: 2, tries: 2, capped: 2, effort: 0.2 });
  const singleSq = bestCarryOverRounds(8, { seed: 2, tries: 2, capped: 2, squeeze: 2, effort: 0.2 });
  assert.ok(singleSq.tries.length > single.tries.length, "a single round robin squeezes too");
  assert.deepEqual(singleSq.rounds, single.rounds, "and its choice is unchanged");
});

// every pair meets once, no team twice in a round, each team's home and away games within one
function checkSingle(rounds, n) {
  const N = n % 2 ? n + 1 : n;
  assert.equal(rounds.length, N - 1);
  const seen = new Set(), home = Array(n).fill(0), games = Array(n).fill(0);
  for (const r of rounds) {
    assert.equal(r.leg, 0);
    const used = new Set();
    for (const [h, a] of r.matches) {
      assert.ok(h !== a && h >= 0 && a >= 0 && h < n && a < n);
      assert.ok(!used.has(h) && !used.has(a), "a team plays twice in a round");
      used.add(h); used.add(a);
      const k = `${Math.min(h, a)}-${Math.max(h, a)}`;
      assert.ok(!seen.has(k), `${k} meets twice`);
      seen.add(k); home[h]++; games[h]++; games[a]++;
    }
  }
  assert.equal(seen.size, (n * (n - 1)) / 2);
  for (let t = 0; t < n; t++) assert.ok(Math.abs(2 * home[t] - games[t]) <= 1, `team ${t} unbalanced`);
}

for (const n of [8, 9, 12, 13]) {
  test(`single squeeze at ${n} teams: a valid round robin, within the cap, never more carry-over than its start`, () => {
    const start = lowCarryOverRounds(n, { seed: 2, effort: 0.2, breakWeight: 20 });
    for (const cap of [start.breaks, start.breaks + 4]) {
      const s = squeezeSingleRounds(n, start, { seed: 3, effort: 0.3, maxBreaks: cap });
      checkSingle(s.rounds, n);
      assert.equal(s.breaks, breaksOf(n, s.rounds), "the reported breaks are the schedule's own");
      assert.equal(carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds: s.rounds }).value, s.coe, "the reported carry-over is the schedule's own");
      assert.ok(s.breaks <= cap, `${s.breaks} breaks over the cap ${cap}`);
      assert.ok(s.coe <= start.coe, `${s.coe} carry-over above the start's ${start.coe}`);
      assert.deepEqual(squeezeSingleRounds(n, start, { seed: 3, effort: 0.3, maxBreaks: cap }).rounds, s.rounds, "seeded");
    }
  });
}

test("single squeeze refuses a home-and-away start, and the three-cycle move (cycles) keeps every home count", () => {
  assert.throws(() => squeezeSingleRounds(8, lowCarryOverDoubleRounds(8, { seed: 1, effort: 0.1 }), { maxBreaks: 10 }), /single round robin/);
  // 9 teams: 8 games each, so every team is exactly 4-4 and only the three-cycle move can change a ground
  const start = lowCarryOverRounds(9, { seed: 1, effort: 0.2, breakWeight: 20 });
  const s = squeezeSingleRounds(9, start, { seed: 1, effort: 0.3, maxBreaks: start.breaks + 4, cycles: true });
  checkSingle(s.rounds, 9);
  const home = Array(9).fill(0);
  for (const r of s.rounds) for (const [h] of r.matches) home[h]++;
  assert.deepEqual(home, Array(9).fill(4));
});

test("carryOverSqueeze on single round robin tries: numbered after them, valid, a new target each time", () => {
  const tries = [0, 1, 2, 3, 4, 5].map((i) => carryOverTry(10, i, { seed: 1, effort: 0.2, weighted: 4 }));
  const all = carryOverSqueezes(10, tries, 3, { seed: 1, effort: 0.2 });
  const sq = all.slice(tries.length);
  assert.ok(sq.length >= 1);
  sq.forEach((t, j) => { assert.equal(t.index, tries.length + j); checkSingle(t.rounds, 10); });
  assert.equal(new Set(sq.map((t) => `${t.squeezedFrom}@${t.maxBreaks}`)).size, sq.length, "no target twice");
});
