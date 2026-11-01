import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan, validatePlan, layoutWall, verifyWall } from "./engine.mjs";

// Property test: random walls (length, spacing, stud size, openings) must either be rejected by validatePlan
// or lay out with no self-check problem, and takeoff must then succeed with positive totals.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWall(rand, id) {
  const length = 72 + Math.floor(rand() * 60) * 6;
  const openings = [];
  let at = 12 + Math.floor(rand() * 40);
  while (rand() < 0.8 && at < length - 40) {
    const door = rand() < 0.3;
    const width = door ? 36 : 24 + Math.floor(rand() * 8) * 6;
    if (at + width > length - 12) break;
    openings.push(door
      ? { kind: "door", label: `D${openings.length}`, offset: at, width, height: 82.5, header: "2x10" }
      : { kind: "window", label: `W${openings.length}`, offset: at, width, height: 24 + Math.floor(rand() * 5) * 6, header: "2x10" });
    at += width + 8 + Math.floor(rand() * 60);
  }
  return { id, length, stud: rand() < 0.5 ? "2x4" : "2x6", corner: rand() < 0.5, openings };
}

test("fuzz: every valid random wall lays out with a clean self-check", () => {
  let laid = 0, rejected = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const plan = samplePlan();
    plan.studSpacing = rand() < 0.5 ? 16 : 24;
    plan.walls = [randomWall(rand, "A"), randomWall(rand, "B")];
    if (validatePlan(plan).length) { rejected++; continue; }
    for (const wall of plan.walls) {
      const w = layoutWall(plan, wall);
      const problems = verifyWall(w, wall);
      if (problems.length) failures.push(`seed ${seed} ${wall.id}: ${problems[0]}`);
    }
    const t = takeoff(plan);
    if (!t.ok) failures.push(`seed ${seed}: takeoff ${t.errors?.[0]}`);
    laid++;
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 200, `only ${laid} valid walls (${rejected} rejected)`);
});
