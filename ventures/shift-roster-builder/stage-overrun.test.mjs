// Where the time past the budget goes (README, 2026-11-16): the stage timeline buildRoster returns, and the cover walk's
// deadline, which stops a walk mid-way instead of only between walks.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, _internals } from "./calc.mjs";

const { buildContext, coverPass, coverRepair, polishPay, scoreOwner, ownerValid } = _internals;

function week(seed, P, S) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}

test("timeline lists each stage's end in order, and its last entry matches the summed timings", () => {
  const { staff, slots } = week(7, 8, 20);
  const r = buildRoster(staff, slots, { memo: false });
  assert.ok(Array.isArray(r.timeline) && r.timeline.length > 0);
  for (let k = 1; k < r.timeline.length; k++) assert.ok(r.timeline[k][1] >= r.timeline[k - 1][1], "ends in order");
  assert.ok(r.timeline.some(([n]) => n === "anneal"));
  const total = Object.values(r.timings).reduce((a, b) => a + b, 0);
  assert.equal(r.timeline[r.timeline.length - 1][1], total);
});

test("a cover walk past its deadline stops at once and returns a valid roster no worse than its start", () => {
  const { staff, slots } = week(11, 12, 60);
  const ctx = buildContext(staff, slots, {});
  const start = new Array(ctx.S).fill(-1);
  const t0 = Date.now();
  const r = coverPass(ctx, start, 3, 50_000_000, { deadline: Date.now() - 1 });
  assert.ok(Date.now() - t0 < 1000, "stopped long before 50M steps");
  assert.ok(r.open <= scoreOwner(ctx, start).unfilled + 1e-9);
  const free = coverPass(ctx, start, 3, 20000);
  assert.ok(free.open <= r.open + 1e-9, "the untimed walk is unchanged and goes at least as far");
});

test("an untimed walk is the same with or without an infinite deadline", () => {
  const { staff, slots } = week(5, 10, 40);
  const ctx = buildContext(staff, slots, {});
  const start = new Array(ctx.S).fill(-1);
  const a = coverPass(ctx, start, 9, 30000), b = coverPass(ctx, start, 9, 30000, { deadline: Infinity });
  assert.deepEqual(a.owner, b.owner);
  assert.equal(a.open, b.open);
});

// The cover repair's deadline (README "The repair stops at the budget's end"): read inside its rounds, not only between them.
test("a cover repair past its deadline stops at once and returns its start unchanged", () => {
  const { staff, slots } = week(11, 12, 60);
  const ctx = buildContext(staff, slots, {});
  const start = coverPass(ctx, new Array(ctx.S).fill(-1), 3, 20000).owner;
  const before = scoreOwner(ctx, start).unfilled;
  const t0 = Date.now();
  const r = coverRepair(ctx, start.slice(), 7, { rounds: 1000, totalNodes: 1e9, timeLimitMs: 1e9, deadline: Date.now() - 1 });
  assert.ok(Date.now() - t0 < 200, "stopped before any round");
  assert.equal(r.late, true);
  assert.equal(r.gains, 0);
  assert.ok(Math.abs(r.open - before) < 1e-6);
});

test("a repair stopped mid-round by its deadline keeps a valid roster no worse than its start", () => {
  const { staff, slots } = week(13, 14, 70);
  const ctx = buildContext(staff, slots, {});
  const start = coverPass(ctx, new Array(ctx.S).fill(-1), 5, 5000).owner;
  const before = scoreOwner(ctx, start).unfilled;
  const r = coverRepair(ctx, start.slice(), 9, { rounds: 1000, totalNodes: 1e9, nodeLimit: 1e9, timeLimitMs: 1e9, deadline: Date.now() + 30 });
  assert.ok(ownerValid(ctx, r.owner), "every hard rule holds");
  assert.ok(r.open <= before + 1e-6);
  assert.ok(Math.abs(scoreOwner(ctx, r.owner).unfilled - r.open) < 1e-6, "reported open hours match the roster");
});

test("an infinite repair deadline changes nothing", () => {
  const { staff, slots } = week(5, 10, 40);
  const ctx = buildContext(staff, slots, {});
  const start = coverPass(ctx, new Array(ctx.S).fill(-1), 9, 3000).owner;
  const a = coverRepair(ctx, start.slice(), 3, { rounds: 20 }), b = coverRepair(ctx, start.slice(), 3, { rounds: 20, deadline: Infinity });
  assert.deepEqual(a.owner, b.owner);
  assert.equal(a.open, b.open);
  assert.equal(b.late, false);
});

// The pay polish's deadline (README "The pay polish stops at the budget's end").
test("a pay polish past its deadline stops within its first 1,024 moves and adds no open hours", () => {
  const { staff, slots } = week(17, 20, 80);
  const ctx = buildContext(staff, slots, {});
  const start = coverPass(ctx, new Array(ctx.S).fill(-1), 3, 20000).owner;
  const before = scoreOwner(ctx, start);
  const t0 = Date.now();
  const r = polishPay(ctx, start, 5, 1e9, { deadline: Date.now() - 1 });
  assert.ok(Date.now() - t0 < 200, "stopped at once, not after 1e9 moves");
  const after = scoreOwner(ctx, r);
  assert.ok(ownerValid(ctx, r), "every hard rule holds");
  assert.ok(after.unfilled <= before.unfilled + 1e-6);
  assert.ok(after.total <= before.total + 1e-6);
});

test("an infinite polish deadline changes nothing", () => {
  const { staff, slots } = week(19, 12, 50);
  const ctx = buildContext(staff, slots, {});
  const start = coverPass(ctx, new Array(ctx.S).fill(-1), 4, 5000).owner;
  assert.deepEqual(polishPay(ctx, start, 8, 30000), polishPay(ctx, start, 8, 30000, { deadline: Infinity }));
});
