import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutRetaining, validateRetaining, retainingText } from "./retaining.mjs";

const w30 = { walls: [{ length: 30, height: 3 }] };

test("30 ft x 3 ft wall of 16 x 6 x 12 in blocks, hand count", () => {
  const r = layoutRetaining(w30);
  assert.equal(r.ok, true);
  assert.equal(r.walls[0].exposedCourses, 6); assert.equal(r.walls[0].buriedCourses, 1);
  assert.equal(r.walls[0].blocksPerCourse, 23); // 360 / 16 = 22.5
  assert.equal(r.blocks, 170); // 23 x 7 = 161, +5% = 169.05
  assert.equal(r.caps, 24); // 22.5 +5% = 23.6
  assert.ok(Math.abs(r.baseCuYd - 30 * 2 * 0.5 / 27 * 1.25) < 1e-9); // trench 12 + 2x6 in wide, 6 in deep
  assert.ok(Math.abs(r.drainCuYd - 30 * 1 * 3.5 / 27) < 1e-9); // 7 courses x 6 in = 3.5 ft built
  assert.equal(r.fabricSqFt, 30 * (3.5 + 1 + 2));
  assert.equal(r.pipeFeet, 30); assert.equal(r.adhesiveTubes, 2); assert.equal(r.geogridSqFt, 0); assert.equal(r.cost, null);
  assert.deepEqual(r.notes, []);
});
test("geogrid layers, steps of different height, and prices", () => {
  const r = layoutRetaining({ walls: [{ length: 20, height: 5 }, { length: 10, height: 2 }], block: { geogridEvery: 2, geogridLength: 5, blockPrice: 4, capPrice: 5 } });
  assert.equal(r.walls[0].exposedCourses, 10);
  assert.equal(r.walls[0].geogridLayers, 4); // after courses 2,4,6,8 -> floor(9/2)
  assert.equal(r.walls[1].geogridLayers, 1); // 4 exposed courses: floor(3/2)
  assert.equal(r.geogridSqFt, (4 * 20 + 1 * 10) * 5);
  assert.equal(r.blocks, 174 + 42); // 15 x 11 = 165 and 8 x 5 = 40, each +5%
  assert.equal(r.caps, 16 + 8);
  assert.equal(r.cost, 216 * 4 + 24 * 5);
});
test("refusals, notes and text", () => {
  for (const bad of [null, {}, { walls: [] }, { walls: [{ length: 0, height: 3 }] }, { walls: [{ length: 10, height: 30 }] }, { walls: [{ length: 10, height: 3 }], block: { waste: 2 } }, { walls: [{ length: "x", height: 3 }] }])
    assert.ok(validateRetaining(bad).length > 0, JSON.stringify(bad));
  const tall = layoutRetaining({ walls: [{ length: 10, height: 5 }] });
  assert.ok(tall.notes.some((n) => /geogrid/.test(n))); assert.ok(tall.notes.some((n) => /permit/.test(n)));
  assert.match(retainingText(layoutRetaining(w30)).join("\n"), /170 blocks/);
});
