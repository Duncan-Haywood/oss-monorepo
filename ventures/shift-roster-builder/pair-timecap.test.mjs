// The second-call-out price's pass stops at a time limit and keeps the moves it made (2026-11-15, README "A time cap on the
// pair price", eval/pair-timecap.mjs). The clock is moved by hand here so the test does not depend on the machine's speed.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverSlackPass, coverSlackText } from "./calc.mjs";
import { seededWeeks } from "./eval/reissue-scale.mjs";

const O = { minRestHours: 10 };
const { staff: st, shifts: sh } = seededWeeks(20, 56, 3)[2];
const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
const ctx = buildContext(staff, slots, O);
const start = buildRoster(staff, slots, { ...O, seed: 1 }).owner;
const P = { price: 25, pairPrice: 1 };
const realNow = Date.now;
const J = (r) => r.score + 25 * r.risk.hours + r.pairHours;

test("with no limit hit the capped pass is the uncapped pass; a stop between moves keeps an exact prefix", () => {
  const seen = [];
  const full = coverSlackPass(ctx, start, { ...P, onMove: (m) => seen.push(m) });
  assert.ok(full.moves >= 2, "the seeded 20-person week 2 takes several pair-priced moves");
  assert.equal(full.pairTimedOut, false);
  const roomy = coverSlackPass(ctx, start, { ...P, pairMs: 1e9 });
  assert.deepEqual(roomy.owner, full.owner);
  assert.equal(roomy.moves, full.moves);
  assert.equal(roomy.pairTimedOut, false);
  // Jump the clock past the limit right after the second move: the pass must end there with those two moves.
  let cut;
  try {
    cut = coverSlackPass(ctx, start, { ...P, pairMs: 60000, onMove: (m) => { if (m.moves === 2) Date.now = () => realNow() + 1e9; } });
  } finally { Date.now = realNow; }
  assert.equal(cut.pairTimedOut, true);
  assert.equal(cut.moves, 2);
  assert.deepEqual(cut.owner, seen[1].owner);
  assert.equal(cut.pairHours, seen[1].pairHours);
  // Each move lowers the pass's objective, so the prefix sits between the start and the uncapped end.
  const none = coverSlackPass(ctx, start, { ...P, rounds: 0 });
  assert.ok(J(cut) < J(none) - 1e-6 && J(cut) >= J(full) - 1e-6);
});

test("a limit spent before the starting count finishes posts the starting roster, unpriced", () => {
  // Jump the clock as soon as the pass starts: the starting roster's own pair walks cannot finish.
  const realNow0 = Date.now;
  let calls = 0, r;
  try {
    Date.now = () => (++calls > 1 ? realNow0() + 1e9 : realNow0());
    r = coverSlackPass(ctx, start, { ...P, pairMs: 60000 });
  } finally { Date.now = realNow0; }
  assert.equal(r.pairTimedOut, true);
  assert.equal(r.pairStartTimedOut, true);
  assert.equal(r.moves, 0);
  assert.deepEqual(r.owner, start);
  assert.equal(r.pairHours, null);
  assert.equal(r.pairHoursBefore, null);
});

test("buildRoster passes --second-callout-seconds through and the slack line says the search stopped", () => {
  const res = buildRoster(staff, slots, { ...O, seed: 1, coverPrice: 25, coverPairPrice: 1, coverPairMs: 1 });
  assert.equal(res.coverSlack.pairTimedOut, true);
  assert.equal(res.coverSlack.pairMs, 1);
  // 1 ms: the starting pair count itself runs out of time, so the week is priced on single call-outs only, and says so.
  assert.equal(res.coverSlack.pairStartTimedOut, true);
  assert.match(coverSlackText(res.coverSlack), /Second call-outs were not priced: counting the pairs on this week took longer than/);
  const mid = { ...res.coverSlack, pairStartTimedOut: false, pairHours: 100, pairHoursBefore: 120, pairPrice: 1, pairMs: 10000 };
  assert.match(coverSlackText(mid), /stopped at its 10 s limit and kept the moves it had made/);
  const plain = buildRoster(staff, slots, { ...O, seed: 1, coverPrice: 25 });
  assert.equal(plain.coverSlack.pairTimedOut, false);
  assert.doesNotMatch(coverSlackText(plain.coverSlack), /limit/);
});
