import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutCmu, validateCmu, cmuText } from "./cmu.mjs";

const wall = { id: "A", length: 480, height: 96, openings: [{ width: 36, height: 80 }] };

test("by hand: blocks, mortar, grout and rebar for one 40 x 8 ft wall with a door", () => {
  const l = layoutCmu({ walls: [wall], bondBeamEvery: 0 });
  assert.equal(l.ok, true);
  // 480*96 = 46080 in2, less 36*80 = 2880 -> 43200 in2 = 300 sq ft; /128 = 337.5 blocks; +5% = 354.375 -> 355
  assert.equal(l.netSqFt, 300); assert.equal(l.blocksNet, 337.5); assert.equal(l.blocks, 355);
  assert.equal(l.courses, 12); assert.equal(l.mortarBags, 11); // 355/35 = 10.14
  // 480/32 = 15 -> 16 bars; cell = .45*16*8/2 = 28.8 in2; 16*28.8*96 = 44236.8 in3 = 25.6 cu ft; +10% = 28.16
  assert.equal(l.verticalBars, 16); assert.equal(l.groutCuFt, 25.6); assert.equal(l.groutOrderCuFt, 28.16);
  assert.equal(l.groutYd, 1.04);
  // bar #5 dia .625, lap 48*.625 = 30 in: (96+30)*16 = 2016 in = 168 ft * 1.043 = 175.2 lb
  assert.equal(l.verticalBarFt, 168); assert.equal(l.rebarLb, 175);
});

test("bond beams and joint reinforcement", () => {
  const l = layoutCmu({ walls: [{ length: 240, height: 96 }], bondBeamEvery: 6, jointReinfCourses: 2, barSpacing: 48 });
  assert.equal(l.bondBeamCourses, 2); // 12 courses / 6
  assert.equal(l.ladderFt, 120); // 6 * 20 ft
  // beam grout: 2 * 240 * .45*8*8 = 13824 in3; bars: 240/48=5 -> 6 * 28.8 * 96 = 16588.8; total 30412.8 in3 = 17.6 cu ft
  assert.equal(l.groutCuFt, 17.6);
  // bond beam bar: 2 courses * (240 + 30*... lap 48*.625=30 * floor(240/240)=1) = 540 in = 45 ft
  assert.equal(l.bondBeamBarFt, 45);
});

test("cut-course notes, small grout note and prices", () => {
  const l = layoutCmu({ walls: [{ length: 100, height: 100 }], blockPrice: 2, mortarBagPrice: 10 });
  assert.equal(l.notes.length, 3); assert.equal(l.courses, 13);
  assert.ok(l.cost > 0);
  assert.ok(cmuText(l).join("\n").includes("Concrete block 8 in"));
});

test("hostile input is refused, not computed", () => {
  for (const bad of [null, [], {}, { walls: [] }, { walls: [{ length: "9", height: 96 }] }, { walls: [wall], waste: "0.1" }, { walls: [wall], thickness: 7 }, { walls: [wall], barSpacing: 0 }, { walls: [wall], bar: 12 }, { walls: [{ length: 1e9, height: 96 }] }, { walls: [{ length: 96, height: 96, openings: [{ width: -1, height: 1 }] }] }]) {
    assert.ok(validateCmu(bad).length > 0, JSON.stringify(bad));
    assert.equal(layoutCmu(bad).ok, false);
  }
});
