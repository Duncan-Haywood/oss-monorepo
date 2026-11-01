import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { layoutVentilation, validateVentilation, ventilationText } from "./ventilation.mjs";

const plan = () => ({ ...samplePlan(), walls: [] });
const gable = () => layoutRoof(sampleRoof(), plan());

test("1/150 by hand: 28 x 40 ft attic = 1120 sq ft -> 1075.2 sq in, half on the ridge", () => {
  const v = layoutVentilation({}, gable());
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.equal(v.atticSqFt, 1120);
  assert.ok(Math.abs(v.requiredSqIn - 1120 / 150 * 144) < 1e-9); // 1075.2
  // ridge 42 ft (480 + 2 x 12 in rakes) less 1 ft each end = 40 ft; half = 537.6 sq in / 18 = 29.87 ft
  assert.ok(Math.abs(v.ridgeFeetUsed - 537.6 / 18) < 1e-9);
  assert.equal(v.ridgePieces, Math.ceil(29.8667 * 12 / 48)); // 8 four-foot pieces
  assert.equal(v.soffitUnits, Math.ceil(537.6 / 56)); // 10
  assert.ok(v.providedSqIn >= v.requiredSqIn);
});

test("1/300 halves the area; with no ridge vent every square inch goes low", () => {
  const a = layoutVentilation({ ratio: 300 }, gable());
  assert.ok(Math.abs(a.requiredSqIn - 537.6) < 1e-9);
  const b = layoutVentilation({ ridgeVent: false }, gable());
  assert.equal(b.ridgePieces, 0);
  assert.equal(b.upperShare, 0);
  assert.equal(b.soffitUnits, Math.ceil(1075.2 / 56));
  assert.ok(b.notes.some((n) => /No ridge vent/.test(n)));
});

test("a hip roof vents only its short ridge, and a short ridge hands the rest to the soffit", () => {
  const roof = layoutRoof({ ...sampleRoof(), shape: "hip", hip: "2x8", width: 240, length: 360 }, plan());
  const v = layoutVentilation({}, roof);
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.equal(v.shape, "hip");
  assert.equal(v.ridgeVentFeet, (360 - 240) / 12 - 2); // 8 ft
  assert.ok(Math.abs(v.ridgeFeetUsed - 8) < 1e-9);
  assert.ok(v.notes.some((n) => /short of/.test(n)));
  assert.ok(v.providedSqIn >= v.requiredSqIn);
});

test("bad inputs and no roof are refused; prices total", () => {
  assert.ok(validateVentilation({ ratio: 200 }).length);
  assert.ok(validateVentilation({ upperShare: 2 }).length);
  assert.equal(layoutVentilation({}, null).ok, false);
  const v = layoutVentilation({ ridgePrice: 20, soffitPrice: 3 }, gable());
  assert.equal(v.cost, 20 * v.ridgePieces + 3 * v.soffitUnits);
  assert.ok(ventilationText(v).join("\n").includes("Required:"));
});
