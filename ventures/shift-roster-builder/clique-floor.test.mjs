// The clique LP's open-hours floor (calc.mjs cliqueOpenFloor, README "The 60-person week's 300 open hours are the least"): a floor
// on open hours for every roster, from cover rows, weekly and daily hour caps and one row per clique of shifts that break the rest
// rule pairwise. Checked against brute force on tiny seeded weeks with rest gaps, daily caps and last week's late finishes, and on
// the 60 x 168 week whose 300 open hours HiGHS proved least (eval/clique-floor.out.txt).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, _internals } from "./calc.mjs";

const { buildContext, ownerValid, cliqueOpenFloor } = _internals;

function seededWeek(seed, P, S, { daily = false, prev = false } = {}) {
  const days = ["Mon", "Tue", "Wed"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => {
    const extra = [daily && rnd(2) ? `daily: ${[6, 8, 10][rnd(3)]}` : "", prev && rnd(2) ? `prev: Sun ${[8, 10, 11][rnd(3)]}pm` : ""].filter(Boolean);
    return [`P${p}`, 10 + rnd(12), [8, 11, 13, 16, 24][rnd(5)], 0, `Mon-Wed ${6 + rnd(3)}-${18 + rnd(6)}`, ...extra].join(",");
  }).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 6 + rnd(10); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  const ps = parseStaff(st);
  assert.deepEqual(ps.errors, [], st);
  return { staff: ps.staff, slots: parseShifts(sh).slots };
}

function leastOpen(ctx) {
  const len = ctx.slots.map((s) => (s.end - s.start) / 60);
  const owner = new Array(ctx.S).fill(-1);
  let least = Infinity;
  const rec = (i, open) => {
    if (open >= least) return;
    if (i === ctx.S) { if (ownerValid(ctx, owner)) least = open; return; }
    for (let p = 0; p < ctx.P; p++) { if (!ctx.elig[p][i]) continue; owner[i] = p; rec(i + 1, open); }
    owner[i] = -1; rec(i + 1, open + len[i]);
  };
  rec(0, 0);
  return least;
}

test("the clique floor never exceeds the brute-force least open hours, and often meets it", () => {
  let checked = 0, tight = 0, positive = 0;
  for (let seed = 1; seed < 241; seed++) {
    const variant = { daily: seed % 3 === 1, prev: seed % 2 === 0 };
    const { staff, slots } = seededWeek(seed * 7919, 3, 7, variant);
    const options = { minRestHours: [0, 8, 10, 12][seed % 4], maxDailyHours: seed % 5 === 0 ? 8 : 0 };
    const ctx = buildContext(staff, slots, options);
    const least = leastOpen(ctx);
    const r = cliqueOpenFloor(ctx, { upTo: least });
    assert.ok(r, `seed ${seed}: LP failed`);
    assert.ok(r.floor <= least + 1e-9, `seed ${seed}: floor ${r.floor} above least ${least}`);
    assert.ok(r.bound <= r.lp + 1e-6, `seed ${seed}: dual bound ${r.bound} above LP ${r.lp}`);
    checked++;
    if (least > 0) positive++;
    if (least > 0 && Math.abs(r.floor - least) < 1e-9) tight++;
  }
  console.log(`clique floor: ${checked} weeks, ${positive} must leave hours open, floor meets the least on ${tight}`);
  assert.equal(checked, 240);
  // On these weeks the floor meets the least open hours on most weeks that must leave any open (measured: see the README).
  assert.ok(positive > 100 && tight / positive > 0.6, `tight on ${tight} of ${positive}`);
});

test("on the 60 x 168 week 0 the clique floor is the 300 open hours HiGHS proved least", () => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const P = 60, S = 168;
  let seed = 20261022 + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const ctx = buildContext(parseStaff(st).staff, parseShifts(sh).slots, { exact: true });
  const r = cliqueOpenFloor(ctx, { upTo: 300 });
  assert.equal(ctx.S, 245);
  assert.equal(r.floor, 300);
});

test("buildRoster reports the clique floor and proves coverage with it; cliqueFloor: false turns it off", () => {
  const { staff, slots } = seededWeek(424242, 3, 7, { daily: true });
  // The old order (plateau walk first) runs the clique LP before column generation. Since 2026-11-13 a fresh build runs column
  // generation first and the clique LP only if that proves nothing; this small week it proves, so the LP is skipped.
  const on = buildRoster(staff, slots, { exact: true, deferCover: false });
  const off = buildRoster(staff, slots, { exact: true, cliqueFloor: false, deferCover: false });
  const now = buildRoster(staff, slots, { exact: true });
  assert.equal(now.unfilledHours, on.unfilledHours);
  assert.ok(Math.abs(now.score - on.score) < 1e-6);
  assert.ok(on.optimality.cliqueFloor && on.optimality.cliqueFloor.floor >= 0);
  assert.equal(off.optimality.cliqueFloor, null);
  assert.equal(on.unfilledHours, off.unfilledHours);
  assert.ok(on.optimality.forcedOpenHours <= on.unfilledHours + 1e-9);
});
