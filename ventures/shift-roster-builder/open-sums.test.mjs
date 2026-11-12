// The open-hours floor lifted to sums of shift lengths (openSumLift in calc.mjs): open hours are a sum of whole shifts, so a
// floor between two such sums means the larger. Found on the call-out study (eval/callout-ilp-check.py, README "Open hours come in
// whole shifts"): with a spare part-timer, Cleo or Eli off Saturday left 3 h open, an ILP proves 3 h is least, and the engine's
// floor stopped at 2 h after 40 s of search, because nothing sums to 2 h from shifts of 3, 8 and 10 hours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openSumLift, parseStaff, parseShifts, buildRoster, sampleShifts } from "./calc.mjs";
import { WITH_SPARE } from "./eval/callout-cover-study.mjs";

test("openSumLift rounds a floor up to the least sum of shift lengths at or above it", () => {
  const lift = openSumLift([8, 3, 10, 8], 40);
  assert.deepEqual([0, 0.5, 2, 3, 3.2, 4, 9, 12, 12.5, 29].map(lift), [0, 3, 3, 3, 8, 8, 10, 13, 13, 29]);
  assert.equal(lift(30), 30, "past the total no sum exists: the floor is kept");
  assert.equal(openSumLift([7.5, 0.25], 10)(1), 7.5, "quarter-hour lengths");
  assert.equal(openSumLift([8, 1 / 3], 10)(1), 1, "off the quarter-hour grid: unchanged");
  assert.equal(openSumLift([], 10)(2), 2);
});

test("openSumLift matches a brute-force subset sum on random lengths, and never lowers a floor", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  for (let c = 0; c < 200; c++) {
    const len = Array.from({ length: 1 + rnd(9) }, () => (1 + rnd(48)) / 4);
    const sums = new Set([0]);
    for (const h of len) for (const s of [...sums]) sums.add(s + h);
    const sorted = [...sums].sort((a, b) => a - b), total = sorted.at(-1);
    const lift = openSumLift(len, total);
    for (let k = 0; k < 12; k++) {
      const x = rnd(Math.ceil(total * 4) + 4) / 4 + (rnd(2) ? 0.1 : 0);
      const want = x <= 1e-9 ? x : (sorted.find((s) => s >= x - 1e-6) ?? x);
      assert.ok(Math.abs(lift(x) - Math.max(x, want)) < 1e-9, `${len} at ${x}: ${lift(x)} vs ${want}`);
      assert.ok(lift(x) >= x);
    }
  }
});

test("call-out week with Cleo off Saturday: coverage proven at 3 h open (2 h floor without the lift)", () => {
  const slots = parseShifts(sampleShifts()).slots;
  const text = WITH_SPARE().split("\n").map((l) => (l.startsWith("Cleo,") ? `${l}, off: Sat` : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
  const staff = parseStaff(text).staff;
  const on = buildRoster(staff, slots, { exactMs: 1500 });
  assert.equal(on.unfilledHours, 3);
  assert.equal(on.optimality.forcedOpenHours, 3);
  assert.equal(on.optimality.coverageProven, true);
  const off = buildRoster(staff, slots, { exactMs: 1500, openSums: false });
  assert.equal(off.unfilledHours, 3);
  assert.equal(off.optimality.coverageProven, false);
  assert.ok(off.optimality.forcedOpenHours < 3);
});
