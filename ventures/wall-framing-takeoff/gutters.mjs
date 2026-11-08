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
// Leaf guards (`leafGuards: true`) are one section per gutter section. Sealant (`sealant: true`, `jointsPerTube`) is one bead per splice, end cap, corner side and downspout outlet. Not counted: slope pitch, fascia brackets,
// screws, downspout straps beyond the one per `strapSpacing` inches, and a cross
// wing of a different pitch than the main roof (noted). Equal-pitch wings are counted.
import { packPieces } from "./trim.mjs";

import { textNumberErrors } from "./numfields.mjs";
/** @typedef {{ gutterStock?: number, downspoutStock?: number, eaveHeight?: number, hangerSpacing?: number, maxRunFeet?: number, sqFtPerDownspout?: number, strapSpacing?: number, waste?: number, gutterPrice?: number, downspoutPrice?: number, hangerPrice?: number, capPrice?: number, elbowPrice?: number, cornerPrice?: number, strapPrice?: number, splashBlocks?: boolean, splashBlockPrice?: number, leafGuards?: boolean, leafGuardPrice?: number, sealant?: boolean, jointsPerTube?: number, sealantPrice?: number }} Gutters */

/** @param {Gutters} d */
export function validateGutters(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Gutter settings are an object."];
  e.push(...textNumberErrors(d, ['capPrice', 'cornerPrice', 'downspoutPrice', 'downspoutStock', 'eaveHeight', 'elbowPrice', 'gutterPrice', 'gutterStock', 'hangerPrice', 'hangerSpacing', 'maxRunFeet', 'sqFtPerDownspout', 'strapPrice', 'strapSpacing', 'waste', 'splashBlockPrice', 'leafGuardPrice', 'jointsPerTube', 'sealantPrice']));
  if (d.splashBlocks != null && typeof d.splashBlocks !== "boolean") e.push("Splash blocks is true or false.");
  if (d.splashBlockPrice != null && !(d.splashBlockPrice >= 0)) e.push("Splash block price cannot be negative.");
  if (d.leafGuards != null && typeof d.leafGuards !== "boolean") e.push("Leaf guards is true or false.");
  if (d.leafGuardPrice != null && !(d.leafGuardPrice >= 0)) e.push("Leaf guard price cannot be negative.");
  if (d.sealant != null && typeof d.sealant !== "boolean") e.push("Sealant is true or false.");
  if (d.jointsPerTube != null && !(d.jointsPerTube >= 1 && d.jointsPerTube <= 100)) e.push("Joints per sealant tube is 1 to 100.");
  if (d.sealantPrice != null && !(d.sealantPrice >= 0)) e.push("Sealant price cannot be negative.");
  if (e.length) return e;
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
  let planSqFt = hip ? (L + 2 * oh) * (W + 2 * oh) / 144 : (L + 2 * rake) * (W + 2 * oh) / 144;
  // A cross wing (equal pitch only) replaces the stretch of main eave it sits on, `width + 2 x overhang`, with
  // its own two eave runs (gable end to the main eave line) and adds the plan area beyond that line.
  /** @type {string[]} */ const wingNotes = [];
  let wingCount = 0;
  for (const wg of (hip ? [] : roof.wings || [])) {
    if (Math.abs(wg.pitch - roof.pitch) > 1e-9) { wingNotes.push(`A cross wing ${wg.width / 12} ft wide has its own pitch, so its gutters are not counted (equal pitch only).`); continue; }
    const cut = wg.width + 2 * oh, i = runs.findIndex((r) => r >= cut);
    if (i < 0) { wingNotes.push("A cross wing is wider than the main eave it sits on; its gutters are not counted."); continue; }
    runs[i] -= cut;
    runs.push(wg.eaveLineRun, wg.eaveLineRun);
    planSqFt += cut * wg.eaveLineRun / 144;
    wingCount++;
  }
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
  const splashBlocks = d.splashBlocks ? downspouts : 0; // one under each downspout kick-out, when asked for
  const gutters = up(gp.boards);
  const leafGuards = d.leafGuards ? gutters : 0; // one guard section per gutter section (same stock length and waste), when asked for
  // Sealant: one bead per joint, joints = splices between sections + end caps + two per outside corner + one per downspout outlet; typed joints per tube (default 10).
  const joints = Math.max(0, Math.ceil(gp.boards - 1e-9) - runs.length) + caps + 2 * corners + downspouts;
  const sealantTubes = d.sealant ? Math.ceil(joints / (d.jointsPerTube ?? 10) - 1e-9) : 0;
  const priced = ["gutterPrice", "downspoutPrice", "hangerPrice", "capPrice", "elbowPrice", "cornerPrice", "strapPrice", "splashBlockPrice", "leafGuardPrice", "sealantPrice"].some((k) => /** @type {any} */ (d)[k] != null);
  const m = (/** @type {number | undefined} */ p, /** @type {number} */ q) => (p != null ? q * p : 0);
  return {
    ok: true, errors: [], shape: hip ? "hip" : "gable", waste, gutterStock: stock, downspoutStock: dsStock, eaveHeight: height, hangerSpacing: hanger,
    wings: wingCount, wingNotes, runFeet: total / 12, runs: runs.length, planSqFt, gutters, downspouts, downspoutPieces: dsPieces, hangers, endCaps: caps, outsideCorners: corners, elbows, straps, splashBlocks, leafGuards, joints, sealantTubes,
    cost: priced ? m(d.gutterPrice, gutters) + m(d.downspoutPrice, dsPieces) + m(d.hangerPrice, hangers) + m(d.capPrice, caps) + m(d.elbowPrice, elbows) + m(d.cornerPrice, corners) + m(d.strapPrice, straps) + m(d.splashBlockPrice, splashBlocks) + m(d.leafGuardPrice, leafGuards) + m(d.sealantPrice, sealantTubes) : null,
  };
}

/** @param {any} g */
export function guttersText(g) {
  const l = [];
  l.push(`  Gutter: ${g.runFeet.toFixed(0)} ft in ${g.runs} run(s) -> ${g.gutters} sections of ${g.gutterStock / 12} ft (${(100 * g.waste).toFixed(0)}% waste added)${g.leafGuards ? `, ${g.leafGuards} leaf guard sections` : ""}`);
  l.push(`  Downspouts: ${g.downspouts} (roof plan area ${g.planSqFt.toFixed(0)} sq ft), ${g.eaveHeight / 12} ft drop -> ${g.downspoutPieces} pieces of ${g.downspoutStock / 12} ft, ${g.elbows} elbows, ${g.straps} straps${g.splashBlocks ? `, ${g.splashBlocks} splash blocks` : ""}${g.sealantTubes ? `, ${g.sealantTubes} sealant tubes (${g.joints} joints)` : ""}`);
  l.push(`  Hangers: ${g.hangers} (every ${g.hangerSpacing} in), end caps: ${g.endCaps}${g.outsideCorners ? `, outside corners: ${g.outsideCorners}` : ""}`);
  if (g.cost != null) l.push(`  Priced parts: ${g.cost.toFixed(2)}`);
  l.push("  Downspout count is a rule of thumb (one per run length and per roof area), not a drainage design; screws are not counted (sealant and leaf guards only when asked for).");
  for (const n of g.wingNotes || []) l.push("  " + n);
  return l;
}
