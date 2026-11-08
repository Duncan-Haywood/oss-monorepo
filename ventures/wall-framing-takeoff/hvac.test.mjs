import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutHvac, validateHvac, hvacText } from "./hvac.mjs";

test("hand count: a small two-story run", () => {
  const r = layoutHvac({ trunkFt: 30, trunkFittings: 3, rooms: [
    { id: "bedroom", count: 3, supplyFt: 12, registers: 1 },
    { id: "living", supplyFt: 20, registers: 2, returnFt: 10 },
    { id: "hall", returnFt: 8, returnGrilles: 2 },
  ] });
  assert.equal(r.roomCount, 5);
  assert.equal(r.supplyFt, 36 + 20); assert.equal(r.returnFt, 18);
  assert.equal(r.flexFt, 74);
  // 30 ft x 1.1 = 33 / 5 -> 7 sticks; 74 x 1.1 = 81.4 / 25 -> 4 rolls
  assert.equal(r.trunkSticks, 7); assert.equal(r.flexRolls, 4);
  // registers 3 + 2 + 0 = 5; boots default to registers
  assert.equal(r.registers, 5); assert.equal(r.boots, 5);
  assert.equal(r.returnGrilles, 3);
  assert.equal(r.fittings, 3);
});

test("defaults: one register per supply run, one grille per return run; boots typed", () => {
  const r = layoutHvac({ rooms: [{ supplyFt: 10, returnFt: 5 }, { supplyFt: 10, boots: 2 }] });
  assert.equal(r.registers, 2); assert.equal(r.boots, 1 + 2); assert.equal(r.returnGrilles, 1);
  assert.equal(r.trunkSticks, 0); assert.equal(r.cost, null);
});

test("rolls and sticks round up exactly at the boundary; supports, tape and prices add", () => {
  const r = layoutHvac({ waste: 0, trunkFt: 10, trunkStickFt: 5, flexRollFt: 25, supportSpacingFt: 4, tapeFtPerDuctFt: 0.5, tapeRollFt: 60,
    trunkPrice: 20, flexRollPrice: 50, bootPrice: 8, registerPrice: 6, returnGrillePrice: 12, fittingPrice: 3, supportPrice: 1, tapeRollPrice: 7,
    rooms: [{ supplyFt: 15, returnFt: 10, fittings: 2 }] });
  assert.equal(r.trunkSticks, 2); assert.equal(r.flexRolls, 1);
  // 35 ft duct / 4 -> 9 supports; tape 17.5 ft -> 1 roll
  assert.equal(r.supports, 9); assert.equal(r.tapeRolls, 1);
  assert.equal(r.cost, 2 * 20 + 50 + 8 + 6 + 12 + 2 * 3 + 9 + 7);
  const r2 = layoutHvac({ waste: 0, rooms: [{ supplyFt: 25.5 }] });
  assert.equal(r2.flexRolls, 2);
  assert.ok(hvacText(r).length >= 4);
});

test("bad input is refused with a reason", () => {
  assert.ok(validateHvac({}).length);
  assert.ok(validateHvac({ rooms: [] }).length);
  assert.ok(validateHvac({ rooms: [{ supplyFt: -1 }] }).length);
  assert.ok(validateHvac({ rooms: [{ registers: 1.5 }] }).length);
  assert.ok(validateHvac({ flexRollFt: 5, rooms: [{ supplyFt: 1 }] }).length);
  assert.equal(layoutHvac({ rooms: [] }).ok, false);
});
