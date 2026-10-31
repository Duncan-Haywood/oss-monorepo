// @ts-check
// Gutters, downspouts and their fittings along the roof's eaves (`--eaves` sets
// the same runs), counted from the roof the plan already has (`--roof`).
//
// Gutters hang on the eave runs only: all four sides of a hip, the two long
// sides of a gable (rakes shed onto the ground). Each run is packed into stock
// lengths by first fit decreasing; every run takes two end caps (one where a
// downspout outlet sits, still a cap on the other end), hangers every `hangerSpacing`
// inches (default 24), and a hip roof's four corners take an outside mitre each.
// Downspouts per run are the larger of two rules of thumb you can change: one per
// `maxRunFeet` of gutter (default 40) and one per `sqFtPerDownspout` of roof plan
// area drained (default 600, a 2x3 in downspout on 5 in gutter; plan area shared
// by eave length). These are sizing habits, not a drainage design: local rainfall
// and the manufacturer's tables decide the real count.
// Not counted: slope pitch, splash blocks, leaf guards, fascia brackets, sealant,
// screws, downspout straps beyond the one per `strapSpacing` inches, and a cross
// wing's runs (main roof only).
import { packPieces } from "./trim.mjs";

/** @typedef {{ gutterStock?: number, downspoutStock?: number, eaveHeight?: number, hangerSpacing?: number, maxRunFeet?: number, sqFtPerDownspout?: number, strapSpacing?: number, waste?: number, gutterPrice?: number, downspoutPrice?: number, hangerPrice?: number, capPrice?: number, elbowPrice?: number, cornerPrice?: number, strapPrice?: number }} Gutters */

/** @param {Gutters} d */
export function validateGutters(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Gutter options are an object."];
  const e = [];
  for (const [k, n, lo, hi] of /** @type {const} */ ([
    ["gutterStock", "Gutter length", 48, 288], ["downspoutStock", "Downspout length", 48, 240],
    ["eaveHeight", "Eave height", 48, 600], ["hangerSpacing", "Hanger spacing", 12, 48],
    ["maxRunFeet", "Longest run per downspout (ft)", 10, 80], ["sqFtPerDownspout", "Roof area per downspout (sq ft)", 100, 2000],
    ["strapSpacing", "Strap spacing", 24, 120],
  ])) {
    const v = d[k];
    if (v != null && !(v >= lo && v <= hi)) e.push(`${n} must be between ${lo} and ${hi}.`);
  }
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Gutter waste must be between 0 and 0.3.");
  return e;
}

/**
 * @param {Gutters} d
 * @param {any} roof the layoutRoof result
 */
export function layoutGutters(d, roof) {
  const errors = validateGutters(d);
  if (errors.length) return { ok: false, errors };
  if (!roof || !roof.ok) return { ok: false, errors: ["Gutters need a roof in the plan (`roof`, or --roof)."] };
  const stock = d.gutterStock ?? 120, dsStock = d.downspoutStock ?? 120, height = d.eaveHeight ?? 120;
  const hanger = d.hangerSpacing ?? 24, maxRun = (d.maxRunFeet ?? 40) * 12, perDs = d.sqFtPerDownspout ?? 600;
  const strap = d.strapSpacing ?? 72, waste = d.waste ?? 0.1;
  const oh = roof.overhang, rake = roof.gableOverhang, hip = roof.shape === "hip";
  const L = roof.length, W = roof.width;
  /** gutter runs in inches, and the roof's plan area (sq ft) with its overhangs */
  const runs = hip ? [L + 2 * oh, L + 2 * oh, W + 2 * oh, W + 2 * oh] : [L + 2 * rake, L + 2 * rake];
  const planSqFt = hip ? (L + 2 * oh) * (W + 2 * oh) / 144 : (L + 2 * rake) * (W + 2 * oh) / 144;
  const total = runs.reduce((a, b) => a + b, 0);
  const up = (/** @type {number} */ n) => Math.ceil(n * (1 + waste) - 1e-9);
  const gp = packPieces(runs, stock);
  let downspouts = 0;
  for (const r of runs) {
    const byLength = Math.ceil(r / maxRun - 1e-9), byArea = Math.ceil((planSqFt * r / total) / perDs - 1e-9);
    downspouts += Math.max(1, byLength, byArea);
  }
  const dsPieces = downspouts * Math.ceil(height / dsStock - 1e-9);
  const hangers = runs.reduce((a, r) => a + Math.floor(r / hanger) + 1, 0);
  const caps = 2 * runs.length;
  const corners = hip ? 4 : 0;
  const elbows = 2 * downspouts; // top offset under the outlet, bottom kick-out
  const straps = downspouts * (Math.floor(height / strap) + 1);
  const gutters = up(gp.boards);
  const priced = ["gutterPrice", "downspoutPrice", "hangerPrice", "capPrice", "elbowPrice", "cornerPrice", "strapPrice"].some((k) => /** @type {any} */ (d)[k] != null);
  const m = (/** @type {number | undefined} */ p, /** @type {number} */ q) => (p != null ? q * p : 0);
  return {
    ok: true, errors: [], shape: hip ? "hip" : "gable", waste, gutterStock: stock, downspoutStock: dsStock, eaveHeight: height, hangerSpacing: hanger,
    runFeet: total / 12, runs: runs.length, planSqFt, gutters, downspouts, downspoutPieces: dsPieces, hangers, endCaps: caps, outsideCorners: corners, elbows, straps,
    cost: priced ? m(d.gutterPrice, gutters) + m(d.downspoutPrice, dsPieces) + m(d.hangerPrice, hangers) + m(d.capPrice, caps) + m(d.elbowPrice, elbows) + m(d.cornerPrice, corners) + m(d.strapPrice, straps) : null,
  };
}

/** @param {any} g */
export function guttersText(g) {
  const l = [];
  l.push(`  Gutter: ${g.runFeet.toFixed(0)} ft in ${g.runs} run(s) -> ${g.gutters} sections of ${g.gutterStock / 12} ft (${(100 * g.waste).toFixed(0)}% waste added)`);
  l.push(`  Downspouts: ${g.downspouts} (roof plan area ${g.planSqFt.toFixed(0)} sq ft), ${g.eaveHeight / 12} ft drop -> ${g.downspoutPieces} pieces of ${g.downspoutStock / 12} ft, ${g.elbows} elbows, ${g.straps} straps`);
  l.push(`  Hangers: ${g.hangers} (every ${g.hangerSpacing} in), end caps: ${g.endCaps}${g.outsideCorners ? `, outside corners: ${g.outsideCorners}` : ""}`);
  if (g.cost != null) l.push(`  Priced parts: ${g.cost.toFixed(2)}`);
  l.push("  Downspout count is a rule of thumb (one per run length and per roof area), not a drainage design; splash blocks, leaf guards, sealant, screws and a cross wing's runs are not counted.");
  return l;
}
