import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFlooring, validateFlooring, flooringText } from "./flooring.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("plank by hand: 12 x 15 ft + diagonal 10 x 10 ft", () => {
  // 180 sq ft x 1.07 = 192.6; 100 sq ft x 1.12 = 112; total 304.6 / 20 = 15.23 -> 16 boxes
  const f = layoutFlooring({ rooms: [{ width: 144, depth: 180, kind: "plank" }, { width: 120, depth: 120, kind: "plank", diagonal: true }], plank: { underlayment: true, boxPrice: 60, underlaymentPrice: 30 } });
  assert.ok(f.ok);
  near(f.plank.orderSqFt, 304.6);
  assert.equal(f.plank.boxes, 16);
  near(f.plank.leftoverSqFt, 320 - 304.6);
  assert.equal(f.plank.underlaymentRolls, 3); // 280 sq ft / 100
  assert.equal(f.cost, 16 * 60 + 3 * 30);
});

test("tile by hand: 12 in tile, 1/8 in joint, 100 sq ft", () => {
  // pitch 12.125 in -> 1.0212 sq ft per tile; 100 x 1.10 = 110 / 1.02127... = 107.7 -> 108 tiles
  const f = layoutFlooring({ rooms: [{ width: 120, depth: 120, kind: "tile" }] });
  assert.equal(f.tile.tiles, 108);
  assert.equal(f.tile.thinsetBags, 2); // 100 / 80
  // joint inches per sq ft = 144 x 2/12.125; x 0.125 x 0.375 = 1.1134 in3; x100 sq ft / 1728 x 100 lb/ft3 = 6.443 lb
  near(f.tile.groutLb, 100 * 144 * 2 / 12.125 * 0.125 * 0.375 / 1728 * 100, 1e-9);
  assert.ok(Math.abs(f.tile.groutLb - 6.443) < 0.01);
  assert.equal(f.tile.groutBags, 1);
});

test("tile: a larger tile uses fewer, rectangular tiles read both sides", () => {
  const f = layoutFlooring({ rooms: [{ width: 96, depth: 96, kind: "tile" }], tile: { tileWidth: 12, tileLength: 24, joint: 0, waste: 0 } });
  assert.equal(f.tile.tiles, 32); // 64 sq ft / 2
});

test("carpet by hand: a 14 x 12 ft room needs two strips and a seam", () => {
  // 12 ft roll: short side 12 ft = 144 in -> one strip, no seam; long side 168 in + 6 = 174 in
  const a = layoutFlooring({ rooms: [{ width: 168, depth: 144, kind: "carpet" }] });
  assert.equal(a.carpet.seams, 0);
  near(a.carpet.rollLinearFeet, 14.5);
  near(a.carpet.rollSqYd, 174 * 144 / 1296);
  // 14 x 13 ft: short side 156 in > 144 -> two strips, one seam, 2 x 174 in
  const b = layoutFlooring({ rooms: [{ width: 168, depth: 156, kind: "carpet" }] });
  assert.equal(b.carpet.seams, 1);
  near(b.carpet.rollLinearFeet, 29);
  near(b.carpet.padSqYd, 168 * 156 / 144 / 9 * 1.05);
  near(b.carpet.tackFeet, 2 * (168 + 156) / 12);
});

test("an unpriced quantity gives a null cost, never zero", () => {
  assert.equal(layoutFlooring({ rooms: [{ width: 100, depth: 100, kind: "plank" }] }).cost, null);
});

test("refuses bad input", () => {
  assert.match(validateFlooring({})[0], /needs rooms/);
  assert.match(validateFlooring({ rooms: [{ width: "12", depth: 1, kind: "plank" }] }).join(" "), /width must be a number/);
  assert.match(validateFlooring({ rooms: [{ width: 1, depth: 1, kind: "marble" }] }).join(" "), /kind must be/);
  assert.match(validateFlooring({ rooms: [{ width: 1, depth: 1, kind: "tile" }], tile: { tileWidth: 0 } }).join(" "), /tileWidth/);
  assert.match(validateFlooring({ rooms: [{ width: 1, depth: 1, kind: "plank" }], plank: { boxSqFt: "20" } }).join(" "), /boxSqFt must be a number/);
  assert.match(validateFlooring({ rooms: [{ width: 1, depth: 1, kind: "carpet" }], carpet: { rollWidth: 10 } }).join(" "), /rollWidth/);
  assert.equal(layoutFlooring(null).ok, false);
});

test("text names every kind used", () => {
  const f = layoutFlooring({ rooms: [{ width: 100, depth: 100, kind: "plank" }, { width: 100, depth: 100, kind: "tile" }, { width: 100, depth: 100, kind: "carpet" }] });
  const t = flooringText(f).join("\n");
  assert.match(t, /Plank:/); assert.match(t, /Tile:/); assert.match(t, /Carpet:/);
});

test("tackStripLength of 0 or below is refused, not an infinite or negative cost", () => {
  for (const v of [0, -1]) {
    const r = layoutFlooring({ rooms: [{ width: 100, depth: 100, kind: "carpet" }], carpet: { tackPrice: 2, tackStripLength: v } });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" "), /tackStripLength/);
  }
});
