import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  lowCarryOverCappedRounds, lowCarryOverDoubleRounds, bestCarryOverRounds, carryOverTry, cappedTryBreaks,
  combineCarryOverTries, splitCarryOverTries, carryOverSummary, carryOver,
} from "./carryover.mjs";

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

function checkLeg(rounds, n) {
  const seen = new Set();
  for (const r of rounds) {
    const used = new Set();
    for (const [h, a] of r.matches) {
      assert.ok(h !== a && h >= 0 && a >= 0 && h < n && a < n);
      assert.ok(!used.has(h) && !used.has(a), "a team plays twice in a round");
      used.add(h); used.add(a);
      const k = Math.min(h, a) * 100 + Math.max(h, a);
      assert.ok(!seen.has(k), "a pair meets twice in a leg");
      seen.add(k);
    }
  }
  assert.equal(seen.size, (n * (n - 1)) / 2, "every pair meets");
}

function homeAway(n, rounds) {
  const h = Array(n).fill(0), g = Array(n).fill(0);
  for (const r of rounds) for (const [a, b] of r.matches) { h[a]++; g[a]++; g[b]++; }
  return { h, g };
}

test("capped single: a valid round robin, the minimum n - 2 breaks by default, balanced, below the circle", () => {
  for (const n of [6, 8, 10, 12, 14]) {
    const r = lowCarryOverCappedRounds(n, { seed: 1, effort: 0.3 });
    checkLeg(r.rounds, n);
    assert.equal(r.breaks, n - 2, `${n} teams`);
    assert.equal(breaksOf(n, r.rounds), r.breaks, "the reported breaks are the rounds' breaks");
    const { h, g } = homeAway(n, r.rounds);
    for (let t = 0; t < n; t++) assert.ok(Math.abs(2 * h[t] - g[t]) <= 1, `team ${t} home/away balance`);
    assert.equal(carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds: r.rounds }).value, r.coe);
    // 6 teams: the circle's 42 is already the least a 6-team round robin can have (all 720 enumerated)
    if (n === 6) assert.equal(r.coe, 42); else assert.ok(r.coe < r.circleCoe, `${n} teams: ${r.coe} not below the circle's ${r.circleCoe}`);
  }
});

test("capped single: never over the cap, a looser cap gives no worse carry-over at 12 teams, odd leagues work", () => {
  let last = Infinity;
  for (const cap of [10, 14, 20]) {
    const r = lowCarryOverCappedRounds(12, { seed: 2, effort: 0.5, maxBreaks: cap });
    checkLeg(r.rounds, 12);
    assert.ok(breaksOf(12, r.rounds) <= cap);
    assert.ok(r.coe <= last + 30, `cap ${cap}: ${r.coe} after ${last}`); // a search, so allow a little noise
    last = Math.min(last, r.coe);
  }
  for (const n of [5, 7, 9]) {
    const r = lowCarryOverCappedRounds(n, { seed: 1, effort: 0.3 });
    checkLeg(r.rounds, n);
    assert.equal(r.rounds.filter((x) => x.bye !== null).length, n, "one bye a round");
    assert.ok(breaksOf(n, r.rounds) <= r.maxBreaks);
  }
});

test("capped single is seeded", () => {
  const a = lowCarryOverCappedRounds(10, { seed: 3, effort: 0.3, maxBreaks: 12 });
  const b = lowCarryOverCappedRounds(10, { seed: 3, effort: 0.3, maxBreaks: 12 });
  assert.deepEqual(a.rounds, b.rounds);
});

test("capped double: two legs, return game at the other ground, no back-to-back repeat, inside the season cap", () => {
  for (const n of [6, 8, 10, 12]) {
    const caps = cappedTryBreaks(n, 1, true);
    const d = lowCarryOverDoubleRounds(n, { seed: 1, effort: 0.3, maxBreaks: caps.season, legBreaks: caps.leg });
    const R = n - 1;
    checkLeg(d.rounds.slice(0, R), n);
    checkLeg(d.rounds.slice(R), n);
    const host = new Map();
    for (const r of d.rounds.slice(0, R)) for (const [h, a] of r.matches) host.set(`${Math.min(h, a)}-${Math.max(h, a)}`, h);
    for (const r of d.rounds.slice(R)) for (const [h, a] of r.matches) assert.equal(host.get(`${Math.min(h, a)}-${Math.max(h, a)}`), a, "return game at the other ground");
    assert.equal(d.repeats, 0);
    const b = breaksOf(n, d.rounds);
    assert.equal(b, d.breaks);
    assert.ok(b <= caps.season, `${n} teams: ${b} breaks over the season cap ${caps.season}`);
  }
});

test("capped tries reach the few-breaks end: at 12 teams fewer breaks than every weighted try", () => {
  const r = bestCarryOverRounds(12, { double: true, seed: 1, tries: 4, capped: 2, effort: 0.3, pick: 0 });
  assert.equal(r.tries.length, 6);
  assert.deepEqual(r.tries.map((c) => c.breakWeight), [10, 20, 40, 80, null, null]);
  assert.deepEqual(r.tries.slice(4).map((c) => c.maxBreaks), [cappedTryBreaks(12, 0, true).season, cappedTryBreaks(12, 1, true).season]);
  r.tries.slice(4).forEach((c) => assert.ok(c.breaks <= c.maxBreaks));
  const weightedFewest = Math.min(...r.tries.slice(0, 4).map((c) => c.breaks));
  assert.ok(Math.min(...r.tries.slice(4).map((c) => c.breaks)) < weightedFewest, JSON.stringify(r.tries));
  const few = combineCarryOverTries(r.tries.map((_, i) => carryOverTry(12, i, { double: true, seed: 1, effort: 0.3, weighted: 4 })), 1e6);
  assert.ok(few.tries[few.chosen].maxBreaks != null, "a large trade keeps a capped try");
  assert.ok(carryOverSummary(few).candidates.slice(4).every((c) => Number.isInteger(c.maxBreaks)));
});

test("weighted tries are unchanged by capped ones after them, and a pool returns the serial result", () => {
  const plain = bestCarryOverRounds(8, { double: true, seed: 4, tries: 4, pick: 0 });
  const more = bestCarryOverRounds(8, { double: true, seed: 4, tries: 4, capped: 2, pick: 0 });
  assert.deepEqual(more.tries.slice(0, 4), plain.tries);
  // a try does not depend on the pick, so the pool searches once and each pick gets its own copy
  const done = splitCarryOverTries(6, 4).map((q) => q.map((i) => carryOverTry(8, i, { double: true, seed: 4, weighted: 4 })));
  for (const pick of [0, 40]) {
    const serial = bestCarryOverRounds(8, { double: true, seed: 4, tries: 4, capped: 2, pick });
    const pooled = combineCarryOverTries(JSON.parse(JSON.stringify([...done].reverse().flat())), pick);
    assert.deepEqual(pooled.rounds, serial.rounds);
  }
  assert.throws(() => bestCarryOverRounds(6, { tries: 2, capped: -1 }), /capped/);
});

test("the page runs 8 weighted + 2 capped tries and tells the worker where the capped ones start", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /CARRY_WEIGHTED = 8, CARRY_CAPPED = 2/);
  assert.match(html, /weighted: CARRY_WEIGHTED, indices/);
  const worker = readFileSync(new URL("./carryover-worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /weighted: Number\.isInteger\(weighted\) \? weighted : Infinity/);
});

test("the 'fewest' choice survives a share link and keeps the capped minimum", async () => {
  const { readSpec, encodeFields, decodeFields } = await import("./calc.mjs");
  const { CARRY_OVER_PICK } = await import("./carryover.mjs");
  const f = { teams: "A\nB\nC\nD\nE\nF", start: "2026-01-05", weekdays: ["Mon"], carryOver: true, carryOverPick: "fewest", skip: "", blackouts: "" };
  assert.equal(decodeFields(encodeFields(f)).carryOverPick, "fewest");
  assert.equal(readSpec(f).spec.carryOverPick, CARRY_OVER_PICK.fewest);
  const r = bestCarryOverRounds(12, { double: true, seed: 1, tries: 4, capped: 2, effort: 0.3, pick: CARRY_OVER_PICK.fewest });
  assert.equal(r.breaks, Math.min(...r.tries.map((c) => c.breaks)));
  assert.equal(r.breaks, 3 * (12 - 2), "the mirrored minimum 3(n - 2)");
});

test("an odd league's capped tries run the capped search from a zero-break start and stay under their caps", () => {
  for (const double of [false, true]) {
    const t = carryOverTry(9, 1, { double, seed: 1, effort: 0.3, weighted: 1 });
    const caps = cappedTryBreaks(9, 0, double);
    const cap = double ? caps.season : caps.leg;
    // the capped search, or the heavy-weight stand-in when that found fewer breaks
    if (t.breakWeight === null) assert.equal(t.maxBreaks, cap); else assert.equal(t.breakWeight, 160);
    checkLeg(t.rounds.slice(0, 9), 9);
    if (double) checkLeg(t.rounds.slice(9), 9);
    assert.ok(breaksOf(9, t.rounds) <= cap, `${breaksOf(9, t.rounds)} over ${cap}`);
    const capped = double
      ? lowCarryOverDoubleRounds(9, { seed: t.seed, effort: 0.3, maxBreaks: caps.season, legBreaks: caps.leg })
      : lowCarryOverCappedRounds(9, { seed: t.seed, effort: 0.3, maxBreaks: caps.leg });
    assert.ok(t.breaks <= capped.breaks, "never more breaks than the capped search alone");
  }
  assert.deepEqual(cappedTryBreaks(9, 0), { leg: 6, season: null });
  assert.deepEqual(cappedTryBreaks(9, 1, true), { leg: 10, season: 30 });
  // 11 teams a leg at 8 breaks: well below the circle method's carry-over, which the old fallback
  // (a heavy break weight) could only reach at 21 breaks
  const r = lowCarryOverCappedRounds(11, { seed: 2, effort: 0.5, maxBreaks: 8 });
  assert.ok(breaksOf(11, r.rounds) <= 8);
  assert.ok(r.coe < r.circleCoe / 2, `${r.coe} vs circle ${r.circleCoe}`);
});
