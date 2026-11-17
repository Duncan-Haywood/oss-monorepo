// @ts-check
// Stud drilling and notching check for pipes and cable runs through the wall frame.
//
// The usual residential-code limits for a solid-sawn wood stud (IRC R602.6 as
// commonly stated; the edition and your local amendments are yours to check, so
// every limit is held in `limits` and can be typed over):
//   bored hole  : at most 40% of the stud width in a bearing wall; 60% in a
//                 non-bearing wall, or in a bearing wall whose bored studs are
//                 doubled (no more than two doubled studs bored in a row); the
//                 edge of the hole no nearer than 5/8 in to either stud edge.
//   notch       : at most 25% of the stud width in a bearing or exterior wall,
//                 40% in a non-bearing one. Never a notch and a hole at one section.
// A run is `{ wall, kind: "bore"|"notch", size | pipe, count, doubled, label }`.
// `size` is the hole diameter or notch depth in inches; `pipe` is a DWV nominal
// size ("1-1/2", "2", "3", "4") and uses its outside diameter plus `clearance`.
// The result says whether the wall's stud takes it, how much of the stud it
// uses, and the smallest listed stud (2x4, 2x6, 2x8) that would, or that none
// does and a chase or a sleeve in a doubled stud is the way out. This is a
// counting aid for the walk-through with the plumber, not an engineer's review.

import { textNumberErrors } from "./numfields.mjs";

/** Actual stud widths (the face a hole is bored across), inches. */
export const STUD_WIDTH = { "2x4": 3.5, "2x6": 5.5, "2x8": 7.25 };
/** Outside diameters, inches, of common Schedule 40 DWV pipe by nominal size (ASTM D1785 / D2665). */
export const DWV_OD = { "1-1/4": 1.66, "1-1/2": 1.9, "2": 2.375, "3": 3.5, "4": 4.5 };
const DEFAULT_LIMITS = { boreBearing: 0.4, boreDoubledOrNonBearing: 0.6, notchBearing: 0.25, notchNonBearing: 0.4, edge: 0.625 };

/** @param {any} d @param {any} [plan] */
export function validateDrilling(d, plan) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Drilling settings are an object with a runs list."];
  const e = [];
  if (!Array.isArray(d.runs) || !d.runs.length) return ["drilling.runs is a list of {wall, kind, size or pipe} runs."];
  if (d.clearance != null && !(typeof d.clearance === "number" && d.clearance >= 0 && d.clearance <= 1)) e.push("clearance must be between 0 and 1 inch.");
  if (d.limits != null) { if (typeof d.limits !== "object" || Array.isArray(d.limits)) e.push("limits is an object."); else for (const k of Object.keys(d.limits)) if (!Object.hasOwn(DEFAULT_LIMITS, k)) e.push(`limits.${k} is not a limit (${Object.keys(DEFAULT_LIMITS).join(", ")}).`); else if (!(d.limits[k] > 0 && d.limits[k] <= 1.5)) e.push(`limits.${k} must be a positive fraction (edge is inches).`); }
  const ids = plan ? new Set((plan.walls || []).map((/** @type {any} */ w) => w.id)) : null;
  d.runs.forEach((/** @type {any} */ r, i) => {
    const n = `runs[${i + 1}]`;
    if (r == null || typeof r !== "object") { e.push(`${n} is an object.`); return; }
    const ne = textNumberErrors(r, ["size", "count"]); if (ne.length) { e.push(...ne.map((x) => `${n}: ${x}`)); return; }
    if (typeof r.wall !== "string") e.push(`${n} needs a wall id.`);
    else if (ids && !ids.has(r.wall)) e.push(`${n} names "${r.wall}", which is not a wall in the plan.`);
    if (r.kind !== "bore" && r.kind !== "notch") e.push(`${n} kind is "bore" or "notch".`);
    if (r.pipe != null && (r.kind === "notch" || !Object.hasOwn(DWV_OD, String(r.pipe)))) e.push(`${n} pipe "${r.pipe}" is not one of ${Object.keys(DWV_OD).join(", ")} (a bore only); type size instead.`);
    if (r.pipe == null && r.size == null) e.push(`${n} needs a size (inches) or a pipe.`);
    if (r.size != null && !(r.size > 0 && r.size <= 12)) e.push(`${n} size must be over 0 and at most 12 inches.`);
    if (r.count != null && !(Number.isInteger(r.count) && r.count >= 1 && r.count <= 500)) e.push(`${n} count is a whole number 1 to 500.`);
  });
  return e;
}

/**
 * @param {any} d
 * @param {{ walls: { id: string, stud?: string, bearing?: boolean }[] }} plan
 */
export function layoutDrilling(d, plan) {
  const errors = validateDrilling(d, plan);
  if (errors.length) return { ok: false, errors };
  const L = { ...DEFAULT_LIMITS, ...(d.limits || {}) }, clr = d.clearance ?? 0.125;
  const rows = d.runs.map((/** @type {any} */ r) => {
    const w = plan.walls.find((x) => x.id === r.wall);
    const stud = /** @type {keyof typeof STUD_WIDTH} */ (w?.stud || "2x4");
    const width = STUD_WIDTH[stud];
    const bearing = w?.bearing !== false;
    const bore = r.kind === "bore";
    const size = r.pipe != null ? +(DWV_OD[/** @type {keyof typeof DWV_OD} */ (String(r.pipe))] + clr).toFixed(4) : r.size;
    const relaxed = !bearing || !!r.doubled;
    const frac = bore ? (relaxed ? L.boreDoubledOrNonBearing : L.boreBearing) : (bearing ? L.notchBearing : L.notchNonBearing);
    const maxSize = bore ? Math.min(frac * width, width - 2 * L.edge) : frac * width;
    const edge = bore ? (width - size) / 2 : null;
    const ok = size <= maxSize + 1e-9;
    /** @type {string|null} */ let fix = null;
    if (!ok) {
      const fits = Object.entries(STUD_WIDTH).find(([, sw]) => size <= (bore ? Math.min(frac * sw, sw - 2 * L.edge) : frac * sw) + 1e-9);
      fix = fits ? `needs a ${fits[0]} stud here` : bore && !relaxed ? "no listed stud takes it single; double the stud, or run it in a chase / furred wall" : "no listed stud takes it; run it in a chase / furred wall or sleeve through the plate";
      if (fits && bore && !relaxed) fix += ", or double the bored studs";
    }
    return { wall: r.wall, label: r.label || null, kind: r.kind, stud, bearing, doubled: !!r.doubled, count: r.count ?? 1, size, maxSize: +maxSize.toFixed(4), usedPct: +(100 * size / width).toFixed(1), edge: edge == null ? null : +edge.toFixed(4), ok, fix };
  });
  const failing = rows.filter((/** @type {any} */ x) => !x.ok);
  return { ok: true, errors: [], rows, failing: failing.length, holes: rows.reduce((/** @type {number} */ a, /** @type {any} */ x) => a + (x.kind === "bore" ? x.count : 0), 0), limits: L, clearance: clr };
}

/** @param {any} t */
export function drillingText(t) {
  const l = [];
  l.push(`  ${t.rows.length} runs checked, ${t.failing} over the limit (bearing bore ${+(100 * t.limits.boreBearing).toFixed(4)}%, doubled or non-bearing bore ${+(100 * t.limits.boreDoubledOrNonBearing).toFixed(4)}%, notch ${+(100 * t.limits.notchBearing).toFixed(4)}% / ${+(100 * t.limits.notchNonBearing).toFixed(4)}%, edge ${t.limits.edge} in).`);
  for (const r of t.rows) l.push(`    ${r.ok ? "ok  " : "OVER"} ${r.wall}${r.label ? ` (${r.label})` : ""}: ${r.kind} ${r.size} in in a ${r.stud}${r.bearing ? " bearing" : " non-bearing"}${r.doubled ? " doubled" : ""} stud = ${r.usedPct}% of its width, max ${r.maxSize} in${r.fix ? `; ${r.fix}` : ""}`);
  l.push("  Limits are the common residential-code ones, typed in `limits`; the code edition and local amendments are yours to check. A hole and a notch at one section of a stud are never allowed.");
  return l;
}
