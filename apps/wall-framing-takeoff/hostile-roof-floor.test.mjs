import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { validateRoof, sampleRoof } from "./roof.mjs";
import { validateFloor, sampleFloor } from "./floor.mjs";

const plan = () => samplePlan();

test("roof: numeric fields typed as text are refused (a string overhang once concatenated and hung the layout)", () => {
  for (const k of ["width", "length", "pitch", "overhang", "gableOverhang", "spacing"]) {
    const errs = validateRoof({ ...sampleRoof(), [k]: "10" }, plan());
    assert.ok(errs.some((e) => e.includes(k) && e.includes("number")), k);
  }
});

test("roof: rafter spacing under 4 in is refused", () => {
  assert.ok(validateRoof({ ...sampleRoof(), spacing: 1e-9 }, plan()).length > 0);
});

test("floor: joist spacing must be a number of at least 4 in (1e-9 threw Invalid array length)", () => {
  for (const v of [1e-9, "16", 3, null]) assert.ok(validateFloor({ ...sampleFloor(), spacing: v }, plan()).length > 0, String(v));
  assert.deepEqual(validateFloor(sampleFloor(), plan()), []);
});

test("floor: blockingRows must be a whole number 0 to 20 (1e12 hung the layout)", () => {
  for (const v of [1e12, -1, 1.5, "2"]) assert.ok(validateFloor({ ...sampleFloor(), blockingRows: v }, plan()).some((e) => e.includes("blockingRows")), String(v));
  assert.deepEqual(validateFloor({ ...sampleFloor(), blockingRows: 2 }, plan()), []);
});
