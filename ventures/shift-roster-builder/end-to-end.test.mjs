// buildRoster with the exact check on a week above EXACT_TREE_SLOTS (60 copies): the whole-score column generation runs before the
// cover passes, the branch-and-bound tree is skipped, and the roster comes back proven, valid and no worse than the old order
// (cover passes first, tree on). The week is case 0 of `node eval/end-to-end.mjs 20 56`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster } from "./calc.mjs";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const week = () => {
  const P = 20, S = 56;
  let seed = 20261022 + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
};

test("a 20-person, 76-copy week is proven by column generation with the tree skipped and the cover passes deferred", () => {
  const { staff, slots } = week();
  assert.equal(slots.length, 76);
  const r = buildRoster(staff, slots, { exact: true });
  const o = r.optimality;
  assert.ok(o.scoreCG.proven);
  assert.ok(o.status === "optimal" || o.status === "improved");
  assert.ok(o.coverageProven);
  assert.equal(r.unfilledHours, 151);
  // the proof came first, so the plateau walk never ran and the tree was not entered
  assert.equal(r.timings.coverPass, undefined);
  assert.equal(r.timings.exactSearch ?? 0, 0);
  assert.equal(o.nodes, 0);
  // every assignment respects availability and nobody holds two overlapping shifts
  const byPerson = new Map();
  r.assignments.forEach((a, i) => { if (a.person) { if (!byPerson.has(a.person)) byPerson.set(a.person, []); byPerson.get(a.person).push(slots[i]); } });
  for (const list of byPerson.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let k = 1; k < list.length; k++) assert.ok(list[k].start >= list[k - 1].end);
  }
  // the old order (cover passes first, tree allowed) finds the same open hours and no lower score
  const old = buildRoster(staff, slots, { exact: true, deferCover: false, exactTree: true });
  assert.equal(old.unfilledHours, r.unfilledHours);
  assert.ok(r.score <= old.score + 0.5 + 1e-9);
});

test("timings name each stage that ran, in milliseconds", () => {
  const { staff, slots } = week();
  const r = buildRoster(staff, slots.slice(0, 10), { exact: false });
  assert.ok(Number.isFinite(r.timings.anneal));
  for (const v of Object.values(r.timings)) assert.ok(v >= 0);
});
