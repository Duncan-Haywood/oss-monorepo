import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "./allowance-bench.mjs";

test("one plain 20 ft wall: allowance rules match hand arithmetic", () => {
  const plan = { studSpacing: 16, studLength: 96, kerf: 0.125, topPlateLap: 24, cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 82.5,
    stock: [8, 10, 12, 14, 16].map((f) => ({ size: "2x4", length: f * 12, price: f })), walls: [{ id: "A", length: 240, stud: "2x4" }] };
  const c = compare(plan);
  assert.ok(c.ok);
  // per-foot: (20 studs * 8 ft + 3 * 20 ft) * 1.1 = 242
  assert.ok(Math.abs(c.perFoot - 242) < 1e-9);
  // on-centre: (ceil(240/16)+1 = 16 studs * 8 + 60) * 1.1 = 206.8
  assert.ok(Math.abs(c.onCentre - 206.8) < 1e-9);
  assert.ok(c.counted > 0);
});

import { samplePlan } from "./engine.mjs";
test("the example house lays out and the on-centre rule overshoots the count", () => {
  const c = compare(samplePlan());
  assert.ok(c.ok);
  assert.ok(c.onCentre > c.counted);
});

import { spacingSweep } from "./allowance-bench.mjs";
test("wider spacing lowers the counted order and the on-centre rule, not the per-foot rule", () => {
  const [a, b] = spacingSweep(samplePlan());
  assert.ok(a.ok && b.ok);
  assert.ok(b.counted < a.counted);
  assert.ok(b.onCentre < a.onCentre);
  assert.equal(a.perFoot, b.perFoot);
});
