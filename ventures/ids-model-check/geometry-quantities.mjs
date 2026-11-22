// Quantities read from an element's own geometry, for the model fill
// (model-fill.mjs, opts.geometry) when no quantity set in the model holds
// them. The measuring is ifc-quantity-takeoff's (its qto.mjs takeoff(): the
// body's volume, less its IfcRelVoidsElement openings, and areas cut through
// the body by the planes the standard Qto_ sets define). This file only maps
// its rows onto the Qto_ quantity names they stand for.
//
// Which names are offered, and why (eval/qto-from-geometry-2026-11-21.md
// measures each against the values exporters stored, on the HHS Office
// models):
//   GrossVolume, NetVolume   any element with a body (NetVolume only when
//                            every opening could be cut out)
//   GrossSideArea, NetSideArea, GrossFootprintArea, NetFootprintArea, Width
//                            walls (side: the wall's middle plane; footprint:
//                            the plan at its base; width: its thickness)
//   GrossArea, NetArea       slabs, plates, coverings, roofs (the extruded
//                            profile)
//   CrossSectionArea         columns, beams, members, piles
//   Length, Height           walls: the direction from a straight 'Axis'
//                            representation, or with none from the body's own
//                            side faces; the body extruded or faceted
//                            (wallLines below; eval/wall-axis-lengths-2026-11-21.md,
//                            eval/wall-brep-lengths-2026-11-21.md)
// Other lengths and heights are not offered: a beam's or member's Qto_ Length
// is a nominal figure its cut-backs make ambiguous, and no public model here
// stores one to check against.
//
// Every value is in SI units (m, m2, m3), as the IDS standard reads values.

const WALL = /^IFCWALL/;
const PLAN = /^IFC(SLAB|PLATE|COVERING|ROOF)/;
const CROSS = /^IFC(COLUMN|BEAM|MEMBER|PILE)/;
const LINES = new Set(["Length", "Height"]); // read from computed.lines, not the sections

// [quantity name, quantity kind, class test or null for any, reader(row) -> number|null]
export const GEOMETRY_QUANTITIES = [
  ["GrossVolume", "volume", null, (r) => r.computed.gross],
  ["NetVolume", "volume", null, (r) => r.computed.net],
  ["GrossSideArea", "area", WALL, (r) => r.computed.areas?.side?.gross],
  ["NetSideArea", "area", WALL, (r) => r.computed.areas?.side?.net],
  ["GrossFootprintArea", "area", WALL, (r) => r.computed.areas?.footprint?.gross],
  ["NetFootprintArea", "area", WALL, (r) => r.computed.areas?.footprint?.net],
  ["Width", "length", WALL, (r) => r.computed.areas?.side?.width],
  ["GrossArea", "area", PLAN, (r) => r.computed.areas?.plan?.gross],
  ["NetArea", "area", PLAN, (r) => r.computed.areas?.plan?.net],
  ["CrossSectionArea", "area", CROSS, (r) => r.computed.areas?.cross?.gross],
  ["Length", "length", WALL, (r) => r.computed.lines?.length],
  ["Height", "length", WALL, (r) => r.computed.lines?.height],
];

// The IFC quantity class each kind is written as.
export const KIND_CLASS = { volume: "IFCQUANTITYVOLUME", area: "IFCQUANTITYAREA", length: "IFCQUANTITYLENGTH" };

const usable = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/**
 * The quantities each element's geometry gives.
 * @param {Array} rows takeoff(model).rows from ifc-quantity-takeoff/qto.mjs
 * @returns {Map<number, Map<string, {value: number, kind: string}>>} STEP id -> name -> SI value
 */
export function quantitiesFromRows(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!r.computed || r.computed.status !== "ok") continue;
    const A = r.computed.areas;
    const areasOk = A && !A.error && !A.faceted;
    let m = null;
    for (const [name, kind, cls, read] of GEOMETRY_QUANTITIES) {
      if (cls && !cls.test(r.ifcType)) continue;
      if (kind !== "volume" && !areasOk && !LINES.has(name)) continue;
      const v = read(r);
      if (!usable(v)) continue;
      if (!m) out.set(r.id, (m = new Map()));
      m.set(name, { value: v, kind });
    }
  }
  return out;
}

// ---- a wall's length and height, from its axis and body --------------------
//
// Qto_WallBaseQuantities: Length is "the total nominal length of the wall
// along the wall path", Height "the total nominal height of the wall". The
// 'Axis' representation gives the path's direction but not its length:
// ARCHICAD draws it on the wall's reference line, often a face, and runs it
// to the reference line's corners (FZK-Haus: axis 4.59 m, stored Length 4.17
// m, the mean of its 4.05 m and 4.29 m faces). So the length is measured on
// the body: along the axis direction, on the plane halfway through the
// wall's thickness, at the level where the wall is longest (a gable wall's
// base). It reads the body as the takeoff holds it, a signed sum of convex
// pieces (a roof clip is a negative piece), so a line's inside is where the
// signs add up above zero. The height is the extrusion depth ("usually the
// extrusion depth", the Qto_ definition says): the positive pieces' extent
// up the wall, before a roof or slab clips it. Revit stores that; ARCHICAD
// stores the clipped wall's tallest point (`tallest`). Where the two differ
// (a clipped wall) no Height is offered (addWallLines); elsewhere they are the
// same figure (eval/wall-axis-lengths-2026-11-21.md counts both).

/** The parameter range [lo, hi] where the line o + t d is inside a convex polyhedron (outward planes), or null. */
function lineThrough(planes, o, d) {
  let lo = -Infinity, hi = Infinity;
  for (const [n, k] of planes) {
    const a = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
    const b = k - (n[0] * o[0] + n[1] * o[1] + n[2] * o[2]);
    if (Math.abs(a) < 1e-12) { if (b < -1e-9 * (Math.abs(k) + 1)) return null; continue; }
    const t = b / a;
    if (a > 0) { if (t < hi) hi = t; } else if (t > lo) lo = t;
    if (lo >= hi) return null;
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}

/** First and last t where the signed pieces along the line add up above zero, or null. */
function insideSpan(pieces, o, d) {
  const ev = [];
  for (const { s, planes } of pieces) {
    const r = lineThrough(planes, o, d);
    if (r) { ev.push([r[0], s], [r[1], -s]); }
  }
  if (!ev.length) return null;
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let sum = 0, first = null, last = null;
  for (let i = 0; i < ev.length; i++) {
    const before = sum;
    sum += ev[i][1];
    if (before <= 0 && sum > 0 && first === null) first = ev[i][0];
    if (before > 0 && sum <= 0) last = ev[i][0];
  }
  return first !== null && last !== null && last > first ? [first, last] : null;
}

const MAX_SAMPLES = 400;

/**
 * A wall's length along its axis direction and its height, both on the plane
 * halfway through its thickness, in the body's own units.
 *
 * A faceted body (a brep, a tessellation: `mesh` with its closed `shells`)
 * is first taken as convex pieces by `asTerms` (geom.mjs: a convex shell is
 * one piece, any other a signed fan of tetrahedra whose signs add up to the
 * shell's inside), so the same line test reads it. Its extrusion is lost:
 * a roof's or slab's cut is already in the faces, so its depth up the wall
 * is the clipped wall's, and `flatTop` says whether the top is level along
 * the whole wall (addWallLines offers a faceted wall's Height only then).
 * @param {{terms: Array<{s: number, faces: number[][][]}>, mesh?: number, shells?: Array|null}} body
 * @param {number[]} dir the axis direction in the body's plane (x, y)
 * @param {(faces) => Array<[number[], number]>} polyPlanes ifc-quantity-takeoff's geom.mjs
 * @param {{asTerms?: Function}} [opts] geom.mjs asTerms, to read a faceted body
 * @returns {{length: number, height: number, tallest: number, faceted: boolean, flatTop: boolean} | null}
 *   null for a faceted body whose faces are not all known (or with no asTerms), or nothing found
 */
export function wallLines(body, dir, polyPlanes, opts = {}) {
  if (!body) return null;
  const faceted = !!body.mesh;
  let src = body;
  if (faceted) {
    if (!body.shells || !body.shells.length || typeof opts.asTerms !== "function") return null;
    src = opts.asTerms(body);
    if (!src || src.mesh) return null;
  } else if (body.shells && body.shells.length) return null;
  if (!src.terms?.length) return null;
  const L = Math.hypot(dir[0], dir[1]);
  if (!(L > 0)) return null;
  const d = [dir[0] / L, dir[1] / L, 0], n = [-d[1], d[0], 0];
  const pieces = src.terms.map((t) => ({ s: t.s, planes: polyPlanes(t.faces), faces: t.faces }));
  // the material's own vertices: an extruded body's positive pieces, or a
  // faceted body's material shells (a fan's tetrahedra share the shell's
  // centre, which is no vertex of the wall)
  const material = faceted
    ? [...body.terms.filter((t) => t.s > 0).map((t) => t.faces), ...body.shells.filter((sh) => sh.s > 0).map((sh) => sh.loops)]
    : pieces.filter((p) => p.s > 0).map((p) => p.faces);
  // the middle of the material's extent across the wall, and the vertices'
  // positions along it and up it: where the inside's ends can turn
  let nlo = Infinity, nhi = -Infinity;
  const along = new Set(), up = new Set();
  for (const faces of material) for (const f of faces) for (const q of f) { const x = n[0] * q[0] + n[1] * q[1]; if (x < nlo) nlo = x; if (x > nhi) nhi = x; }
  for (const p of pieces) {
    for (const f of p.faces) for (const q of f) {
      along.add(d[0] * q[0] + d[1] * q[1]);
      up.add(q[2]);
    }
  }
  if (!(nhi > nlo)) return null;
  const mid = (nlo + nhi) / 2;
  // sample between and a hair to each side of every vertex position
  const samples = (set) => {
    const v = [...set].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const span = (v[v.length - 1] - v[0]) || 1;
      out.push(v[i] + span * 1e-6, v[i] - span * 1e-6);
      if (i + 1 < v.length) out.push((v[i] + v[i + 1]) / 2);
    }
    if (out.length <= MAX_SAMPLES) return out;
    const step = out.length / MAX_SAMPLES;
    return Array.from({ length: MAX_SAMPLES }, (_, i) => out[Math.floor(i * step)]);
  };
  let length = 0, tallest = 0, zlo = Infinity, zhi = -Infinity;
  for (const z of samples(up)) {
    const o = [n[0] * mid, n[1] * mid, z];
    const r = insideSpan(pieces, o, d);
    if (r && r[1] - r[0] > length) length = r[1] - r[0];
  }
  // the extrusion depth: the material's extent up the wall
  for (const faces of material) for (const f of faces) for (const q of f) { if (q[2] < zlo) zlo = q[2]; if (q[2] > zhi) zhi = q[2]; }
  const height = zhi - zlo;
  // the tallest vertical line through the body as clipped (a roof's or slab's
  // cut taken off), on either face or the middle: for the evaluation's record.
  // On the middle plane, also the top's lowest point along the wall (a hair
  // in from its ends): a level top has it at the material's top.
  const eps = (nhi - nlo) * 1e-4;
  let topLow = Infinity, alo = Infinity, ahi = -Infinity;
  for (const a of along) { if (a < alo) alo = a; if (a > ahi) ahi = a; }
  for (const c of [nlo + eps, mid, nhi - eps]) {
    for (const a of samples(along)) {
      const o = [n[0] * c + d[0] * a, n[1] * c + d[1] * a, 0];
      const r = insideSpan(pieces, o, [0, 0, 1]);
      if (r && r[1] - r[0] > tallest) tallest = r[1] - r[0];
      if (r && c === mid && a > alo + (ahi - alo) * 0.01 && a < ahi - (ahi - alo) * 0.01 && r[1] < topLow) topLow = r[1];
    }
  }
  const flatTop = Number.isFinite(topLow) && zhi - topLow <= 0.005 * (zhi - zlo);
  // A body the middle line crosses on a short leg (an L-shaped plan: the
  // middle of its extent across runs through one arm only) is no single
  // straight wall: a length shorter than the body is thick is not offered.
  if (!(length >= nhi - nlo)) return null;
  return length > 0 && height > 0 ? { length, height, tallest, faceted, flatTop } : null;
}

/**
 * The plan direction of an element's straight 'Axis' representation, or
 * null (none, a curved or bent axis, or one that does not read).
 */
export function straightAxis(model, geo, e) {
  const shape = model.entities.get(e.args[6]?.ref);
  if (!shape || !Array.isArray(shape.args[2])) return null;
  for (const r of shape.args[2]) {
    const rep = model.entities.get(r?.ref);
    if (!rep || rep.type !== "IFCSHAPEREPRESENTATION" || rep.args[1] !== "Axis" || !Array.isArray(rep.args[3]) || rep.args[3].length !== 1) continue;
    let pts;
    try { pts = geo.curve(rep.args[3][0]); } catch { return null; }
    if (!pts || pts.length < 2) return null;
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (!(L > 0)) return null;
    // every point on the chord: a polyline of collinear points is straight, an arc is not
    for (const p of pts) if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L > L * 1e-6) return null;
    return [dx / L, dy / L];
  }
  return null;
}

/**
 * The plan direction along a wall with no usable 'Axis': perpendicular to the
 * horizontal face normal its body is thinnest across (the takeoff's side
 * plane, computed.areas.side.n), or null.
 */
export function bodyDirection(row) {
  const n = row.computed?.areas?.side?.n;
  if (!Array.isArray(n) || !(Math.abs(n[2] ?? 0) < 1e-3)) return null;
  const L = Math.hypot(n[0], n[1]);
  return L > 0 ? [-n[1] / L, n[0] / L] : null;
}

/**
 * Adds computed.lines = {length, height} (SI) to each wall row whose
 * direction is known (a straight axis, or with no axis its body's side
 * faces: lines.from says which) and whose body reads as convex pieces
 * (extruded, or faceted with all its faces known; lines.faceted).
 * opts.asTerms (geom.mjs) reads faceted bodies; without it they are skipped.
 * opts.bodyDirection = false keeps to walls with an axis.
 */
export function addWallLines(model, rows, { Geometry, polyPlanes, readUnits, asTerms, bodyDirection: useBody = true }) {
  const units = readUnits(model);
  const geo = new Geometry(model, { angle: units.PLANEANGLEUNIT });
  let n = 0;
  for (const r of rows) {
    if (!WALL.test(r.ifcType) || !r.computed || r.computed.status !== "ok") continue;
    const body = r.computed.solids?.body;
    const e = model.entities.get(r.id);
    if (!body || !e) continue;
    // the body's own z must be the world's up: the height is read along it
    const W = r.world;
    if (W && !(Math.abs(W[10]) > 0.999 * Math.hypot(W[2], W[6], W[10]))) continue;
    let dir = straightAxis(model, geo, e), from = "axis";
    if (!dir && useBody) { dir = bodyDirection(r); from = "body"; }
    if (!dir) continue;
    let w;
    try { w = wallLines(body, dir, polyPlanes, { asTerms }); } catch { w = null; }
    if (!w) continue;
    const f = r.lengthUnit ?? units.LENGTHUNIT;
    // A wall a roof or slab clips has two heights exporters disagree on (the
    // extrusion depth, Revit; the clipped tallest point, ARCHICAD): offer
    // neither, and leave it to the table. A faceted body has no extrusion
    // left, only its faces: its height is offered only when its top is
    // level along the whole wall, where the two readings are one figure.
    const clipped = Math.abs(w.height - w.tallest) > 0.005 * w.height || (w.faceted && !w.flatTop);
    r.computed.lines = { length: w.length * f, height: clipped ? null : w.height * f, extrusion: w.height * f, tallest: w.tallest * f, clipped, from, faceted: w.faceted };
    n++;
  }
  return n;
}

/**
 * The model fill's opts.geometry: (element, quantity name, quantity class)
 * -> SI value or undefined.
 */
export function geometryLookup(byId) {
  return (e, name, qclass) => {
    const m = byId.get(e.id);
    const q = m && m.get(name);
    return q && Object.hasOwn(KIND_CLASS, q.kind) && KIND_CLASS[q.kind] === qclass ? q.value : undefined;
  };
}

/**
 * Loads ifc-quantity-takeoff (the sibling folder, in the monorepo and on the
 * site alike, or the URL given) and measures the model. Node or a worker.
 * @param {string|Uint8Array} ifcText the .ifc file's text or bytes
 * @param {{dir?: string|URL}} opts dir: ifc-quantity-takeoff's folder
 */
export async function measureModel(ifcText, opts = {}) {
  const base = opts.dir ? new URL(String(opts.dir).replace(/\/?$/, "/"), import.meta.url) : new URL("../ifc-quantity-takeoff/", import.meta.url);
  const { parseStep } = await import(new URL("step.mjs", base).href);
  const { takeoff, readUnits } = await import(new URL("qto.mjs", base).href);
  const { Geometry, polyPlanes, asTerms } = await import(new URL("geom.mjs", base).href);
  const model = parseStep(ifcText);
  const { rows } = takeoff(model);
  addWallLines(model, rows, { Geometry, polyPlanes, readUnits, asTerms });
  return quantitiesFromRows(rows);
}
