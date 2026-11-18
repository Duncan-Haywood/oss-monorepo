// The exact repair (calc.mjs coverRepair, README "The clique LP picks the repair's people"): each round now starts from the
// neighbourhood's own value and prunes on the chosen people's weekly hours, and with the clique LP's values it may choose its
// people as a chain the LP suggests (opt-in: it measured no better than random people). None of that may make a roster invalid, leave more hours open, or miss the best roster
// when the neighbourhood is everyone.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, _internals } from "./calc.mjs";

const { buildContext, coverRepair, ownerValid, cliqueOpenFloor, validList, insertSorted } = _internals;

function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => [`P${p}`, 10 + rnd(12), [8, 11, 13, 16, 24][rnd(5)], 0, `Mon-Wed ${6 + rnd(3)}-${18 + rnd(6)}`].join(",")).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 6 + rnd(10); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}
const hrs = (ctx, i) => (ctx.slots[i].end - ctx.slots[i].start) / 60;
const openOf = (ctx, own) => own.reduce((t, p, i) => t + (p < 0 ? hrs(ctx, i) : 0), 0);

// Least open hours by trying every assignment (tiny weeks only).
function bruteMin(ctx) {
  const { P, S, elig } = ctx;
  const lists = Array.from({ length: P }, () => []);
  let best = Infinity;
  const go = (i, open) => {
    if (open >= best) return;
    if (i === S) { best = open; return; }
    for (let p = 0; p < P; p++) {
      if (!elig[p][i]) continue;
      const nl = insertSorted(ctx, lists[p], i);
      if (!validList(ctx, p, nl)) continue;
      const old = lists[p]; lists[p] = nl; go(i + 1, open); lists[p] = old;
    }
    go(i + 1, open + hrs(ctx, i));
  };
  go(0, 0);
  return best;
}

test("a repair over everyone finds the least open hours (the weekly-hours bound prunes nothing it needs)", () => {
  let checked = 0, open = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { staff, slots } = seededWeek(seed, 2 + (seed % 3), 5 + (seed % 4));
    const ctx = buildContext(staff, slots, { exact: true });
    const start = new Array(ctx.S).fill(-1);
    const r = coverRepair(ctx, start, seed, { k: ctx.P, rounds: 1, nodeLimit: 1e7, totalNodes: 1e8 });
    assert.ok(ownerValid(ctx, r.owner), `seed ${seed}`);
    assert.ok(Math.abs(r.open - bruteMin(ctx)) < 1e-6, `seed ${seed}: repair ${r.open}, best ${bruteMin(ctx)}`);
    checked++; if (r.open > 0) open++;
  }
  assert.ok(checked === 60 && open >= 10, `${open} of ${checked} weeks keep hours open`);
});

test("guided and unguided repairs keep every rule, report their open hours and never open more", () => {
  let guidedRounds = 0, gains = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { staff, slots } = seededWeek(seed, 5 + (seed % 5), 14 + (seed % 9));
    const ctx = buildContext(staff, slots, { exact: true });
    const lp = cliqueOpenFloor(ctx, {});
    // A start with half the shifts open: give each even shift to the first person who can take it.
    const start = new Array(ctx.S).fill(-1), lists = Array.from({ length: ctx.P }, () => []);
    for (let i = 0; i < ctx.S; i += 2) for (let p = 0; p < ctx.P; p++) {
      const nl = insertSorted(ctx, lists[p], i);
      if (ctx.elig[p][i] && validList(ctx, p, nl)) { lists[p] = nl; start[i] = p; break; }
    }
    for (const guide of [null, lp?.xs ?? null]) {
      const r = coverRepair(ctx, start, seed, { k: 2, rounds: 20, guide, guideProb: 1 });
      assert.ok(ownerValid(ctx, r.owner), `seed ${seed}`);
      assert.ok(Math.abs(openOf(ctx, r.owner) - r.open) < 1e-6, `seed ${seed}: reported ${r.open}`);
      assert.ok(r.open <= openOf(ctx, start) + 1e-9);
      if (lp) assert.ok(r.open >= lp.floor - 1e-6);
      if (guide) { guidedRounds += r.guidedRounds; gains += r.guidedGains; } else assert.equal(r.guidedRounds, 0);
    }
  }
  assert.ok(guidedRounds >= 200 && gains >= 30, `${guidedRounds} guided rounds, ${gains} gains`);
});

test("buildRoster reports the repair, unguided unless repairGuide: true", () => {
  const { staff, slots } = seededWeek(7, 6, 22);
  const on = buildRoster(staff, slots, { exact: true, deferCover: false, repairGuide: true, coverRepairAtFloor: true });
  const off = buildRoster(staff, slots, { exact: true, deferCover: false, coverRepairAtFloor: true });
  assert.equal(on.optimality.coverRepair.guided, true);
  assert.ok(on.optimality.coverRepair.guidedRounds > 0);
  assert.equal(off.optimality.coverRepair.guided, false);
  assert.equal(off.optimality.coverRepair.guidedRounds, 0);
});
