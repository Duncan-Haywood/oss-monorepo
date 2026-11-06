// @ts-check
// Concrete block (CMU) wall takeoff: blocks, mortar, grout, rebar and joint
// reinforcement from typed walls. Standalone: it needs no framing plan.
//
// Geometry: a nominal block is 16 in long by 8 in high (the 3/8 in joint is
// inside the nominal size), `thickness` in (default 8) deep. A wall course is
// 8 in high, so courses = ceil(height / 8) and blocks = net face area /
// (16 x 8) = 1.125 per sq ft, plus waste. Cells: the share of the block volume
// that is hollow (`voidShare`, default 0.45) split over two cells per block.
// Grout fills the cells that hold a vertical bar (every `barSpacing` in plus
// both wall ends) and, in a bond beam course, the whole course length. Grout
// is volume x (1 + grout waste). Mortar bags come from `blocksPerMortarBag`
// (default 35, a rule of thumb for face-shell bedding: type your supplier's).
// Rebar: verticals are wall height plus a lap of `lapDiameters` bar diameters
// (dowel from the footing); bond beam bars run the wall length with the same
// lap in 20 ft stock. Joint reinforcement is optional ladder wire every
// `jointReinfCourses` courses.
// All sizes and schedules are inputs. Nothing here checks them against a code,
// a masonry design or an engineer.

import { textNumberErrors } from "./numfields.mjs";

const BAR_LB_FT = { 3: 0.376, 4: 0.668, 5: 1.043, 6: 1.502, 7: 2.044, 8: 2.67 };
const STOCK = 240;
const COURSE = 8;
const BLOCK_LEN = 16;
const ROUND = (/** @type {number} */ x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

/** @typedef {{ id?: string, length: number, height: number, openings?: { width: number, height: number }[] }} CmuWall */
/** @typedef {{ walls: CmuWall[], thickness?: number, voidShare?: number, waste?: number, groutWaste?: number, blocksPerMortarBag?: number, bar?: number, barSpacing?: number, lapDiameters?: number, bondBeamEvery?: number, bondBeamBars?: number, bondBeamBar?: number, jointReinfCourses?: number, blockPrice?: number, mortarBagPrice?: number, groutYardPrice?: number, rebarLbPrice?: number }} Cmu */

/** @param {any} d */
export function validateCmu(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["The wall set is a JSON object."];
  e.push(...textNumberErrors(d, ["thickness", "voidShare", "waste", "groutWaste", "blocksPerMortarBag", "bar", "barSpacing", "lapDiameters", "bondBeamEvery", "bondBeamBars", "bondBeamBar", "jointReinfCourses", "blockPrice", "mortarBagPrice", "groutYardPrice", "rebarLbPrice"]));
  if (!Array.isArray(d.walls) || d.walls.length === 0) e.push("walls must be a list with at least one wall.");
  else if (d.walls.length > 500) e.push("At most 500 walls.");
  else d.walls.forEach((w, i) => {
    if (w == null || typeof w !== "object" || Array.isArray(w)) { e.push(`Wall ${i + 1} must be an object.`); return; }
    for (const k of ["length", "height"]) {
      if (typeof w[k] !== "number" || !Number.isFinite(w[k]) || !(w[k] >= 8 && w[k] <= 6000)) e.push(`Wall ${i + 1}: ${k} must be a number from 8 to 6000 in.`);
    }
    if (w.openings != null && !Array.isArray(w.openings)) e.push(`Wall ${i + 1}: openings must be a list.`);
    else for (const o of w.openings || []) {
      if (o == null || typeof o.width !== "number" || typeof o.height !== "number" || !(o.width > 0 && o.height > 0 && o.width <= 6000 && o.height <= 6000)) e.push(`Wall ${i + 1}: each opening needs a width and a height above 0.`);
    }
  });
  if (e.length) return e;
  if (d.thickness != null && ![4, 6, 8, 10, 12].includes(d.thickness)) e.push("thickness must be 4, 6, 8, 10 or 12 in.");
  if (d.voidShare != null && !(d.voidShare >= 0.1 && d.voidShare <= 0.7)) e.push("voidShare must be between 0.1 and 0.7.");
  for (const k of /** @type {const} */ (["waste", "groutWaste"])) if (d[k] != null && !(d[k] >= 0 && d[k] <= 0.5)) e.push(`${k} must be between 0 and 0.5.`);
  if (d.blocksPerMortarBag != null && !(d.blocksPerMortarBag >= 5 && d.blocksPerMortarBag <= 200)) e.push("blocksPerMortarBag must be between 5 and 200.");
  if (d.bar != null && !(d.bar in BAR_LB_FT)) e.push("bar must be a bar size from 3 to 8.");
  if (d.bondBeamBar != null && !(d.bondBeamBar in BAR_LB_FT)) e.push("bondBeamBar must be a bar size from 3 to 8.");
  if (d.barSpacing != null && !(d.barSpacing >= 8 && d.barSpacing <= 192)) e.push("barSpacing must be between 8 and 192 in (0 is not allowed: leave it out for no vertical bars).");
  if (d.lapDiameters != null && !(d.lapDiameters >= 0 && d.lapDiameters <= 100)) e.push("lapDiameters must be between 0 and 100.");
  for (const k of /** @type {const} */ (["bondBeamEvery", "jointReinfCourses"])) if (d[k] != null && !(Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= 100)) e.push(`${k} must be a whole number from 0 to 100 (0 for none).`);
  if (d.bondBeamBars != null && !(Number.isInteger(d.bondBeamBars) && d.bondBeamBars >= 1 && d.bondBeamBars <= 6)) e.push("bondBeamBars must be 1 to 6.");
  return e;
}

/** @param {Cmu} d */
export function layoutCmu(d) {
  const errors = validateCmu(d);
  if (errors.length) return { ok: false, errors };
  const t = d.thickness ?? 8, voidShare = d.voidShare ?? 0.45, waste = d.waste ?? 0.05, gWaste = d.groutWaste ?? 0.1;
  const perBag = d.blocksPerMortarBag ?? 35, bar = d.bar ?? 5, spacing = d.barSpacing ?? 32, lapD = d.lapDiameters ?? 48;
  const bbEvery = d.bondBeamEvery ?? 0, bbBars = d.bondBeamBars ?? 1, bbBar = d.bondBeamBar ?? 5, ladderEvery = d.jointReinfCourses ?? 0;
  const barDia = bar / 8, bbDia = bbBar / 8;
  const notes = [];
  let faceIn = 0, openIn = 0, blocks = 0, groutIn3 = 0, vBars = 0, vInches = 0, bbInches = 0, bbCourses = 0, ladderFt = 0;
  const walls = [];
  for (const [i, w] of d.walls.entries()) {
    const id = w.id || `Wall ${i + 1}`;
    const courses = Math.ceil(w.height / COURSE - 1e-9);
    const open = (w.openings || []).reduce((s, o) => s + Math.min(o.width, w.length) * Math.min(o.height, w.height), 0);
    const net = Math.max(0, w.length * w.height - open);
    faceIn += w.length * w.height; openIn += open;
    const wBlocks = net / (BLOCK_LEN * COURSE);
    blocks += wBlocks;
    if (w.height % COURSE) notes.push(`${id}: ${w.height} in is not a multiple of 8, so the top course is cut (${courses} courses).`);
    if (w.length % 8) notes.push(`${id}: ${w.length} in is not a multiple of 8, so the run needs a cut block.`);
    // vertical bars: both ends plus every barSpacing; a grouted cell each
    const nBars = d.barSpacing === 0 ? 0 : Math.ceil(w.length / spacing - 1e-9) + 1;
    const cellVol = voidShare * BLOCK_LEN * t / 2; // sq in per cell
    groutIn3 += nBars * cellVol * w.height;
    vBars += nBars; vInches += nBars * (w.height + lapD * barDia);
    let wBB = 0;
    if (bbEvery > 0) {
      wBB = Math.floor(courses / bbEvery);
      if (!wBB && courses >= 1) wBB = 1; // a short wall still gets its top bond beam
      bbCourses += wBB;
      bbInches += wBB * bbBars * (w.length + lapD * bbDia * Math.floor(w.length / STOCK));
      groutIn3 += wBB * w.length * voidShare * t * COURSE;
    }
    if (ladderEvery > 0) ladderFt += Math.floor(courses / ladderEvery) * w.length / 12;
    walls.push({ id, courses, netSqFt: ROUND(net / 144), blocks: ROUND(wBlocks), bars: nBars, bondBeamCourses: wBB });
  }
  const netIn = faceIn - openIn;
  const blockOrder = Math.ceil(blocks * (1 + waste) - 1e-9);
  const groutCuFt = groutIn3 / 1728, groutOrderCuFt = groutCuFt * (1 + gWaste);
  const groutYd = groutOrderCuFt / 27;
  const vLb = vInches / 12 * BAR_LB_FT[/** @type {3|4|5|6|7|8} */ (bar)];
  const bbLb = bbInches / 12 * BAR_LB_FT[/** @type {3|4|5|6|7|8} */ (bbBar)];
  const rebarLb = vLb + bbLb;
  const mortarBags = Math.ceil(blockOrder / perBag - 1e-9);
  const price = (/** @type {number|undefined} */ p, /** @type {number} */ q) => (p == null ? null : ROUND(p * q));
  const parts = [price(d.blockPrice, blockOrder), price(d.mortarBagPrice, mortarBags), price(d.groutYardPrice, groutYd), price(d.rebarLbPrice, rebarLb)];
  const cost = parts.some((p) => p != null) ? ROUND(parts.reduce((s, p) => (s ?? 0) + (p ?? 0), 0) ?? 0) : null;
  if (groutYd > 0 && groutYd < 1) notes.push("Under 1 cu yd of grout: a ready-mix truck may not deliver it. Mix on site or ask for a small load.");
  return {
    ok: true, errors: [], thickness: t, walls,
    faceSqFt: ROUND(faceIn / 144), openingSqFt: ROUND(openIn / 144), netSqFt: ROUND(netIn / 144),
    blocksNet: ROUND(blocks), blocks: blockOrder, courses: walls.reduce((s, w) => s + w.courses, 0), mortarBags,
    groutCuFt: ROUND(groutCuFt), groutOrderCuFt: ROUND(groutOrderCuFt), groutYd: ROUND(groutYd),
    verticalBars: vBars, verticalBarFt: ROUND(vInches / 12, 1), bondBeamCourses: bbCourses, bondBeamBarFt: ROUND(bbInches / 12, 1),
    rebarLb: Math.round(rebarLb), ladderFt: ROUND(ladderFt, 1), ladderRolls: Math.ceil(ladderFt / 10 - 1e-9) , cost, notes,
  };
}

/** @param {any} l */
export function cmuText(l) {
  const o = [];
  o.push(`Concrete block ${l.thickness} in: ${l.faceSqFt} sq ft of wall, less ${l.openingSqFt} sq ft of openings, ${l.netSqFt} sq ft net, ${l.courses} courses.`);
  for (const w of l.walls) o.push(`  ${w.id}: ${w.courses} courses, ${w.netSqFt} sq ft, ${w.blocks} blocks, ${w.bars} vertical bars${w.bondBeamCourses ? `, ${w.bondBeamCourses} bond beam course${w.bondBeamCourses > 1 ? "s" : ""}` : ""}`);
  o.push(`Blocks: ${l.blocksNet} net, ${l.blocks} to order with waste.`);
  o.push(`Mortar: ${l.mortarBags} bags.`);
  o.push(`Grout: ${l.groutCuFt} cu ft, ${l.groutOrderCuFt} cu ft with waste = ${l.groutYd} cu yd.`);
  o.push(`Rebar: ${l.verticalBars} vertical bars (${l.verticalBarFt} ft)${l.bondBeamCourses ? `, ${l.bondBeamBarFt} ft in ${l.bondBeamCourses} bond beam courses` : ""}, about ${l.rebarLb} lb.`);
  if (l.ladderFt) o.push(`Joint reinforcement: ${l.ladderFt} ft, ${l.ladderRolls} 10 ft lengths.`);
  if (l.cost != null) o.push(`Cost of priced lines: ${l.cost.toFixed(2)}.`);
  for (const n of l.notes) o.push(`Note: ${n}`);
  o.push("Block, mortar and grout figures use typical rules of thumb you can change. Cores, lintels, pilasters, control joints and cutting are not counted.");
  return o;
}
