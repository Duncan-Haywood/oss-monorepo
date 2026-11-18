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

// The whole-shift floor (`openHoursFloor(ctx, { wholeShifts: true })`, 2026-11-16) caps each person at the largest sum of whole
// eligible shifts within their hours. The plateau walk stops on it, so it must also never overstate, and never be below the plain one.
test("the whole-shift floor never overstates, never undercuts the plain floor, and is tighter where max hours split a shift", () => {
  let tighter = 0, exact = 0, positive = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed), P = 2 + Math.floor(r() * 2), S = 4 + Math.floor(r() * 4);
    const staff = ["name, wage, max hours, min hours, availability"];
    for (let p = 0; p < P; p++) staff.push(`P${p}, 15, ${4 + Math.floor(r() * 14)}, 0, ${r() < 0.4 ? "any" : `Mon-${DAYS[1 + Math.floor(r() * 3)]} ${6 + Math.floor(r() * 4)}-${14 + Math.floor(r() * 8)}`}`);
    const shifts = [];
    for (let s = 0; s < S; s++) { const a = 6 + Math.floor(r() * 10); shifts.push(`${DAYS[Math.floor(r() * 4)]},${a},${a + 3 + Math.floor(r() * 5)},1`); }
    const opts = [{}, { maxDailyHours: 6 }, { minRestHours: 10 }][seed % 3];
    const ctx = buildContext(parseStaff(staff.join("\n")).staff, parseShifts(shifts.join("\n")).slots, opts);
    const plain = openHoursFloor(ctx), whole = openHoursFloor(ctx, { wholeShifts: true }), least = leastOpen(ctx);
    assert.ok(whole <= least + 1e-9, `seed ${seed}: whole-shift floor ${whole} > least open ${least}`);
    assert.ok(whole >= plain - 1e-9, `seed ${seed}: whole-shift floor ${whole} < plain ${plain}`);
    if (whole > plain + 1e-9) tighter++;
    if (least > 0) { positive++; if (Math.abs(whole - least) < 1e-9) exact++; }
  }
  // 2026-11-16: tighter on 18 of the 60 weeks, exact on 31 of the 52 that must leave hours open (the plain floor: 16).
  assert.ok(tighter >= 10, `the whole-shift floor was tighter on only ${tighter} weeks`);
  assert.ok(exact >= 25, `whole-shift floor exact on only ${exact} of ${positive}`);
  // One person, 16 h, pinned to a 10 h and a 9 h shift: the plain flow covers 16 of the 19 h (3 open); whole shifts leave 9 open.
  const one = buildContext(parseStaff("name,wage,max,min,availability\nAna,18,16,0,any").staff, parseShifts("Mon,8,18,1\nTue,12,21,1").slots, {});
  assert.equal(openHoursFloor(one), 3);
  assert.equal(openHoursFloor(one, { wholeShifts: true }), 9);
});

test("wholeShiftCap is the largest subset sum within the cap", () => {
  const { wholeShiftCap } = _internals;
  const r = rng(7);
  for (let t = 0; t < 300; t++) {
    const lens = Array.from({ length: Math.floor(r() * 8) }, () => [180, 240, 270, 480, 600, 601][Math.floor(r() * 6)]);
    const cap = Math.floor(r() * 2400);
    let best = 0;
    for (let m = 0; m < 1 << lens.length; m++) { let s = 0; for (let k = 0; k < lens.length; k++) if (m >> k & 1) s += lens[k]; if (s <= cap && s > best) best = s; }
    const total = lens.reduce((a, b) => a + b, 0);
    assert.equal(wholeShiftCap(lens, cap), total <= cap ? cap : best, `${lens} within ${cap}`);
  }
});
