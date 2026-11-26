import { test } from "node:test";
import assert from "node:assert/strict";
import { expandSteppedWalls } from "./stepwall.mjs";
import { samplePlan, validatePlan, takeoff } from "./engine.mjs";

// Seeded fuzz: random stepped walls must be refused with a reason, or split into
// segments that tile the wall, keep every opening and tee once, and still take off.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("random stepped walls: refused with a reason, or segments tile the wall and take off", () => {
  const rand = rng(20261105);
  let expanded = 0;
  for (let n = 0; n < 300; n++) {
    const length = 120 + Math.floor(rand() * 40) * 6;
    const steps = [];
    let at = 0;
    const count = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      at += 12 + Math.floor(rand() * 60);
      steps.push({ at, studLength: 60 + Math.floor(rand() * 8) * 12 });
    }
    const openings = [];
    let o = 10 + Math.floor(rand() * 30);
    while (rand() < 0.7 && o < length - 40) {
      const width = 24 + Math.floor(rand() * 4) * 6;
      openings.push({ kind: "window", label: `W${openings.length}`, offset: o, width, height: 36, header: "2x6" });
      o += width + 10 + Math.floor(rand() * 50);
    }
    const tees = rand() < 0.5 ? [Math.floor(rand() * length)] : [];
    const wall = { id: "S", length, steps, openings, tees, corner: rand() < 0.5 };
    const before = JSON.stringify(wall);
    const r = expandSteppedWalls({ ...samplePlan(), walls: [wall] });
    assert.equal(JSON.stringify(wall), before, "input mutated");
    if (!r.ok) { assert.ok(r.errors.length && r.errors.every((e) => typeof e === "string" && e), "refusal without a reason"); continue; }
    expanded++;
    const segs = r.plan.walls;
    assert.equal(segs.length, steps.length + 1);
    assert.equal(segs.reduce((s, w) => s + w.length, 0), length, "segments do not tile the wall");
    assert.equal(segs.reduce((s, w) => s + w.openings.length, 0), openings.length, "openings lost or doubled");
    assert.ok(segs.every((w) => w.steps === undefined && w.length >= 12));
    const v = validatePlan(r.plan);
    if (v.ok) takeoff(r.plan);
  }
  assert.ok(expanded > 30, `only ${expanded} walls expanded`);
});
