// The second-call-out price cuts off pair walks once a move cannot pay, walking last roster's clashing pairs first
// (2026-11-15, README "Only the walks a move can pass", eval/pair-stop.mjs). Both cuts are exact: same rosters, fewer pairs.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk, coverSlackPass } from "./calc.mjs";
import { seededWeeks } from "./eval/reissue-scale.mjs";

const O = { minRestHours: 10 };
const { staff: st, shifts: sh } = seededWeeks(20, 56, 3)[2];
const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
const ctx = buildContext(staff, slots, O);
const start = buildRoster(staff, slots, { ...O, seed: 1 }).owner;

test("coverPairRisk: stopAt stops at the first count that reaches it; `first` changes only the order", () => {
  const one = coverRisk(ctx, start);
  const all = coverPairRisk(ctx, start, { single: one });
  assert.ok(all.hours > 20 && all.cases.length > 3);
  assert.equal(all.stopped, false);
  const cut = coverPairRisk(ctx, start, { single: one, stopAt: 10 });
  assert.equal(cut.stopped, true);
  assert.ok(cut.hours >= 10 && cut.hours <= all.hours && cut.pairs < all.pairs);
  // Walking a few known clashes first reaches the limit sooner and never changes the full count.
  const hint = all.cases.slice(-3);
  const firstCut = coverPairRisk(ctx, start, { single: one, stopAt: 10, first: hint });
  assert.ok(firstCut.pairs <= 3);
  const firstAll = coverPairRisk(ctx, start, { single: one, first: hint });
  assert.equal(firstAll.hours, all.hours);
  assert.equal(firstAll.pairs, all.pairs);
  assert.deepEqual(firstAll.cases.map((c) => JSON.stringify(c)).sort(), all.cases.map((c) => JSON.stringify(c)).sort());
});

test("the priced pass posts the same roster with the cuts on and off, searching far fewer pairs", () => {
  const on = coverSlackPass(ctx, start, { price: 25, pairPrice: 1 });
  const off = coverSlackPass(ctx, start, { price: 25, pairPrice: 1, pairStop: false });
  assert.deepEqual(on.owner, off.owner);
  assert.equal(on.score, off.score);
  assert.equal(on.moves, off.moves);
  assert.equal(on.pairHours, off.pairHours);
  assert.ok(on.moves > 0);
  assert.equal(off.pairStops, 0);
  assert.ok(on.pairStops > 100);
  assert.ok(on.pairsSearched * 2 < off.pairsSearched, `${on.pairsSearched} vs ${off.pairsSearched}`);
});

test("buildRoster reports the walk counts and coverPairStop: false turns the cuts off", () => {
  const base = { ...O, coverPrice: 25, coverPairPrice: 1, seed: 1 };
  const rOn = buildRoster(staff, slots, base), rOff = buildRoster(staff, slots, { ...base, coverPairStop: false });
  const on = rOn.coverSlack, off = rOff.coverSlack;
  assert.ok(on.pairStops > 0);
  assert.equal(off.pairStops, 0);
  // The two builds run time-limited phases, so a loaded runner can hand the pass different rosters (pairHours 688 vs 532 on
  // PR #16599's CI). The cuts' exactness on one roster is the test above; here it is checked only when the builds agree.
  if (JSON.stringify(rOn.owner) === JSON.stringify(rOff.owner)) assert.equal(on.pairHours, off.pairHours);
});
