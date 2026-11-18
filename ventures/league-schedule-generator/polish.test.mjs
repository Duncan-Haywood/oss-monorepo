// Regrounded seasons (README "Polishing the grounds of the frontier", 2026-11-13): the same
// timetable with fewer back-to-back home or away games, kept only when it lands on the frontier.
import test from "node:test";
import assert from "node:assert/strict";
import { polishSeasonVenues, carryOverPolish, carryOverTry, carryOverSqueezes, bestCarryOverRounds, carryOver, carryOverKeepText, CARRY_OVER_POLISH } from "./carryover.mjs";
import { buildSchedule, readSpec, validateSchedule } from "./calc.mjs";

const key = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const coeOf = (rounds, n) => carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds }).value;
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
// same pairs in every round (so the same carry-over), every team's home and away games within one
// over the balanced span, and in a season each pair's two meetings at opposite grounds
function checkRegrounded(before, after, n) {
  const N = n % 2 ? n + 1 : n, R = N - 1, double = after.rounds.length === 2 * R;
  assert.equal(after.rounds.length, before.rounds.length);
  after.rounds.forEach((r, i) => {
    assert.deepEqual(r.matches.map(([a, b]) => key(a, b)).sort(), before.rounds[i].matches.map(([a, b]) => key(a, b)).sort(), `round ${i}`);
    assert.equal(r.bye ?? null, before.rounds[i].bye ?? null);
  });
  assert.equal(coeOf(after.rounds, n), coeOf(before.rounds, n));
  assert.equal(after.coe, before.coe);
  const span = double ? R : after.rounds.length;
  for (let t = 0; t < n; t++) {
    let h = 0, g = 0;
    for (const r of after.rounds.slice(0, span)) for (const [x, y] of r.matches) if (x === t || y === t) { g++; if (x === t) h++; }
    assert.ok(Math.abs(2 * h - g) <= 1, `team ${t}: ${h} at home of ${g}`);
  }
  if (double) {
    const host = new Map();
    for (const r of after.rounds) for (const [h, a] of r.matches) {
      const k = key(h, a);
      if (host.has(k)) assert.notEqual(host.get(k), h, `${k} hosted twice by ${h}`); else host.set(k, h);
    }
  }
  assert.equal(after.breaks, breaksOf(n, after.rounds));
}

test("polishSeasonVenues: 14 teams' gap try 314 / 20 regrounds to 314 / 16 on the same timetable", () => {
  const t = carryOverTry(14, 10, { seed: 1, weighted: 8 });
  assert.equal(t.coe, 314);
  assert.equal(t.breaks, 20);
  const p = polishSeasonVenues(14, t, { seed: 1 });
  assert.ok(p, "regrounded");
  checkRegrounded(t, p, 14);
  assert.equal(p.breaks, 16); // the least this timetable allows, proved by eval/orient-maxsat.py
});

test("polishSeasonVenues returns null when it finds no fewer breaks", () => {
  const t = carryOverTry(12, 0, { seed: 1, weighted: 8 }); // 168 / 14: proved least for its timetable
  assert.equal(polishSeasonVenues(12, t, { seed: 1 }), null);
});

test("polishSeasonVenues keeps every rule on either kind and odd or even leagues", () => {
  for (const [n, double] of [[8, false], [9, false], [8, true], [9, true], [12, true]]) {
    const t = carryOverTry(n, 0, { seed: 2, weighted: 8, double });
    // claim more breaks than it has, so any regrounding that is valid is returned
    const p = polishSeasonVenues(n, { ...t, breaks: t.breaks + 1000 }, { seed: 3 });
    assert.ok(p, `${n} ${double}`);
    checkRegrounded(t, p, n);
  }
  assert.throws(() => polishSeasonVenues(8, { rounds: [] }), /single or home-and-away/);
});

test("carryOverPolish: numbered after the results, on the frontier, seeded, and never polishes twice", () => {
  const tries = Array.from({ length: 6 }, (_, i) => carryOverTry(8, i, { seed: 1, weighted: 4 }));
  const all = carryOverSqueezes(8, tries, 2, { seed: 1 });
  const pol = carryOverPolish(8, all, { seed: 1 });
  assert.ok(pol.length >= 1 && pol.length <= CARRY_OVER_POLISH);
  const every = [...all, ...pol];
  pol.forEach((p, j) => {
    assert.equal(p.index, all.length + j);
    assert.equal(p.breakWeight, null);
    assert.equal(p.squeezedFrom, undefined);
    const src = all[p.polishedFrom];
    assert.equal(p.coe, src.coe);
    assert.ok(p.breaks < src.breaks);
    checkRegrounded(src, p, 8);
    assert.ok(!every.some((y) => y.coe <= p.coe && y.breaks <= p.breaks && (y.coe < p.coe || y.breaks < p.breaks)), "on the frontier");
  });
  assert.ok(pol.some((p) => p.coe === 48 && p.breaks === 8));
  assert.deepEqual(carryOverPolish(8, all, { seed: 1 }).map((p) => p.rounds), pol.map((p) => p.rounds), "seeded");
  assert.deepEqual(carryOverPolish(8, every, { seed: 1 }).map((p) => p.polishedFrom).filter((f) => pol.some((p) => p.polishedFrom === f)), [], "a source is regrounded once");
  assert.equal(carryOverPolish(8, all, { seed: 1, count: 0 }).length, 0);
});

test("bestCarryOverRounds and buildSchedule: polished seasons only join the list, and a kept one is rebuilt", () => {
  // 8 teams, one leg: 4 weighted + 2 capped tries and 2 squeezes; 48 / 10 regrounds to 48 / 8
  const opts = { seed: 1, tries: 4, capped: 2, squeeze: 2 };
  const plain = bestCarryOverRounds(8, opts);
  const withPol = bestCarryOverRounds(8, { ...opts, polish: 4 });
  assert.equal(withPol.chosen, plain.chosen);
  assert.deepEqual(withPol.rounds, plain.rounds);
  const at = withPol.tries.length - 1;
  assert.ok(at >= plain.tries.length, "a polished season is listed");
  assert.equal(withPol.tries[at].coe, 48);
  assert.equal(withPol.tries[at].breaks, 8);
  assert.throws(() => bestCarryOverRounds(8, { ...opts, polish: -1 }), /polish/);
  const fields = { teams: "A\nB\nC\nD\nE\nF\nG\nH", start: "2026-01-05", weekdays: ["Mon"], carryOver: true, double: false, seed: 1, carryOverKeep: carryOverKeepText(at, { n: 8, double: false, seed: 1 }) };
  const { spec } = readSpec(fields);
  const s = buildSchedule({ ...spec, carryOverTries: 4, carryOverCapped: 2, carryOverSqueeze: 2, carryOverPolish: 4 });
  assert.deepEqual(validateSchedule(s).errors, []);
  assert.equal(s.carryOverSearch.chosen, at);
  assert.equal(s.stats.carryOver.value, 48);
});
