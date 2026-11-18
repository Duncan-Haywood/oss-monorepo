import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutPaint, validatePaint, paintText } from "./paint.mjs";

const room = { studLength: 92.625, walls: [
  { id: "A", length: 144, sheathed: false, openings: [{ kind: "door", width: 36, height: 80 }] },
  { id: "B", length: 120, openings: [{ kind: "window", width: 48, height: 48 }] },
] };

test("by hand: area, coats, gallons", () => {
  // height 96 in (92.625 + 4.5 rounds to 96). A: (144*96 - 36*80) * 2 faces = 21888 in2; B: (120*96 - 48*48) * 1 = 9216 in2
  const p = layoutPaint({ waste: 0, doors: false }, room);
  assert.equal(p.height, 96);
  assert.ok(Math.abs(p.wallSqFt - (21888 + 9216) / 144) < 1e-9); // 216 sq ft
  assert.ok(Math.abs(p.paintGallonsExact - 216 * 2 / 350) < 1e-9);
  assert.equal(p.paintGallons, 2);
});

test("doors, ceilings, primer and waste", () => {
  const p = layoutPaint({ ceilings: [{ width: 144, depth: 120 }], primerCoats: 1, waste: 0.1 }, room);
  assert.equal(p.doorLeaves, 1);
  assert.equal(p.doorSqFt, 42);
  assert.equal(p.ceilingSqFt, 120);
  assert.ok(Math.abs(p.paintGallonsExact - ((216 + 42) * 2 / 350 + 120 * 2 / 350) * 1.1) < 1e-9);
  assert.ok(Math.abs(p.primerGallonsExact - (216 + 120) / 300 * 1.1) < 1e-9);
});

test("pails and cost", () => {
  const big = { walls: [{ id: "A", length: 4800, openings: [] }] }; // 3200 sq ft at 8 ft
  const p = layoutPaint({ height: 96, coats: 2, waste: 0, gallonPrice: 40, fivePrice: 150 }, big);
  assert.equal(p.paintGallons + 5 * p.paintPails >= Math.ceil(3200 * 2 / 350 - 1e-9), true);
  assert.equal(p.paintPails, 4); // 19 gal: 3 pails + 4 gal at 40 = 310 > 150, so a 4th pail
  assert.equal(p.cost, 600);
});

test("bad inputs are refused, not guessed", () => {
  assert.ok(validatePaint({ coats: 2.5 }).length);
  assert.ok(validatePaint({ coverage: 10 }).length);
  assert.ok(validatePaint({ faces: 3 }).length);
  assert.ok(validatePaint({ ceilings: [{ width: 0, depth: 5 }] }).length);
  assert.equal(layoutPaint({ waste: 2 }, room).ok, false);
  assert.match(paintText(layoutPaint({}, room)).join("\n"), /Paint: 2 coats/);
});

test("layoutPaint refuses a missing plan or one with no wall list instead of throwing", () => {
  for (const bad of [undefined, null, 5, {}, { walls: "x" }]) {
    const r = layoutPaint({}, bad);
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /wall list/);
  }
});
