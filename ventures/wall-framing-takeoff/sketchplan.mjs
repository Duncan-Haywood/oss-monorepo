// @ts-check
// A sketch (sketch.mjs) to the plan the takeoff takes: written out as DXF by
// `sketchToDxf` and read back by the same `planFromDxf` that reads a real
// floor plan. Kept apart from sketch.mjs so the page loads the DXF reader only
// when a sketch is used, not to draw or restore one.

import { planFromDxf } from "./dxf.mjs";
import { sketchToDxf } from "./sketch.mjs";

/** @typedef {import("./sketch.mjs").Sketch} Sketch */

/**
 * The takeoff plan for a sketch: the same result shape as `planFromDxf`.
 * @param {Sketch} sk
 * @param {Parameters<typeof planFromDxf>[1]} [opt]
 */
export function planFromSketch(sk, opt = {}) {
  if (!sk || typeof sk !== "object" || !Array.isArray(sk.walls)) return { ok: false, errors: ["No sketch to read."], notes: [] };
  if (!sk.walls.length) return { ok: false, errors: ["Draw at least one wall first."], notes: [] };
  return planFromDxf(sketchToDxf(sk), { units: "in", ...opt });
}
