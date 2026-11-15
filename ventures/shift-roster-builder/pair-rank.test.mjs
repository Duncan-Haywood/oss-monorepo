// Best moves first for the second-call-out price's pass (2026-11-15, README "The pair price's best moves first",
// eval/pair-rank.mjs): `pairRank` sets each round's candidates aside after the cheap tests and walks them largest room first.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverSlackPass } from "./calc.mjs";
import { seededWeeks } from "./eval/reissue-scale.mjs";

const O = { minRestHours: 10 };
const { staff: st, shifts: sh } = seededWeeks(20, 56, 3)[2];
const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
const ctx = buildContext(staff, slots, O);
const start = buildRoster(staff, slots, { ...O, seed: 1 }).owner;
const P = { price: 25, pairPrice: 1 };
const J = (score, risk, ph) => score + 25 * risk + ph;

test("the ranked pass takes only confirmed gains: every move lowers the objective and the end is no worse than the start", () => {
  const none = coverSlackPass(ctx, start, { ...P, rounds: 0 });
  const seen = [];
  const r = coverSlackPass(ctx, start, { ...P, pairRank: true, onMove: (m) => seen.push(m) });
  assert.ok(r.moves >= 1, "the seeded 20-person week 2 takes a pair-priced move");
  let last = J(none.score, none.risk.hours, none.pairHours);
  for (const m of seen) { const j = J(m.score, m.riskHours, m.pairHours); assert.ok(j < last - 1e-6); last = j; }
  assert.ok(J(r.score, r.risk.hours, r.pairHours) < J(none.score, none.risk.hours, none.pairHours) - 1e-6);
  assert.equal(r.pairConfirmed, true);
});

test("with no pair price the rank changes nothing, and buildRoster passes coverPairRank through", () => {
  const a = coverSlackPass(ctx, start, { price: 25 });
  const b = coverSlackPass(ctx, start, { price: 25, pairRank: true });
  assert.deepEqual(b.owner, a.owner);
  assert.equal(b.moves, a.moves);
  const plain = buildRoster(staff, slots, { ...O, seed: 1, coverPrice: 25, coverPairPrice: 1, coverPairMs: Infinity });
  const ranked = buildRoster(staff, slots, { ...O, seed: 1, coverPrice: 25, coverPairPrice: 1, coverPairMs: Infinity, coverPairRank: true });
  assert.notDeepEqual(ranked.owner, plain.owner, "the ranked pass walks another path on this week");
});
