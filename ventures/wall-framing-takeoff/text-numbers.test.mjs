// A number given as text ("96") passed the range checks by coercion in several validators.
// Every numeric field of each sample must be refused when turned into a string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan, validatePlan } from "./engine.mjs";
import { sampleDeck, validateDeck } from "./deck.mjs";
import { sampleDrywall, validateDrywall } from "./drywall.mjs";
import { sampleFloor, validateFloor } from "./floor.mjs";
import { sampleFoundation, validateFoundation } from "./foundation.mjs";
import { sampleRoof, validateRoof } from "./roof.mjs";
import { sampleStair, validateStair } from "./stairs.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));
const leaves = (o, p = []) => (o && typeof o === "object" ? Object.keys(o).flatMap((k) => leaves(o[k], [...p, k])) : typeof o === "number" ? [p] : []);
const bad = (r) => (Array.isArray(r) ? r.length > 0 : r?.ok === false);

for (const [name, sample, check] of [
  ["plan", samplePlan, (x) => validatePlan(x)],
  ["deck", sampleDeck, (x) => validateDeck(x)],
  ["drywall", sampleDrywall, (x) => validateDrywall(x)],
  ["floor", sampleFloor, (x) => validateFloor(x, samplePlan())],
  ["foundation", sampleFoundation, (x) => validateFoundation(x)],
  ["roof", sampleRoof, (x) => validateRoof(x, samplePlan())],
  ["stair", sampleStair, (x) => validateStair(x)],
]) {
  test(`${name}: the sample is valid`, () => assert.ok(!bad(check(clone(sample())))));
  test(`${name}: any numeric field given as text is refused`, () => {
    const s = sample();
    const leaks = [];
    for (const p of leaves(s)) {
      const x = clone(s);
      let o = x;
      for (const k of p.slice(0, -1)) o = o[k];
      o[p.at(-1)] = String(o[p.at(-1)]);
      let r;
      try { r = check(x); } catch { r = ["threw"]; }
      if (!bad(r)) leaks.push(p.join("."));
    }
    assert.deepEqual(leaks, []);
  });
}

// Option validators: every listed numeric setting given as text is refused.
import { validateEaves } from "./eaves.mjs";
import { validateTrim } from "./trim.mjs";
import { validateSiding } from "./siding.mjs";
import { validateInsulation } from "./insulation.mjs";
import { validateGutters } from "./gutters.mjs";
import { validateDormer } from "./dormer.mjs";
import { validateVentilation } from "./ventilation.mjs";
import { validateFasteners } from "./fasteners.mjs";
import { slabConcrete } from "./slab.mjs";

const OPTS = [
  ["eaves", validateEaves, {}, ["panelWidth", "panelStock", "fasciaStock", "channelStock", "waste", "panelPrice"]],
  ["trim", validateTrim, {}, ["baseStock", "casingStock", "casingWidth", "reveal", "scarf", "waste", "basePrice"]],
  ["siding", validateSiding, {}, ["exposure", "stock", "cornerStock", "waste", "boardPrice", "height"]],
  ["insulation", validateInsulation, {}, ["bagSqFt", "waste", "rValue", "price"]],
  ["gutters", validateGutters, {}, ["gutterStock", "eaveHeight", "hangerSpacing", "waste", "gutterPrice"]],
  ["dormer", validateDormer, { width: 96, eaveHeight: 48, pitch: 8, mainPitch: 8 }, ["width", "eaveHeight", "pitch", "mainPitch"]],
  ["fasteners", validateFasteners, {}, ["studEndNails", "headerEndNails", "sillEndNails", "headerRows", "plateSpacing", "jackSpacing", "backingSpacing", "headerSpacing", "fieldSpacing", "edgeSpacing", "waste", "nailsPerBox", "price"]],
  ["ventilation", validateVentilation, {}, ["atticSqFt", "upperShare", "ridgeNfaPerFt", "ridgePrice"]],
];
for (const [name, fn, base, keys] of OPTS) {
  test(`${name}: settings given as text are refused`, () => {
    assert.deepEqual(fn(base), []);
    const leaks = keys.filter((k) => fn({ ...base, [k]: "12" }).length === 0);
    assert.deepEqual(leaks, []);
  });
}
test("insulation: nested attic and assembly numbers given as text are refused", () => {
  assert.ok(validateInsulation({ attic: { rValue: "38" } }).length);
  assert.ok(validateInsulation({ assembly: { ceilingR: "30" } }).length);
});
test("slab: numbers given as text are refused (a text waste of \"0.1\" used to order 50 yd for a 5.5 yd slab)", () => {
  const b = { shape: "slab", length: 240, width: 240, depth: 4 };
  assert.equal(slabConcrete(b).ok, true);
  for (const k of ["length", "width", "depth", "waste", "count", "bag"]) {
    assert.equal(slabConcrete({ ...b, [k]: "1" }).ok, false, k);
  }
  assert.equal(slabConcrete({ shape: "pier", diameter: "12", depth: 36 }).ok, false);
});
test("sheathing: text, negative and huge settings are refused, not coerced", async () => {
  const { sheathe, defaultSheathing } = await import("./sheathing.mjs");
  const { takeoff } = await import("./engine.mjs");
  const plan = samplePlan();
  const r = takeoff(plan);
  const base = defaultSheathing();
  assert.notEqual(sheathe({ ...plan, sheathing: base }, r).ok, false);
  for (const [k, v] of [["minStrip", "12"], ["minStrip", -5], ["minCourse", "x"], ["minCourse", 1e9], ["rimLap", "9"], ["rimLap", -5], ["coverHeight", "96"]]) {
    assert.equal(sheathe({ ...plan, sheathing: { ...base, [k]: v } }, r).ok, false, `${k}=${v}`);
  }
  const s0 = base.sheets[0];
  assert.equal(sheathe({ ...plan, sheathing: { ...base, sheets: [{ ...s0, width: "48" }] } }, r).ok, false);
});

test("option validators refuse a negative or huge price (a basePrice of -5 gave a negative cost line)", () => {
  const cases = [
    [validateTrim, "basePrice"], [validateTrim, "casingPrice"], [validateSiding, "boardPrice"],
    [validateInsulation, "price"], [validateGutters, "gutterPrice"], [validateVentilation, "ridgePrice"],
    [validateEaves, "panelPrice"], [validateFasteners, "price"],
  ];
  for (const [fn, k] of cases) {
    assert.ok(fn({ [k]: -5 }).length, `${k} -5`);
    assert.ok(fn({ [k]: 1e12 }).length, `${k} 1e12`);
    assert.deepEqual(fn({ [k]: 0 }), [], `${k} 0 stays allowed`);
    assert.deepEqual(fn({ [k]: 12.5 }), [], `${k} 12.5 stays allowed`);
  }
});
