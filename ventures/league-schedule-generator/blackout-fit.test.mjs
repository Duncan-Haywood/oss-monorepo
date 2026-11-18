import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, validateSchedule, roundRobin, relabelPlan, countBreaks, parseDate } from "./calc.mjs";

const D = (iso) => parseDate(iso);
const names = (n) => Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
const spec = (n, extra = {}) => ({ teams: names(n), double: false, start: D("2027-01-05"), weekdays: [2], skipDays: [], blackouts: {}, courts: [], times: [], seed: 1, minutes: 60, ...extra });
const makeups = (s) => s.rounds.filter((r) => r.makeup).reduce((a, r) => a + r.matches.length, 0);

test("relabelPlan keeps a round robin and every team's break count moves with its label", () => {
  for (const double of [false, true]) {
    const plan = roundRobin(7, { double });
    const perm = [3, 0, 6, 1, 5, 2, 4];
    const re = relabelPlan(plan, perm);
    const pairs = new Map();
    for (const r of re) {
      const seen = new Set();
      for (const [h, a] of r.matches) { assert.ok(!seen.has(h) && !seen.has(a)); seen.add(h); seen.add(a); const k = Math.min(h, a) + "-" + Math.max(h, a); pairs.set(k, (pairs.get(k) || 0) + 1); }
      if (r.bye !== null) assert.ok(!seen.has(r.bye));
    }
    assert.equal(pairs.size, 21);
    for (const v of pairs.values()) assert.equal(v, double ? 2 : 1);
    // home/away sequence of team perm[p] in the relabelled plan equals position p's in the original
    const seq = (pl, t) => pl.map((r) => { const m = r.matches.find(([h, a]) => h === t || a === t); return m ? (m[0] === t ? "H" : "A") : "-"; }).join("");
    for (let p = 0; p < 7; p++) assert.equal(seq(re, perm[p]), seq(plan, p));
  }
});

test("an odd league puts each team's single blackout on its bye: no makeup match", () => {
  // 7 teams, 7 rounds, each team has one bye; give every team one blackout on a different week
  const s0 = spec(7);
  const blackouts = {};
  for (let t = 0; t < 7; t++) blackouts[t] = [s0.start + 7 * ((t * 3) % 7)];
  const old = buildSchedule({ ...s0, blackouts, blackoutFit: false });
  const neu = buildSchedule({ ...s0, blackouts });
  assert.ok(makeups(neu) <= makeups(old));
  assert.equal(makeups(neu), 0);
  assert.equal(neu.rounds.length, 7);
  assert.ok(validateSchedule(neu).ok);
  assert.equal(neu.blackoutFit.displacedAfter, 0);
  // breaks are the search's third key, so with nothing displaced it is never above the old placement
  const sum = (s) => countBreaks(s).reduce((a, b) => a + b, 0);
  assert.ok(sum(neu) <= sum(old));
  assert.equal(sum(neu), neu.blackoutFit.breaksAfter);
});

test("two teams out on the same night are paired against each other: one makeup, not two", () => {
  const s0 = spec(8);
  const night = s0.start + 7 * 3;
  const blackouts = { 0: [night], 5: [night] };
  const neu = buildSchedule({ ...s0, blackouts });
  assert.equal(makeups(neu), 1);
  assert.ok(validateSchedule(neu).ok);
  assert.ok(makeups(buildSchedule({ ...s0, blackouts, blackoutFit: false })) >= 1);
});

test("never worse than the plan as given, and the same seed gives the same season", () => {
  for (let seed = 1; seed <= 6; seed++) {
    const n = 5 + seed;
    const s0 = spec(n, { seed, double: seed % 2 === 0 });
    const blackouts = {};
    for (let t = 0; t < n; t += 2) blackouts[t] = [s0.start + 7 * ((t * 5 + seed) % (n - 1))];
    const old = buildSchedule({ ...s0, blackouts, blackoutFit: false });
    const a = buildSchedule({ ...s0, blackouts });
    const b = buildSchedule({ ...s0, blackouts });
    assert.ok(makeups(a) <= makeups(old));
    assert.ok(makeups(a) < makeups(old) || a.rounds.at(-1).day <= old.rounds.at(-1).day);
    assert.deepEqual(a.rounds, b.rounds);
    assert.ok(validateSchedule(a).ok);
  }
});

test("no blackouts: the season is untouched and no summary is attached", () => {
  const s = buildSchedule(spec(9));
  assert.equal(s.blackoutFit, undefined);
  assert.deepEqual(s.rounds, buildSchedule({ ...spec(9), blackoutFit: false }).rounds);
});
