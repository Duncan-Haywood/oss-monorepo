import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, rosterFromOwner, sampleStaff, sampleShifts } from "./calc.mjs";

test("a browser-built owner array prices exactly as buildRoster did, on the sample week", () => {
  const st = parseStaff(sampleStaff()).staff, sl = parseShifts(sampleShifts()).slots;
  const r = buildRoster(st, sl);
  const x = rosterFromOwner(st, sl, r.owner);
  assert.equal(x.ok, true);
  assert.ok(Math.abs(x.cost - r.cost) < 1e-6, `${x.cost} vs ${r.cost}`);
  assert.equal(x.unfilledSlots, r.unfilledSlots);
  assert.deepEqual(x.assignments.map((a) => a.person), r.assignments.map((a) => a.person));
  assert.deepEqual(x.people.map((p) => p.hours), r.people.map((p) => p.hours));
});

test("an owner array that breaks a rule or does not fit the lists is refused", () => {
  const st = parseStaff("name, wage, max hours, min hours, availability\nAna, 20, 16, 0, any\nBen, 18, 40, 0, Mon 9-17").staff;
  const sl = parseShifts("day, start, end, people needed\nMon, 9, 17, 1\nTue, 9, 17, 1\nWed, 9, 17, 1").slots;
  assert.equal(rosterFromOwner(st, sl, [0, 0, -1]).ok, true);
  assert.match(rosterFromOwner(st, sl, [0, 0, 0]).error, /breaks a rule/); // Ana over her 16 hours
  assert.match(rosterFromOwner(st, sl, [1, 1, -1]).error, /breaks a rule/); // Ben is free Monday only
  assert.match(rosterFromOwner(st, sl, [0, 0]).error, /does not match/);
  assert.match(rosterFromOwner(st, sl, [0, 2, -1]).error, /not on the staff list/);
  assert.match(rosterFromOwner(st, sl, [0, 0.5, -1]).error, /not on the staff list/);
  assert.match(rosterFromOwner(st, sl, "0,0,-1").error, /does not match/);
  assert.equal(rosterFromOwner(st, sl, [-1, -1, -1]).unfilledSlots, 3);
});
