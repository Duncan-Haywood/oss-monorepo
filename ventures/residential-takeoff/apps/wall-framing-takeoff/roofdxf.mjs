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
 * @returns {{ ok: boolean, errors: string[], notes: string[], eave?: Pt[], layers?: string[], others?: number, scale?: number }}
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
  return { ok: true, errors: [], notes, eave, layers, others: read.length - 1, scale };
}

/**
 * The overhang between an eave line and the wall outline under it: for every eave
 * side, its distance out from the nearest parallel wall side it overlaps.
 * @param {Pt[]} eave counter-clockwise @param {Pt[]} walls counter-clockwise
 * @returns {{ uniform: boolean, overhang: number | null, min: number, max: number, sides: (number | null)[] }}
 */
export function measureOverhang(eave, walls) {
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
  const found = sides.filter((v) => v !== null);
  const min = found.length ? Math.min(...found) : NaN, max = found.length ? Math.max(...found) : NaN;
  const uniform = found.length === sides.length && max - min <= 0.5;
  return { uniform, overhang: uniform ? r16((min + max) / 2) : null, min, max, sides };
}

/**
 * The roof outline (the walls) and overhang the roof model takes, from an eave line.
 * @param {Pt[]} eave counter-clockwise, inches
 * @param {{ overhang?: number, walls?: Pt[] | null }} o typed overhang (inches), and the
 *   outside of the drawing's exterior walls when it has a loop
 * @returns {{ ok: boolean, errors: string[], notes: string[], outline?: Pt[], overhang?: number, measured?: boolean }}
 */
export function outlineFromEave(eave, o) {
  const notes = [];
  const walls = o && Array.isArray(o.walls) && o.walls.length >= 3 ? o.walls : null;
  if (walls) {
    const m = measureOverhang(eave, walls);
    if (m.uniform && m.overhang !== null) {
      notes.push(`Eave overhang measured from the drawing: ${fmt(m.overhang)} beyond the exterior walls on every side; the roof uses the wall outline with that overhang.`);
      return { ok: true, errors: [], notes, outline: walls, overhang: m.overhang, measured: true };
    }
    const named = m.sides.map((v, i) => `side ${i + 1}: ${v === null ? "no wall side under it" : fmt(r16(v))}`).join(", ");
    return { ok: false, errors: [`The eave line is not one overhang beyond the exterior walls (${named}). The roof here takes one overhang all round; type the outline, or check the roof and wall layers line up.`], notes };
  }
  const d = o && Number.isFinite(o.overhang) ? /** @type {number} */ (o.overhang) : NaN;
  if (!(d >= 0 && d <= 60)) return { ok: false, errors: ["With no exterior wall loop in the drawing, the eave overhang (0 to 60 in) is needed to move the eave line in to the walls."], notes };
  const inner = d > 0 ? offsetAngledOutline(eave, -d) : eave;
  if (!inner) return { ok: false, errors: [`Moved in by the ${fmt(d)} overhang, a side of the eave line turns round or the outline crosses itself; the overhang is too deep for this outline.`], notes };
  const outline = inner.map((p) => ({ x: r16(p.x), y: r16(p.y) }));
  notes.push(`No exterior wall loop to measure against: the eave line moved in by the ${fmt(d)} overhang you typed is the wall outline. Change the overhang and read the drawing again to move it.`);
  return { ok: true, errors: [], notes, outline, overhang: d, measured: false };
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
/** @param {number} v inches */
function fmt(v) { return `${Math.round(v * 100) / 100} in`; }
