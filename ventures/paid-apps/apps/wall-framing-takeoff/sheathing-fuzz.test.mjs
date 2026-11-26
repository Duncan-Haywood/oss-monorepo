import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { sheathe, defaultSheathing } from "./sheathing.mjs";

// Property test: random walls with random openings, both orientations. Whatever the layout, the panels of a
// wall must tile its length (per course) with no gap or overlap, no panel may be wider than a sheet, and
// every cutout must sit inside its panel.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const EPS = 1e-6;

function randomWall(rand, id) {
  const length = 96 + Math.floor(rand() * 40) * 6;
  const openings = [];
  let at = 12 + Math.floor(rand() * 30);
  while (rand() < 0.8 && at < length - 40) {
    const width = 24 + Math.floor(rand() * 8) * 6;
    if (at + width > length - 12) break;
    const door = rand() < 0.3;
    openings.push(door
      ? { kind: "door", offset: at, width: 36, height: 82.5, header: "2x10" }
      : { kind: "window", offset: at, width, height: 36 + Math.floor(rand() * 4) * 6, header: "2x10" });
    if (door) openings[openings.length - 1].width = 36;
    at += openings[openings.length - 1].width + 12 + Math.floor(rand() * 60);
  }
  return { id, length, stud: "2x4", openings };
}

test("fuzz: sheathing panels tile every wall and keep cutouts inside", () => {
  let checked = 0, declined = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const plan = { ...samplePlan(), walls: [randomWall(rand, "A"), randomWall(rand, "B")] };
    for (const orientation of ["vertical", "horizontal"]) {
      const cfg = { ...defaultSheathing(), orientation };
      const r = takeoff(plan);
      if (!r.ok) { declined++; continue; }
      let s;
      try { s = sheathe({ ...plan, sheathing: cfg }, r); }
      catch (e) { assert.fail(`seed ${seed} ${orientation}: threw ${e.message}`); }
      if (!s.ok) { declined++; continue; }
      for (const w of s.walls) {
        const src = plan.walls.find((x) => x.id === w.id);
        const courses = new Map();
        for (const p of w.panels) {
          assert.ok(p.width > EPS, `seed ${seed} ${orientation} ${p.id}: empty panel`);
          assert.ok(Math.abs(p.x1 - p.x0 - p.width) < 1e-9, `seed ${seed} ${p.id}: width disagrees with x0..x1`);
          for (const c of p.cutouts) {
            assert.ok(c.x0 >= -EPS && c.x1 <= p.width + EPS && c.x1 > c.x0, `seed ${seed} ${orientation} ${p.id}: cutout outside panel in x`);
            assert.ok(c.y0 >= -EPS && c.y1 > c.y0, `seed ${seed} ${orientation} ${p.id}: bad cutout y`);
          }
          const key = `${p.course}:${p.y0}`;
          if (!courses.has(key)) courses.set(key, []);
          courses.get(key).push(p);
        }
        for (const list of courses.values()) {
          list.sort((a, b) => a.x0 - b.x0);
          assert.ok(Math.abs(list[0].x0) < EPS || w.panels.length === 0 || list[0].x0 <= EPS, `seed ${seed} ${orientation} ${w.id}: course does not start at 0`);
          for (let i = 1; i < list.length; i++) assert.ok(Math.abs(list[i].x0 - list[i - 1].x1) < EPS, `seed ${seed} ${orientation} ${w.id}: gap or overlap at ${list[i].x0}`);
          assert.ok(list[list.length - 1].x1 >= src.length - EPS, `seed ${seed} ${orientation} ${w.id}: course stops short of the wall`);
        }
        checked++;
      }
    }
  }
  console.log(`# fuzz: ${checked} sheathed walls checked, ${declined} plans or layouts declined`);
  assert.ok(checked > 200, `only ${checked} walls checked (${declined} declined)`);
});
