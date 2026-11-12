// openHoursFloor (calc.mjs) lets the coverage plateau walk stop early, which is only safe if the floor never overstates the
// least hours a valid roster must leave open. Checked here against every assignment on small seeded weeks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, sampleStaff, sampleShifts, _internals } from "./calc.mjs";

const { buildContext, ownerValid, openHoursFloor } = _internals;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function leastOpen(ctx) {
  const { P, S, slots } = ctx, owner = new Array(S).fill(-1);
  let best = Infinity;
  const go = (i, open) => {
    if (open >= best) return;
    if (i === S) { if (ownerValid(ctx, owner)) best = open; return; }
    for (let p = 0; p < P; p++) if (ctx.elig[p][i]) { owner[i] = p; go(i + 1, open); }
    owner[i] = -1;
    go(i + 1, open + (slots[i].end - slots[i].start) / 60);
  };
  go(0, 0);
  return best;
}

test("the open-hours floor never overstates the least a valid roster leaves open, and is often exact", () => {
  let tight = 0, positive = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed), P = 2 + Math.floor(r() * 2), S = 4 + Math.floor(r() * 4);
    const staff = ["name, wage, max hours, min hours, availability"];
    for (let p = 0; p < P; p++) staff.push(`P${p}, 15, ${4 + Math.floor(r() * 14)}, 0, ${r() < 0.4 ? "any" : `Mon-${DAYS[1 + Math.floor(r() * 3)]} ${6 + Math.floor(r() * 4)}-${14 + Math.floor(r() * 8)}`}`);
    const shifts = [];
    for (let s = 0; s < S; s++) { const a = 6 + Math.floor(r() * 10); shifts.push(`${DAYS[Math.floor(r() * 4)]},${a},${a + 3 + Math.floor(r() * 5)},1`); }
    const opts = [{}, { maxDailyHours: 6 }, { minRestHours: 10 }][seed % 3];
    const ctx = buildContext(parseStaff(staff.join("\n")).staff, parseShifts(shifts.join("\n")).slots, opts);
    const floor = openHoursFloor(ctx), least = leastOpen(ctx);
    assert.ok(floor <= least + 1e-9, `seed ${seed}: floor ${floor} > least open ${least}`);
    if (least > 0) { positive++; if (Math.abs(floor - least) < 1e-9) tight++; }
  }
  assert.ok(positive >= 20, `only ${positive} weeks must leave hours open`);
  // 2026-11-12: exact on 16 of the 52 weeks that must leave hours open (a relaxation, so a looser floor is expected elsewhere).
  assert.ok(tight >= 10, `floor exact on only ${tight} of ${positive}`);
});

test("the café sample's floor is the proven 15 hours", () => {
  const ctx = buildContext(parseStaff(sampleStaff()).staff, parseShifts(sampleShifts()).slots, {});
  assert.equal(openHoursFloor(ctx), 15);
});
