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

test("ridge vent nails by hand: 29.8667 ft x 12 / 6 in = 60 per flange, 120 in all, 2 boxes of 100", () => {
  const v = layoutVentilation({ ridgeNailSpacing: 6, ridgeNailBox: 100 }, gable());
  assert.equal(v.ridgeNails, 2 * Math.ceil(29.8667 * 12 / 6 - 1e-9)); // 2 x 60
  assert.equal(v.ridgeNails, 120);
  assert.equal(v.ridgeNailBoxes, 2);
  assert.match(v.notes.join(" "), /Ridge vent nails/);
  assert.equal(layoutVentilation({}, gable()).ridgeNails, 0); // opt-in
  assert.equal(layoutVentilation({ ridgeVent: false, ridgeNailSpacing: 6 }, gable()).ridgeNails, 0);
  assert.ok(validateVentilation({ ridgeNailSpacing: 1 }).length > 0);
});

test("a nail box holds whole nails and ridgeVent is a true/false flag", () => {
  assert.ok(validateVentilation({ ridgeNailBox: 2.5 }).length > 0);
  assert.ok(validateVentilation({ ridgeVent: "no" }).length > 0);
  assert.deepEqual(validateVentilation({ ridgeNailBox: 100, ridgeVent: false }), []);
});

test("an outline's all-hip roof: a rectangle sizes exactly as the framed hip roof on it", async () => {
  const { outlineRoof } = await import("./roofoutline.mjs");
  const hip = layoutRoof({ ...sampleRoof(), shape: "hip", hip: "2x8", width: 240, length: 360 }, plan());
  const ro = outlineRoof([[0, 0], [360, 0], [360, 240], [0, 240]], { pitch: hip.pitch, overhang: hip.overhang });
  assert.ok(hip.ok && ro.ok, JSON.stringify([hip.errors, ro.errors]));
  for (const d of [{}, { ratio: /** @type {300} */ (300) }, { ridgeVent: false }, { ridgeEndGap: 0, upperShare: 0.4 }]) {
    const a = layoutVentilation(d, hip), b = layoutVentilation(d, { ...ro, spacing: hip.spacing });
    assert.ok(a.ok && b.ok, JSON.stringify([a.errors, b.errors]));
    for (const k of ["shape", "atticSqFt", "requiredSqIn", "ridgeVentFeet", "ridgeFeetUsed", "ridgePieces", "lowerSqIn", "soffitUnits", "maxSoffitUnits", "baffles"]) {
      if (typeof a[k] === "number") assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${k}: ${a[k]} vs ${b[k]}`);
      else assert.equal(b[k], a[k], k);
    }
  }
});

test("a Z outline the framing model cannot split: two ridges and the whole eave line, by hand", async () => {
  const { outlineRoof } = await import("./roofoutline.mjs");
  // 30 x 30 ft staircase, 600 sq ft inside the walls; at 6:12 with 12 in eaves its all-hip roof has two 10 ft ridges
  const ro = outlineRoof([[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]], { pitch: 6, overhang: 12 });
  assert.ok(ro.ok, JSON.stringify(ro.errors));
  const v = layoutVentilation({}, ro);
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.equal(v.shape, "hip");
  assert.equal(v.atticSqFt, 600);
  assert.ok(Math.abs(v.requiredSqIn - 576) < 1e-9); // 600 / 150 sq ft = 4 sq ft
  // each ridge 120 in less 12 in at both ends = 8 ft; two = 16 ft x 18 sq in/ft = 288 sq in, exactly the half asked of it
  assert.ok(Math.abs(v.ridgeVentFeet - 16) < 1e-9);
  assert.ok(Math.abs(v.ridgeFeetUsed - 16) < 1e-9);
  assert.equal(v.ridgePieces, 4);
  assert.ok(Math.abs(v.lowerSqIn - 288) < 1e-9);
  assert.equal(v.soffitUnits, 6); // 288 / 56 = 5.14
  assert.equal(v.maxSoffitUnits, 48); // 128 ft of eave line x 50% / 16 in
  assert.equal(v.baffles, 0);
  assert.ok(v.notes.some((n) => /2 ridges of 10\.00, 10\.00 ft/.test(n)));
  assert.ok(v.notes.some((n) => /Baffles not counted/.test(n)));
  assert.equal(layoutVentilation({}, { ...ro, spacing: 24 }).baffles, 64); // 1536 in / 24
  // a typed attic area still wins
  assert.equal(layoutVentilation({ atticSqFt: 500 }, ro).atticSqFt, 500);
  // a short ridge spills to the soffit, as on a framed roof
  const shortGap = layoutVentilation({ ridgeEndGap: 60 }, ro);
  assert.equal(shortGap.ridgeVentFeet, 0);
  assert.equal(shortGap.ridgePieces, 0);
  assert.equal(shortGap.soffitUnits, Math.ceil(576 / 56));
});

test("the CLI sizes the vents, and the vented soffit panels, under an outline-only roof", async () => {
  const { main } = await import("./cli.mjs");
  const plan = { ...samplePlan(), roof: { outline: [[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]], pitch: 6, overhang: 12 }, ventilation: {}, eaves: { ventedPanelNfa: 30, waste: 0 } };
  const out = main(["plan.json", "--json"], () => JSON.stringify(plan));
  assert.equal(out.code, 0, out.out);
  const r = JSON.parse(out.out);
  assert.equal(r.ventilation.atticSqFt, 600);
  assert.equal(r.ventilation.soffitUnits, 6);
  assert.equal(r.eaves.panels, 12);
  assert.equal(r.eaves.ventedPanels, 10); // 288 sq in low / 30 sq in a panel = 9.6
  assert.equal(r.eaves.solidPanels, 2);
  assert.equal(r.eaves.ventedFits, true);
  // before 2026-11-26 the outline-only roof had no ventilation at all: the CLI refused --ventilation
  assert.ok(main(["plan.json", "--ventilation"], () => JSON.stringify({ ...plan, eaves: undefined })).out.includes("ATTIC VENTILATION"));
});
