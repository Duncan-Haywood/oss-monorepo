// The cover passes steered by the clique LP (calc.mjs coverPass `guide`, README "The clique LP steers the cover passes"): the
// guide only changes which person a fill step proposes, so a guided pass keeps every rule, never ends with more open hours than it
// started with, and buildRoster passes the open-hours LP's values to it unless `coverGuide: false`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, _internals } from "./calc.mjs";

const { buildContext, coverPass, ownerValid, cliqueOpenFloor } = _internals;

function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => [`P${p}`, 10 + rnd(12), [8, 11, 13, 16, 24][rnd(5)], 0, `Mon-Wed ${6 + rnd(3)}-${18 + rnd(6)}`].join(",")).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 6 + rnd(10); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}

const openOf = (ctx, own) => own.reduce((t, p, i) => t + (p < 0 ? (ctx.slots[i].end - ctx.slots[i].start) / 60 : 0), 0);

test("a guided cover pass keeps every rule and never opens more hours than it started with", () => {
  let ran = 0, moved = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const { staff, slots } = seededWeek(seed, 4 + (seed % 5), 10 + (seed % 9));
    const ctx = buildContext(staff, slots, { exact: true });
    const lp = cliqueOpenFloor(ctx, {});
    if (!lp?.xs) continue;
    const start = new Array(ctx.S).fill(-1);
    for (const prob of [0.5, 1]) {
      const r = coverPass(ctx, start, seed, 20000, { guide: lp.xs, guideProb: prob });
      assert.ok(ownerValid(ctx, r.owner), `seed ${seed}`);
      assert.ok(Math.abs(openOf(ctx, r.owner) - r.open) < 1e-6);
      assert.ok(r.open <= openOf(ctx, start) + 1e-9);
      assert.ok(r.open >= lp.floor - 1e-6, `seed ${seed}: ${r.open} under the floor ${lp.floor}`);
      ran++; if (r.open < openOf(ctx, start) - 1e-9) moved++;
    }
  }
  assert.ok(ran >= 100 && moved >= 100, `${ran} passes, ${moved} filled something`);
});

test("a guide of all zeros proposes uniformly, as with no guide", () => {
  const { staff, slots } = seededWeek(7, 6, 14);
  const ctx = buildContext(staff, slots, { exact: true });
  const start = new Array(ctx.S).fill(-1);
  const a = coverPass(ctx, start, 3, 5000);
  const b = coverPass(ctx, start, 3, 5000, { guide: new Float64Array(ctx.P * ctx.S), guideProb: 0.5 });
  assert.deepEqual(b.owner, a.owner);
});

test("buildRoster hands the open-hours LP's values to the cover passes unless coverGuide is false", () => {
  let guided = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { staff, slots } = seededWeek(100 + seed, 6, 40);
    const on = buildRoster(staff, slots, { exact: true, deferCover: false, seed });
    const off = buildRoster(staff, slots, { exact: true, deferCover: false, seed, coverGuide: false });
    assert.ok(!on.error && !off.error);
    if (on.optimality?.coverGuided === null) continue; // nothing was open after the annealer: no cover pass ran
    assert.equal(off.optimality.coverGuided, false);
    if (on.optimality.cliqueFloor) { assert.equal(on.optimality.coverGuided, true); guided++; }
  }
  assert.ok(guided >= 1, "no seeded week ran a guided cover pass");
});
