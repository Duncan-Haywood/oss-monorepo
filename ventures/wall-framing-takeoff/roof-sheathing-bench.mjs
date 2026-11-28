// @ts-check
// How many sheets of roof sheathing does a gable roof take? The roof engine's
// course-by-course count (roof.mjs: 4x8 sheets laid in staggered courses up each
// plane, pieces packed into sheets by the cutting-stock solver, a narrow top
// course ripped and two strips taken from one sheet when they fit) against the
// usual rule of thumb, roof area / 32 sq ft plus 10%.
//
// The roofs are generated rectangles, not real houses: four footprints, five
// pitches, 12 in eave and rake overhangs, trusses at 24 in (so rafter length
// limits never refuse a case). Hip roofs are left out on purpose: roof.mjs counts
// hip courses without reusing the triangular offcuts, so its hip count is an
// upper bound, not a measurement.
//
//   node roof-sheathing-bench.mjs     # prints the table quoted on roof-sheathing-calculator-guide.html
import { layoutRoof, slopeFactor } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";
import { pathToFileURL } from "node:url";

/** Footprints in feet (wall to wall), as width x length. */
export const FOOTPRINTS = /** @type {const} */ ([[24, 40], [28, 48], [32, 60], [36, 70]]);
export const PITCHES = /** @type {const} */ ([4, 6, 8, 10, 12]);

/** The area rule a roofer uses without a layout: area / 32, plus 10%, rounded up. @param {number} sqft */
export const ruleSheets = (sqft) => Math.ceil((sqft / 32) * 1.1 - 1e-9);

/** One gable roof, counted. @param {number} wFt @param {number} lFt @param {number} pitch */
export function countGable(wFt, lFt, pitch) {
  const r = { id: `${wFt}x${lFt} at ${pitch}/12`, shape: /** @type {const} */ ("gable"), width: wFt * 12, length: lFt * 12, pitch, overhang: 12, gableOverhang: 12, rafter: "2x8", spacing: 24, ridge: null, trusses: { spacing: 24 } };
  const l = /** @type {any} */ (layoutRoof(r, samplePlan()));
  if (!l.ok) throw new Error(`${r.id}: ${l.errors.join("; ")}`);
  const area = l.sheets.area;
  const slopeIn = l.slope;
  const fullCourses = Math.floor(slopeIn / 48 + 1e-9);
  const topCourse = slopeIn - fullCourses * 48; // inches; 0 when the plane is a whole number of courses
  return {
    wFt, lFt, pitch, area, counted: l.sheets.count, rule: ruleSheets(area), bare: area / 32,
    waste: l.sheets.waste, slopeFt: slopeIn / 12, topCourse,
  };
}

/** Every case on the page, footprint by footprint. */
export function cases() {
  return FOOTPRINTS.flatMap(([w, l]) => PITCHES.map((p) => countGable(w, l, p)));
}

/** Pitch factor (sloped length per unit of run) for x/12, as printed. @param {number} p */
export const pitchFactor = (p) => slopeFactor(p);

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  for (const c of cases()) {
    console.log(`${c.wFt}x${c.lFt} ${c.pitch}/12: ${c.area.toFixed(0)} sq ft, counted ${c.counted}, rule ${c.rule} (${c.rule - c.counted >= 0 ? "+" : ""}${c.rule - c.counted}), waste ${(c.waste * 100).toFixed(1)}%, slope ${c.slopeFt.toFixed(2)} ft, top course ${c.topCourse.toFixed(1)} in`);
  }
  for (let p = 1; p <= 12; p++) console.log(`${p}/12 factor ${pitchFactor(p).toFixed(3)}`);
}
