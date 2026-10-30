// @ts-check
// Soffit panels, fascia boards and J-channel under the roof's overhangs, counted
// from the roof the plan already has (`--roof`), not from a perimeter guess.
//
// Eaves run along the plan's roof length (gable) or on all four sides (hip),
// each `overhang` deep. Rakes (gable ends) run up the slope, `gableOverhang`
// deep; a rake soffit is optional (`rakeSoffit`, default off: most houses leave
// the rake open or box it with a fascia only). Soffit panels lie parallel to the
// wall, `panelWidth` wide (default 12 in), so an overhang takes
// ceil(overhang / panelWidth) courses; each course's run is packed into stock
// panels by first fit decreasing. Fascia boards follow the eave and rake runs
// and are packed the same way. J-channel is the length of wall the soffit meets.
// Not counted: corner mitres, vented-panel mix, frieze board, drip edge (the
// roof's own count), nails, caulk and paint; a cross wing's overhangs (main roof only).
import { packPieces } from "./trim.mjs";

/** @typedef {{ panelWidth?: number, panelStock?: number, fasciaStock?: number, channelStock?: number, waste?: number, rakeSoffit?: boolean, panelPrice?: number, fasciaPrice?: number, channelPrice?: number }} Eaves */

/** @param {Eaves} d */
export function validateEaves(d) {
  const e = [];
  if (d.panelWidth != null && !(d.panelWidth >= 6 && d.panelWidth <= 24)) e.push("Soffit panel width must be between 6 and 24 inches.");
  for (const [k, n] of /** @type {const} */ ([["panelStock", "Soffit panel"], ["fasciaStock", "Fascia board"], ["channelStock", "J-channel"]])) {
    const v = d[k];
    if (v != null && !(v >= 48 && v <= 288)) e.push(`${n} length must be between 48 and 288 inches.`);
  }
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Eave waste must be between 0 and 0.3.");
  return e;
}

/**
 * @param {Eaves} d
 * @param {any} roof the layoutRoof result
 */
export function layoutEaves(d, roof) {
  const errors = validateEaves(d);
  if (errors.length) return { ok: false, errors };
  if (!roof || !roof.ok) return { ok: false, errors: ["Soffit and fascia need a roof in the plan (`roof`, or --roof)."] };
  const pw = d.panelWidth ?? 12, panelStock = d.panelStock ?? 144, fasciaStock = d.fasciaStock ?? 192, channelStock = d.channelStock ?? 144;
  const waste = d.waste ?? 0.1, rakeSoffit = d.rakeSoffit === true;
  const oh = roof.overhang, rake = roof.gableOverhang;
  const hip = roof.shape === "hip";
  const L = roof.length, W = roof.width;
  /** @type {number[]} */ let eaveRuns, rakeRuns;
  if (hip) { eaveRuns = [L + 2 * oh, L + 2 * oh, W + 2 * oh, W + 2 * oh]; rakeRuns = []; }
  else { eaveRuns = [L + 2 * rake, L + 2 * rake]; rakeRuns = [roof.slope, roof.slope, roof.slope, roof.slope]; }
  const eaveCourses = oh > 0 ? Math.ceil(oh / pw - 1e-9) : 0;
  const rakeCourses = rakeSoffit && rake > 0 ? Math.ceil(rake / pw - 1e-9) : 0;
  /** @type {number[]} */ const soffitRuns = [];
  for (const r of eaveRuns) for (let c = 0; c < eaveCourses; c++) soffitRuns.push(r);
  for (const r of rakeRuns) for (let c = 0; c < rakeCourses; c++) soffitRuns.push(r);
  const soffitSqFt = (eaveRuns.reduce((a, b) => a + b, 0) * oh + (rakeSoffit ? rakeRuns.reduce((a, b) => a + b, 0) * rake : 0)) / 144;
  const up = (/** @type {number} */ n) => Math.ceil(n * (1 + waste) - 1e-9);
  const sp = soffitRuns.length ? packPieces(soffitRuns, panelStock) : { boards: 0, usedIn: 0 };
  const fasciaRuns = [...eaveRuns, ...rakeRuns];
  const fp = packPieces(fasciaRuns, fasciaStock);
  const channelRuns = [...(oh > 0 ? eaveRuns : []), ...(rakeSoffit ? rakeRuns : [])];
  const cp = channelRuns.length ? packPieces(channelRuns, channelStock) : { boards: 0, usedIn: 0 };
  const panels = up(sp.boards), fascia = up(fp.boards), channel = up(cp.boards);
  const money = (/** @type {number | undefined} */ p, /** @type {number} */ q) => (p != null ? q * p : 0);
  const priced = d.panelPrice != null || d.fasciaPrice != null || d.channelPrice != null;
  return {
    ok: true, errors: [], shape: hip ? "hip" : "gable", waste, panelWidth: pw, panelStock, fasciaStock, channelStock, rakeSoffit,
    eaveFeet: eaveRuns.reduce((a, b) => a + b, 0) / 12, rakeFeet: rakeRuns.reduce((a, b) => a + b, 0) / 12,
    soffitSqFt, eaveCourses, rakeCourses, panels, fascia, channel,
    cost: priced ? money(d.panelPrice, panels) + money(d.fasciaPrice, fascia) + money(d.channelPrice, channel) : null,
    panelPrice: d.panelPrice ?? null, fasciaPrice: d.fasciaPrice ?? null, channelPrice: d.channelPrice ?? null,
  };
}

/** @param {any} s */
export function eavesText(s) {
  const l = [];
  const m = (/** @type {number} */ q, /** @type {number | null} */ p) => (p != null ? `, ${(q * p).toFixed(2)} at ${p} each` : "");
  l.push(`  Soffit: ${s.soffitSqFt.toFixed(0)} sq ft under ${s.eaveFeet.toFixed(0)} ft of eave${s.rakeSoffit ? ` and ${s.rakeFeet.toFixed(0)} ft of rake` : ""}, ${s.eaveCourses} course(s) of ${s.panelWidth} in panels -> ${s.panels} panels of ${s.panelStock / 12} ft (${(100 * s.waste).toFixed(0)}% waste added)${m(s.panels, s.panelPrice)}`);
  l.push(`  Fascia: ${(s.eaveFeet + s.rakeFeet).toFixed(0)} ft (eave${s.rakeFeet ? " and rake" : ""}) -> ${s.fascia} boards of ${s.fasciaStock / 12} ft${m(s.fascia, s.fasciaPrice)}`);
  l.push(`  J-channel: ${s.channel} pieces of ${s.channelStock / 12} ft along the wall${m(s.channel, s.channelPrice)}`);
  l.push("  Corner mitres, vented-panel mix, frieze, drip edge, nails, caulk, paint and a cross wing's overhangs are not counted; widths, stock lengths and prices are figures you type.");
  return l;
}
