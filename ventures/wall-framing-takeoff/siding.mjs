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
// Window and door trim boards (2026-10-30, `openingTrim: true`): per exterior opening a head and two jambs,
// plus a sill board on windows, cut from `trimWidth` stock (default 3.5 in, a 1x4) and packed with the corner
// boards' first-fit rule; off by default so earlier totals do not move. Siding runs are not shortened by the trim.
// Vertical siding (2026-10-30, `style: "vertical"`, `boardWidth` coverage per board, default 11.25 in): columns of full-height boards; an opening leaves a piece above and below it; with `battens: true` one batten covers each seam between columns (see below); nailers and splices are not counted (a piece longer than the board length is refused).
// Starter strip (2026-10-31, `starter: true`, lap style only, `starterPrice`): one strip along the base of every sheathed wall, its length, packed into `stock` boards with the same waste; the rip to width and splices over studs are not modelled; off by default so earlier totals do not move.
// Head flashing (2026-10-31, `headFlashing: true`, `flashingExtend` inches past each jamb, default 2, `flashingStock` piece length, default 120 in, `flashingPrice`): one Z-flashing piece over every exterior opening, the opening width plus the extension at both ends, packed into stock with the same waste; off by default so earlier totals do not move.
// Not counted: soffit and fascia, sill and jamb flashing, nails, caulk, paint, and the starter strip's rip.
// Wall height defaults to the plan's stud length plus the plates, as the
// drywall hang height does.
import { THICK } from "./engine.mjs";
import { packPieces } from "./trim.mjs";

/** @typedef {{ exposure?: number, stock?: number, waste?: number, wrapRollSqFt?: number, wrapLap?: number, corners?: number, cornerStock?: number, height?: number, boardPrice?: number, wrapPrice?: number, cornerPrice?: number, style?: "lap" | "vertical", boardWidth?: number, battens?: boolean, battenStock?: number, battenPrice?: number, openingTrim?: boolean, trimWidth?: number, trimStock?: number, trimPrice?: number, starter?: boolean, starterPrice?: number, headFlashing?: boolean, flashingStock?: number, flashingExtend?: number, flashingPrice?: number }} Siding */

/** @param {Siding} d */
export function validateSiding(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Siding settings are an object."];
  if (d.exposure != null && !(d.exposure >= 2 && d.exposure <= 16)) e.push("Siding exposure must be between 2 and 16 inches.");
  if (d.stock != null && !(d.stock >= 48 && d.stock <= 240)) e.push("Siding board length must be between 48 and 240 inches.");
  if (d.cornerStock != null && !(d.cornerStock >= 48 && d.cornerStock <= 240)) e.push("Corner board length must be between 48 and 240 inches.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Siding waste must be between 0 and 0.3.");
  if (d.wrapLap != null && !(d.wrapLap >= 0 && d.wrapLap <= 0.3)) e.push("House wrap lap allowance must be between 0 and 0.3.");
  if (d.wrapRollSqFt != null && !(d.wrapRollSqFt >= 100 && d.wrapRollSqFt <= 3000)) e.push("House wrap roll coverage must be between 100 and 3000 sq ft.");
  if (d.corners != null && !(Number.isInteger(d.corners) && d.corners >= 0 && d.corners <= 40)) e.push("Outside corners must be a whole number from 0 to 40.");
  if (d.style != null && d.style !== "lap" && d.style !== "vertical") e.push("Siding style must be \"lap\" or \"vertical\".");
  if (d.boardWidth != null && !(d.boardWidth >= 3 && d.boardWidth <= 24)) e.push("Vertical board width must be between 3 and 24 inches.");
  if (d.battenStock != null && !(d.battenStock >= 48 && d.battenStock <= 240)) e.push("Batten length must be between 48 and 240 inches.");
  if (d.trimWidth != null && !(d.trimWidth > 0 && d.trimWidth <= 8)) e.push("Trim board width must be between 0 and 8 inches.");
  if (d.trimStock != null && !(d.trimStock >= 48 && d.trimStock <= 240)) e.push("Trim board length must be between 48 and 240 inches.");
  if (d.starter != null && typeof d.starter !== "boolean") e.push("Starter strip must be true or false.");
  if (d.headFlashing != null && typeof d.headFlashing !== "boolean") e.push("Head flashing must be true or false.");
  if (d.flashingExtend != null && !(d.flashingExtend >= 0 && d.flashingExtend <= 12)) e.push("Flashing extension must be between 0 and 12 inches.");
  if (d.flashingStock != null && !(d.flashingStock >= 24 && d.flashingStock <= 240)) e.push("Flashing length must be between 24 and 240 inches.");
  if (d.starter && d.style === "vertical") e.push("A starter strip belongs to lap siding; vertical boards need none.");
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
  const vertical = d.style === "vertical", bw = d.boardWidth ?? 11.25;
  const corners = d.corners ?? 4, cornerStock = d.cornerStock ?? 120;
  const height = d.height ?? Math.round((plan.studLength + 3 * THICK) / 12) * 12;
  /** @type {number[]} */ const runs = [];
  const tw = d.trimWidth ?? 3.5, trimStock = d.trimStock ?? 96;
  /** @type {number[]} */ const trimPieces = [];
  /** @type {number[]} */ const battenPieces = [];
  const battenStock = d.battenStock ?? stock;
  /** @type {number[]} */ const starterPieces = [];
  /** @type {number[]} */ const flashPieces = [];
  const flashStock = d.flashingStock ?? 120, flashExt = d.flashingExtend ?? 2;
  let trimDoors = 0, trimWindows = 0;
  let areaIn = 0, openIn = 0, wallsDone = 0, courses = 0;
  for (const w of plan.walls) {
    if (w.sheathed === false) continue;
    wallsDone++;
    if (d.starter) starterPieces.push(w.length);
    const ops = (w.openings || []).map((o) => {
      const top = o.headerHeight ?? plan.defaultHeaderHeight;
      return { x0: Math.max(0, o.offset), x1: Math.min(w.length, o.offset + o.width), y0: Math.max(0, top - o.height), y1: Math.min(height, top) };
    });
    if (d.headFlashing) for (const o of w.openings || []) flashPieces.push(o.width + 2 * flashExt);
    if (d.openingTrim) for (const o of w.openings || []) {
      if (o.kind === "door") { trimDoors++; trimPieces.push(o.width + 2 * tw, o.height, o.height); }
      else { trimWindows++; trimPieces.push(o.width + 2 * tw, o.width + 2 * tw, o.height, o.height); }
    }
    const g = gableOf(w, height);
    areaIn += w.length * height + (g ? 0.5 * w.length * g.rise : 0);
    for (const o of ops) openIn += Math.max(0, o.x1 - o.x0) * Math.max(0, o.y1 - o.y0);
    if (vertical) {
      // boards stand side by side from the wall's start; an opening leaves a piece above and below it in each column it touches
      const nCols = Math.ceil(w.length / bw - 1e-9);
      courses += nCols;
      for (let k = 0; k < nCols; k++) {
        const x0 = k * bw, x1 = Math.min(w.length, x0 + bw);
        let top = height;
        if (g) { const px = w.gable.peak ?? w.length / 2; top += px < x0 ? g.s2 * (w.length - x0) : px > x1 ? g.s1 * x1 : g.rise; } // the taller edge of the column
        const holes = ops.filter((o) => o.x0 < x1 - 1e-9 && o.x1 > x0 + 1e-9 && o.y1 > o.y0).sort((a, b) => a.y0 - b.y0);
        let y = 0;
        for (const o of holes) { if (o.y0 > y + 1e-9) runs.push(o.y0 - y); y = Math.max(y, o.y1); }
        if (top > y + 1e-9) runs.push(top - y);
      }
      if (d.battens) for (let k = 1; k < nCols; k++) { // one batten over each seam, cut at openings, topped by the gable line
        const x = k * bw;
        let top = height;
        if (g) { const px = w.gable.peak ?? w.length / 2; top += x <= px ? g.s1 * x : g.s2 * (w.length - x); }
        const holes = ops.filter((o) => o.x0 < x - 1e-9 && o.x1 > x + 1e-9 && o.y1 > o.y0).sort((a, b) => a.y0 - b.y0);
        let y = 0;
        for (const o of holes) { if (o.y0 > y + 1e-9) battenPieces.push(o.y0 - y); y = Math.max(y, o.y1); }
        if (top > y + 1e-9) battenPieces.push(top - y);
      }
      continue;
    }
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
  if (vertical && runs.some((r) => r > stock + 1e-9)) return { ok: false, errors: [`Vertical boards do not splice: the longest piece is ${Math.max(...runs).toFixed(1)} in and the board length is ${stock} in. Type a longer \`stock\`.`] };
  if (battenPieces.some((r) => r > battenStock + 1e-9)) return { ok: false, errors: [`Battens do not splice: the longest is ${Math.max(...battenPieces).toFixed(1)} in and the batten length is ${battenStock} in. Type a longer \`battenStock\`.`] };
  const b = packPieces(runs, stock);
  const bp = vertical && d.battens ? packPieces(battenPieces, battenStock) : null;
  const battenBoards = bp ? Math.ceil(bp.boards * (1 + waste) - 1e-9) : 0;
  const boards = Math.ceil(b.boards * (1 + waste) - 1e-9);
  const netSqFt = (areaIn - openIn) / 144;
  const wrapSqFt = netSqFt * (1 + wrapLap);
  const wrapRolls = Math.ceil(wrapSqFt / wrapRoll - 1e-9);
  const cp = packPieces(Array.from({ length: 2 * corners }, () => height), cornerStock);
  const cornerBoards = corners > 0 ? Math.ceil(cp.boards * (1 + waste) - 1e-9) : 0;
  const tp = d.openingTrim ? packPieces(trimPieces, trimStock) : null;
  const trimBoards = tp ? Math.ceil(tp.boards * (1 + waste) - 1e-9) : 0;
  const sp = d.starter ? packPieces(starterPieces, stock) : null;
  const starterBoards = sp ? Math.ceil(sp.boards * (1 + waste) - 1e-9) : 0;
  const fp = d.headFlashing ? packPieces(flashPieces, flashStock) : null;
  const flashBoards = fp ? Math.ceil(fp.boards * (1 + waste) - 1e-9) : 0;
  const money = (/** @type {number | undefined} */ p, /** @type {number} */ q) => (p != null ? q * p : 0);
  return {
    ok: true, errors: [], style: vertical ? "vertical" : "lap", boardWidth: vertical ? bw : null, waste, exposure, stock, height, courses, walls: wallsDone,
    netSqFt, openingSqFt: openIn / 144, runFeet: b.usedIn / 12, boards, wrapSqFt, wrapRollSqFt: wrapRoll, wrapRolls, corners, cornerBoards, cornerStock,
    battens: bp ? { pieces: battenPieces.length, feet: bp.usedIn / 12, stock: battenStock, boards: battenBoards, price: d.battenPrice ?? null } : null,
    trim: tp ? { doors: trimDoors, windows: trimWindows, width: tw, stock: trimStock, feet: tp.usedIn / 12, boards: trimBoards, price: d.trimPrice ?? null } : null,
    flashing: fp ? { openings: flashPieces.length, feet: fp.usedIn / 12, stock: flashStock, pieces: flashBoards, price: d.flashingPrice ?? null } : null,
    starter: sp ? { walls: starterPieces.length, feet: sp.usedIn / 12, stock, boards: starterBoards, price: d.starterPrice ?? null } : null,
    cost: d.boardPrice != null || (sp && d.starterPrice != null) || d.wrapPrice != null || d.cornerPrice != null || (tp && d.trimPrice != null) || (fp && d.flashingPrice != null) || (bp && d.battenPrice != null) ? money(d.boardPrice, boards) + money(d.wrapPrice, wrapRolls) + money(d.cornerPrice, cornerBoards) + money(d.trimPrice, trimBoards) + money(d.battenPrice, battenBoards) + money(d.starterPrice, starterBoards) + money(d.flashingPrice, flashBoards) : null,
    boardPrice: d.boardPrice ?? null, wrapPrice: d.wrapPrice ?? null, cornerPrice: d.cornerPrice ?? null,
  };
}

/** @param {any} s */
export function sidingText(s) {
  const l = [];
  if (s.style === "vertical") l.push(`  Siding (vertical): ${s.walls} exterior wall(s), ${s.height / 12} ft high, ${s.courses} board columns at ${s.boardWidth} in coverage; ${s.runFeet.toFixed(0)} ft of boards (a column an opening cuts leaves a piece above and below, counted at full width) packed into ${s.stock / 12} ft boards -> ${s.boards} boards (${(100 * s.waste).toFixed(0)}% waste added)${s.boardPrice != null ? `, ${(s.boards * s.boardPrice).toFixed(2)} at ${s.boardPrice} each` : ""}`);
  else l.push(`  Siding: ${s.walls} exterior wall(s), ${s.height / 12} ft high, ${s.courses} courses at ${s.exposure} in exposure; ${s.runFeet.toFixed(0)} ft of runs cut round openings and packed into ${s.stock / 12} ft boards -> ${s.boards} boards (${(100 * s.waste).toFixed(0)}% waste added)${s.boardPrice != null ? `, ${(s.boards * s.boardPrice).toFixed(2)} at ${s.boardPrice} each` : ""}`);
  if (s.battens) l.push(`  Battens: one over each seam between columns, ${s.battens.pieces} piece(s), ${s.battens.feet.toFixed(0)} ft packed into ${s.battens.stock / 12} ft boards -> ${s.battens.boards} boards (waste added)${s.battens.price != null ? `, ${(s.battens.boards * s.battens.price).toFixed(2)} at ${s.battens.price} each` : ""}; boards sit edge to edge, so the batten is a cover strip, not a gap spacer.`);
  l.push(`  House wrap: ${s.netSqFt.toFixed(0)} sq ft of wall net of ${s.openingSqFt.toFixed(0)} sq ft of openings, ${s.wrapSqFt.toFixed(0)} with laps -> ${s.wrapRolls} roll(s) of ${s.wrapRollSqFt} sq ft${s.wrapPrice != null ? `, ${(s.wrapRolls * s.wrapPrice).toFixed(2)} at ${s.wrapPrice} each` : ""}`);
  l.push(`  Corner boards: ${s.corners} outside corners x 2 = ${s.cornerBoards} boards of ${s.cornerStock / 12} ft${s.cornerPrice != null ? `, ${(s.cornerBoards * s.cornerPrice).toFixed(2)} at ${s.cornerPrice} each` : ""}`);
  if (s.flashing) l.push(`  Head flashing: ${s.flashing.openings} opening(s), ${s.flashing.feet.toFixed(0)} ft packed into ${s.flashing.stock / 12} ft pieces -> ${s.flashing.pieces} pieces (waste added)${s.flashing.price != null ? `, ${(s.flashing.pieces * s.flashing.price).toFixed(2)} at ${s.flashing.price} each` : ""}`);
  if (s.starter) l.push(`  Starter strip: ${s.starter.feet.toFixed(0)} ft along the base of ${s.starter.walls} wall(s) packed into ${s.starter.stock / 12} ft boards -> ${s.starter.boards} boards (waste added)${s.starter.price != null ? `, ${(s.starter.boards * s.starter.price).toFixed(2)} at ${s.starter.price} each` : ""}`);
  if (s.trim) l.push(`  Opening trim: ${s.trim.doors} door(s) x (head + 2 jambs), ${s.trim.windows} window(s) x (head + sill + 2 jambs), ${s.trim.width} in boards, ${s.trim.feet.toFixed(0)} ft packed into ${s.trim.stock / 12} ft boards -> ${s.trim.boards} boards (waste added)${s.trim.price != null ? `, ${(s.trim.boards * s.trim.price).toFixed(2)} at ${s.trim.price} each` : ""}`);
  l.push(`  Soffit and fascia, ${s.trim ? "" : "window and door trim, "}flashing, nails, caulk and paint are not counted; exposure, stock lengths, coverage and prices are figures you type.`);
  return l;
}
