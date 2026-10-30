// @ts-check
// Exterior lap siding, house wrap and corner boards, counted course by course
// from the wall and the openings, not from a square-foot-over-coverage guess.
//
// Each sheathed wall is a stack of courses, one `exposure` tall (the reveal
// you type from the siding you buy; default 7 in, a 8 in board over a 1 in
// lap). A door or window that cuts through a course splits that course's run;
// the runs of every course are packed into stock boards by first fit
// decreasing, so the offcut of one course starts the next, which is how a
// crew works. House wrap is the wall area less openings, plus the lap
// allowance, in rolls whose coverage you type. Corner boards are two per
// outside corner (default four corners, a plain rectangle), full wall height.
// A wall with `gable: {pitch, peak?}` also gets its triangle (2026-10-29): the
// courses above the eave line are as long as the triangle is wide at the
// course's lower edge (boards are cut to the slope), the wrap is the exact
// triangle area, and openings are only clipped to the eave line.
// Not counted: soffit and fascia, window and door trim
// boards, flashing, nails, caulk, paint, and the starter strip's rip.
// Wall height defaults to the plan's stud length plus the plates, as the
// drywall hang height does.
import { THICK } from "./engine.mjs";
import { packPieces } from "./trim.mjs";

/** @typedef {{ exposure?: number, stock?: number, waste?: number, wrapRollSqFt?: number, wrapLap?: number, corners?: number, cornerStock?: number, height?: number, boardPrice?: number, wrapPrice?: number, cornerPrice?: number }} Siding */

/** @param {Siding} d */
export function validateSiding(d) {
  const e = [];
  if (d.exposure != null && !(d.exposure >= 2 && d.exposure <= 16)) e.push("Siding exposure must be between 2 and 16 inches.");
  if (d.stock != null && !(d.stock >= 48 && d.stock <= 240)) e.push("Siding board length must be between 48 and 240 inches.");
  if (d.cornerStock != null && !(d.cornerStock >= 48 && d.cornerStock <= 240)) e.push("Corner board length must be between 48 and 240 inches.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Siding waste must be between 0 and 0.3.");
  if (d.wrapLap != null && !(d.wrapLap >= 0 && d.wrapLap <= 0.3)) e.push("House wrap lap allowance must be between 0 and 0.3.");
  if (d.wrapRollSqFt != null && !(d.wrapRollSqFt >= 100 && d.wrapRollSqFt <= 3000)) e.push("House wrap roll coverage must be between 100 and 3000 sq ft.");
  if (d.corners != null && !(Number.isInteger(d.corners) && d.corners >= 0 && d.corners <= 40)) e.push("Outside corners must be a whole number from 0 to 40.");
  if (d.height != null && !(d.height >= 72 && d.height <= 192)) e.push("Siding height must be between 6 and 16 ft.");
  return e;
}

/** Rise and the two slopes (rise per inch) of a gable wall, or null for a level wall. */
function gableOf(/** @type {any} */ w, /** @type {number} */ eave) {
  if (!w.gable || !(w.gable.pitch > 0)) return null;
  const peak = w.gable.peak ?? w.length / 2;
  if (!(peak > 0 && peak < w.length)) return null;
  const s1 = w.gable.pitch / 12, rise = peak * s1;
  return { rise, s1, s2: rise / (w.length - peak), eave };
}

/**
 * @param {Siding} d
 * @param {{ studLength: number, defaultHeaderHeight: number, walls: { id: string, length: number, sheathed?: boolean, gable?: { pitch: number, peak?: number }, openings?: { kind: string, offset: number, width: number, height: number, headerHeight?: number }[] }[] }} plan
 */
export function layoutSiding(d, plan) {
  const errors = validateSiding(d);
  if (errors.length) return { ok: false, errors };
  const waste = d.waste ?? 0.1, exposure = d.exposure ?? 7, stock = d.stock ?? 144;
  const wrapRoll = d.wrapRollSqFt ?? 1350, wrapLap = d.wrapLap ?? 0.1;
  const corners = d.corners ?? 4, cornerStock = d.cornerStock ?? 120;
  const height = d.height ?? Math.round((plan.studLength + 3 * THICK) / 12) * 12;
  /** @type {number[]} */ const runs = [];
  let areaIn = 0, openIn = 0, wallsDone = 0, courses = 0;
  for (const w of plan.walls) {
    if (w.sheathed === false) continue;
    wallsDone++;
    const ops = (w.openings || []).map((o) => {
      const top = o.headerHeight ?? plan.defaultHeaderHeight;
      return { x0: Math.max(0, o.offset), x1: Math.min(w.length, o.offset + o.width), y0: Math.max(0, top - o.height), y1: Math.min(height, top) };
    });
    const g = gableOf(w, height);
    areaIn += w.length * height + (g ? 0.5 * w.length * g.rise : 0);
    for (const o of ops) openIn += Math.max(0, o.x1 - o.x0) * Math.max(0, o.y1 - o.y0);
    const nCourses = Math.ceil((height + (g ? g.rise : 0)) / exposure - 1e-9);
    courses += nCourses;
    for (let k = 0; k < nCourses; k++) {
      const y0 = k * exposure, y1 = Math.min(height + (g ? g.rise : 0), y0 + exposure);
      if (y0 >= height - 1e-9) { // wholly in the triangle: the width at the lower edge
        const up = y0 - height, run = w.length - up / g.s1 - up / g.s2;
        if (run > 1e-9) runs.push(Math.min(w.length, run));
        continue;
      }
      // openings that cut this course, left to right; overlapping ones merge into one gap
      const cuts = ops.filter((o) => o.y0 < y1 - 1e-9 && o.y1 > y0 + 1e-9 && o.x1 > o.x0).sort((a, b) => a.x0 - b.x0);
      let x = 0;
      for (const o of cuts) { if (o.x0 > x + 1e-9) runs.push(o.x0 - x); x = Math.max(x, o.x1); }
      if (w.length > x + 1e-9) runs.push(w.length - x);
    }
  }
  if (!wallsDone) return { ok: false, errors: ["Siding needs at least one sheathed (exterior) wall."] };
  const b = packPieces(runs, stock);
  const boards = Math.ceil(b.boards * (1 + waste) - 1e-9);
  const netSqFt = (areaIn - openIn) / 144;
  const wrapSqFt = netSqFt * (1 + wrapLap);
  const wrapRolls = Math.ceil(wrapSqFt / wrapRoll - 1e-9);
  const cp = packPieces(Array.from({ length: 2 * corners }, () => height), cornerStock);
  const cornerBoards = corners > 0 ? Math.ceil(cp.boards * (1 + waste) - 1e-9) : 0;
  const money = (/** @type {number | undefined} */ p, /** @type {number} */ q) => (p != null ? q * p : 0);
  return {
    ok: true, errors: [], waste, exposure, stock, height, courses, walls: wallsDone,
    netSqFt, openingSqFt: openIn / 144, runFeet: b.usedIn / 12, boards, wrapSqFt, wrapRollSqFt: wrapRoll, wrapRolls, corners, cornerBoards, cornerStock,
    cost: d.boardPrice != null || d.wrapPrice != null || d.cornerPrice != null ? money(d.boardPrice, boards) + money(d.wrapPrice, wrapRolls) + money(d.cornerPrice, cornerBoards) : null,
    boardPrice: d.boardPrice ?? null, wrapPrice: d.wrapPrice ?? null, cornerPrice: d.cornerPrice ?? null,
  };
}

/** @param {any} s */
export function sidingText(s) {
  const l = [];
  l.push(`  Siding: ${s.walls} exterior wall(s), ${s.height / 12} ft high, ${s.courses} courses at ${s.exposure} in exposure; ${s.runFeet.toFixed(0)} ft of runs cut round openings and packed into ${s.stock / 12} ft boards -> ${s.boards} boards (${(100 * s.waste).toFixed(0)}% waste added)${s.boardPrice != null ? `, ${(s.boards * s.boardPrice).toFixed(2)} at ${s.boardPrice} each` : ""}`);
  l.push(`  House wrap: ${s.netSqFt.toFixed(0)} sq ft of wall net of ${s.openingSqFt.toFixed(0)} sq ft of openings, ${s.wrapSqFt.toFixed(0)} with laps -> ${s.wrapRolls} roll(s) of ${s.wrapRollSqFt} sq ft${s.wrapPrice != null ? `, ${(s.wrapRolls * s.wrapPrice).toFixed(2)} at ${s.wrapPrice} each` : ""}`);
  l.push(`  Corner boards: ${s.corners} outside corners x 2 = ${s.cornerBoards} boards of ${s.cornerStock / 12} ft${s.cornerPrice != null ? `, ${(s.cornerBoards * s.cornerPrice).toFixed(2)} at ${s.cornerPrice} each` : ""}`);
  l.push("  Soffit and fascia, window and door trim, flashing, nails, caulk and paint are not counted; exposure, stock lengths, coverage and prices are figures you type.");
  return l;
}
