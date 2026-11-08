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

test("two windows too close to share kings: refused plain, laid out when ganged", () => {
  const plan = { ...samplePlan(), walls: [{ id: "A", length: 240, stud: "2x4", openings: [
    { kind: "window", offset: 60, width: 36, height: 48, sill: 36, header: "2x8" }, { kind: "window", offset: 99, width: 36, height: 48, sill: 36, header: "2x8" }] }] };
  const plain = compare(plan);
  assert.equal(plain.ok, false);
  const g = compare(plan, { gang: true });
  assert.ok(g.ok && g.ganged);
});

test("at 12 in o.c. the per-foot rule under-orders; at 16 in and wider it over-orders", () => {
  const [s12, s16, s192, s24] = spacingSweep(samplePlan(), [12, 16, 19.2, 24]);
  assert.ok(s12.perFootOff < 0);
  assert.ok(s16.perFootOff > 0 && s192.perFootOff > s16.perFootOff && s24.perFootOff > s192.perFootOff);
});

test("a 16 ft opening in a 20 ft wall: refused as drawn, laid out with the bench's 24 ft stock retry", () => {
  const plan = { ...samplePlan(), walls: [{ id: "A", length: 240, stud: "2x4", openings: [
    { kind: "door", offset: 24, width: 192, height: 82, header: "2x10" }] }] };
  assert.equal(compare(plan).ok, false);
  const g = compare(plan, { gang: true });
  assert.ok(g.ok && g.longHeaders, JSON.stringify(g.errors));
});

import { breakEvenWaste } from "./allowance-bench.mjs";
test("break-even waste: the rule's own 10% waste is the break-even when it already equals the count", () => {
  const b = breakEvenWaste({ counted: 100, perFoot: 110, onCentre: 220 });
  assert.ok(Math.abs(b.perFoot - 0) < 1e-12);   // 110 / 1.1 = 100: zero waste matches
  assert.ok(Math.abs(b.onCentre - (-0.5)) < 1e-12); // 200 raw vs 100 counted: -50%
});

test("the rules size studs from each wall's own studLength when it has one", () => {
  const base = { ...samplePlan(), studLength: 96 };
  const wall = (studLength) => ({ id: "A", length: 192, stud: "2x4", ...(studLength ? { studLength } : {}) });
  const flat = compare({ ...base, walls: [wall()] });
  const tall = compare({ ...base, walls: [wall(120)] });
  assert.ok(flat.ok && tall.ok);
  // per-foot rule by hand: 16 ft wall, one stud per foot at 8 ft (or 10 ft) plus three plates, +10% waste
  assert.ok(Math.abs(flat.perFoot - 1.1 * (16 * 8 + 48)) < 1e-9);
  assert.ok(Math.abs(tall.perFoot - 1.1 * (16 * 10 + 48)) < 1e-9);
});
