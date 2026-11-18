// Column generation keeps to its time share (bnp.mjs columnGenerationOpen `hardStop`, README "Column generation keeps to its
// share"): the LP solves stop at the limit and the pricing loop checks it before each call, so a big week's column generation no
// longer runs a whole round (up to 1.5 s at 350-400 copies) past its share. A round cut short is inexact, so its value is never
// taken as a bound.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster } from "./calc.mjs";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
function week(P, S, seed0) {
  let seed = seed0;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}
// Everything after column generation cut short so the test stays quick; the exact search is off (the big-week path skips it).
// The 12 s budget only has to reach the exact check on a slow CI runner (a 3 s one did not); the share is fixed by scoreCGMs.
const quick = { exact: true, timeBudgetMs: 12000, scoreFloor: false, cliqueFloor: false, dayLNSMs: 50, exactMs: 400 };

test("on a 60 x 168 week column generation stops near its share, where the old check ran on", () => {
  const { staff, slots } = week(60, 168, 20261022 + 60 * 100 + 168);
  const share = 300;
  const r = buildRoster(staff, slots, { ...quick, scoreCGMs: share });
  const g = r.optimality.scoreCG;
  assert.equal(g.shareMs, share);
  // The longest single pricing call on these weeks is under 230 ms here (eval/cg-overrun.out.txt); 500 ms leaves a slow runner room.
  assert.ok(g.ms <= share + 500, `stopped at ${g.ms} ms for a ${share} ms share`);
  assert.ok(g.stoppedMidRound >= 1, "the stop came inside a round");
  assert.ok(g.bound <= r.optimality.bestScore + 1e-6);
});

test("a stopped column generation never bounds above the proven best", () => {
  for (let k = 0; k < 3; k++) {
    const { staff, slots } = week(8, 20, 7000 + k);
    const full = buildRoster(staff, slots, { exact: true, dayLNSMs: 50 });
    if (full.optimality.status === "bounded") continue;
    const best = full.optimality.bestScore;
    for (const ms of [0, 5]) {
      // exactMs 300: the cut calls spent 8 s each (the default) in the exact search's tree, which runs after the column generation
      // under test and was 90% of this test's 61 s. At 300 ms the open-hours row (a second column generation, also cut to `ms`)
      // still runs inside it on all six calls, as at 8 s (docs/history/ci-perf-2026-11-16-shift-roster-cg-hardstop-exact-ms.md).
      const cut = buildRoster(staff, slots, { exact: true, scoreCGMs: ms, dayLNSMs: 50, exactMs: 300 });
      const g = cut.optimality.scoreCG;
      assert.ok(g.bound <= best + 1e-6, `seed ${k}, ${ms} ms: bound ${g.bound} above the best ${best}`);
      const row = cut.optimality.openRow;
      if (row) assert.ok(row.bound <= best + 1e-6, `seed ${k}, ${ms} ms: open-hours row bound ${row.bound} above the best ${best}`);
      assert.ok(cut.optimality.lowerBound <= best + 1e-6, `seed ${k}, ${ms} ms: lower bound ${cut.optimality.lowerBound} above ${best}`);
    }
  }
});

test("hardStop off keeps the old between-rounds check (no mid-round stops)", () => {
  const { staff, slots } = week(60, 168, 20261022 + 60 * 100 + 168);
  const r = buildRoster(staff, slots, { ...quick, scoreCGMs: 300, scoreCGHardStop: false });
  assert.equal(r.optimality.scoreCG.stoppedMidRound, 0);
});
