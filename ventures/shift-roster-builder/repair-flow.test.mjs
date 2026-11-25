// The flow-bounded repair (calc.mjs coverRepair with bound "flow", the default since 2026-11-15; neighbourhoodFloor; README
// "The repair's neighbourhood under a flow bound"). The neighbourhood's max-flow floor must never overstate what the
// neighbourhood can reach, the dead-shift bound must prune nothing a better assignment needs, and the search must stay valid.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, repairReserveFor, _internals } from "./calc.mjs";

const { buildContext, coverRepair, ownerValid, validList, validWith, insertSorted, neighbourhoodFloor } = _internals;

function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => [`P${p}`, 10 + rnd(12), [8, 11, 13, 16, 24][rnd(5)], 0, `Mon-Wed ${6 + rnd(3)}-${18 + rnd(6)}`].join(",")).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 6 + rnd(10); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}
const hrs = (ctx, i) => (ctx.slots[i].end - ctx.slots[i].start) / 60;
const openOf = (ctx, own) => own.reduce((t, p, i) => t + (p < 0 ? hrs(ctx, i) : 0), 0);

// A start with every other shift given to the first person who can take it.
function halfStart(ctx) {
  const start = new Array(ctx.S).fill(-1), lists = Array.from({ length: ctx.P }, () => []);
  for (let i = 0; i < ctx.S; i += 2) for (let p = 0; p < ctx.P; p++) {
    const nl = insertSorted(ctx, lists[p], i);
    if (ctx.elig[p][i] && validList(ctx, p, nl)) { lists[p] = nl; start[i] = p; break; }
  }
  return start;
}

test("the flow-bounded and depth-first repairs agree over everyone (the dead-shift bound and the floor stop prune nothing)", () => {
  let open = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { staff, slots } = seededWeek(seed, 2 + (seed % 3), 5 + (seed % 4));
    const ctx = buildContext(staff, slots, { exact: true });
    const start = new Array(ctx.S).fill(-1);
    const a = coverRepair(ctx, start, seed, { k: ctx.P, rounds: 1, nodeLimit: 1e7, totalNodes: 1e8, bound: "dfs" });
    const b = coverRepair(ctx, start, seed, { k: ctx.P, rounds: 1, nodeLimit: 1e7, totalNodes: 1e8, bound: "flow" });
    assert.ok(ownerValid(ctx, b.owner), `seed ${seed}`);
    assert.ok(Math.abs(a.open - b.open) < 1e-6, `seed ${seed}: dfs ${a.open}, flow ${b.open}`);
    if (b.open > 0) open++;
  }
  assert.ok(open >= 10, `${open} weeks keep hours open`);
});

test("a neighbourhood's flow floor never exceeds the least open hours an exhaustive search of it finds", () => {
  let tight = 0, checked = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const { staff, slots } = seededWeek(seed, 4 + (seed % 3), 10 + (seed % 5));
    const ctx = buildContext(staff, slots, { exact: true });
    const owner = halfStart(ctx);
    const people = [seed % ctx.P, (seed + 1) % ctx.P];
    const pick = new Set(people);
    const free = [];
    owner.forEach((p, i) => { if ((p < 0 || pick.has(p)) && people.some((q) => ctx.elig[q][i])) free.push(i); });
    const lists = Array.from({ length: ctx.P }, () => []);
    owner.forEach((p, i) => { if (p >= 0 && !pick.has(p)) lists[p] = insertSorted(ctx, lists[p], i); });
    const can = people.map((q) => free.map((i) => (ctx.elig[q][i] && validWith(ctx, q, lists[q], i) ? 1 : 0)));
    const floor = neighbourhoodFloor(ctx, people, free, lists, can);
    let best = Infinity;
    const go = (d, o) => {
      if (o >= best) return;
      if (d === free.length) { best = o; return; }
      const i = free[d];
      for (const q of people) {
        if (!ctx.elig[q][i]) continue;
        const nl = insertSorted(ctx, lists[q], i);
        if (!validList(ctx, q, nl)) continue;
        const old = lists[q]; lists[q] = nl; go(d + 1, o); lists[q] = old;
      }
      go(d + 1, o + hrs(ctx, i));
    };
    go(0, 0);
    assert.ok(floor <= best + 1e-9, `seed ${seed}: floor ${floor} above the best ${best}`);
    checked++; if (Math.abs(floor - best) < 1e-9) tight++;
  }
  assert.ok(checked === 80 && tight >= 40, `floor tight on ${tight} of ${checked}`);
});

test("the flow-bounded repair keeps every rule, never opens more, and skips rounds it cannot win", () => {
  let skipped = 0, gains = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { staff, slots } = seededWeek(seed, 5 + (seed % 5), 14 + (seed % 9));
    const ctx = buildContext(staff, slots, { exact: true });
    const start = halfStart(ctx);
    const r = coverRepair(ctx, start, seed, { k: 2, rounds: 20 });
    assert.ok(ownerValid(ctx, r.owner), `seed ${seed}`);
    assert.ok(Math.abs(openOf(ctx, r.owner) - r.open) < 1e-6, `seed ${seed}: reported ${r.open}`);
    assert.ok(r.open <= openOf(ctx, start) + 1e-9);
    skipped += r.skipped; gains += r.gains;
  }
  assert.ok(skipped > 0 && gains >= 20, `${skipped} skipped, ${gains} gains`);
});

test("buildRoster reports the floor's skips; coverRepairBound: 'dfs' keeps the old search", () => {
  const { staff, slots } = seededWeek(7, 6, 22);
  const on = buildRoster(staff, slots, { exact: true, deferCover: false, coverRepairAtFloor: true });
  const off = buildRoster(staff, slots, { exact: true, deferCover: false, coverRepairBound: "dfs", coverRepairAtFloor: true });
  assert.equal(typeof on.optimality.coverRepair.floorSkipped, "number");
  assert.equal(off.optimality.coverRepair.floorSkipped, 0);
});

test("the repair is skipped when the roster's open hours already equal the proven floor (README \"The repair reserve at 30-60 people\")", () => {
  let skips = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { staff, slots } = seededWeek(seed, 6, 22);
    const r = buildRoster(staff, slots, { exact: true, deferCover: false });
    const forced = buildRoster(staff, slots, { exact: true, deferCover: false, coverRepairAtFloor: true });
    const cr = r.optimality.coverRepair;
    if (cr?.skippedAtFloor) {
      skips++;
      // A skip happens only at a proven floor, so running the repair anyway cannot cover more.
      assert.ok(Math.abs(r.unfilledHours - r.optimality.forcedOpenHours) < 1e-6, `seed ${seed}: ${r.unfilledHours} vs floor ${r.optimality.forcedOpenHours}`);
      assert.ok(forced.unfilledHours >= r.unfilledHours - 1e-9, `seed ${seed}`);
    }
    // Asked for explicitly, it always runs.
    const on = buildRoster(staff, slots, { exact: true, deferCover: false, coverRepair: true });
    assert.notEqual(on.optimality.coverRepair?.skippedAtFloor, true, `seed ${seed}`);
  }
  assert.ok(skips > 0, "no seeded week reached its floor before the repair");
});

// README "The repair reserve on the biggest weeks": under a time budget the reserve defaults to a tenth of the budget, at most
// 2 s, on weeks of 300 or more copies, and to none below; an explicit coverRepairReserveMs wins either way.
function benchWeek(P, S) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  let seed = 20261022 + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}
test("the repair reserve is on by default from 300 copies, off below, and an explicit value wins", () => {
  const big = benchWeek(90, 252), small = benchWeek(40, 112);
  assert.ok(big.slots.length >= 300 && small.slots.length < 300);
  // The reserve is set from the week's size and the budget before any pass runs, so it is reported even when the passes never
  // start: here they are turned off, which also keeps the build short. (Before 2026-11-25 it was set only once the passes
  // started, and a loaded runner that spent the budget first read null: CI on PR #16481, PR #16599 and PR #18785.)
  const rb = buildRoster(big.staff, big.slots, { exact: true, timeBudgetMs: 10000, seed: 1, coverPass: false, dayLNS: false });
  assert.equal(rb.optimality.coverGuided, null);
  assert.equal(rb.optimality.coverRepairReserveMs, 1000);
  assert.equal(buildRoster(big.staff, big.slots, { exact: true, timeBudgetMs: 10000, seed: 1, coverPass: false, dayLNS: false, coverRepairReserveMs: 0 }).optimality.coverRepairReserveMs, 0);
  // The small-week builds at 3 s failed the same way on a loaded runner (reserve null: CI on PR #16599; 9 of 12 copies at once
  // here, and 5 of 12 even at 10 s), so the rule below and above 300 copies is checked on the pure function instead.
  assert.equal(repairReserveFor(small.slots.length, 3000), 0);
  assert.equal(repairReserveFor(299, 30000), 0);
  assert.equal(repairReserveFor(300, 10000), 1000);
  assert.equal(repairReserveFor(300, 30000), 2000);
  assert.equal(repairReserveFor(small.slots.length, 3000, 250), 250);
  assert.equal(repairReserveFor(big.slots.length, 10000, 0), 0);
  assert.equal(repairReserveFor(400, 0), 0);
});
