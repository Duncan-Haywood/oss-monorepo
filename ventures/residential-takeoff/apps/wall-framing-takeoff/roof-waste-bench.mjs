// @ts-check
// How much should a roof sheathing order add for waste, and does a hip roof really need more than a gable?
// For sixteen rectangular footprints and pitches, the 4x8 sheets `roof.mjs` lays in courses for
//
//   gable                  two planes, end joints on rafters, alternate courses staggered
//   hip, cut course by course  every course of the four hip planes cut to its bottom length, the triangles thrown away
//   hip, offcuts reused    the same roof with the hip triangles starting other courses' hip ends (the default)
//
// against the roof's own area. The waste factor is what the order adds on top of the area:
// sheets x 32 sq ft / area - 1. It is cutting waste only; damaged sheets, mistakes and the
// skylights, chimneys and vents cut out later are a separate allowance.
//
//   node roof-waste-bench.mjs     # prints the table quoted on roof-sheathing-waste-factor.html
import { pathToFileURL } from "node:url";
import { layoutRoof } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";

export const FOOTPRINTS = /** @type {const} */ ([[24, 32], [28, 40], [32, 48], [36, 60]]);
export const PITCHES = /** @type {const} */ ([4, 6, 8, 12]);
export const WAYS = /** @type {const} */ (["gable", "hip, cut course by course", "hip, offcuts reused"]);
const SHEET_SQFT = 32;

/** The sample plan's stock plus long rafter, ridge and hip boards (to 40 ft, as an LVL hip would be), so every case lays out. */
function stock() {
  const plan = samplePlan();
  return { ...plan, stock: [...plan.stock, ...["2x8", "2x10", "2x12"].flatMap((size) => [288, 336, 384, 480].map((length) => ({ size, length, price: length / 6 })))] };
}

/** The roof every way is laid on: 12 in eave and rake overhangs, 2x10 rafters at 16 in, a 2x12 ridge and hips. */
export function roofFor(/** @type {number} */ wFt, /** @type {number} */ lFt, /** @type {number} */ pitch, /** @type {string} */ way) {
  return {
    width: wFt * 12, length: lFt * 12, pitch, overhang: 12, gableOverhang: 12, rafter: "2x10", hip: "2x12", spacing: 16, ridge: "2x12",
    shape: way === "gable" ? "gable" : "hip", ...(way === "hip, cut course by course" ? { hipStarts: false } : {}),
  };
}

/** Sheets, area and waste factor for one footprint and pitch, every way. */
export function measure(/** @type {number} */ wFt, /** @type {number} */ lFt, /** @type {number} */ pitch) {
  const plan = stock();
  /** @type {Record<string, {sheets: number, area: number, waste: number}>} */
  const ways = {};
  for (const way of WAYS) {
    const r = /** @type {any} */ (layoutRoof(/** @type {any} */ (roofFor(wFt, lFt, pitch, way)), plan));
    if (!r.ok) throw new Error(`${wFt}x${lFt} at ${pitch}:12, ${way}: ${r.errors?.[0]}`);
    ways[way] = { sheets: r.sheets.count, area: r.sheets.area, waste: (r.sheets.count * SHEET_SQFT) / r.sheets.area - 1 };
  }
  return { footprint: `${wFt} x ${lFt} ft`, pitch, area: ways.gable.area, minimum: ways.gable.area / SHEET_SQFT, ways };
}

export function allCases() {
  return FOOTPRINTS.flatMap(([w, l]) => PITCHES.map((p) => measure(w, l, p)));
}

/** Low and high of a list. @param {number[]} xs */
export const range = (xs) => [Math.min(...xs), Math.max(...xs)];
export const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;

/** The table row the page shows for one case. @param {ReturnType<typeof measure>} c */
export function rowCells(c) {
  return [String(Math.round(c.area)), String(Math.ceil(c.minimum - 1e-9)), ...WAYS.map((k) => `${c.ways[k].sheets} (${pct(c.ways[k].waste)})`)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = allCases();
  console.log(["footprint", "pitch", "area sq ft", "min sheets", ...WAYS].join(" | "));
  for (const c of all) console.log([c.footprint, `${c.pitch}:12`, ...rowCells(c)].join(" | "));
  for (const k of WAYS) { const [lo, hi] = range(all.map((c) => c.ways[k].waste)); console.log(`${k}: ${pct(lo)} to ${pct(hi)}`); }
  const saved = all.map((c) => c.ways["hip, cut course by course"].sheets - c.ways["hip, offcuts reused"].sheets);
  console.log(`reuse saves ${Math.min(...saved)} to ${Math.max(...saved)} sheets`);
  const vsGable = all.map((c) => c.ways["hip, offcuts reused"].sheets - c.ways.gable.sheets);
  console.log(`hip reused minus gable: ${Math.min(...vsGable)} to ${Math.max(...vsGable)} sheets; equal or fewer on ${vsGable.filter((x) => x <= 0).length} of ${all.length}`);
}
