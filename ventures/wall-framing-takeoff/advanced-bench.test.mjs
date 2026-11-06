import { test } from "node:test";
import assert from "node:assert/strict";
import { measure, VARIANTS } from "./advanced-bench.mjs";
import { samplePlan } from "./engine.mjs";

test("example house: each advanced option costs no more than standard, all together least", () => {
  const m = measure(samplePlan());
  assert.ok(m.ok);
  assert.equal(m.rows.length, VARIANTS.length);
  const [std, ...rest] = m.rows;
  for (const r of rest) assert.ok(r.cost <= std.cost, r.name);
  const all = m.rows.at(-1);
  assert.ok(m.rows.every((r) => all.cost <= r.cost));
});

test("a 20 ft plain wall: 24 in spacing drops the stud count by hand arithmetic", () => {
  const plan = { studSpacing: 16, studLength: 96, kerf: 0.125, topPlateLap: 24, cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 82.5,
    stock: [8, 10, 12, 14, 16].map((f) => ({ size: "2x4", length: f * 12, price: f })), walls: [{ id: "A", length: 240, stud: "2x4" }] };
  const m = measure(plan);
  assert.ok(m.ok);
  // studs: 16 in -> 16 (15 + end), 24 in -> 11 (10 + end); plates 3 runs in both
  assert.ok(m.rows[1].pieces < m.rows[0].pieces);
  assert.equal(m.rows[0].pieces - m.rows[1].pieces, 5);
});

test("gang option: a plan whose close windows break the layout is measured once they are ganged", () => {
  // two 36 in windows 3 in apart: kings collide (need 4-1/2 in), so as drawn it does not lay out
  const stock = [8, 10, 12, 14, 16].map((f) => ({ size: "2x4", length: f * 12, price: f }))
    .concat([{ size: "2x10", length: 192, price: 30 }]);
  const wall = { id: "A", length: 240, stud: "2x4", openings: [
    { kind: "window", label: "W1", offset: 60, width: 36, height: 48, header: "2x10" },
    { kind: "window", label: "W2", offset: 99, width: 36, height: 48, header: "2x10" }] };
  const plan = { studSpacing: 16, studLength: 96, kerf: 0.125, topPlateLap: 24, cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 82.5, stock, walls: [wall] };
  assert.equal(measure(plan).ok, false);
  const g = measure(plan, { gang: true });
  assert.ok(g.ok, JSON.stringify(g.errors));
  assert.equal(g.ganged.length, 1);
  assert.equal(g.rows.length, VARIANTS.length);
});
