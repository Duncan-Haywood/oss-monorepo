// The second-call-out price confirms its moves with a pair walk run to the end (2026-11-15, README "Fewer capped pairs",
// eval/pair-confirm.mjs, eval/cover-pair-capped.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk } from "./calc.mjs";
import { seededWeeks } from "./eval/reissue-scale.mjs";

const O = { minRestHours: 10 };
const { staff: st, shifts: sh } = seededWeeks(20, 56, 3)[2];
const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
const ctx = buildContext(staff, slots, O);

test("the budgeted pair walk gives up on pairs that are coverable, and counts them as clashing", () => {
  const r = buildRoster(staff, slots, { ...O, coverPrice: 25, seed: 1 });
  const one = coverRisk(ctx, r.owner);
  const cut = coverPairRisk(ctx, r.owner, { single: one, keep: true });
  const end = coverPairRisk(ctx, r.owner, { single: one, keep: true, budget: 1e6 });
  assert.equal(end.capped, 0);
  assert.ok(cut.capped > 100);
  // Every verdict the budgeted walk did reach is the same; some given-up pairs turn out coverable.
  let freed = 0;
  cut.checked.forEach((c, k) => {
    if (c.how === null) { if (end.checked[k].how) freed++; } else assert.equal(!!c.how, !!end.checked[k].how);
  });
  assert.ok(freed > 50);
  assert.ok(end.hours < cut.hours);
});

test("--second-callout-price reports the pair hours of the walk run to the end, in no more moves", () => {
  const base = { ...O, coverPrice: 25, coverPairPrice: 1, seed: 1 };
  const on = buildRoster(staff, slots, base);
  const off = buildRoster(staff, slots, { ...base, coverPairConfirm: false });
  assert.equal(on.coverSlack.pairConfirmed, true);
  assert.equal(off.coverSlack.pairConfirmed, false);
  const exact = coverPairRisk(ctx, on.owner, { budget: 1e6 }).hours;
  assert.equal(on.coverSlack.pairHours, exact);
  assert.ok(on.coverSlack.pairHoursScreen >= exact); // the screen's count is an upper bound
  assert.ok(off.coverSlack.pairHours >= coverPairRisk(ctx, off.owner, { budget: 1e6 }).hours);
  assert.ok(on.coverSlack.moves <= off.coverSlack.moves);
  // Confirming never pays for a move the full walk says gains nothing: the confirmed roster's exact pair hours are no worse.
  assert.ok(exact <= coverPairRisk(ctx, off.owner, { budget: 1e6 }).hours + 1e-9);
});
