import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutPlumbing, validatePlumbing, plumbingText } from "./plumbing.mjs";

test("hand count: one bath group", () => {
  const r = layoutPlumbing({ fixtures: [
    { id: "toilet", drainFt: 6, ventFt: 4, coldFt: 12, stops: 1, dfu: 3 },
    { id: "lav", count: 2, drainFt: 5, ventFt: 5, hotFt: 10, coldFt: 10, dfu: 1 },
  ] });
  assert.equal(r.fixtureCount, 3);
  assert.equal(r.drainFt, 16); assert.equal(r.ventFt, 14);
  assert.equal(r.hotFt, 20); assert.equal(r.coldFt, 32);
  // 30 ft x 1.1 = 33 -> 4 sticks of 10
  assert.equal(r.drainSticks, 4);
  assert.equal(r.hotCoils, 1); assert.equal(r.coldCoils, 1);
  assert.equal(r.traps, 3);
  // toilet 1 typed; lavs default hot+cold = 2 each x 2 = 4
  assert.equal(r.stops, 5);
  assert.equal(r.dfu, 5);
});

test("coils and sticks round up exactly at the boundary; prices add", () => {
  const r = layoutPlumbing({ waste: 0, drainStickFt: 10, pexCoilFt: 100, drainPipePrice: 10, pexCoilPrice: 50, trapPrice: 5, stopPrice: 4, drainFittingPrice: 2, supplyFittingPrice: 1,
    fixtures: [{ id: "x", drainFt: 10, coldFt: 100, drainFittings: 3, supplyFittings: 2 }] });
  assert.equal(r.drainSticks, 1); assert.equal(r.coldCoils, 1);
  assert.equal(r.cost, 10 + 50 + 5 + 4 + 6 + 2);
  const r2 = layoutPlumbing({ waste: 0, fixtures: [{ drainFt: 10.5, coldFt: 101 }] });
  assert.equal(r2.drainSticks, 2); assert.equal(r2.coldCoils, 2);
  assert.equal(r2.dfu, null); assert.equal(r2.cost, null);
});

test("trap false suppresses the trap; text renders", () => {
  const r = layoutPlumbing({ fixtures: [{ id: "floor drain", drainFt: 8, trap: false }] });
  assert.equal(r.traps, 0);
  assert.ok(plumbingText(r).length >= 3);
});

test("bad input is refused with a reason", () => {
  assert.ok(validatePlumbing({}).length);
  assert.ok(validatePlumbing({ fixtures: [] }).length);
  assert.ok(validatePlumbing({ fixtures: [{ count: 0 }] }).length);
  assert.ok(validatePlumbing({ fixtures: [{ drainFt: -1 }] }).length);
  assert.ok(validatePlumbing({ fixtures: [{ stops: 1.5 }] }).length);
  assert.ok(validatePlumbing({ fixtures: [{}], waste: 2 }).length);
  assert.ok(validatePlumbing({ fixtures: [{ drainFt: "6" }] }).length);
  assert.ok(validatePlumbing({ fixtures: [null] }).length);
  assert.equal(layoutPlumbing(null).ok, false);
});

test("supports: opt-in, typed spacing, round up, priced", () => {
  const f = [{ id: "x", drainFt: 10, ventFt: 5, hotFt: 7, coldFt: 8 }];
  const off = layoutPlumbing({ fixtures: f });
  assert.equal(off.hangers, 0); assert.equal(off.straps, 0);
  // 15 ft / 4 ft = 3.75 -> 4 hangers; 15 ft / 2.5 ft = 6 straps exactly
  const r = layoutPlumbing({ fixtures: f, drainHangerSpacingFt: 4, supplyStrapSpacingFt: 2.5, hangerPrice: 2, strapPrice: 0.5 });
  assert.equal(r.hangers, 4); assert.equal(r.straps, 6);
  assert.ok(r.cost >= 4 * 2 + 6 * 0.5);
  assert.ok(plumbingText(r).join("\n").includes("4 drain hangers"));
  assert.ok(validatePlumbing({ fixtures: f, drainHangerSpacingFt: 0.1 }).length);
});
