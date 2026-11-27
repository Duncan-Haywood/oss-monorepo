import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutTrim, validateTrim, packPieces, trimText } from "./trim.mjs";

test("packing: first-fit decreasing, long runs split", () => {
  assert.equal(packPieces([60, 36], 96).boards, 1);
  assert.equal(packPieces([60, 60], 96).boards, 2);
  assert.equal(packPieces([200], 96).boards, 3); // 96 + 96 + 8
});

test("interior wall: baseboard both faces, door width left out, by hand", () => {
  const plan = { walls: [{ id: "A", length: 144, sheathed: false, openings: [{ kind: "door", width: 32, height: 80 }] }] };
  const t = layoutTrim({ baseStock: 144, waste: 0 }, plan);
  // net 112 in over 2 runs of 56 in, two faces: four 56 in pieces = 224 in
  assert.ok(Math.abs(t.baseFeet - 224 / 12) < 1e-9);
  assert.equal(t.baseBoards, 2); // 56+56 | 56+56 -> 112 each fits 144
  // casing: 2 faces x (80.1875 x2 + 32+2*(2.25+0.1875)=36.875) = 6 pieces
  assert.equal(t.doorFaces, 2);
  assert.ok(Math.abs(t.casingFeet - 2 * (2 * 80.1875 + 36.875) / 12) < 1e-9);
});

test("exterior wall gets one face of casing; window has a sill piece", () => {
  const plan = { walls: [{ id: "A", length: 96, openings: [{ kind: "window", width: 36, height: 48 }] }] };
  const t = layoutTrim({ waste: 0 }, plan);
  assert.equal(t.windowFaces, 1);
  assert.ok(Math.abs(t.casingFeet - (2 * 48.1875 + 36 + 2 * 2.4375 + 36 + 0.375) / 12) < 1e-9);
  assert.ok(Math.abs(t.baseFeet - 8) < 1e-9); // a window does not break it
});

test("prices, waste and bad inputs", () => {
  const plan = { walls: [{ id: "A", length: 100, sheathed: false }] };
  const t = layoutTrim({ waste: 0.1, basePrice: 10 }, plan);
  assert.equal(t.baseBoards, Math.ceil(t.baseBoards)); assert.equal(t.cost, t.baseBoards * 10);
  assert.ok(trimText(t).length >= 3);
  assert.equal(validateTrim({ waste: 0.9 }).length, 1);
  assert.equal(layoutTrim({ baseStock: 10 }, plan).ok, false);
});

test("shoe moulding follows the baseboard runs in its own stock, off by default", () => {
  const plan = { walls: [{ id: "A", length: 144, sheathed: false, openings: [{ kind: "door", width: 32, height: 80 }] }] };
  assert.equal(layoutTrim({ waste: 0 }, plan).shoeBoards, 0);
  const t = layoutTrim({ waste: 0, shoe: true, shoeStock: 96, shoePrice: 5 }, plan);
  assert.ok(Math.abs(t.shoeFeet - 224 / 12) < 1e-9); // four 56 in runs
  assert.equal(t.shoeBoards, 4); // two 56 in runs do not fit one 96 in board
  assert.equal(t.cost, 4 * 5);
  assert.ok(trimText(t).some((x) => x.includes("Shoe moulding")));
  assert.equal(layoutTrim({ shoe: true, shoeStock: 10 }, plan).ok, false);
});

test("scarf joints: each splice overlaps, so a long run uses more board than a butt joint", () => {
  const plan = { walls: [{ id: "A", length: 300 }] };
  const butt = layoutTrim({ waste: 0 }, plan);
  assert.equal(butt.splices, 2); assert.ok(Math.abs(butt.baseFeet - 25) < 1e-9);
  // 300 in: two 144 boards each add 141 net, 18 left: 306 in cut (300 + 2 x 3)
  const t = layoutTrim({ waste: 0, scarf: 3 }, plan);
  assert.equal(t.splices, 2); assert.ok(Math.abs(t.baseFeet - 306 / 12) < 1e-9); assert.equal(t.baseBoards, 3);
  // 150 in: 144 + a 9 in stub (150 - 141) rather than 6 in
  assert.ok(Math.abs(layoutTrim({ waste: 0, scarf: 3 }, { walls: [{ id: "B", length: 150 }] }).baseFeet - 153 / 12) < 1e-9);
  // a run that fits one board has no splice
  assert.equal(layoutTrim({ scarf: 3 }, { walls: [{ id: "C", length: 100 }] }).splices, 0);
  assert.equal(layoutTrim({ scarf: 20 }, plan).ok, false);
  assert.ok(trimText(t).some((x) => x.includes("2 splices")));
});
