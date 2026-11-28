// @ts-check
// How many extra roof sheathing sheets does a hip roof really need over a gable?
// The 4x8 sheets each layout buys against the roof's own surface (overhangs
// included), on 16 rectangular houses at four pitches, gable and hip:
//
//   gable                 courses from the eave up, end joints on rafters (roof.mjs, this edition)
//   hip, offcuts thrown   the same courses on four planes, every course cut to its bottom length
//                         and each hip-end triangle thrown away (roof.mjs, this edition)
//   hip, offcuts reused   the paid edition's layout: a hip-end triangle starts or fills another
//                         course, cut down when the band is narrower, kept only when it saves a sheet
//                         (Residential Takeoff, ../residential-takeoff/apps/wall-framing-takeoff/roof.mjs)
//
// Extra = sheets x 32 sq ft / roof surface - 1: the allowance you would have to add to the
// surface area to buy the same number of sheets. Cutting waste only; damaged sheets and
// mistakes are a separate allowance.
//
//   node roof-waste-bench.mjs     # prints the table quoted on roof-sheathing-waste-factor.html
import { pathToFileURL } from "node:url";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";
import { layoutRoof as paidLayoutRoof } from "../residential-takeoff/apps/wall-framing-takeoff/roof.mjs";

/** Footprints, outside of the walls, in feet: width (eave to eave) by length (along the ridge). */
export const HOUSES = /** @type {const} */ ([[24, 36], [28, 40], [32, 48], [36, 60]]);
export const PITCHES = /** @type {const} */ ([4, 6, 8, 10]);
export const WAYS = /** @type {const} */ (["gable", "hip, offcuts thrown", "hip, offcuts reused"]);

/** The sample plan's boards plus 20 to 32 ft lengths, so long hip rafters lay out; rafters do not change the sheets. */
export function benchPlan() {
  const plan = samplePlan();
  const sizes = [...new Set(plan.stock.map((s) => s.size))];
  return { ...plan, stock: [...plan.stock, ...sizes.flatMap((size) => [240, 288, 384].map((length) => ({ size, length, price: 30 })))] };
}

/**
 * Sheets and surface for one house, pitch and way of laying the sheathing.
 * @param {number} w feet @param {number} len feet @param {number} pitch rise in 12 @param {typeof WAYS[number]} way
 */
export function measure(w, len, pitch, way, plan = benchPlan()) {
  const roof = { ...sampleRoof(), width: w * 12, length: len * 12, pitch, shape: way === "gable" ? "gable" : "hip" };
  const l = way === "hip, offcuts reused" ? paidLayoutRoof(roof, plan) : layoutRoof(roof, plan);
  if (!l.ok) throw new Error(`${w} x ${len} ft at ${pitch}:12, ${way}: ${l.errors?.[0]}`);
  const { count, area } = l.sheets;
  return { sheets: count, area, extra: (count * 32) / area - 1 };
}

/** Every case: { w, len, pitch, gable, thrown, reused }. */
export function table() {
  const plan = benchPlan();
  const rows = [];
  for (const pitch of PITCHES) for (const [w, len] of HOUSES) {
    const [gable, thrown, reused] = WAYS.map((way) => measure(w, len, pitch, way, plan));
    rows.push({ w, len, pitch, gable, thrown, reused });
  }
  return rows;
}

/** Lowest, highest and mean of a list. @param {number[]} xs */
export function spread(xs) {
  return { min: Math.min(...xs), max: Math.max(...xs), mean: xs.reduce((s, x) => s + x, 0) / xs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
  const rows = table();
  console.log("house | pitch | surface sq ft | gable | hip, thrown | hip, reused");
  for (const r of rows) {
    console.log(`${r.w} x ${r.len} | ${r.pitch}:12 | ${Math.round(r.gable.area)} | ${r.gable.sheets} (${pct(r.gable.extra)}) | ${r.thrown.sheets} (${pct(r.thrown.extra)}) | ${r.reused.sheets} (${pct(r.reused.extra)})`);
  }
  for (const k of /** @type {const} */ (["gable", "thrown", "reused"])) {
    const s = spread(rows.map((r) => r[k].extra));
    console.log(`${k}: ${pct(s.min)} to ${pct(s.max)}, mean ${pct(s.mean)}`);
  }
  const saved = rows.map((r) => r.thrown.sheets - r.reused.sheets);
  const same = rows.filter((r) => r.reused.sheets === r.gable.sheets).length;
  console.log(`reuse saves ${Math.min(...saved)} to ${Math.max(...saved)} sheets; hip reused equals gable on ${same} of ${rows.length}`);
}
