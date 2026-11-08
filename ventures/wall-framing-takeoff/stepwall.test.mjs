import { test } from "node:test";
import assert from "node:assert/strict";
import { expandSteppedWalls } from "./stepwall.mjs";
import { takeoff, samplePlan, layoutWall } from "./engine.mjs";

const plan = (wall) => ({ ...samplePlan(), walls: [wall] });

test("a plan with no steps comes back untouched", () => {
  const p = plan({ id: "A", length: 120, openings: [] });
  const r = expandSteppedWalls(p);
  assert.equal(r.ok, true);
  assert.equal(r.plan, p);
});

test("a 20 ft wall stepping from 8 ft to 10 ft studs splits in two with a doubled stud at the step", () => {
  const p = plan({ id: "A", length: 240, studLength: 92.625, corner: true, tees: [80, 200], steps: [{ at: 120, studLength: 116.625 }],
    openings: [{ kind: "window", offset: 30, width: 36, height: 48, header: "2x6" }, { kind: "window", offset: 150, width: 36, height: 48, header: "2x6" }] });
  const r = expandSteppedWalls(p);
  assert.equal(r.ok, true);
  const [a, b] = r.plan.walls;
  assert.deepEqual([a.id, b.id], ["A (a)", "A (b)"]);
  assert.deepEqual([a.length, b.length], [120, 120]);
  assert.deepEqual([a.studLength, b.studLength], [92.625, 116.625]);
  assert.deepEqual(a.tees, [80]); assert.deepEqual(b.tees, [80]);
  assert.equal(a.corner, true); assert.equal(b.corner, false);
  assert.equal(b.openings[0].offset, 30);
  assert.ok(!("steps" in a) && !("steps" in b));
  // Hand count: each segment is a level wall, so each has two end studs; the step is two adjacent end studs.
  const la = layoutWall(r.plan, a), lb = layoutWall(r.plan, b);
  assert.equal(la.members.filter((m) => m.label === "end stud").length, 2);
  assert.equal(lb.members.filter((m) => m.label === "end stud").length, 2);
  const tall = lb.members.filter((m) => m.kind === "stud" && Math.abs(m.h - 116.625) < 1e-6);
  assert.ok(tall.length >= 2);
  const t = takeoff(r.plan);
  assert.equal(t.ok, true);
});

test("an opening that crosses the step, a bad order or a gable is refused", () => {
  const w = { id: "A", length: 240, steps: [{ at: 120, studLength: 116.625 }], openings: [{ kind: "door", offset: 100, width: 36, height: 80, header: "2x6" }] };
  assert.equal(expandSteppedWalls(plan(w)).ok, false);
  assert.equal(expandSteppedWalls(plan({ id: "A", length: 240, steps: [{ at: 120, studLength: 100 }, { at: 100, studLength: 90 }] })).ok, false);
  assert.equal(expandSteppedWalls(plan({ id: "A", length: 240, gable: { pitch: 6 }, steps: [{ at: 120, studLength: 100 }] })).ok, false);
  assert.equal(expandSteppedWalls(plan({ id: "A", length: 240, steps: [{ at: 120, studLength: 5 }] })).ok, false);
});

test("a tee from another wall onto a stepped wall lands on the segment under it", () => {
  const p = { ...samplePlan(), walls: [{ id: "H", length: 240, steps: [{ at: 120, studLength: 116.625 }] }, { id: "P", length: 100, tee: { wall: "H", at: 150 } }] };
  const r = expandSteppedWalls(p);
  assert.deepEqual(r.plan.walls[2].tee, { wall: "H (b)", at: 30 });
});

test("a step that leaves a segment under 12 in is refused here, with the step named", () => {
  for (const at of [6, 11.9, 229, 235]) {
    const r = expandSteppedWalls(plan({ id: "A", length: 240, steps: [{ at, studLength: 116.625 }], openings: [] }));
    assert.equal(r.ok, false, `at ${at}`);
    assert.match(r.errors[0], /Wall A: steps must rise in order/);
  }
  assert.equal(expandSteppedWalls(plan({ id: "A", length: 240, steps: [{ at: 12, studLength: 116.625 }, { at: 228, studLength: 92.625 }], openings: [] })).ok, true);
});

test("hostile stepped walls are refused with a reason, not a raw TypeError or coercion", () => {
  const cases = {
    "text length": (w) => { w.length = "240"; },
    "openings not a list": (w) => { w.openings = { a: 1 }; },
    "null opening": (w) => { w.openings = [null]; },
    "text opening offset": (w) => { w.openings = [{ kind: "door", offset: "20", width: 36 }]; },
    "tees not a list": (w) => { w.tees = 5; },
    "text tee": (w) => { w.tees = ["50"]; },
    "null id": (w) => { w.id = null; },
    "object id": (w) => { w.id = { a: 1 }; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const w = { id: "A", length: 240, steps: [{ at: 100, studLength: 120 }], openings: [], tees: [] };
    mutate(w);
    let r;
    assert.doesNotThrow(() => { r = expandSteppedWalls(plan(w)); }, name);
    assert.equal(r.ok, false, name);
  }
});

test("a segment name that collides with another wall is refused", () => {
  const p = plan({ id: "A", length: 240, steps: [{ at: 100, studLength: 120 }], openings: [] });
  p.walls.push({ id: "A (a)", length: 50 });
  const r = expandSteppedWalls(p);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Two walls are named "A \(a\)"/);
});
