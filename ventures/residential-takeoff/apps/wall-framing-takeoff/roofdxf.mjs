// The roof's outline read from a roof plan in a DXF: the eave (drip, fascia) line
// drawn on a roof layer, instead of the exterior wall loop pushed out by half a wall.
//
// A roof plan is usually the eave line plus the ridges, hips and valleys inside it,
// often on the same layer. So the eave line is read as the OUTER boundary of
// everything on the roof layer: lines and polylines are snapped end to end, split
// where they cross or one ends on another, dangling ends are trimmed, and the
// boundary is walked round the outside, so lines inside it (ridges, hips, valleys,
// a dashed wall line under the eave) do not matter. A closed polyline is the
// common case and needs none of this; loose lines work the same way.
//
// The roof model (roofoutline.mjs) takes the outline of the walls and one eave
// overhang. The eave line is the walls moved out by the overhang, so:
//  - when the drawing also has the exterior wall loop, the overhang is MEASURED:
//    each eave side's distance out from the parallel wall side. One overhang all
//    round (within 1/2 in) is used with the wall outline; anything else is reported
//    side by side and not guessed.
//  - with no wall loop, the eave line is moved in by the overhang the user typed.
//
// Gable ends (2026-11-27). A ridge that runs into the eave line square to a side, away
// from its corners, ends at a gable: that side is a rake, not an eave. Hips and valleys
// end at corners, so they never qualify. A ridge's far end must meet another roof line
// (a hip, a valley, another ridge or the far rake), so a loose slope arrow drawn up to
// the eave is not read as one. The rake overhang is measured (or typed) apart from the
// eave overhang, and the roof is framed as a gable roof whose gable ends are where the
// drawing put them, or as a hip roof when ridges are drawn and none ends on the eave line.
// With no lines inside the eave line, nothing about the shape is read.
//
// Geometry only, nothing structural; the same caveats as roofoutline.mjs.

import { parseDxf, UNIT_IN, UNIT_NAME } from "./dxf.mjs";
import { readAngledOutline, offsetAngledOutline } from "./roofoutline.mjs";

/** @typedef {{ x: number, y: number }} Pt */

const NAMED = { in: 1, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54 };
const MAX_SEGS = 5000;

/**
 * Read the eave line from a DXF's roof layer.
 * @param {string} text ASCII DXF
 * @param {{ units?: "in"|"ft"|"mm"|"cm"|"m", roofLayer?: RegExp, wallLayer?: RegExp, snap?: number }} [opt]
 * @returns {{ ok: boolean, errors: string[], notes: string[], eave?: Pt[], layers?: string[], others?: number, scale?: number, ridgeEnds?: { side: number, at: Pt }[], inner?: number }}
 */
export function eaveFromDxf(text, opt) {
  if (opt === null || typeof opt !== "object" || Array.isArray(opt)) opt = {};
  const roofLayer = opt.roofLayer ?? /roof|eave|fascia|drip/i, wallLayer = opt.wallLayer ?? /wall/i;
  const snap = Number.isFinite(opt.snap) && /** @type {number} */ (opt.snap) > 0 ? /** @type {number} */ (opt.snap) : 1;
  const notes = [];
  if (typeof text !== "string") return { ok: false, errors: ["The DXF must be text (an ASCII DXF file's contents)."], notes };
  const parsed = parseDxf(text);
  if (parsed.binary) return { ok: false, errors: ["This is a binary DXF; save it as ASCII DXF (R12 to 2018) and try again."], notes };
  let scale;
  if (opt.units) scale = Object.hasOwn(NAMED, opt.units) ? NAMED[opt.units] : undefined;
  else if (UNIT_IN[parsed.insunits]) scale = UNIT_IN[parsed.insunits];
  else scale = 1;
  if (!scale) return { ok: false, errors: [`Unknown units "${opt.units}" (in, ft, mm, cm, m).`], notes };
  const segs = parsed.segs
    .filter((s) => roofLayer.test(s.layer) && !wallLayer.test(s.layer))
    .map((s) => ({ layer: s.layer, a: { x: s.a.x * scale, y: s.a.y * scale }, b: { x: s.b.x * scale, y: s.b.y * scale } }));
  if (!segs.length) return { ok: false, errors: [`No lines on a roof layer (a layer matching ${roofLayer} and not ${wallLayer}).`], notes };
  if (segs.length > MAX_SEGS) return { ok: false, errors: [`More than ${MAX_SEGS} lines on the roof layer; put the eave line on a layer of its own and pass it as the roof layer.`], notes };
  const layers = [...new Set(segs.map((s) => s.layer))];
  const loops = outerLoops(segs, snap);
  const read = loops.map((pts) => readAngledOutline(pts.map((p) => [p.x, p.y]))).filter((r) => r.ok);
  if (!read.length) return { ok: false, errors: [`The lines on the roof layer${layers.length === 1 ? "" : "s"} ${layers.join(", ")} do not close into an outline (ends more than ${snap} in apart, or a self-crossing outline).`], notes, layers };
  read.sort((p, q) => area(q.points) - area(p.points));
  const eave = read[0].points.map((p) => ({ x: r16(p.x), y: r16(p.y) }));
  notes.push(`Eave line read from the roof layer${layers.length === 1 ? "" : "s"} ${layers.join(", ")}: ${eave.length} corners, ${(area(eave) / 144).toFixed(1)} sq ft inside it${parsed.insunits && UNIT_IN[parsed.insunits] && !opt.units ? ` (drawing units ${UNIT_NAME[parsed.insunits]})` : ""}. Lines inside it (ridges, hips, valleys) are not used; the roof lines are worked out from the outline.`);
  if (read.length > 1) notes.push(`${read.length - 1} other closed outline${read.length === 2 ? "" : "s"} on the roof layer (a porch or garage roof drawn apart) ${read.length === 2 ? "was" : "were"} not used: only the largest is the roof here.`);
  const g = gableEnds(eave, segs, snap);
  if (g.ends.length) {
    const sides = [...new Set(g.ends.map((e) => e.side))];
    notes.push(`Gable end${sides.length === 1 ? "" : "s"} read from the roof layer: a ridge runs square into eave side${sides.length === 1 ? "" : "s"} ${sides.map((i) => i + 1).join(", ")} (counted from the corner at ${fmtPt(eave[0])}, counter-clockwise), so ${sides.length === 1 ? "that side is a rake" : "those sides are rakes"}, not eaves.`);
  } else if (g.inner) notes.push("No ridge on the roof layer ends on the eave line, so every side is an eave: a hip roof.");
  else notes.push("Only the eave line is drawn on the roof layer (no ridges, hips or valleys inside it), so the roof's shape is not read from the drawing.");
  return { ok: true, errors: [], notes, eave, layers, others: read.length - 1, scale, ridgeEnds: g.ends, inner: g.inner };
}

/**
 * Ridge lines that end on the eave line: each one runs square into a side (ending on it or
 * drawn on past it), meets it more than 6 in (and the snap) from its corners, is at least 12 in long, points inside, and its
 * far end meets another line on the roof layer. Also counts the lines inside the eave line.
 * @param {Pt[]} eave counter-clockwise @param {{ a: Pt, b: Pt }[]} segs @param {number} snap
 * @returns {{ ends: { side: number, at: Pt }[], inner: number }}
 */
export function gableEnds(eave, segs, snap) {
  const n = eave.length, clear = Math.max(6, snap);
  const sides = eave.map((a, i) => {
    const b = eave[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y);
    return { a, L, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L };
  });
  /** where p falls on side s: along (t) and off (signed, + inside for a CCW outline) */
  const on = (/** @type {Pt} */ p, /** @type {typeof sides[0]} */ s) => ({ t: (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy, off: (p.y - s.a.y) * s.ux - (p.x - s.a.x) * s.uy });
  const onBoundary = (/** @type {{ a: Pt, b: Pt }} */ g) => sides.some((s) => [g.a, g.b].every((p) => { const q = on(p, s); return Math.abs(q.off) <= snap && q.t >= -snap && q.t <= s.L + snap; }));
  const inner = segs.filter((g) => Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) > snap && !onBoundary(g));
  const near = (/** @type {Pt} */ p, /** @type {{ a: Pt, b: Pt }} */ g) => {
    const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - g.a.x) * dx + (p.y - g.a.y) * dy) / L2)) : 0;
    return Math.hypot(p.x - g.a.x - t * dx, p.y - g.a.y - t * dy) <= snap;
  };
  /** points of g where h ends on it, it ends on h, or the two cross @param {{ a: Pt, b: Pt }} g @param {{ a: Pt, b: Pt }} h @returns {Pt[]} */
  const touches = (g, h) => {
    const out = [...[h.a, h.b].filter((p) => near(p, g)), ...[g.a, g.b].filter((p) => near(p, h))];
    const rx = g.b.x - g.a.x, ry = g.b.y - g.a.y, sx = h.b.x - h.a.x, sy = h.b.y - h.a.y, den = rx * sy - ry * sx;
    if (Math.abs(den) > 1e-9) {
      const u = ((h.a.x - g.a.x) * sy - (h.a.y - g.a.y) * sx) / den, v = ((h.a.x - g.a.x) * ry - (h.a.y - g.a.y) * rx) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) out.push({ x: g.a.x + u * rx, y: g.a.y + u * ry });
    }
    return out;
  };
  /** @type {{ side: number, at: Pt }[]} */
  const ends = [];
  for (const g of inner) {
    const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
    sides.forEach((s, i) => {
      if (Math.abs(((g.b.x - g.a.x) * s.ux + (g.b.y - g.a.y) * s.uy) / len) > 0.02) return; // square to the side
      const qa = on(g.a, s), qb = on(g.b, s);
      // the end on the side, or where the line crosses it (a ridge drawn on past the rake), and the far end inside
      let t, F;
      if (Math.abs(qa.off) <= snap && qb.off > snap) { t = qa.t; F = g.b; }
      else if (Math.abs(qb.off) <= snap && qa.off > snap) { t = qb.t; F = g.a; }
      else if (qa.off < -snap && qb.off > snap) { t = qa.t + (qb.t - qa.t) * -qa.off / (qb.off - qa.off); F = g.b; }
      else if (qb.off < -snap && qa.off > snap) { t = qb.t + (qa.t - qb.t) * -qb.off / (qa.off - qb.off); F = g.a; }
      else return;
      if (t < clear || t > s.L - clear || on(F, s).off < 12) return;
      const at = { x: r16(s.a.x + t * s.ux), y: r16(s.a.y + t * s.uy) };
      // further in, the line meets another roof line (a hip, valley, ridge, or the far side of the eave line)
      if (!segs.some((h) => h !== g && touches(g, h).some((p) => Math.hypot(p.x - at.x, p.y - at.y) >= 12))) return;
      if (!ends.some((e) => e.side === i && Math.hypot(e.at.x - at.x, e.at.y - at.y) <= snap)) ends.push({ side: i, at });
    });
  }
  ends.sort((p, q) => p.side - q.side);
  return { ends, inner: inner.length };
}

/**
 * The overhang between an eave line and the wall outline under it: for every eave
 * side, its distance out from the nearest parallel wall side it overlaps.
 * @param {Pt[]} eave counter-clockwise @param {Pt[]} walls counter-clockwise
 * @param {boolean[]} [rake] sides that are rakes (gable ends): measured as a second overhang
 * @returns {{ uniform: boolean, overhang: number | null, min: number, max: number, sides: (number | null)[], rake: { uniform: boolean, overhang: number | null, min: number, max: number } | null }}
 */
export function measureOverhang(eave, walls, rake) {
  const sides = eave.map((a, i) => {
    const b = eave[(i + 1) % eave.length], L = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = uy, ny = -ux; // outward normal of a CCW side
    let best = null;
    for (let k = 0; k < walls.length; k++) {
      const c = walls[k], d = walls[(k + 1) % walls.length], M = Math.hypot(d.x - c.x, d.y - c.y);
      if (M < 1e-9) continue;
      if (((d.x - c.x) * ux + (d.y - c.y) * uy) / M < 0.9999) continue; // parallel, same direction
      const dist = (a.x - c.x) * nx + (a.y - c.y) * ny; // eave side out from the wall side
      if (dist < -1e-6) continue;
      // the two sides overlap along their direction
      const t0 = (c.x - a.x) * ux + (c.y - a.y) * uy, t1 = (d.x - a.x) * ux + (d.y - a.y) * uy;
      if (Math.min(t0, t1) >= L - 1e-6 || Math.max(t0, t1) <= 1e-6) continue;
      if (best === null || dist < best) best = dist;
    }
    return best;
  });
  /** @param {boolean} want */
  const group = (want) => {
    const all = sides.filter((_, i) => !!(rake && rake[i]) === want), found = all.filter((v) => v !== null);
    const min = found.length ? Math.min(...found) : NaN, max = found.length ? Math.max(...found) : NaN;
    const uniform = found.length > 0 && found.length === all.length && max - min <= 0.5;
    return { uniform, overhang: uniform ? r16((min + max) / 2) : null, min, max };
  };
  const eaves = group(false), rakes = rake && rake.some(Boolean) ? group(true) : null;
  return { ...eaves, sides, rake: rakes };
}

/**
 * The roof outline (the walls) and overhang the roof model takes, from an eave line.
 * @param {Pt[]} eave counter-clockwise, inches
 * @param {{ overhang?: number, gableOverhang?: number, walls?: Pt[] | null, ridgeEnds?: { side: number, at: Pt }[] | null, inner?: number }} o typed overhangs
 *   (inches; the rake's defaults to the eave's), the outside of the drawing's exterior walls when it has a loop, and
 *   the gable ends eaveFromDxf read (with `inner`, how many lines it found inside the eave line)
 * @returns {{ ok: boolean, errors: string[], notes: string[], outline?: Pt[], overhang?: number, gableOverhang?: number, measured?: boolean, shape?: "gable" | "hip", gableEnds?: Pt[] }}
 */
export function outlineFromEave(eave, o) {
  const notes = [];
  const walls = o && Array.isArray(o.walls) && o.walls.length >= 3 ? o.walls : null;
  const ends = o && Array.isArray(o.ridgeEnds) ? o.ridgeEnds.filter((e) => e && Number.isInteger(e.side) && e.side >= 0 && e.side < eave.length) : [];
  const rake = eave.map((_, i) => ends.some((e) => e.side === i));
  const gabled = ends.length > 0;
  // the shape read from the roof layer: gable when a ridge ends on the eave line, hip when lines are drawn inside it and none does
  const shapeOf = () => (gabled ? { shape: /** @type {const} */ ("gable") } : o && Number(o.inner) > 0 ? { shape: /** @type {const} */ ("hip") } : {});
  /** each ridge end moved in square to its side by that side's overhang: where the gable wall's ridge line is @param {(i: number) => number} dist */
  const inward = (dist) => ends.map((e) => {
    const a = eave[e.side], b = eave[(e.side + 1) % eave.length], L = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, d = dist(e.side);
    return { x: r16(e.at.x + nx * d), y: r16(e.at.y + ny * d) };
  });
  if (walls) {
    const m = measureOverhang(eave, walls, rake);
    if (m.uniform && m.overhang !== null && (!gabled || (m.rake && m.rake.uniform && m.rake.overhang !== null))) {
      const g = gabled && m.rake ? /** @type {number} */ (m.rake.overhang) : undefined;
      if (g !== undefined) notes.push(`Overhangs measured from the drawing: ${fmt(m.overhang)} at the eaves and ${fmt(g)} at the rakes (gable ends), beyond the exterior walls; the roof uses the wall outline with those overhangs.`);
      else notes.push(`Eave overhang measured from the drawing: ${fmt(m.overhang)} beyond the exterior walls on every side; the roof uses the wall outline with that overhang.`);
      return { ok: true, errors: [], notes, outline: walls, overhang: m.overhang, ...(g !== undefined ? { gableOverhang: g, gableEnds: inward((i) => /** @type {number} */ (m.sides[i])) } : {}), measured: true, ...shapeOf() };
    }
    const named = m.sides.map((v, i) => `side ${i + 1}${rake[i] ? " (rake)" : ""}: ${v === null ? "no wall side under it" : fmt(r16(v))}`).join(", ");
    return { ok: false, errors: [`The eave line is not one overhang beyond the exterior walls${gabled ? " at the eaves and one at the rakes" : ""} (${named}). The roof here takes one eave overhang all round${gabled ? " and one rake overhang" : ""}; type the outline, or check the roof and wall layers line up.`], notes };
  }
  const d = o && Number.isFinite(o.overhang) ? /** @type {number} */ (o.overhang) : NaN;
  if (!(d >= 0 && d <= 60)) return { ok: false, errors: ["With no exterior wall loop in the drawing, the eave overhang (0 to 60 in) is needed to move the eave line in to the walls."], notes };
  const gr = o && Number.isFinite(o.gableOverhang) ? /** @type {number} */ (o.gableOverhang) : d;
  if (gabled && !(gr >= 0 && gr <= 48)) return { ok: false, errors: ["The rake (gable) overhang is 0 to 48 in."], notes };
  const dist = (/** @type {number} */ i) => (rake[i] ? gr : d);
  const inner = !gabled || gr === d ? (d > 0 ? offsetAngledOutline(eave, -d) : eave) : offsetSides(eave, eave.map((_, i) => dist(i)));
  if (!inner) return { ok: false, errors: [`Moved in by the ${fmt(d)} overhang${gabled && gr !== d ? ` (${fmt(gr)} at the rakes)` : ""}, a side of the eave line turns round or the outline crosses itself; the overhang is too deep for this outline.`], notes };
  const outline = inner.map((p) => ({ x: r16(p.x), y: r16(p.y) }));
  notes.push(`No exterior wall loop to measure against: the eave line moved in by the ${fmt(d)} overhang you typed${gabled ? ` (${fmt(gr)} at the rakes${o && Number.isFinite(o.gableOverhang) ? "" : ", the eave's, since no rake overhang was typed"})` : ""} is the wall outline. Change the overhang and read the drawing again to move it.`);
  return { ok: true, errors: [], notes, outline, overhang: d, ...(gabled ? { gableOverhang: gr, gableEnds: inward(dist) } : {}), measured: false, ...shapeOf() };
}

/**
 * A closed outline with each side moved in (square to itself) by its own distance; the
 * corners are where the moved sides meet. Null when a side turns round or the result
 * crosses itself.
 * @param {Pt[]} p counter-clockwise, no two neighbouring sides parallel @param {number[]} ds inches, per side (p[i] to p[i+1])
 * @returns {Pt[] | null}
 */
export function offsetSides(p, ds) {
  const n = p.length;
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    return { x: a.x - uy * ds[i], y: a.y + ux * ds[i], ux, uy }; // moved left of the side: inside for CCW
  });
  /** @type {Pt[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i + n - 1) % n], B = lines[i], den = A.ux * B.uy - A.uy * B.ux;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((B.x - A.x) * B.uy - (B.y - A.y) * B.ux) / den;
    out.push({ x: A.x + t * A.ux, y: A.y + t * A.uy });
  }
  for (let i = 0; i < n; i++) {
    const a = out[i], b = out[(i + 1) % n];
    if ((b.x - a.x) * lines[i].ux + (b.y - a.y) * lines[i].uy <= 1e-6) return null; // turned round
  }
  const ok = readAngledOutline(out.map((q) => [q.x, q.y]));
  return ok.ok && ok.points.length === n ? out : null;
}

/**
 * Outer boundaries of the segments' connected pieces, counter-clockwise.
 * @param {{ a: Pt, b: Pt }[]} raw @param {number} snap
 * @returns {Pt[][]}
 */
export function outerLoops(raw, snap) {
  // 1. snap endpoints into shared vertices
  /** @type {Pt[]} */
  const verts = [];
  const vid = (/** @type {Pt} */ p) => {
    for (let k = 0; k < verts.length; k++) if (Math.hypot(verts[k].x - p.x, verts[k].y - p.y) <= snap) return k;
    verts.push({ x: p.x, y: p.y });
    return verts.length - 1;
  };
  /** @type {[number, number][]} */
  let edges = [];
  for (const s of raw) { const i = vid(s.a), j = vid(s.b); if (i !== j) edges.push([i, j]); }
  // 2. split at crossings and where an end lies on another segment
  for (let pass = 0, changed = true; changed && pass < 4; pass++) {
    changed = false;
    /** @type {Map<number, number[]>} */
    const cuts = new Map();
    const add = (/** @type {number} */ e, /** @type {number} */ v) => { const l = cuts.get(e) ?? []; if (!l.includes(v)) l.push(v); cuts.set(e, l); };
    for (let e = 0; e < edges.length; e++) for (let f = e + 1; f < edges.length; f++) {
      const [a, b] = edges[e], [c, d] = edges[f];
      if (a === c || a === d || b === c || b === d) continue;
      const P = verts[a], Q = verts[b], R = verts[c], S = verts[d];
      const rx = Q.x - P.x, ry = Q.y - P.y, sx = S.x - R.x, sy = S.y - R.y, den = rx * sy - ry * sx;
      const Lr = Math.hypot(rx, ry), Ls = Math.hypot(sx, sy);
      // an end of one on the other (within snap): a T
      for (const [v, e1, A, B, L] of [[c, e, P, Q, Lr], [d, e, P, Q, Lr], [a, f, R, S, Ls], [b, f, R, S, Ls]]) {
        const V = verts[/** @type {number} */ (v)], Ap = /** @type {Pt} */ (A), Bp = /** @type {Pt} */ (B), Ln = /** @type {number} */ (L);
        const t = ((V.x - Ap.x) * (Bp.x - Ap.x) + (V.y - Ap.y) * (Bp.y - Ap.y)) / (Ln * Ln);
        const off = Math.abs((V.x - Ap.x) * (Bp.y - Ap.y) - (V.y - Ap.y) * (Bp.x - Ap.x)) / Ln;
        if (off <= snap && t * Ln > snap && (1 - t) * Ln > snap) add(/** @type {number} */ (e1), /** @type {number} */ (v));
      }
      if (Math.abs(den) < 1e-9) continue;
      const t = ((R.x - P.x) * sy - (R.y - P.y) * sx) / den, u = ((R.x - P.x) * ry - (R.y - P.y) * rx) / den;
      if (t * Lr > snap && (1 - t) * Lr > snap && u * Ls > snap && (1 - u) * Ls > snap) {
        const v = vid({ x: P.x + t * rx, y: P.y + t * ry });
        add(e, v); add(f, v);
      }
    }
    if (!cuts.size) break;
    changed = true;
    /** @type {[number, number][]} */
    const next = [];
    edges.forEach(([a, b], e) => {
      const l = cuts.get(e);
      if (!l) { next.push([a, b]); return; }
      const A = verts[a], B = verts[b], dx = B.x - A.x, dy = B.y - A.y;
      const chain = [a, ...l.sort((p, q) => ((verts[p].x - A.x) * dx + (verts[p].y - A.y) * dy) - ((verts[q].x - A.x) * dx + (verts[q].y - A.y) * dy)), b];
      for (let k = 0; k + 1 < chain.length; k++) if (chain[k] !== chain[k + 1]) next.push([chain[k], chain[k + 1]]);
    });
    edges = next;
  }
  // 3. adjacency without duplicate edges; trim dangling ends
  /** @type {Set<number>[]} */
  const adj = verts.map(() => new Set());
  for (const [a, b] of edges) { adj[a].add(b); adj[b].add(a); }
  for (let changed = true; changed;) {
    changed = false;
    for (let v = 0; v < adj.length; v++) if (adj[v].size === 1) { const [w] = adj[v]; adj[w].delete(v); adj[v].clear(); changed = true; }
  }
  // 4. each connected piece's outer boundary, walked counter-clockwise from its leftmost-lowest vertex
  const seen = new Set();
  /** @type {Pt[][]} */
  const loops = [];
  for (let s = 0; s < verts.length; s++) {
    if (seen.has(s) || !adj[s].size) continue;
    const comp = [];
    for (const st = [s]; st.length;) { const v = /** @type {number} */ (st.pop()); if (seen.has(v)) continue; seen.add(v); comp.push(v); for (const w of adj[v]) st.push(w); }
    const v0 = comp.reduce((p, q) => (verts[q].x < verts[p].x - 1e-9 || (Math.abs(verts[q].x - verts[p].x) <= 1e-9 && verts[q].y < verts[p].y) ? q : p));
    let prev = -1, cur = v0, hx = 0, hy = -1; // arrive heading down
    const loop = [];
    for (let step = 0; step <= 2 * edges.length + 2; step++) {
      loop.push(cur);
      const hin = Math.atan2(hy, hx);
      let pick = -1, bestTurn = Infinity;
      for (const w of adj[cur]) {
        let turn = Math.atan2(verts[w].y - verts[cur].y, verts[w].x - verts[cur].x) - hin;
        while (turn <= -Math.PI) turn += 2 * Math.PI;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        if (w === prev) turn = Math.PI + 1; // back the way we came only if nothing else
        if (turn < bestTurn) { bestTurn = turn; pick = w; }
      }
      if (pick < 0) break;
      hx = verts[pick].x - verts[cur].x; hy = verts[pick].y - verts[cur].y;
      prev = cur; cur = pick;
      if (cur === v0) break;
    }
    if (cur === v0 && loop.length >= 3) loops.push(loop.map((v) => verts[v]));
  }
  return loops;
}

/** @param {Pt[]} p */
function area(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s / 2);
}
/** @param {number} v */
function r16(v) { return Math.round(v * 16) / 16; }
/** @param {Pt} p */
function fmtPt(p) { return `(${fmt(p.x)}, ${fmt(p.y)})`; }
/** @param {number} v inches */
function fmt(v) { return `${Math.round(v * 100) / 100} in`; }
