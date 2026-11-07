import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutStucco, validateStucco, stuccoText } from "./stucco.mjs";

// Two exterior walls, 8 ft high: A is 20 ft with one 48 x 48 in window, B is 10 ft.
const plan = { studLength: 96, defaultHeaderHeight: 80, walls: [
  { id: "A", length: 240, openings: [{ kind: "window", offset: 60, width: 48, height: 48 }] },
  { id: "B", length: 120 },
] };

test("by hand: area, barrier, lath, plaster and trim for a 30 ft by 8 ft wall run", () => {
  const s = layoutStucco({}, plan);
  assert.equal(s.ok, true);
  assert.equal(s.height, 96);
  assert.equal(s.netSqFt, 224);                 // 360 in x 96 in = 240 sq ft, less a 4 x 4 ft window
  assert.ok(Math.abs(s.barrier.sqFt - 224 * 2 * 1.1) < 1e-9); assert.equal(s.barrier.rolls, 1);
  assert.equal(s.lath.sheets, 16);              // 224 x 1.1 / 18 x 1.1 = 15.06 -> 16
  assert.equal(s.lath.fasteners, 407);          // 246.4 sq ft x (144 / (16 x 6)) x 1.1 = 406.6
  assert.ok(Math.abs(s.plaster.volumeCuFt - 224 * 0.875 / 12) < 1e-9);
  assert.equal(s.plaster.bags, 32);             // 16.333 x 1.15 / 0.6 = 31.3
  assert.equal(s.trim.screed.feet, 30);
  assert.equal(s.trim.casing.feet, 16);         // 2 x 48 + 2 x 48 in
  assert.equal(s.trim.joints.count, 1);         // wall A is 20 ft, over the 18 ft run limit
  assert.equal(s.trim.corner.feet, 32);         // 4 corners x 8 ft
  assert.equal(s.cost, null);
});

test("typed figures move the answer the way the arithmetic says", () => {
  const thin = layoutStucco({ scratch: 0.25, brown: 0.25, finish: 0.125, rebound: 0 }, plan);
  assert.ok(Math.abs(thin.plaster.volumeCuFt - 224 * 0.625 / 12) < 1e-9);
  assert.equal(thin.plaster.bags, 20);          // 11.667 / 0.6 = 19.4
  assert.equal(layoutStucco({ barrierLayers: 0 }, plan).barrier.rolls, 0);
  assert.equal(layoutStucco({ corners: 0 }, plan).trim.corner.pieces, 0);
  assert.equal(layoutStucco({ maxRunFt: 8 }, plan).trim.joints.count, 2 + 1);   // A: ceil(20/8)-1 = 2, B: ceil(10/8)-1 = 1
});

test("a wall that is not sheathed is left out; prices total only what is priced", () => {
  const p2 = { ...plan, walls: [...plan.walls, { id: "Inside", length: 500, sheathed: false }] };
  assert.equal(layoutStucco({}, p2).netSqFt, 224);
  const c = layoutStucco({ bagPrice: 10, lathPrice: 5 }, plan);
  assert.equal(c.cost, 32 * 10 + 16 * 5);
  assert.match(stuccoText(c).join("\n"), /Cost of the lines you priced: 400\.00/);
});

test("bad input is refused with a message", () => {
  assert.ok(validateStucco({ waste: "0.1" }).length);
  assert.ok(validateStucco({ bagYieldCuFt: 0 }).length);
  assert.ok(validateStucco({ barrierLayers: 1.5 }).length);
  assert.ok(validateStucco([]).length);
  assert.equal(layoutStucco({ rebound: 0.9 }, plan).ok, false);
  assert.equal(layoutStucco({}, { ...plan, walls: [{ id: "x", length: 100, sheathed: false }] }).ok, false);
});
