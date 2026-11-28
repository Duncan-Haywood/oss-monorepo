// @ts-check
// How many sheets of OSB or plywood do a house's exterior walls take? The
// sheathing engine's panel-by-panel count (sheathing.mjs: every joint on a stud
// centre, cut-outs at openings, strips pooled across walls by the cutting-stock
// solver) against the two area rules people use: wall area / sheet area plus
// 10%, with and without the windows and doors taken off first.
//
// The houses are generated rectangles, not real plans: four footprints, three
// precut wall heights, one 36 x 48 in window per 12 ft of perimeter (rounded)
// and two 36 x 82-1/2 in doors (houseSheathingPlan spreads them evenly).
// Framed with 2x4 studs at 16 in and a single bottom plate under a double top
// plate, an "8 ft" wall is 97-1/8 in tall, a "9 ft" 109-1/8 in and a "10 ft"
// 121-1/8 in.
//
// Vertical sheets: one sheet tall, the shortest stock sheet that covers the
// wall (4x9, 4x10, 4x12); and 4x8 covering 96 in of the 8 ft wall, which leaves
// the top 1-1/8 in of the top plate bare. Horizontal: 4x8 sheets in courses,
// course joints blocked, again both at 96 in and at the full height. A course
// is never laid under 12 in (sheathing.mjs minCourse), so 4x8s across the full
// 97-1/8 in take three courses: 48, 37-1/8 and 12 in.
//
//   node wall-sheathing-bench.mjs     # prints the tables quoted on wall-sheathing-sheets.html
import { sheathe, houseSheathingPlan } from "./sheathing.mjs";
import { takeoff } from "./engine.mjs";
import { pathToFileURL } from "node:url";

/** Footprints in feet (outside of framing), as length x width. */
export const FOOTPRINTS = /** @type {const} */ ([[40, 24], [48, 28], [60, 32], [70, 36]]);
export const HEIGHTS = /** @type {const} */ (["8ft", "9ft", "10ft"]);

/** Windows for a footprint: one per 12 ft of perimeter, rounded. @param {number} l @param {number} w */
export const windowsFor = (l, w) => Math.round((2 * (l + w)) / 12);
export const DOORS = 2;

/** The area rule: square feet / sheet square feet, plus 10%, rounded up. @param {number} sqft @param {number} sheetSqft */
export const ruleSheets = (sqft, sheetSqft) => Math.ceil((sqft / sheetSqft) * 1.1 - 1e-9);

/**
 * One house, counted.
 * @param {number} lFt @param {number} wFt @param {"8ft"|"9ft"|"10ft"} height
 * @param {{orientation:"vertical"|"horizontal", sheetLength?:number, cover?:number}} how
 */
export function countHouse(lFt, wFt, height, how) {
  const windows = windowsFor(lFt, wFt);
  const h = /** @type {any} */ (houseSheathingPlan({ length: lFt * 12, width: wFt * 12, height, windows, doors: DOORS, orientation: how.orientation, ...(how.sheetLength ? { sheetLength: how.sheetLength } : {}) }));
  if (!h.ok) throw new Error(h.errors.join("; "));
  if (how.cover) h.plan.sheathing.coverHeight = how.cover;
  const r = takeoff(h.plan);
  if (!r.ok) throw new Error((r.errors || []).join("; "));
  const s = /** @type {any} */ (sheathe(h.plan, r));
  if (!s.ok) throw new Error((s.errors || []).join("; "));
  const perimeter = 2 * (lFt + wFt);
  const sheet = s.courses[0].sheet;
  const sheetSqft = (sheet.width * sheet.length) / 144;
  const gross = (perimeter * s.cover) / 12;
  const openings = s.summary.areaCutOut;
  const net = gross - openings;
  return {
    lFt, wFt, height, windows, perimeter, cover: s.cover, sheet: sheet.label, courses: s.courses.length,
    topCourse: s.courses.length > 1 ? s.courses[s.courses.length - 1].y1 - s.courses[s.courses.length - 1].y0 : null,
    counted: s.summary.sheets, quarter: Math.ceil(perimeter / 4 - 1e-9),
    gross, openings, net, grossRule: ruleSheets(gross, sheetSqft), netRule: ruleSheets(net, sheetSqft),
    waste: s.summary.waste,
  };
}

/** Vertical, one sheet tall: the 4x8 at 96 in on 8 ft walls, then the sheet that covers each height. */
export function verticalCases() {
  return FOOTPRINTS.flatMap(([l, w]) => [
    countHouse(l, w, "8ft", { orientation: "vertical", sheetLength: 96, cover: 96 }),
    ...HEIGHTS.map((ht) => countHouse(l, w, ht, { orientation: "vertical" })),
  ]);
}

/** Horizontal 4x8 courses: two courses covering 96 in of the 8 ft wall, then the full height of each. */
export function horizontalCases() {
  return FOOTPRINTS.flatMap(([l, w]) => [
    countHouse(l, w, "8ft", { orientation: "horizontal", sheetLength: 96, cover: 96 }),
    ...HEIGHTS.map((ht) => countHouse(l, w, ht, { orientation: "horizontal", sheetLength: 96 })),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const line = (c) => `${c.lFt}x${c.wFt} ${c.height} cover ${c.cover} ${c.sheet} x${c.courses}${c.topCourse ? ` top ${c.topCourse}` : ""}: counted ${c.counted}, perimeter/4 ${c.quarter}, gross rule ${c.grossRule}, net rule ${c.netRule}, openings ${c.openings} sq ft, waste ${(c.waste * 100).toFixed(1)}%`;
  console.log("vertical"); for (const c of verticalCases()) console.log(line(c));
  console.log("horizontal"); for (const c of horizontalCases()) console.log(line(c));
}
