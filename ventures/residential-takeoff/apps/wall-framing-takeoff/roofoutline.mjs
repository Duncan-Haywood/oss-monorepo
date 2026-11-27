// @ts-check
// A roof from a plan's outline instead of typed width, length and wings.
//
// The outline is the outside of the exterior walls as a closed list of corners
// (inches, or length strings such as "34'"), every side square to the axes. Two
// results come from it:
//
//  1. For ANY such outline, with every plane at one pitch and every eave level
//     (an all-hip roof): the sloped area is the plan area inside the eave line
//     times the slope factor sqrt(1 + (pitch/12)^2), and the eave length is the
//     eave line's perimeter. Both are exact for that roof shape, whatever the
//     ridges, hips and valleys do. `outlineRoof` returns these as squares and feet,
//     and, from hiproof.mjs, that roof's ridges, hips and valleys themselves: every
//     line's ends and heights, and their lengths along the slope (2026-11-26).
//     Outlines with sides at other angles (a bay, a 45-degree corner, a wing set at
//     an angle) get the same results from skeleton.mjs (2026-11-27): the area and
//     eave length are exact the same way, and the hips and valleys bisect the eave
//     line's corners. Only the square-cornered sides are framed or laid out in
//     sheathing courses; an angled outline gets squares and roof lines only.
//  2. Where the outline is a rectangle (gable or hip), or one rectangle with up to
//     two narrower rectangles attached to its long sides (an L, T, U or cross
//     plan, framed as a gable main roof with cross wings), `roofFromOutline`
//     builds the `roof` object `layoutRoof` already frames (roof.mjs), so the
//     rafters, ridge, hips, valleys, sheathing and roofing come from that tested
//     model. Any other outline gets result 1 only, and says so.
//
// Nothing here decides a pitch, a bearing or a structure; the pitch is typed.
import { parseLength } from "./engine.mjs";
import { slopeFactor } from "./roof.mjs";
import { hipRoofLines } from "./hiproof.mjs";
import { skeletonRoofLines } from "./skeleton.mjs";

const TOL = 0.5; // in: a side whose ends differ by this much across the axis is square

/** @typedef {{ x: number, y: number }} Pt */

/** @param {unknown} v */
const num = (v) => (typeof v === "string" ? parseLength(v) : typeof v === "number" ? v : NaN);

/**
 * Read and check an outline: closed, every side along x or y, no side crossing another.
 * Accepts [[x, y], ...] or [{ x, y }, ...]; a repeated first point at the end is dropped,
 * and corners in the middle of a straight side are removed. Turned counter-clockwise.
 * @param {unknown} raw
 * @returns {{ ok: true, points: Pt[], errors: string[] } | { ok: false, points: Pt[], errors: string[] }}
 */
export function readOutline(raw) {
  if (!Array.isArray(raw)) return { ok: false, points: [], errors: ["The roof outline is a list of corners, [[x, y], ...] in inches or as lengths like \"34'\"."] };
  if (raw.length > 200) return { ok: false, points: [], errors: ["The roof outline has more than 200 corners."] };
  /** @type {Pt[]} */
  let pts = [];
  for (const [i, p] of raw.entries()) {
    const x = num(Array.isArray(p) ? p[0] : p && typeof p === "object" ? /** @type {any} */ (p).x : undefined);
    const y = num(Array.isArray(p) ? p[1] : p && typeof p === "object" ? /** @type {any} */ (p).y : undefined);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5) return { ok: false, points: [], errors: [`Outline corner ${i + 1} is not a pair of lengths within 8,000 ft.`] };
    pts.push({ x, y });
  }
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= TOL) pts.pop();
  // square each side: snap the near-equal coordinate to the earlier corner's
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (dx <= TOL && dy > TOL) b.x = i + 1 === pts.length ? b.x : a.x;
    else if (dy <= TOL && dx > TOL) b.y = i + 1 === pts.length ? b.y : a.y;
  }
  // drop repeated corners and corners partway along a straight side
  for (let changed = true; changed && pts.length >= 3;) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length], c = pts[i], n = pts[(i + 1) % pts.length];
      const same = Math.hypot(c.x - n.x, c.y - n.y) <= TOL;
      const straight = (Math.abs(p.x - c.x) <= TOL && Math.abs(c.x - n.x) <= TOL) || (Math.abs(p.y - c.y) <= TOL && Math.abs(c.y - n.y) <= TOL);
      if (same || straight) { pts.splice(i, 1); changed = true; break; }
    }
  }
  if (pts.length < 4) return { ok: false, points: [], errors: ["The roof outline needs at least 4 corners."] };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (Math.abs(a.x - b.x) > TOL && Math.abs(a.y - b.y) > TOL) return { ok: false, points: [], errors: [`Outline side ${i + 1} is not square to the axes (corner ${i + 1} to ${((i + 1) % pts.length) + 1}); only square-cornered outlines are read.`] };
  }
  // exact closing: the last side shares x or y with the first corner
  const last = pts[pts.length - 1], first = pts[0];
  if (Math.abs(last.x - first.x) <= TOL) last.x = first.x; else last.y = first.y;
  if (crossing(pts)) return { ok: false, points: [], errors: ["The roof outline crosses itself."] };
  if (signedArea(pts) < 0) pts.reverse();
  if (pts.length % 2) return { ok: false, points: [], errors: ["A square-cornered outline has an even number of corners."] };
  return { ok: true, points: pts, errors: [] };
}

/** @param {Pt[]} p */
function signedArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

/** Any two non-adjacent sides touching. @param {Pt[]} p */
function crossing(p) {
  const n = p.length;
  const seg = (i) => { const a = p[i], b = p[(i + 1) % n]; return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) }; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    const s = seg(i), t = seg(j);
    if (s.x0 <= t.x1 + 1e-9 && t.x0 <= s.x1 + 1e-9 && s.y0 <= t.y1 + 1e-9 && t.y0 <= s.y1 + 1e-9) return true;
  }
  return false;
}

/** Plan area (sq in) and perimeter (in) of a read outline. @param {Pt[]} p */
export function areaPerimeter(p) {
  let per = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; per += Math.abs(b.x - a.x) + Math.abs(b.y - a.y); }
  return { area: Math.abs(signedArea(p)), perimeter: per };
}

/**
 * Move every side of a counter-clockwise square-cornered outline out by `d`.
 * Each corner moves by d along both its sides' outward normals. For an outline with
 * c convex and r reflex corners (c - r = 4) the new area is area + perimeter x d + 4 d^2
 * until an inside corner's offset meets another side; that is checked, not assumed.
 * @param {Pt[]} p @param {number} d
 */
export function offsetOutline(p, d) {
  const n = p.length;
  const normal = (i) => { const a = p[i], b = p[(i + 1) % n], L = Math.abs(b.x - a.x) + Math.abs(b.y - a.y); return { x: (b.y - a.y) / L, y: -(b.x - a.x) / L }; };
  const out = p.map((c, i) => { const m = normal((i + n - 1) % n), k = normal(i); return { x: c.x + d * (m.x + k.x), y: c.y + d * (m.y + k.y) }; });
  const want = areaPerimeter(p).area + areaPerimeter(p).perimeter * d + 4 * d * d;
  if (crossing(out) || Math.abs(areaPerimeter(out).area - want) > 1e-6 * Math.max(1, want)) return null;
  return out;
}

/**
 * Read an outline whose sides may run at any angle: closed, at least 3 corners, no side
 * crossing another. Sides within TOL of square are squared as readOutline does; a corner
 * within TOL of the line through its neighbours is dropped. Turned counter-clockwise.
 * `angled` says whether any side is not square to the axes.
 * @param {unknown} raw
 * @returns {{ ok: true, points: Pt[], angled: boolean, errors: string[] } | { ok: false, points: Pt[], errors: string[] }}
 */
export function readAngledOutline(raw) {
  if (!Array.isArray(raw)) return { ok: false, points: [], errors: ["The roof outline is a list of corners, [[x, y], ...] in inches or as lengths like \"34'\"."] };
  if (raw.length > 200) return { ok: false, points: [], errors: ["The roof outline has more than 200 corners."] };
  /** @type {Pt[]} */
  const pts = [];
  for (const [i, p] of raw.entries()) {
    const x = num(Array.isArray(p) ? p[0] : p && typeof p === "object" ? /** @type {any} */ (p).x : undefined);
    const y = num(Array.isArray(p) ? p[1] : p && typeof p === "object" ? /** @type {any} */ (p).y : undefined);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5) return { ok: false, points: [], errors: [`Outline corner ${i + 1} is not a pair of lengths within 8,000 ft.`] };
    pts.push({ x, y });
  }
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= TOL) pts.pop();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (dx <= TOL && dy > TOL) b.x = a.x; else if (dy <= TOL && dx > TOL) b.y = a.y;
  }
  if (pts.length > 2) { // the closing side squared onto the first corner
    const a = pts[pts.length - 1], b = pts[0], dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (dx <= TOL && dy > TOL) a.x = b.x; else if (dy <= TOL && dx > TOL) a.y = b.y;
  }
  for (let changed = true; changed && pts.length >= 3;) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length], c = pts[i], n = pts[(i + 1) % pts.length];
      const L = Math.hypot(n.x - p.x, n.y - p.y);
      const off = L > 0 ? Math.abs((c.x - p.x) * (n.y - p.y) - (c.y - p.y) * (n.x - p.x)) / L : 0;
      const between = (c.x - p.x) * (n.x - p.x) + (c.y - p.y) * (n.y - p.y) > 0 && (c.x - n.x) * (p.x - n.x) + (c.y - n.y) * (p.y - n.y) > 0;
      if (Math.hypot(c.x - n.x, c.y - n.y) <= TOL || (off <= TOL && between)) { pts.splice(i, 1); changed = true; break; }
    }
  }
  if (pts.length < 3) return { ok: false, points: [], errors: ["The roof outline needs at least 3 corners."] };
  if (crossingAny(pts)) return { ok: false, points: [], errors: ["The roof outline crosses itself."] };
  if (signedArea(pts) < 0) pts.reverse();
  const angled = pts.some((a, i) => { const b = pts[(i + 1) % pts.length]; return a.x !== b.x && a.y !== b.y; });
  return { ok: true, points: pts, angled, errors: [] };
}

/** Any two non-adjacent sides touching, for sides at any angle. @param {Pt[]} p */
function crossingAny(p) {
  const n = p.length;
  const orient = (/** @type {Pt} */ a, /** @type {Pt} */ b, /** @type {Pt} */ c) => { const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return Math.abs(v) < 1e-9 ? 0 : Math.sign(v); };
  const onSeg = (/** @type {Pt} */ a, /** @type {Pt} */ b, /** @type {Pt} */ c) => Math.min(a.x, b.x) - 1e-9 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-9;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4 && o1 * o2 <= 0 && o3 * o4 <= 0 && (o1 || o2 || o3 || o4)) return true;
    if ((o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b))) return true;
  }
  return false;
}

/**
 * Move every side of a counter-clockwise outline (sides at any angle) out by `d`: each
 * corner to where its two moved sides meet. Null when a moved side turns round (it was
 * shorter than its corners' mitres) or the moved outline crosses itself.
 * @param {Pt[]} p @param {number} d
 */
export function offsetAngledOutline(p, d) {
  const n = p.length;
  const side = (/** @type {number} */ i) => { const a = p[i], b = p[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y); return { nx: (b.y - a.y) / L, ny: -(b.x - a.x) / L, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L }; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = side((i + n - 1) % n), k = side(i), det = m.nx * k.ny - m.ny * k.nx;
    if (Math.abs(det) < 1e-12) return null;
    // n_m . v = 1 and n_k . v = 1 (outward normals)
    out.push({ x: p[i].x + d * (k.ny - m.ny) / det, y: p[i].y + d * (m.nx - k.nx) / det });
  }
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n], A = out[i], B = out[(i + 1) % n];
    if ((B.x - A.x) * (b.x - a.x) + (B.y - A.y) * (b.y - a.y) <= 0) return null;
  }
  if (crossingAny(out)) return null;
  return out;
}

/** Outside (convex) and inside (reflex) corners of a counter-clockwise outline. @param {Pt[]} p */
function cornerCounts(p) {
  let convex = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0) convex++;
  }
  return { convex, reflex: p.length - convex };
}

/** Plan area (sq in) and perimeter (in) of an outline with sides at any angle. @param {Pt[]} p */
function areaPerimeterAny(p) {
  let per = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; per += Math.hypot(b.x - a.x, b.y - a.y); }
  return { area: Math.abs(signedArea(p)), perimeter: per };
}

/**
 * The all-hip roof over an outline with angled sides (skeleton.mjs). Same fields as
 * outlineRoof's square-cornered result, with `angled: true`.
 * @param {Pt[]} points from readAngledOutline @param {number} pitch @param {number} overhang
 */
function angledRoof(points, pitch, overhang) {
  const eave = offsetAngledOutline(points, overhang);
  if (!eave) return { ok: false, errors: ["At this overhang the eave line of an inside corner runs into another side, or a short side between two angled corners turns round; the outline is too tight for one eave all round."] };
  const walls = areaPerimeterAny(points), line = areaPerimeterAny(eave), k = slopeFactor(pitch);
  const roofLines = skeletonRoofLines(eave, pitch);
  if (!roofLines.ok) return { ok: false, errors: [/** @type {any} */ (roofLines).error] };
  const { convex, reflex } = cornerCounts(points);
  const ft = (/** @type {number} */ v) => v.toFixed(2);
  return {
    ok: true, errors: [], angled: true, points, eaveLine: eave, pitch, overhang,
    corners: points.length, convex, reflex,
    footprintSqFt: walls.area / 144, wallPerimeterFt: walls.perimeter / 12,
    planSqFt: line.area / 144, slopedSqFt: line.area * k / 144, squares: line.area * k / 14400, eaveFeet: line.perimeter / 12,
    ridgeFeet: roofLines.ridgeFeet, hipFeet: roofLines.hipFeet, valleyFeet: roofLines.valleyFeet,
    ridgePlanFeet: roofLines.ridgePlanIn / 12, hipPlanFeet: roofLines.hipPlanIn / 12, valleyPlanFeet: roofLines.valleyPlanIn / 12,
    ridges: roofLines.ridges, hips: roofLines.hips, valleys: roofLines.valleys,
    peakRiseIn: roofLines.peakIn, lines: roofLines.lines,
    notes: [
      `All-hip roof at ${pitch}:12 with a ${overhang} in eave all round: sloped area = plan area inside the eave line x ${k.toFixed(4)} (exact for one pitch and level eaves, whatever the ridges and hips do). The outline has angled sides, so the eave line's corners are mitred: each corner sits where its two sides, moved out ${overhang} in, meet.`,
      `Roof lines of that roof: ${roofLines.ridges} ridge${roofLines.ridges === 1 ? "" : "s"} of ${ft(roofLines.ridgeFeet)} ft in all, ${roofLines.hips} hip${roofLines.hips === 1 ? "" : "s"} of ${ft(roofLines.hipFeet)} ft and ${roofLines.valleys} valle${roofLines.valleys === 1 ? "y" : "ys"} of ${ft(roofLines.valleyFeet)} ft along the slope (${convex} hips start at the eave line's outside corners and ${reflex} valle${reflex === 1 ? "y" : "ys"} at its inside corners${roofLines.hips + roofLines.valleys > points.length ? "; the rest start higher up, where the roof's lines meet" : ""}). The highest point is ${(roofLines.peakIn / 12).toFixed(2)} ft above the eave edge, measured on the roof planes (no rafter depth, heel or fascia). Every hip and valley bisects its corner in plan (45 degrees only at square corners); every plane is at the one pitch typed.`,
      "Angled sides: the rafters and the sheathing courses are laid out for square-cornered outlines only, so this roof gets its squares, eave length and roof lines, not a lumber order for its framing or a sheet count.",
    ],
  };
}

/**
 * Exact quantities for an all-hip roof at one pitch over any square-cornered outline.
 * @param {unknown} raw outline corners @param {{ pitch: number, overhang?: number }} o
 */
export function outlineRoof(raw, o) {
  const r = readOutline(raw);
  // an outline with a side that is not square to the axes: the general roof (skeleton.mjs)
  const any = r.ok ? null : readAngledOutline(raw);
  if (!r.ok && !(any && any.ok && any.angled)) return { ok: false, errors: any && !any.ok ? any.errors : r.errors };
  if (!(typeof o?.pitch === "number" && o.pitch >= 1 && o.pitch <= 24)) return { ok: false, errors: ["Pitch is rise in 12 of run, between 1 and 24."] };
  const overhang = o.overhang ?? 12;
  if (!(typeof overhang === "number" && overhang >= 0 && overhang <= 48)) return { ok: false, errors: ["Eave overhang must be between 0 and 48 inches."] };
  if (!r.ok) return angledRoof(/** @type {Pt[]} */ (any?.points), o.pitch, overhang);
  const eave = offsetOutline(r.points, overhang);
  if (!eave) return { ok: false, errors: ["At this overhang the eave line of an inside corner runs into another side; the outline is too tight for one eave all round."] };
  const walls = areaPerimeter(r.points), line = areaPerimeter(eave), k = slopeFactor(o.pitch);
  const reflex = (r.points.length - 4) / 2;
  // a rectangle's all-hip roof in closed form: ridge = long side - short side of the eave line (plan), four hips
  // of (short side / 2) x sqrt(2 + (pitch/12)^2) each (a 45-degree line in plan rising pitch/12 per unit of run);
  // kept as a check on the general roof lines below
  /** @type {{ ridgeFeet: number, hipFeet: number } | null} */
  let rect = null;
  if (r.points.length === 4) {
    const xs = eave.map((p) => p.x), ys = eave.map((p) => p.y);
    const a = Math.max(...xs) - Math.min(...xs), b = Math.max(...ys) - Math.min(...ys), L = Math.max(a, b), W = Math.min(a, b);
    rect = { ridgeFeet: (L - W) / 12, hipFeet: 4 * (W / 2) * Math.sqrt(2 + (o.pitch / 12) ** 2) / 12 };
  }
  const roofLines = hipRoofLines(eave, o.pitch);
  if (!roofLines.ok) return { ok: false, errors: [/** @type {any} */ (roofLines).error] };
  if (rect && (Math.abs(rect.ridgeFeet - roofLines.ridgeFeet) > 1e-6 || Math.abs(rect.hipFeet - roofLines.hipFeet) > 1e-6)) return { ok: false, errors: ["The roof lines of this rectangle disagree with the closed form; please report the outline."] };
  const ft = (v) => v.toFixed(2);
  return {
    ok: true, errors: [], points: r.points, eaveLine: eave, pitch: o.pitch, overhang,
    corners: r.points.length, convex: r.points.length - reflex, reflex,
    footprintSqFt: walls.area / 144, wallPerimeterFt: walls.perimeter / 12,
    planSqFt: line.area / 144, slopedSqFt: line.area * k / 144, squares: line.area * k / 14400, eaveFeet: line.perimeter / 12,
    ridgeFeet: roofLines.ridgeFeet, hipFeet: roofLines.hipFeet, valleyFeet: roofLines.valleyFeet,
    ridgePlanFeet: roofLines.ridgePlanIn / 12, hipPlanFeet: roofLines.hipPlanIn / 12, valleyPlanFeet: roofLines.valleyPlanIn / 12,
    ridges: roofLines.ridges, hips: roofLines.hips, valleys: roofLines.valleys,
    peakRiseIn: roofLines.peakIn, lines: roofLines.lines,
    notes: [
      `All-hip roof at ${o.pitch}:12 with a ${overhang} in eave all round: sloped area = plan area inside the eave line x ${k.toFixed(4)} (exact for one pitch and level eaves, whatever the ridges and hips do).`,
      `Roof lines of that roof${rect ? " (a rectangle; the same as the closed form)" : ""}: ${roofLines.ridges} ridge${roofLines.ridges === 1 ? "" : "s"} of ${ft(roofLines.ridgeFeet)} ft in all, ${roofLines.hips} hip${roofLines.hips === 1 ? "" : "s"} of ${ft(roofLines.hipFeet)} ft and ${roofLines.valleys} valle${roofLines.valleys === 1 ? "y" : "ys"} of ${ft(roofLines.valleyFeet)} ft along the slope (${r.points.length - reflex} hips start at the eave line's outside corners and ${reflex} valle${reflex === 1 ? "y" : "ys"} at its inside corners${roofLines.hips + roofLines.valleys > r.points.length ? "; the rest start higher up, where ridges and valleys meet" : ""}). The highest point is ${(roofLines.peakIn / 12).toFixed(2)} ft above the eave edge, measured on the roof planes (no rafter depth, heel or fascia). Hips and valleys run at 45 degrees in plan; every plane is at the one pitch typed.`,
    ],
  };
}

/**
 * Split a square-cornered outline into a main rectangle that runs the full length in
 * one direction and up to two rectangles attached to its long sides.
 * @param {Pt[]} p counter-clockwise, from readOutline
 * @returns {{ axis: "x" | "y", main: { a0: number, a1: number, b0: number, b1: number }, wings: { a0: number, a1: number, b0: number, b1: number, side: "left" | "right" }[] }[]}
 */
export function decompose(p) {
  const out = [];
  for (const axis of /** @type {const} */ (["x", "y"])) {
    // a: along the ridge, b: across it
    const q = p.map((c) => (axis === "x" ? { a: c.x, b: c.y } : { a: c.y, b: c.x }));
    const as = [...new Set(q.map((c) => c.a))].sort((m, n) => m - n), bs = [...new Set(q.map((c) => c.b))].sort((m, n) => m - n);
    const inside = (a, b) => { // even-odd ray along +a
      let c = false;
      for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; if (u.a === v.a && (u.b > b) !== (v.b > b) && u.a > a) c = !c; }
      return c;
    };
    const cell = bs.slice(0, -1).map((_, j) => as.slice(0, -1).map((_, i) => inside((as[i] + as[i + 1]) / 2, (bs[j] + bs[j + 1]) / 2)));
    const full = cell.map((row) => row.every(Boolean));
    const first = full.indexOf(true), lastFull = full.lastIndexOf(true);
    if (first < 0 || full.slice(first, lastFull + 1).some((f) => !f)) continue;
    const main = { a0: as[0], a1: as[as.length - 1], b0: bs[first], b1: bs[lastFull + 1] };
    /** @type {{ a0: number, a1: number, b0: number, b1: number, side: "left" | "right" }[]} */
    const wings = [];
    let ok = true;
    for (const [rows, side] of /** @type {[number[], "left" | "right"][]} */ ([[[...Array(first).keys()], "left"], [[...Array(cell.length - lastFull - 1).keys()].map((k) => lastFull + 1 + k), "right"]])) {
      if (!rows.length) continue;
      // columns used next to the main rectangle; each run of them is one wing that must fill its whole box
      const edge = side === "left" ? first - 1 : lastFull + 1;
      const cols = cell[edge].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const runs = [];
      for (const c of cols) { const r = runs[runs.length - 1]; if (r && r[1] === c - 1) r[1] = c; else runs.push([c, c]); }
      let covered = 0;
      for (const [c0, c1] of runs) {
        // depth: rows away from the main rectangle while the whole run is filled
        let depth = 0;
        for (let k = 0; k < rows.length; k++) {
          const j = side === "left" ? first - 1 - k : lastFull + 1 + k;
          const seg = cell[j].slice(c0, c1 + 1);
          if (seg.every(Boolean)) depth++; else break;
        }
        const j0 = side === "left" ? first - depth : lastFull + 1, j1 = side === "left" ? first : lastFull + 1 + depth;
        wings.push({ a0: as[c0], a1: as[c1 + 1], b0: bs[j0], b1: bs[j1], side });
        covered += (c1 - c0 + 1) * depth;
      }
      const filled = rows.reduce((t, j) => t + cell[j].filter(Boolean).length, 0);
      if (filled !== covered) ok = false;
    }
    if (ok) out.push({ axis, main, wings });
  }
  return out;
}

/**
 * The `roof` object roof.mjs frames, from an outline: a rectangle (gable or hip), or a
 * gable main roof with up to two cross wings. Every other setting in `base` (rafter
 * size, spacing, roofing...) is kept. Returns the candidates it tried when none fits.
 * @param {unknown} raw @param {Record<string, any>} base must hold `pitch`
 * @param {(r: any) => string[]} [validate] roof checks to pick a framing that passes (validateRoof with the plan)
 */
export function roofFromOutline(raw, base, validate = () => []) {
  const r = readOutline(raw);
  if (!r.ok) {
    const any = readAngledOutline(raw);
    if (any.ok && any.angled) return { ok: false, errors: ["The outline has angled sides, which the gable and hip framing model does not take; squares, eave length and the all-hip roof lines are still given."], roof: null };
    return { ok: false, errors: r.errors, roof: null };
  }
  const tries = decompose(r.points);
  if (!tries.length) return { ok: false, errors: ["This outline is not one rectangle with at most two narrower rectangles on its long sides, so the gable and hip framing model does not take it; squares, eave length and the all-hip roof lines (ridge, hip and valley lengths) are still given, and that all-hip roof is framed on those lines (hipframe.mjs) when the stock allows."], roof: null };
  const { outline: _drop, ...rest } = base;
  /** @type {{ roof: any, errors: string[], wings: number, width: number }[]} */
  const built = [];
  for (const t of tries) {
    const width = t.main.b1 - t.main.b0, length = t.main.a1 - t.main.a0;
    if (!t.wings.length && width > length) continue; // a rectangle's ridge runs the long way; the other axis is tried too
    /** @type {any} */
    const roof = { ...rest, width, length };
    if (t.wings.length > 2) continue;
    if (t.wings.length && roof.shape === "hip") { built.push({ roof, errors: ["A hip roof is framed on a rectangle only; this outline needs cross wings, which are framed on a gable main roof (set shape to gable, or use the all-hip squares)."], wings: t.wings.length, width }); continue; }
    t.wings.forEach((w, i) => {
      const wing = { ...(i === 0 ? rest.wing : rest.wing2), width: w.a1 - w.a0, projection: w.b1 - w.b0, at: (w.a0 + w.a1) / 2 - t.main.a0, side: w.side };
      if (i === 0) roof.wing = wing; else roof.wing2 = wing;
    });
    if (t.wings.length < 2) delete roof.wing2;
    if (!t.wings.length) delete roof.wing;
    built.push({ roof, errors: validate(roof), wings: t.wings.length, width });
  }
  const good = built.filter((b) => !b.errors.length).sort((m, n) => m.wings - n.wings || n.width - m.width);
  if (good.length) return { ok: true, errors: [], roof: good[0].roof };
  return { ok: false, errors: built.length ? built[0].errors : ["No framing found for this outline."], roof: null };
}
