// Volumes of IFC body geometry, computed from the model's own shapes.
//
// Every solid becomes a signed sum of bounded convex polyhedra ("terms"):
// a convex profile extruded is one term; a concave profile is fanned from
// its first vertex into signed triangles, each extruded (the signed
// triangles' indicator functions add up to the polygon's, so volumes and
// intersections stay exact); a void in a profile enters with the opposite
// sign. A half-space clip (IfcBooleanClippingResult, the way Revit and
// ArchiCAD cut wall tops and joins) clips every term by a plane, so it adds
// no terms. Anything subtracted that is bounded (a polygonal-bounded half
// space, an opening element, a boolean's second solid) is intersected with
// every term and enters with the opposite sign: A - B = A - (A n B). The
// volume is the sum of the terms' signed volumes, each by the divergence
// theorem over its faces.
//
// Shapes with no polyhedral form here (faceted breps, triangulated face
// sets, swept disks, revolved areas, CSG primitives) give a volume but no
// terms ("mesh" volume); they cannot be intersected with an opening, and an
// element whose net volume needs that is reported as such, never guessed.
// Curves are sampled: arcs at 360 segments to the full turn (area 5e-5 low on
// a circle), full circles and ellipses with an area-preserving radius.
//
// Pure functions over a parsed STEP model (step.mjs). Lengths stay in the
// model's own length unit; the caller converts.

const EPS_REL = 1e-9;
const ARC_SEGS = 360;
// polygon side counts tried for an exporter's faceted circles (sectionVariants);
// above 24 sides the area is within 1.2% of the circle's, inside the 2% check
export const SECTION_POLYGON_SIDES = [6, 8, 12, 16, 24];
import { bsplineCurve, bsplineSurface, invertSurface, surfaceGrid, meshFace } from "./surface.mjs";

export const MAX_TERMS = 20000;

export class Unresolved extends Error {}

// ---- small vector and matrix helpers (3x4 affine, row-major) -------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 0 ? mulS(a, 1 / n) : null; };

export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);

/** Matrix from three column axes and an origin. */
const fromAxes = (x, y, z, o) => [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]];

export function apply(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}
const wrapTo = (d, P) => d - P * Math.round(d / P);
const applyDir = (m, d) => [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];

export function mul(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
    }
  }
  return r;
}

export const det = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);

export function invert(m) {
  const d = det(m);
  if (!d) throw new Unresolved("singular transformation");
  const a = m[0], b = m[1], c = m[2], e = m[4], f = m[5], g = m[6], h = m[8], i = m[9], k = m[10];
  const r = [
    (f * k - g * i) / d, (c * i - b * k) / d, (b * g - c * f) / d, 0,
    (g * h - e * k) / d, (a * k - c * h) / d, (c * e - a * g) / d, 0,
    (e * i - f * h) / d, (b * h - a * i) / d, (a * f - b * e) / d, 0,
  ];
  const t = applyDir(r, [m[3], m[7], m[11]]);
  r[3] = -t[0]; r[7] = -t[1]; r[11] = -t[2];
  return r;
}

// ---- convex polyhedra: faces are point loops, counter-clockwise seen from outside

export function polyVolume(faces) {
  // taken about the polyhedron's own first vertex, not the model's origin:
  // the same for a closed polyhedron, but a piece left a hair open by a clip
  // (faces 1e-4 short of closing) far from the origin (a site 230 m off it)
  // would otherwise gain its gap times that distance, millions of mm3
  if (!faces.length || !faces[0].length) return 0;
  const o = faces[0][0];
  let v = 0;
  for (const f of faces) {
    const a = sub(f[0], o);
    for (let i = 1; i + 1 < f.length; i++) v += dot(a, cross(sub(f[i], o), sub(f[i + 1], o)));
  }
  return v / 6;
}

function scaleOf(faces) {
  let s = 0;
  for (const f of faces) for (const p of f) s = Math.max(s, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  return s;
}

/** Keeps the part of a convex polyhedron where n.x <= k. */
export function clipPoly(faces, n, k) {
  if (!faces.length) return faces;
  const eps = EPS_REL * (scaleOf(faces) * norm(n) + Math.abs(k) + 1);
  const out = [];
  const cap = [];
  let anyOut = false;
  for (const f of faces) {
    const res = [];
    const m = f.length;
    for (let i = 0; i < m; i++) {
      const a = f[i], b = f[(i + 1) % m];
      const da = dot(n, a) - k, db = dot(n, b) - k;
      if (da <= eps) res.push(a);
      if (da > eps) anyOut = true;
      if (Math.abs(da) <= eps) cap.push(a);
      if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
        const t = da / (da - db);
        const p = add(a, mulS(sub(b, a), t));
        res.push(p);
        cap.push(p);
      }
    }
    if (res.length >= 3) out.push(res);
  }
  if (!anyOut) return faces;
  if (cap.length >= 3) {
    // order the cut's points around their centre, normal +n (outward)
    const c = mulS(cap.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / cap.length);
    const nn = unit(n);
    const u = unit(Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]));
    const v = cross(nn, u);
    const pts = [];
    const tol = eps * 10;
    for (const p of cap) if (!pts.some((q) => Math.abs(q[0] - p[0]) <= tol && Math.abs(q[1] - p[1]) <= tol && Math.abs(q[2] - p[2]) <= tol)) pts.push(p);
    if (pts.length >= 3) {
      pts.sort((p, q) => Math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)) - Math.atan2(dot(sub(q, c), v), dot(sub(q, c), u)));
      out.push(pts);
    }
  }
  return out;
}

/** Outward planes (n, k with n.x <= k inside) of a convex polyhedron. */
export function polyPlanes(faces) {
  const planes = [];
  for (const f of faces) {
    let n = [0, 0, 0];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
    }
    const u = unit(n);
    if (!u) continue;
    const c = mulS(f.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / f.length);
    planes.push([u, dot(u, c)]);
  }
  return planes;
}

const clipByPlanes = (faces, planes) => {
  let f = faces;
  for (const [n, k] of planes) { f = clipPoly(f, n, k); if (!f.length) break; }
  return f;
};

function transformPoly(faces, m) {
  const flip = det(m) < 0;
  return faces.map((f) => { const g = f.map((p) => apply(m, p)); return flip ? g.reverse() : g; });
}

// ---- solids: { terms: [{s, faces}], mesh: number, shells, notes: [] } -----
//
// `shells` keeps the faces of the faceted part ("mesh"): a list of closed
// shells { s, loops }, each loop a face boundary as given in the file and
// s = +1 or -1 so that s x the shell's signed volume is what it adds (a void
// subtracts). It is null when part of the mesh volume has no faces here (a
// swept disk, a revolved area, a CSG primitive) or when an operation the
// faces did not take part in (a clip, an opening) was applied: such a solid
// has no section.

const solid = (terms = [], mesh = 0, notes = [], shells = mesh ? null : []) => ({ terms, mesh, notes, shells });

export function solidVolume(s) {
  let v = s.mesh;
  for (const t of s.terms) v += t.s * polyVolume(t.faces);
  return v;
}

function transformSolid(s, m) {
  const shells = s.shells ? s.shells.map((sh) => ({ s: sh.s, loops: transformPoly(sh.loops, m) })) : null;
  const out = solid(s.terms.map((t) => ({ s: t.s, faces: transformPoly(t.faces, m) })), s.mesh * Math.abs(det(m)), s.notes, shells);
  if (s.axis) { out.axis = unit(applyDir(m, s.axis)); out.axisWeight = (s.axisWeight ?? 0) * Math.abs(det(m)); }
  return out;
}

// ---- sections: the area a plane cuts from a solid ----------------------------
//
// The cut of a signed sum of convex polyhedra by a plane is the signed sum of
// the convex polygons each one cuts, so its area adds up term by term, exactly
// as the volume does. This is how the quantity sets define their areas: a
// wall's side area is "as viewed by an elevation view of the middle plane of
// the wall", a slab's area is the area of its extruded profile, a member's
// cross-section is the profile (Qto_WallBaseQuantities, Qto_SlabBaseQuantities,
// Qto_BeamBaseQuantities). Faceted parts ("mesh") have no terms and no section.

/** Area of the convex polygon the plane n.x = k cuts from a convex polyhedron. */
export function polySection(faces, n, k) {
  const nn = unit(n);
  const eps = EPS_REL * (scaleOf(faces) + Math.abs(k) + 1);
  const pts = [];
  const tol = eps * 10;
  const addPt = (p) => { if (!pts.some((q) => Math.abs(q[0] - p[0]) <= tol && Math.abs(q[1] - p[1]) <= tol && Math.abs(q[2] - p[2]) <= tol)) pts.push(p); };
  let above = false, below = false;
  for (const f of faces) {
    const m = f.length;
    for (let i = 0; i < m; i++) {
      const a = f[i], b = f[(i + 1) % m];
      const da = dot(nn, a) - k, db = dot(nn, b) - k;
      if (da > eps) above = true; else if (da < -eps) below = true;
      if (Math.abs(da) <= eps) addPt(a);
      else if ((da < -eps && db > eps) || (da > eps && db < -eps)) addPt(add(a, mulS(sub(b, a), da / (da - db))));
    }
  }
  // a plane that only touches the solid (a face lying in it) cuts nothing of measure
  if (!above || !below || pts.length < 3) return 0;
  const c = mulS(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  const u = unit(Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]));
  const v = cross(nn, u);
  const uv = pts.map((p) => [dot(sub(p, c), u), dot(sub(p, c), v)]);
  uv.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
  return Math.abs(signedArea(uv));
}

/**
 * Signed area of the section of a closed shell by the plane n.x = k (n a unit
 * vector): positive when the shell's faces turn counter-clockwise seen from
 * outside. Each face is fanned into signed triangles; the part of a triangle
 * on the n.x <= k side has one edge in the plane (exit point X to entry point
 * Y), and the section is the polygon these edges bound, traversed Y to X with
 * normal +n, so its area is the sum of n.(Y x X) / 2. Faces need not be
 * convex and the section may have several pieces and holes: the edges of a
 * closed shell close up, and each piece's turn gives its sign.
 */
export function shellSection(loops, n, k) {
  const o = mulS(n, k);
  let A = 0;
  for (const f of loops) {
    if (f.length < 3) continue;
    const d = f.map((p) => dot(n, p) - k);
    const a = f[0], da = d[0];
    for (let i = 1; i + 1 < f.length; i++) {
      const tri = [a, f[i], f[i + 1]], dt = [da, d[i], d[i + 1]];
      let X = null, Y = null;
      for (let j = 0; j < 3; j++) {
        const p = tri[j], q = tri[(j + 1) % 3], dp = dt[j], dq = dt[(j + 1) % 3];
        if ((dp <= 0) === (dq <= 0)) continue;
        const pt = add(p, mulS(sub(q, p), dp / (dp - dq)));
        if (dp <= 0) X = pt; else Y = pt;
      }
      if (X && Y) A += dot(n, cross(sub(Y, o), sub(X, o)));
    }
  }
  return A / 2;
}

/** Signed volume of a closed shell given as face loops (divergence theorem). */
export function shellVolume(loops) {
  let v = 0;
  for (const f of loops) {
    const o = f[0];
    for (let i = 1; i + 1 < f.length; i++) v += dot(o, cross(f[i], f[i + 1]));
  }
  return v / 6;
}

export function* solidPoints(s) {
  for (const t of s.terms) for (const f of t.faces) yield* f;
  if (s.shells) for (const sh of s.shells) for (const f of sh.loops) yield* f;
}

/** Smallest and largest n.x over a solid's polyhedral terms and faceted shells. */
export function solidExtent(s, n) {
  const nn = unit(n);
  let lo = Infinity, hi = -Infinity;
  for (const p of solidPoints(s)) { const d = dot(nn, p); if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
}

/** The outward normals of a solid's faces, terms and shells alike. */
function* faceNormals(s) {
  for (const t of s.terms) for (const [n] of polyPlanes(t.faces)) yield n;
  if (s.shells) for (const sh of s.shells) for (const [n] of polyPlanes(sh.loops)) yield n;
}

/**
 * Area of the section of a solid by the plane normal to n through the middle
 * of its extent along n (or at offset k when given). null when the solid has a
 * faceted part whose faces are not all known (see `shells`).
 */
export function sectionArea(s, n, k = null) {
  if (s.mesh && !s.shells) return null;
  if (!s.terms.length && !s.shells?.length) return null;
  const nn = unit(n);
  if (!nn) return null;
  let at = k;
  if (at == null) {
    const [lo, hi] = solidExtent(s, nn);
    if (!(hi > lo)) return null;
    // a hair off the exact middle, so a face lying in the middle plane
    // (two layers meeting there) is never counted from both sides
    at = (lo + hi) / 2 + (hi - lo) * 1e-7;
  }
  let A = 0;
  for (const t of s.terms) A += t.s * polySection(t.faces, nn, at);
  if (s.shells) for (const sh of s.shells) A += sh.s * shellSection(sh.loops, nn, at);
  return Math.abs(A);
}

/**
 * Total area of a solid's boundary faces, or null when it cannot be read off
 * the faces exactly: a faceted part with unknown faces, or more than one
 * polyhedral term (convex pieces of one body share inner faces that are not
 * its surface). Loops are summed plane by plane as area vectors, so an inner
 * bound running against its face's outer bound comes off it.
 */
export function surfaceArea(s) {
  if (s.mesh && !s.shells) return null;
  const loops = [];
  if (s.terms.length > 1) return null;
  for (const t of s.terms) loops.push(...t.faces);
  if (s.shells) for (const sh of s.shells) loops.push(...sh.loops);
  if (!loops.length) return null;
  let scale = 0;
  for (const l of loops) for (const p of l) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const planes = new Map();
  for (const l of loops) {
    if (l.length < 3) continue;
    const a = mulS(newell(l), 0.5);
    const n = unit(a);
    if (!n) continue;
    // one key for both orientations of a plane
    const i = Math.abs(n[0]) > 1e-9 ? 0 : Math.abs(n[1]) > 1e-9 ? 1 : 2;
    const c = n[i] < 0 ? mulS(n, -1) : n;
    const r = (x, q) => Math.round(x / q);
    const key = `${r(c[0], 1e-6)},${r(c[1], 1e-6)},${r(c[2], 1e-6)},${r(dot(c, l[0]), 1e-6 * (scale || 1))}`;
    const v = planes.get(key);
    planes.set(key, v ? add(v, a) : a);
  }
  let A = 0;
  for (const v of planes.values()) A += norm(v);
  return A;
}

/**
 * The extrusion axis of a faceted prism: the direction along which its side
 * faces lie (perpendicular to their normals) with the most face area. A
 * prism's side faces all lie along its axis, its end faces, square or mitred,
 * do not; a box's choice is its longest edge, as before, and a trapezoid in
 * plan (a footing mitred at both ends, also a prism standing up) picks the
 * run, whose sides are larger. null when two directions come within 1% of
 * each other or the body has too many faces to try. Cut normal to it, a
 * mitred or short piece gives its profile, where the longest extent gives a
 * slanted or crosswise cut.
 */
export function prismAxis(s, maxFaces = 48) {
  const loops = [];
  for (const t of s.terms) loops.push(...t.faces);
  if (s.shells) for (const sh of s.shells) loops.push(...sh.loops);
  if (loops.length > maxFaces) return null;
  const faces = [];
  for (const l of loops) {
    if (l.length < 3) continue;
    const a = newell(l), A = norm(a) / 2;
    if (A > 0) faces.push({ u: mulS(a, 1 / (2 * A)), A });
  }
  const ns = [];
  for (const { u } of faces) if (!ns.some((m) => Math.abs(dot(m, u)) > 1 - 1e-9)) ns.push(u);
  if (ns.length < 3) return null;
  const scores = [];
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
    const d = unit(cross(ns[i], ns[j]));
    if (!d || scores.some((e) => Math.abs(dot(e.d, d)) > 1 - 1e-9)) continue;
    let A = 0;
    for (const f of faces) if (Math.abs(dot(f.u, d)) < 1e-6) A += f.A;
    scores.push({ d, A });
  }
  scores.sort((x, y) => y.A - x.A);
  if (!scores.length || (scores[1] && scores[1].A > 0.99 * scores[0].A)) return null;
  return scores[0].d;
}

/**
 * The direction, among the solid's own face normals that pass `keep`, along
 * which the solid is thinnest: a wall's width direction when only horizontal
 * normals are kept, a slab's thickness direction otherwise.
 */
export function thinnestNormal(s, keep = () => true, widest = false) {
  const seen = [];
  for (const n of faceNormals(s)) {
    const m = n[2] < -1e-9 || (Math.abs(n[2]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[0] < 0))) ? mulS(n, -1) : n;
    if (!keep(m)) continue;
    if (!seen.some((q) => Math.abs(dot(q, m)) > 1 - 1e-9)) seen.push(m);
    if (seen.length > 200) break;
  }
  let best = null, bestW = Infinity;
  for (const n of seen) {
    const [lo, hi] = solidExtent(s, n);
    const w = widest ? lo - hi : hi - lo;
    if (w < bestW - 1e-12 * Math.max(1, Math.abs(bestW === Infinity ? w : bestW))) { bestW = w; best = n; }
  }
  return best ? { n: best, width: Math.abs(bestW) } : null;
}

function guard(terms) {
  if (terms.length > MAX_TERMS) throw new Unresolved(`more than ${MAX_TERMS} pieces`);
  return terms;
}

/** a - (a n c), where c is a list of signed convex sets given as plane lists. */
function subtractCutters(a, cutters, what) {
  const terms = a.terms.slice();
  for (const t of a.terms) {
    for (const c of cutters) {
      const f = clipByPlanes(t.faces, c.planes);
      if (f.length) terms.push({ s: -t.s * c.s, faces: f });
    }
  }
  const notes = a.notes.slice();
  if (a.mesh) notes.push(`${what} not taken from a faceted part`);
  const out = solid(guard(terms), a.mesh, notes, a.mesh ? null : []);
  if (a.axis) { out.axis = a.axis; out.axisWeight = a.axisWeight; }
  return out;
}

const cuttersOf = (s) => s.terms.map((t) => ({ s: t.s, planes: polyPlanes(t.faces) }));

// ---- reading the model -----------------------------------------------------

export class Geometry {
  /**
   * @param {{entities: {get(id:number): any}}} model parsed STEP
   * @param {{angle?: number}} units plane angle unit in radians (1 or pi/180)
   */
  constructor(model, units = {}) {
    this.e = model.entities;
    this.angle = units.angle ?? 1;
    this.cache = new Map();
  }

  get(ref) {
    if (ref == null) return null;
    const id = typeof ref === "number" ? ref : ref.ref;
    if (id === undefined) return null;
    const e = this.e.get(id);
    if (!e) throw new Unresolved(`#${id} is not in the file`);
    return e;
  }

  num(v) {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "typed" in v) return this.num(v.value);
    return null;
  }

  point(ref) {
    const e = this.get(ref);
    if (!e) return [0, 0, 0];
    const c = e.args[0];
    return [this.num(c[0]) ?? 0, this.num(c[1]) ?? 0, this.num(c[2]) ?? 0];
  }

  dir(ref, fallback) {
    const e = this.get(ref);
    if (!e) return fallback;
    const c = e.args[0];
    return unit([this.num(c[0]) ?? 0, this.num(c[1]) ?? 0, this.num(c[2]) ?? 0]) ?? fallback;
  }

  /** IfcAxis2Placement2D/3D -> matrix */
  placement(ref) {
    const e = this.get(ref);
    if (!e) return IDENTITY;
    const o = this.point(e.args[0]);
    if (e.type === "IFCAXIS2PLACEMENT2D") {
      const x = this.dir(e.args[1], [1, 0, 0]);
      const xx = unit([x[0], x[1], 0]) ?? [1, 0, 0];
      return fromAxes(xx, [-xx[1], xx[0], 0], [0, 0, 1], o);
    }
    if (e.type !== "IFCAXIS2PLACEMENT3D") throw new Unresolved(`placement ${e.type}`);
    const z = this.dir(e.args[1], [0, 0, 1]);
    let x = this.dir(e.args[2], Math.abs(z[0]) > 0.99 ? [0, 1, 0] : [1, 0, 0]);
    x = unit(sub(x, mulS(z, dot(x, z)))) ?? (Math.abs(z[0]) > 0.99 ? [0, 1, 0] : [1, 0, 0]);
    return fromAxes(x, cross(z, x), z, o);
  }

  /** IfcCartesianTransformationOperator2D/3D (and non-uniform) -> matrix */
  operator(ref) {
    const e = this.get(ref);
    if (!e) return IDENTITY;
    const a = e.args;
    const is3 = e.type.includes("3D");
    const o = this.point(a[2]);
    const s1 = this.num(a[3]) ?? 1;
    let s2 = s1, s3 = s1;
    if (e.type.includes("NONUNIFORM")) {
      s2 = this.num(a[is3 ? 5 : 4]) ?? s1;
      if (is3) s3 = this.num(a[6]) ?? s1;
    }
    const z = is3 ? this.dir(a[4], [0, 0, 1]) : [0, 0, 1];
    let x = this.dir(a[0], null);
    if (!x) x = Math.abs(z[0]) > 0.99 ? [0, 1, 0] : [1, 0, 0];
    x = unit(sub(x, mulS(z, dot(x, z)))) ?? [1, 0, 0];
    let y = this.dir(a[1], null) ?? cross(z, x);
    y = unit(sub(sub(y, mulS(z, dot(y, z))), mulS(x, dot(y, x)))) ?? cross(z, x);
    return fromAxes(mulS(x, s1), mulS(y, s2), mulS(z, s3), o);
  }

  /** IfcLocalPlacement chain -> matrix to world */
  objectPlacement(ref, depth = 0) {
    const e = this.get(ref);
    if (!e) return IDENTITY;
    if (depth > 100) throw new Unresolved("placement loop");
    if (e.type !== "IFCLOCALPLACEMENT") throw new Unresolved(`object placement ${e.type}`);
    const rel = this.placement(e.args[1]);
    return e.args[0] ? mul(this.objectPlacement(e.args[0], depth + 1), rel) : rel;
  }

  // ---- curves to 2D point loops --------------------------------------------

  arcPoints(c, r1, r2, x, y, t0, t1, ccw) {
    // points of c + r1 cos t x + r2 sin t y from t0 to t1
    let span = ccw ? t1 - t0 : t0 - t1;
    while (span <= 1e-12) span += 2 * Math.PI;
    while (span > 2 * Math.PI + 1e-12) span -= 2 * Math.PI;
    const n = Math.max(2, Math.ceil((span / (2 * Math.PI)) * ARC_SEGS));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (ccw ? 1 : -1) * (span * i) / n;
      pts.push([c[0] + r1 * Math.cos(t) * x[0] + r2 * Math.sin(t) * y[0], c[1] + r1 * Math.cos(t) * x[1] + r2 * Math.sin(t) * y[1]]);
    }
    return pts;
  }

  conic(e) {
    const m = this.placement(e.args[0]);
    const c = [m[3], m[7]];
    const x = [m[0], m[4]], y = [m[1], m[5]];
    const r1 = this.num(e.args[1]);
    const r2 = e.type === "IFCELLIPSE" ? this.num(e.args[2]) : r1;
    return { c, x, y, r1, r2 };
  }

  /** a closed loop from a whole circle or ellipse, radius scaled to keep the area */
  fullConic(e) {
    const { c, x, y, r1, r2 } = this.conic(e);
    const n = ARC_SEGS;
    const k = Math.sqrt((2 * Math.PI) / (n * Math.sin((2 * Math.PI) / n)));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (2 * Math.PI * i) / n;
      pts.push([c[0] + k * r1 * Math.cos(t) * x[0] + k * r2 * Math.sin(t) * y[0], c[1] + k * r1 * Math.cos(t) * x[1] + k * r2 * Math.sin(t) * y[1]]);
    }
    return pts;
  }

  trimValue(list, want) {
    for (const v of list || []) {
      if (v && v.ref !== undefined && want === "point") return this.point(v);
      if (v && v.typed === "IFCPARAMETERVALUE" && want === "param") return this.num(v.value);
    }
    return null;
  }

  /** open or closed curve -> list of [x, y] */
  curve(ref, depth = 0) {
    const e = this.get(ref);
    if (depth > 50) throw new Unresolved("curve nesting");
    const a = e.args;
    switch (e.type) {
      case "IFCPOLYLINE":
        return a[0].map((p) => this.point(p)).map((p) => [p[0], p[1]]);
      case "IFCINDEXEDPOLYCURVE": {
        const pl = this.get(a[0]);
        const P = pl.args[0].map((c) => [this.num(c[0]), this.num(c[1])]);
        if (!a[1]) return P.slice();
        const out = [];
        for (const seg of a[1]) {
          const idx = (seg.value || []).map((i) => this.num(i) - 1);
          if (seg.typed === "IFCLINEINDEX") {
            for (const i of idx) out.push(P[i]);
          } else if (seg.typed === "IFCARCINDEX") {
            out.push(...this.arc3(P[idx[0]], P[idx[1]], P[idx[2]]));
          } else throw new Unresolved(`curve segment ${seg.typed}`);
        }
        return out;
      }
      case "IFCCOMPOSITECURVE":
      case "IFCCOMPOSITECURVEONSURFACE": {
        const out = [];
        for (const sref of a[0]) {
          const s = this.get(sref);
          let pts = this.curve(s.args[2], depth + 1);
          if (s.args[1] === false) pts = pts.slice().reverse();
          out.push(...pts);
        }
        return out;
      }
      case "IFCTRIMMEDCURVE": {
        const basis = this.get(a[0]);
        const master = a[4] && a[4].enum;
        const p1 = this.trimValue(a[1], "point"), p2 = this.trimValue(a[2], "point");
        const t1 = this.trimValue(a[1], "param"), t2 = this.trimValue(a[2], "param");
        const useCart = p1 && p2 && (master !== "PARAMETER" || t1 == null || t2 == null);
        const sense = a[3] !== false;
        if (basis.type === "IFCLINE") {
          if (useCart) return [[p1[0], p1[1]], [p2[0], p2[1]]];
          const o = this.point(basis.args[0]);
          const v = this.get(basis.args[1]);
          const d = this.dir(v.args[0], [1, 0, 0]);
          const mag = this.num(v.args[1]) ?? 1;
          const at = (t) => [o[0] + d[0] * mag * t, o[1] + d[1] * mag * t];
          if (t1 == null || t2 == null) throw new Unresolved("line trimmed by nothing usable");
          return [at(t1), at(t2)];
        }
        if (basis.type === "IFCCIRCLE" || basis.type === "IFCELLIPSE") {
          const { c, x, y, r1, r2 } = this.conic(basis);
          const ang = (p) => {
            const dx = p[0] - c[0], dy = p[1] - c[1];
            return Math.atan2((dx * y[0] + dy * y[1]) / r2, (dx * x[0] + dy * x[1]) / r1);
          };
          let a0, a1;
          if (useCart) { a0 = ang(p1); a1 = ang(p2); } else if (t1 != null && t2 != null) { a0 = t1 * this.angle; a1 = t2 * this.angle; } else throw new Unresolved("arc trimmed by nothing usable");
          const pts = this.arcPoints(c, r1, r2, x, y, a0, a1, sense);
          if (useCart) { pts[0] = [p1[0], p1[1]]; pts[pts.length - 1] = [p2[0], p2[1]]; }
          return pts;
        }
        throw new Unresolved(`trimmed ${basis.type}`);
      }
      case "IFCCIRCLE":
      case "IFCELLIPSE":
        return this.fullConic(e);
      case "IFCLINE":
        throw new Unresolved("unbounded line");
      default:
        throw new Unresolved(`curve ${e.type}`);
    }
  }

  arc3(p, q, r) {
    // circle through three points, from p through q to r
    const ax = p[0], ay = p[1], bx = q[0], by = q[1], cx = r[0], cy = r[1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-14 * (Math.abs(ax) + Math.abs(bx) + Math.abs(cx) + 1) ** 2) return [p, q, r];
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const rad = Math.hypot(ax - ux, ay - uy);
    const t0 = Math.atan2(ay - uy, ax - ux), tm = Math.atan2(by - uy, bx - ux), t1 = Math.atan2(cy - uy, cx - ux);
    const norm2 = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const ccw = norm2(tm - t0) < norm2(t1 - t0);
    const pts = this.arcPoints([ux, uy], rad, rad, [1, 0], [0, 1], t0, t1, ccw);
    pts[0] = p; pts[pts.length - 1] = r;
    return pts;
  }

  // ---- profiles to signed loops ----------------------------------------------

  /**
   * -> [{s: +1|-1, pts: [[x,y],...]}] in the profile's own position.
   * opts.plain drops the fillet and edge radii of parametric profiles, and
   * opts.sides draws circles as inscribed polygons of that many sides: the
   * simplified sections some exporters compute their stored volumes from
   * (sectionVariants below).
   */
  profile(ref, depth = 0, opts = null) {
    const e = this.get(ref);
    const a = e.args;
    const n = (i) => this.num(a[i]);
    const rad = (i) => (opts?.plain ? 0 : (n(i) ?? 0));
    const pos = () => (a[2] ? this.placement(a[2]) : IDENTITY);
    const place = (loops) => {
      const m = pos();
      return loops.map((l) => ({ s: l.s, pts: l.pts.map((p) => { const q = apply(m, [p[0], p[1], 0]); return [q[0], q[1]]; }) }));
    };
    const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const circle = (r) => {
      if (opts?.sides) return Array.from({ length: opts.sides }, (_, i) => { const t = (2 * Math.PI * i) / opts.sides; return [r * Math.cos(t), r * Math.sin(t)]; });
      const k = Math.sqrt((2 * Math.PI) / (ARC_SEGS * Math.sin((2 * Math.PI) / ARC_SEGS)));
      const pts = [];
      for (let i = 0; i < ARC_SEGS; i++) { const t = (2 * Math.PI * i) / ARC_SEGS; pts.push([k * r * Math.cos(t), k * r * Math.sin(t)]); }
      return pts;
    };
    switch (e.type) {
      case "IFCRECTANGLEPROFILEDEF":
        return place([{ s: 1, pts: rect(n(3), n(4)) }]);
      case "IFCROUNDEDRECTANGLEPROFILEDEF": {
        const r = rad(5);
        let pts = rect(n(3), n(4));
        if (r > 0) pts = filletAll(pts, [0, 1, 2, 3], r);
        return place([{ s: 1, pts }]);
      }
      case "IFCRECTANGLEHOLLOWPROFILEDEF": {
        const w = n(3), h = n(4), t = n(5);
        let outer = rect(w, h), inner = rect(w - 2 * t, h - 2 * t);
        const ri = rad(6), ro = rad(7);
        if (ro > 0) outer = filletAll(outer, [0, 1, 2, 3], ro);
        if (ri > 0) inner = filletAll(inner, [0, 1, 2, 3], ri);
        return place([{ s: 1, pts: outer }, { s: -1, pts: inner }]);
      }
      case "IFCCIRCLEPROFILEDEF":
        return place([{ s: 1, pts: circle(n(3)) }]);
      case "IFCCIRCLEHOLLOWPROFILEDEF":
        return place([{ s: 1, pts: circle(n(3)) }, { s: -1, pts: circle(n(3) - n(4)) }]);
      case "IFCELLIPSEPROFILEDEF": {
        const b = n(4) / n(3);
        return place([{ s: 1, pts: circle(n(3)).map((p) => [p[0], p[1] * b]) }]);
      }
      case "IFCISHAPEPROFILEDEF": {
        const w = n(3), d = n(4), tw = n(5), tf = n(6), r = rad(7);
        if (n(9)) throw new Unresolved("sloped I flanges");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + tf], [tw / 2, -d / 2 + tf], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf], [-tw / 2, -d / 2 + tf], [-w / 2, -d / 2 + tf]];
        return place([{ s: 1, pts: r > 0 ? filletAll(pts, [3, 4, 9, 10], r) : pts }]);
      }
      case "IFCLSHAPEPROFILEDEF": {
        const d = n(3), w = n(4) ?? n(3), t = n(5), r = rad(6);
        if (n(8)) throw new Unresolved("sloped L legs");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + t], [-w / 2 + t, -d / 2 + t], [-w / 2 + t, d / 2], [-w / 2, d / 2]];
        return place([{ s: 1, pts: r > 0 ? filletAll(pts, [3], r) : pts }]);
      }
      case "IFCTSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6), r = rad(7);
        if (n(10) || n(11)) throw new Unresolved("sloped T");
        const pts = [[-tw / 2, -d / 2], [tw / 2, -d / 2], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf]];
        return place([{ s: 1, pts: r > 0 ? filletAll(pts, [2, 7], r) : pts }]);
      }
      case "IFCUSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6), r = rad(7);
        if (n(9)) throw new Unresolved("sloped U flanges");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + tf], [-w / 2 + tw, -d / 2 + tf], [-w / 2 + tw, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2]];
        return place([{ s: 1, pts: r > 0 ? filletAll(pts, [3, 4], r) : pts }]);
      }
      case "IFCCSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), t = n(5), g = n(6);
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + g], [w / 2 - t, -d / 2 + g], [w / 2 - t, -d / 2 + t], [-w / 2 + t, -d / 2 + t], [-w / 2 + t, d / 2 - t], [w / 2 - t, d / 2 - t], [w / 2 - t, d / 2 - g], [w / 2, d / 2 - g], [w / 2, d / 2], [-w / 2, d / 2]];
        return place([{ s: 1, pts }]);
      }
      case "IFCZSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6);
        const pts = [[-tw / 2, -d / 2], [w - tw / 2, -d / 2], [w - tw / 2, -d / 2 + tf], [tw / 2, -d / 2 + tf], [tw / 2, d / 2], [-w + tw / 2, d / 2], [-w + tw / 2, d / 2 - tf], [-tw / 2, d / 2 - tf]];
        return place([{ s: 1, pts }]);
      }
      case "IFCARBITRARYCLOSEDPROFILEDEF":
      case "IFCARBITRARYPROFILEDEFWITHVOIDS": {
        const loops = [{ s: 1, pts: closeLoop(this.curve(a[2])) }];
        if (e.type === "IFCARBITRARYPROFILEDEFWITHVOIDS") for (const c of a[3] || []) loops.push({ s: -1, pts: closeLoop(this.curve(c)) });
        return loops;
      }
      case "IFCDERIVEDPROFILEDEF":
      case "IFCMIRROREDPROFILEDEF": {
        const m = this.operator(a[3]);
        return this.profile(a[2], depth + 1, opts).map((l) => ({ s: l.s, pts: l.pts.map((p) => { const q = apply(m, [p[0], p[1], 0]); return [q[0], q[1]]; }) }));
      }
      case "IFCCOMPOSITEPROFILEDEF":
        return a[2].flatMap((p) => this.profile(p, depth + 1, opts));
      default:
        throw new Unresolved(`profile ${e.type}`);
    }
  }

  /**
   * The ways an exporter is seen to simplify a parametric section, each as
   * the ratio of the simplified area to the exact one: "no fillets" (root and
   * edge radii left out; Tekla's stored volumes and weights), "N-gon circles"
   * (round parts as inscribed polygons of N sides), and both together. Only
   * variants that differ from the exact area by more than 0.1% are returned;
   * an arbitrary (drawn) profile has none.
   */
  sectionVariants(ref) {
    const area = (loops) => loops.reduce((x, l) => x + l.s * Math.abs(signedArea(l.pts)), 0);
    const e = this.get(ref);
    if (!e || /ARBITRARY/.test(e.type)) return [];
    let exact;
    try { exact = area(this.profile(ref)); } catch { return []; }
    if (!(exact > 0)) return [];
    const out = [];
    const tryOne = (label, opts) => {
      let v;
      try { v = area(this.profile(ref, 0, opts)); } catch { return; }
      const ratio = v / exact;
      if (Math.abs(ratio - 1) > 0.001 && !out.some((o) => Math.abs(o.ratio - ratio) < 1e-6)) out.push({ label, ratio });
    };
    tryOne("no fillets", { plain: true });
    for (const sides of SECTION_POLYGON_SIDES) {
      tryOne(`${sides}-gon circles`, { sides });
      tryOne(`no fillets, ${sides}-gon circles`, { plain: true, sides });
    }
    return out;
  }

  // ---- representation items to solids ----------------------------------------

  item(ref, depth = 0) {
    const e = this.get(ref);
    if (depth > 60) throw new Unresolved("boolean nesting");
    const a = e.args;
    switch (e.type) {
      case "IFCEXTRUDEDAREASOLID": {
        const loops = this.profile(a[0]);
        const m = a[1] ? this.placement(a[1]) : IDENTITY;
        const d = this.dir(a[2], [0, 0, 1]);
        const depthV = this.num(a[3]);
        if (!(depthV > 0)) throw new Unresolved("extrusion with no depth");
        if (Math.abs(d[2]) < 1e-12) throw new Unresolved("extrusion along the profile plane");
        const terms = [];
        for (const l of loops) {
          for (const piece of convexPieces(l.pts)) {
            const faces = prism(piece.pts, mulS(d, depthV));
            terms.push({ s: l.s * piece.s, faces: transformPoly(faces, m) });
          }
        }
        const out = solid(guard(terms));
        // the profile plane's normal: a member's cross-section is cut normal to it
        out.axis = unit([m[2], m[6], m[10]]);
        out.axisWeight = Math.abs(solidVolume(out));
        return out;
      }
      case "IFCBOOLEANCLIPPINGRESULT":
      case "IFCBOOLEANRESULT": {
        const op = a[0] && a[0].enum;
        const first = this.item(a[1], depth + 1);
        const second = this.get(a[2]);
        if (op === "DIFFERENCE") { const r = this.difference(first, second, depth); if (first.axis) { r.axis = first.axis; r.axisWeight = first.axisWeight; } return r; }
        const b = this.item(a[2], depth + 1);
        if (first.mesh || b.mesh) throw new Unresolved(`${op} with a faceted operand`);
        const both = [];
        for (const t of first.terms) for (const c of cuttersOf(b)) {
          const f = clipByPlanes(t.faces, c.planes);
          if (f.length) both.push({ s: t.s * c.s, faces: f });
        }
        if (op === "INTERSECTION") return solid(guard(both), 0, [...first.notes, ...b.notes]);
        if (op === "UNION") return solid(guard([...first.terms, ...b.terms, ...both.map((t) => ({ s: -t.s, faces: t.faces }))]), 0, [...first.notes, ...b.notes]);
        throw new Unresolved(`boolean ${op}`);
      }
      case "IFCMAPPEDITEM": {
        const map = this.get(a[0]);
        const origin = map.args[0] ? (this.get(map.args[0]).type.startsWith("IFCAXIS2PLACEMENT") ? this.placement(map.args[0]) : this.operator(map.args[0])) : IDENTITY;
        const target = this.operator(a[1]);
        const inner = this.representation(map.args[1], depth + 1);
        return transformSolid(inner, mul(target, origin));
      }
      case "IFCFACETEDBREP":
      case "IFCFACETEDBREPWITHVOIDS": {
        const parts = [{ s: 1, faces: this.shellLoops(a[0]) }];
        if (e.type === "IFCFACETEDBREPWITHVOIDS") for (const s of a[1] || []) parts.push({ s: -1, faces: this.shellLoops(s) });
        return faceted(parts);
      }
      case "IFCADVANCEDBREP":
      case "IFCADVANCEDBREPWITHVOIDS": {
        // faces on planes and cylinders, edges on lines, circles and
        // B-splines; each edge sampled once so neighbours share its points
        const parts = [{ s: 1, faces: this.advancedShellLoops(a[0]) }];
        if (e.type === "IFCADVANCEDBREPWITHVOIDS") for (const s of a[1] || []) parts.push({ s: -1, faces: this.advancedShellLoops(s) });
        return faceted(parts);
      }
      case "IFCSHELLBASEDSURFACEMODEL":
      case "IFCFACEBASEDSURFACEMODEL": {
        const parts = [];
        for (const s of a[0]) {
          const sh = this.get(s);
          if (sh.type !== "IFCCLOSEDSHELL" && sh.type !== "IFCCONNECTEDFACESET") throw new Unresolved("open shell");
          parts.push({ s: 1, faces: this.shellLoops(s) });
        }
        return faceted(parts, ["surface model read as closed shells"]);
      }
      case "IFCPOLYGONALFACESET":
      case "IFCTRIANGULATEDFACESET":
      case "IFCTRIANGULATEDIRREGULARNETWORK":
      {
        return faceted([{ s: 1, faces: this.faceSetLoops(e) }]);
      }
      case "IFCSWEPTDISKSOLID":
      case "IFCSWEPTDISKSOLIDPOLYGONAL": {
        if (a[3] != null || a[4] != null) throw new Unresolved("swept disk with trimmed directrix");
        const r = this.num(a[1]), ri = this.num(a[2]) ?? 0;
        const len = this.curveLength3(a[0]);
        return solid([], Math.PI * (r * r - ri * ri) * len);
      }
      case "IFCREVOLVEDAREASOLID": {
        // Pappus: area x path of the centroid
        const loops = this.profile(a[0]);
        const ax = this.get(a[2]);
        const p = this.point(ax.args[0]);
        const d = this.dir(ax.args[1], [0, 0, 1]);
        const ang = (this.num(a[3]) ?? 0) * this.angle;
        let v = 0;
        for (const l of loops) {
          const { A, cx, cy } = areaCentroid(l.pts);
          const rel = [cx - p[0], cy - p[1], -p[2]];
          const r = norm(cross(d, rel));
          v += l.s * Math.abs(A) * r * ang;
        }
        return solid([], Math.abs(v) * Math.abs(det(a[1] ? this.placement(a[1]) : IDENTITY)));
      }
      case "IFCCSGSOLID":
        return this.item(a[0], depth + 1);
      case "IFCBLOCK": {
        const m = this.placement(a[0]);
        const x = this.num(a[1]), y = this.num(a[2]), z = this.num(a[3]);
        return solid([{ s: 1, faces: transformPoly(prism([[0, 0], [x, 0], [x, y], [0, y]], [0, 0, z]), m) }]);
      }
      case "IFCRIGHTCIRCULARCYLINDER":
        return solid([], Math.PI * this.num(a[2]) ** 2 * this.num(a[1]));
      case "IFCSPHERE":
        return solid([], (4 / 3) * Math.PI * this.num(a[1]) ** 3);
      case "IFCRIGHTCIRCULARCONE":
        return solid([], (Math.PI / 3) * this.num(a[2]) ** 2 * this.num(a[1]));
      default:
        throw new Unresolved(`body ${e.type}`);
    }
  }

  difference(first, second, depth) {
    const a = second.args;
    if (second.type === "IFCHALFSPACESOLID" || second.type === "IFCBOXEDHALFSPACE" || second.type === "IFCPOLYGONALBOUNDEDHALFSPACE") {
      const plane = this.get(a[0]);
      if (plane.type !== "IFCPLANE") throw new Unresolved(`half space on ${plane.type}`);
      const m = this.placement(plane.args[0]);
      const p0 = [m[3], m[7], m[11]];
      const nrm = [m[2], m[6], m[10]];
      // AgreementFlag TRUE: the normal points away from the half space's
      // material, so what is kept lies on the normal side.
      const s = a[1] === false ? -1 : 1;
      if (second.type === "IFCBOXEDHALFSPACE" && a[2]) {
        // Revit writes the box as the extent of the cut: what is removed is
        // the half space's material inside the box (the box in the base
        // plane's coordinates). HHS Office: a 3,115 mm wall clipped to the
        // stored 3,000 mm only this way (eval/stored-vs-computed-2026-11-19.md).
        const box = this.get(a[2]);
        const c = this.point(box.args[0]);
        const dims = [this.num(box.args[1]), this.num(box.args[2]), this.num(box.args[3])];
        const axes = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
        const corner = apply(m, c);
        const planes = [[mulS(nrm, s), dot(mulS(nrm, s), p0)]];
        for (let i = 0; i < 3; i++) {
          planes.push([mulS(axes[i], -1), -dot(axes[i], corner)]);
          planes.push([axes[i], dot(axes[i], corner) + dims[i]]);
        }
        return subtractCutters(first, [{ s: 1, planes }], "boxed half-space clip");
      }
      if (second.type !== "IFCPOLYGONALBOUNDEDHALFSPACE") {
        const n = mulS(nrm, -s);
        const k = dot(n, p0);
        const terms = [];
        for (const t of first.terms) {
          const f = clipPoly(t.faces, n, k);
          if (f.length) terms.push({ s: t.s, faces: f });
        }
        const notes = first.notes.slice();
        if (first.mesh) notes.push("half-space clip not taken from a faceted part");
        return solid(terms, first.mesh, notes, first.mesh ? null : []);
      }
      // removed: the half space's material inside the boundary's prism
      const bm = this.placement(a[2]);
      const loop = closeLoop(this.curve(a[3]));
      const material = [mulS(nrm, s), dot(mulS(nrm, s), p0)];
      const axis = [bm[2], bm[6], bm[10]];
      const cutters = [];
      for (const piece of convexPieces(loop)) {
        const planes = [material];
        const pts = piece.pts;
        for (let i = 0; i < pts.length; i++) {
          const p = apply(bm, [pts[i][0], pts[i][1], 0]);
          const q = apply(bm, [pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], 0]);
          const out = unit(cross(sub(q, p), axis));
          if (out) planes.push([out, dot(out, p)]);
        }
        cutters.push({ s: piece.s, planes });
      }
      return subtractCutters(first, cutters, "bounded half-space clip");
    }
    const b0 = this.item(second.id, depth + 1);
    const b = asTerms(b0);
    if (!b) throw new Unresolved("difference with a faceted solid");
    return subtractCutters(first, cuttersOf(b), "boolean difference");
  }

  /** A shell's faces, each a list of point loops (outer and inner bounds), inner bounds reversed as the file asks. */
  shellLoops(ref) {
    const sh = this.get(ref);
    const faces = [];
    for (const fref of sh.args[0]) {
      const f = this.get(fref);
      const face = [];
      for (const bref of f.args[0]) {
        const b = this.get(bref);
        const loop = this.get(b.args[0]);
        if (loop.type !== "IFCPOLYLOOP") throw new Unresolved(`face bound ${loop.type}`);
        let pts = loop.args[0].map((p) => this.point(p));
        if (b.args[1] === false) pts = pts.slice().reverse();
        face.push(pts);
      }
      faces.push(face);
    }
    return faces;
  }

  /**
   * An advanced brep's shell as faces of point loops: a face on a plane gives
   * its edge loops (outer and inner bounds, as in shellLoops); a face on a
   * cylinder is cut into triangles in the surface's (angle, height) space,
   * with no points but its boundary's, so the triangles meet their
   * neighbours edge to edge. Other surfaces are not read.
   */
  advancedShellLoops(ref) {
    const sh = this.get(ref);
    // a shell is read once (mapped items repeat it); the loops are never changed in place
    this.shellCache ??= new Map();
    if (this.shellCache.has(sh.id)) return this.shellCache.get(sh.id);
    const out = [];
    this.edgeCache ??= new Map();
    for (const fref of sh.args[0]) {
      const f = this.get(fref);
      const surf = this.get(f.args[1]);
      const bounds = f.args[0].map((bref) => {
        const b = this.get(bref);
        const loop = this.get(b.args[0]);
        let pts;
        if (loop.type === "IFCPOLYLOOP") pts = loop.args[0].map((p) => this.point(p));
        else if (loop.type === "IFCEDGELOOP") pts = this.edgeLoopPoints(loop);
        else throw new Unresolved(`face bound ${loop.type}`);
        return b.args[1] === false ? pts.slice().reverse() : pts;
      });
      if (surf.type === "IFCPLANE") { out.push(bounds); continue; }
      if (surf.type === "IFCCYLINDRICALSURFACE") { for (const t of this.cylinderTriangles(surf, bounds)) out.push([t]); continue; }
      for (const t of this.surfaceTriangles(surf, bounds)) out.push([t]);
    }
    this.shellCache.set(sh.id, out); // only once read whole
    return out;
  }

  edgeLoopPoints(loop) {
    const pts = [];
    for (const oref of loop.args[0]) {
      const oe = this.get(oref);
      const ec = this.get(oe.args[2]);
      if (ec.type !== "IFCEDGECURVE") throw new Unresolved(`edge ${ec.type}`);
      let e = this.edgeCache.get(ec.id);
      if (!e) { e = this.edgePoints(ec); this.edgeCache.set(ec.id, e); }
      const run = oe.args[3] === false ? e.slice().reverse() : e;
      for (let i = 0; i + 1 < run.length; i++) pts.push(run[i]);
    }
    return pts;
  }

  /** An edge's points from its start vertex to its end vertex, both included. */
  edgePoints(ec) {
    const p0 = this.point(this.get(ec.args[0]).args[0]);
    const p1 = this.point(this.get(ec.args[1]).args[0]);
    let c = this.get(ec.args[2]);
    let sense = ec.args[3] !== false;
    if (c.type === "IFCTRIMMEDCURVE") { if (c.args[3] === false) sense = !sense; c = this.get(c.args[0]); }
    if (c.type === "IFCLINE") return [p0, p1];
    if (c.type === "IFCPOLYLINE") {
      const q = c.args[0].map((r) => this.point(r));
      if (!sense) q.reverse();
      q[0] = p0; q[q.length - 1] = p1;
      return q;
    }
    if (c.type === "IFCCIRCLE" || c.type === "IFCELLIPSE") {
      const m = this.placement(c.args[0]);
      const r1 = this.num(c.args[1]), r2 = c.type === "IFCELLIPSE" ? this.num(c.args[2]) : r1;
      const o = [m[3], m[7], m[11]], x = [m[0], m[4], m[8]], y = [m[1], m[5], m[9]];
      const ang = (p) => { const d = sub(p, o); return Math.atan2(dot(d, y) / r2, dot(d, x) / r1); };
      const a0 = ang(p0);
      let d = ang(p1) - a0;
      if (!sense) d = -d;
      d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (d < 1e-9) d = 2 * Math.PI; // a closed edge: start and end vertex the same
      const n = Math.max(1, Math.ceil((d / (2 * Math.PI)) * ARC_SEGS));
      const out = [p0];
      for (let i = 1; i < n; i++) {
        const t = a0 + (sense ? 1 : -1) * (d * i) / n;
        out.push(add(o, add(mulS(x, r1 * Math.cos(t)), mulS(y, r2 * Math.sin(t)))));
      }
      out.push(p1);
      return out;
    }
    if (c.type === "IFCBSPLINECURVEWITHKNOTS" || c.type === "IFCRATIONALBSPLINECURVEWITHKNOTS") {
      const q = bsplinePoints(c.args[1].map((r) => this.point(r)), this.num(c.args[0]),
        c.args[5].map((v) => this.num(v)), c.args[6].map((v) => this.num(v)),
        c.type === "IFCRATIONALBSPLINECURVEWITHKNOTS" ? c.args[8].map((v) => this.num(v)) : null);
      if (!sense) q.reverse();
      // the edge must run the whole curve: its ends are the vertices
      const tol = 1e-6 * (scaleOf([q]) + 1);
      if (norm(sub(q[0], p0)) > tol * 1e3 || norm(sub(q[q.length - 1], p1)) > tol * 1e3) throw new Unresolved("edge on part of a B-spline");
      q[0] = p0; q[q.length - 1] = p1;
      return q;
    }
    throw new Unresolved(`edge curve ${c.type}`);
  }

  /** A cylindrical face's bounds cut into triangles (3D point loops). */
  cylinderTriangles(surf, bounds) {
    const m = this.placement(surf.args[0]);
    const r = this.num(surf.args[1]);
    const inv = invert(m);
    const param = (pts) => {
      const uv = [];
      let prev = null, t = 0;
      for (const p of pts) {
        const q = apply(inv, p);
        const a = Math.atan2(q[1], q[0]);
        if (prev == null) t = a;
        else { let d = a - prev; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); t += d; }
        prev = a;
        uv.push([t, q[2]]);
      }
      // the turn back to the first point closes the loop
      let d = Math.atan2(apply(inv, pts[0])[1], apply(inv, pts[0])[0]) - prev;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      const winding = Math.round((t + d - uv[0][0]) / (2 * Math.PI));
      return { uv, winding };
    };
    const P = bounds.map((pts) => ({ pts, ...param(pts) }));
    if (P.length === 1 && P[0].winding === 0) {
      const { pts, uv } = P[0];
      // Triangles must join points of nearly the same angle: lifted back on
      // the cylinder a triangle is a chord, and a long one cuts through the
      // solid (ear clipping a half cylinder fanned it from one corner: 2.4
      // times its area, the keyhole rosettes of kleine_Wohnung 35% light).
      const z = zipMonotone(uv, pts);
      if (z) return z;
      return earClip(uv.map(([t, h]) => [r * t, h])).map(([i, j, k]) => [pts[i], pts[j], pts[k]]);
    }
    if (P.length === 2 && Math.abs(P[0].winding) === 1 && Math.abs(P[1].winding) === 1) return zipBand(P);
    if (P.length === 1) return this.surfaceTriangles(surf, bounds);
    throw new Unresolved("cylindrical face bounds not read");
  }

  /**
   * A surface's parameter map: at(u, v) -> point, uv(p, prev) -> [u, v] (prev
   * the last point's, for continuity), and the period of each parameter (0
   * when it has none). Surfaces of revolution (line or circle profile, in a
   * plane through the axis), of linear extrusion, B-spline surfaces (rational
   * too) and cylinders; anything else is not read.
   */
  surfaceMap(surf) {
    this.surfaceCache ??= new Map();
    if (this.surfaceCache.has(surf.id)) return this.surfaceCache.get(surf.id);
    const a = surf.args;
    const TAU = 2 * Math.PI;
    let map;
    if (surf.type === "IFCCYLINDRICALSURFACE") {
      const m = this.placement(a[0]), inv = invert(m), r = this.num(a[1]);
      map = {
        at: (u, v) => apply(m, [r * Math.cos(u), r * Math.sin(u), v]),
        uv: (p) => { const q = apply(inv, p); return [Math.atan2(q[1], q[0]), q[2]]; },
        periods: [TAU, 0],
      };
    } else if (surf.type === "IFCSURFACEOFREVOLUTION") {
      const pos = a[1] ? this.placement(a[1]) : IDENTITY;
      const ax = this.get(a[2]);
      const A = apply(pos, this.point(ax.args[0]));
      const D = unit(applyDir(pos, this.dir(ax.args[1], [0, 0, 1])));
      const prof = this.get(a[0]);
      if (prof.type !== "IFCARBITRARYOPENPROFILEDEF") throw new Unresolved(`revolved ${prof.type}`);
      let c = this.get(prof.args[2]);
      while (c.type === "IFCTRIMMEDCURVE") c = this.get(c.args[0]);
      // the meridian frame: X0 towards the profile, Y0 = D x X0
      const toRH = (p, X0, Y0) => { const q = sub(p, A); const h = dot(q, D); const x = dot(q, X0), y = dot(q, Y0); return [Math.hypot(x, y), h, Math.atan2(y, x)]; };
      let ref, meridian, period = 0;
      if (c.type === "IFCLINE") {
        const L0 = apply(pos, this.point(c.args[0]));
        const vec = this.get(c.args[1]);
        const Ld = mulS(applyDir(pos, this.dir(vec.args[0], [1, 0, 0])), this.num(vec.args[1]) ?? 1);
        ref = sub(L0, A);
        if (norm(sub(ref, mulS(D, dot(ref, D)))) < 1e-12) ref = add(ref, Ld);
        meridian = { L0, Ld };
      } else if (c.type === "IFCCIRCLE") {
        const m = mul(pos, this.placement(c.args[0]));
        const C = [m[3], m[7], m[11]], N = [m[2], m[6], m[10]];
        ref = sub(C, A);
        if (Math.abs(dot(N, D)) > 1e-6) throw new Unresolved("revolved circle not in a plane through the axis");
        meridian = { C, rho: this.num(c.args[1]) };
        period = TAU;
      } else throw new Unresolved(`revolved ${c.type}`);
      const X0 = unit(sub(ref, mulS(D, dot(ref, D))));
      if (!X0) throw new Unresolved("revolved profile on the axis");
      const Y0 = cross(D, X0);
      const lift = (th, r, h) => add(A, add(mulS(D, h), add(mulS(X0, r * Math.cos(th)), mulS(Y0, r * Math.sin(th)))));
      if (meridian.Ld) {
        // the profile in the meridian half-plane through X0: r signed there,
        // so a line running towards the axis keeps its direction
        const inPlane = (p) => [dot(sub(p, A), X0), dot(sub(p, A), D)];
        const p0 = inPlane(meridian.L0), p1 = inPlane(add(meridian.L0, meridian.Ld));
        // a line skew to the axis sweeps a hyperboloid, not read
        if (Math.abs(dot(cross(sub(meridian.L0, A), meridian.Ld), D)) > 1e-9 * (norm(meridian.Ld) * (norm(sub(meridian.L0, A)) + 1))) throw new Unresolved("revolved line skew to the axis");
        const dr = p1[0] - p0[0], dh = p1[1] - p0[1], l2 = dr * dr + dh * dh;
        map = {
          at: (th, s) => lift(th, p0[0] + s * dr, p0[1] + s * dh),
          uv: (p) => { const [r, h, th] = toRH(p, X0, Y0); return [th, ((r - p0[0]) * dr + (h - p0[1]) * dh) / l2]; },
          periods: [TAU, 0],
        };
      } else {
        const rc = dot(sub(meridian.C, A), X0), hc = dot(sub(meridian.C, A), D), rho = meridian.rho;
        map = {
          at: (th, phi) => lift(th, rc + rho * Math.cos(phi), hc + rho * Math.sin(phi)),
          uv: (p) => { const [r, h, th] = toRH(p, X0, Y0); return [th, Math.atan2(h - hc, r - rc)]; },
          periods: [TAU, period],
        };
      }
    } else if (surf.type === "IFCSURFACEOFLINEAREXTRUSION" || surf.type === "IFCBSPLINESURFACEWITHKNOTS" || surf.type === "IFCRATIONALBSPLINESURFACEWITHKNOTS") {
      let S;
      if (surf.type === "IFCSURFACEOFLINEAREXTRUSION") {
        const pos = a[1] ? this.placement(a[1]) : IDENTITY;
        const prof = this.get(a[0]);
        if (prof.type !== "IFCARBITRARYOPENPROFILEDEF") throw new Unresolved(`extruded ${prof.type}`);
        const C = this.curveMap(prof.args[2]);
        const d = applyDir(pos, mulS(this.dir(a[2], [0, 0, 1]), 1));
        const depth = this.num(a[3]) ?? 1;
        S = { at: (u, v) => add(apply(pos, C.at(u)), mulS(d, v)), domain: [[C.u0, C.u1], [-depth, 2 * depth]] };
      } else {
        const rows = a[2].map((row) => row.map((r) => this.point(r)));
        const W = surf.type === "IFCRATIONALBSPLINESURFACEWITHKNOTS" ? a[12].map((row) => row.map((w) => this.num(w))) : null;
        const n = (l) => l.map((v) => this.num(v));
        S = bsplineSurface(rows, this.num(a[0]), this.num(a[1]), n(a[7]), n(a[8]), n(a[9]), n(a[10]), W);
      }
      const grid = surfaceGrid(S);
      map = { at: S.at, uv: (p, prev) => { const r = invertSurface(S, p, prev, grid); return [r[0], r[1]]; }, periods: [0, 0] };
    } else throw new Unresolved(`advanced face on ${surf.type}`);
    this.surfaceCache.set(surf.id, map);
    return map;
  }

  /** A profile curve as at(u) over [u0, u1]: B-spline curves (rational too). */
  curveMap(ref) {
    let c = this.get(ref);
    while (c.type === "IFCTRIMMEDCURVE") c = this.get(c.args[0]);
    if (c.type === "IFCBSPLINECURVEWITHKNOTS" || c.type === "IFCRATIONALBSPLINECURVEWITHKNOTS") {
      return bsplineCurve(c.args[1].map((r) => this.point(r)), this.num(c.args[0]),
        c.args[5].map((v) => this.num(v)), c.args[6].map((v) => this.num(v)),
        c.type === "IFCRATIONALBSPLINECURVEWITHKNOTS" ? c.args[8].map((v) => this.num(v)) : null);
    }
    throw new Unresolved(`extruded ${c.type}`);
  }

  /**
   * A face on a curved surface cut into triangles (3D point loops): its one
   * bound taken to the surface's (u, v), ear clipped there, and every edge
   * inside the face halved until its midpoint on the surface lies within
   * 2e-5 of the face's size of the straight edge. Boundary points are kept as
   * they are, so the face meets its neighbours point for point.
   */
  surfaceTriangles(surf, bounds) {
    if (bounds.length !== 1) throw new Unresolved(`face with ${bounds.length} bounds on ${surf.type}`);
    const S = this.surfaceMap(surf);
    const pts = bounds[0].slice();
    let n = pts.length;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) { lo = lo.map((x, k) => Math.min(x, p[k])); hi = hi.map((x, k) => Math.max(x, p[k])); }
    const size = norm(sub(hi, lo));
    const uv = [];
    let prev = null;
    for (const p of pts) {
      let q = S.uv(p, prev);
      if (prev) q = q.map((x, k) => (S.periods[k] ? prev[k] + wrapTo(x - prev[k], S.periods[k]) : x));
      uv.push(q);
      prev = q;
    }
    for (let k = 0; k < 2; k++) {
      if (!S.periods[k]) continue;
      const total = uv[n - 1][k] - uv[0][k] + wrapTo(uv[0][k] - uv[n - 1][k], S.periods[k]);
      if (Math.abs(total) > S.periods[k] / 2) throw new Unresolved(`face round a closed ${surf.type}`);
    }
    // A pole: a boundary point where the surface pinches (all of one
    // parameter's line maps to one point, as at the tip of a ruled B-spline
    // face that narrows to a point). Its (u, v) is a whole segment, which the
    // loop must run along: the point is written twice, at the pinched
    // parameter of the point before it and of the point after it.
    {
      const h = 1e-6;
      const scaleAt = (q, k) => { const d = k ? [0, h] : [h, 0]; return norm(sub(S.at(q[0] + d[0], q[1] + d[1]), S.at(q[0] - d[0], q[1] - d[1]))) / (2 * h); };
      const ref = [0, 1].map((k) => Math.max(...uv.map((q) => scaleAt(q, k))));
      for (let i = n - 1; i >= 0; i--) {
        for (let k = 0; k < 2; k++) {
          if (scaleAt(uv[i], k) > 1e-6 * ref[k]) continue;
          const a = uv[(i + n - 1) % n], b = uv[(i + 1) % n];
          const q0 = uv[i].slice(), q1 = uv[i].slice();
          q0[k] = a[k]; q1[k] = b[k];
          uv.splice(i, 1, q0, q1);
          pts.splice(i, 1, pts[i], pts[i]);
          break;
        }
      }
      n = pts.length;
    }
    // every boundary point must lie on the surface: within 1e-3 of the face's
    // size, as exporters write B-spline edges that only approximate a circle
    // (kleine_Wohnung's ruled B-spline faces sit 2e-4 of their size off
    // their circular edges); the triangles keep the boundary points as given
    let off = 0;
    for (let i = 0; i < n; i++) off = Math.max(off, norm(sub(S.at(uv[i][0], uv[i][1]), pts[i])));
    if (off > 1e-3 * size + 1e-9) throw new Unresolved(`face bound off its ${surf.type}`);
    // parameter scales at the middle, so the ear clipping sees lengths
    const mid = [uv.reduce((s, q) => s + q[0], 0) / n, uv.reduce((s, q) => s + q[1], 0) / n];
    const h = 1e-6;
    const P0 = S.at(mid[0], mid[1]);
    const su = norm(sub(S.at(mid[0] + h, mid[1]), P0)) / h || 1, sv = norm(sub(S.at(mid[0], mid[1] + h), P0)) / h || 1;
    // a loop monotone in u (or v) is walked by that parameter, so triangles
    // join nearby points (as on a cylinder); ear clipping only otherwise
    const triangulate = [
      (q, ids) => zipMonotone(q, ids),
      (q, ids) => zipMonotone(q.map(([u, v]) => [v, u]), ids),
      (q, ids) => earClip(q.map(([u, v]) => [u * su, v * sv])).map((t) => t.map((i) => ids[i])),
    ];
    const V3 = pts.slice(), UV = uv.map((q) => q.slice());
    let out;
    try {
      out = meshFace(V3, UV, S.at, triangulate, { tol: 2e-4 * size, maxLen: size / 4, su, sv, maxTris: 60000 });
    } catch (err) { throw new Unresolved(`face on ${surf.type} not cut into triangles: ${err.message}`); }
    // a triangle on a pole's two copies has no area: dropped, its other two
    // edges then pair with their neighbours' at the one point
    return out.map(([i, j, k]) => [V3[i], V3[j], V3[k]]).filter(([a, b, c]) => a !== b && b !== c && a !== c);
  }

  faceSetLoops(e) {
    const a = e.args;
    const P = this.get(a[0]).args[0].map((c) => [this.num(c[0]), this.num(c[1]), this.num(c[2])]);
    const loops = [];
    const group = []; // the loop index of each loop's outer bound
    if (e.type === "IFCPOLYGONALFACESET") {
      for (const fref of a[2]) {
        const f = this.get(fref);
        loops.push(f.args[0].map((i) => this.num(i)));
        group.push(loops.length - 1);
        if (f.type === "IFCINDEXEDPOLYGONALFACEWITHVOIDS") for (const inner of f.args[1]) { loops.push(inner.map((i) => this.num(i)).reverse()); group.push(group[group.length - 1]); }
      }
      if (a[3]) {
        const pn = a[3].map((i) => this.num(i));
        for (let i = 0; i < loops.length; i++) loops[i] = loops[i].map((j) => pn[j - 1]);
      }
    } else {
      const ci = e.type === "IFCTRIANGULATEDFACESET" ? a[3] : a[3];
      for (const t of ci) loops.push(t.map((i) => this.num(i)));
      const pnAt = e.type === "IFCTRIANGULATEDFACESET" ? a[4] : null;
      if (pnAt) {
        const pn = pnAt.map((i) => this.num(i));
        for (let i = 0; i < loops.length; i++) loops[i] = loops[i].map((j) => pn[j - 1]);
      }
    }
    const pts = loops.map((l) => l.map((i) => P[i - 1]));
    if (!group.length) return pts;
    // a face with voids keeps its loops together (orientLoops)
    const faces = [];
    pts.forEach((l, i) => { if (group[i] === i) faces.push([l]); else faces[faces.length - 1].push(l); });
    return faces;
  }

  curveLength3(ref) {
    const e = this.get(ref);
    if (e.type === "IFCPOLYLINE") {
      const pts = e.args[0].map((p) => this.point(p));
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += norm(sub(pts[i], pts[i - 1]));
      return L;
    }
    if (e.type === "IFCINDEXEDPOLYCURVE") {
      const pl = this.get(e.args[0]);
      const pts = pl.args[0].map((c) => [this.num(c[0]), this.num(c[1]), this.num(c[2]) ?? 0]);
      if (e.args[1]) throw new Unresolved("indexed directrix with segments");
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += norm(sub(pts[i], pts[i - 1]));
      return L;
    }
    if (e.type === "IFCCOMPOSITECURVE") {
      let L = 0;
      for (const s of e.args[0]) L += this.curveLength3(this.get(s).args[2]);
      return L;
    }
    if (e.type === "IFCTRIMMEDCURVE") {
      const pts = this.curve(ref);
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return L;
    }
    throw new Unresolved(`directrix ${e.type}`);
  }

  /** An IfcShapeRepresentation's items as one solid. */
  representation(ref, depth = 0) {
    const r = this.get(ref);
    const terms = [];
    let mesh = 0;
    let shells = [];
    const notes = [];
    let axis = null, axisWeight = -1;
    let joined = 0, unjoined = 0;
    for (const it of r.args[3]) {
      const s = this.item(it, depth + 1);
      // the body is the union of its items: where two overlap (a cabinet's
      // carcass and doors drawn as solids that run into each other, a door
      // leaf set into its frame) the shared part counts once, A + B - (A n B)
      const u = !s.mesh && terms.length && s.terms.length ? unionTerms(terms, s.terms) : null;
      if (u === false) unjoined++;
      else if (u && u.length) { joined++; terms.push(...u); }
      terms.push(...s.terms);
      mesh += s.mesh;
      shells = shells && s.shells ? shells.concat(s.shells) : null;
      notes.push(...s.notes);
      if (s.axis && (s.axisWeight ?? 0) > axisWeight) { axis = s.axis; axisWeight = s.axisWeight ?? 0; }
    }
    if (joined) notes.push(`${joined} overlapping body item${joined > 1 ? "s" : ""} joined: the shared part counted once`);
    if (unjoined) notes.push(`${unjoined} body item${unjoined > 1 ? "s" : ""} too detailed to join: any overlap with the others is counted twice`);
    const out = solid(guard(terms), mesh, notes, shells);
    if (axis) { out.axis = axis; out.axisWeight = axisWeight; }
    return out;
  }
}

// terms a union adds for the part two term lists share
export const MAX_UNION_TERMS = 4000;
const termBox = (t) => {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const f of t.faces) for (const p of f) for (let i = 0; i < 3; i++) { if (p[i] < b[i]) b[i] = p[i]; if (p[i] > b[i + 3]) b[i + 3] = p[i]; }
  return b;
};

/**
 * The terms to add to A's for A u B to be A + B - (A n B): each pair of
 * terms whose boxes share a volume, intersected, with the product's sign
 * negated. Exact while A and B are each a solid (their terms sum to 0 or 1
 * at every point). [] when nothing is shared; false when the shared part
 * would take more than MAX_UNION_TERMS terms (the caller keeps the plain sum).
 */
export function unionTerms(A, B) {
  const bb = B.map(termBox);
  const all = termBox({ faces: B.flatMap((t) => t.faces) });
  const out = [];
  for (const a of A) {
    const ab = termBox(a);
    const e = 1e-9 * Math.max(ab[3] - ab[0], ab[4] - ab[1], ab[5] - ab[2], 1e-300);
    const apart = (b) => ab[0] >= b[3] - e || b[0] >= ab[3] - e || ab[1] >= b[4] - e || b[1] >= ab[4] - e || ab[2] >= b[5] - e || b[2] >= ab[5] - e;
    if (apart(all)) continue;
    const va = Math.abs(polyVolume(a.faces));
    let planes = null;
    for (let j = 0; j < B.length; j++) {
      if (apart(bb[j])) continue;
      planes ??= polyPlanes(a.faces);
      const f = clipByPlanes(B[j].faces, planes);
      if (f.length < 4) continue;
      // a shared face or edge (items that only touch) is no volume
      if (Math.abs(polyVolume(f)) <= 1e-9 * Math.min(va, Math.abs(polyVolume(B[j].faces)))) continue;
      out.push({ s: -a.s * B[j].s, faces: f });
      if (out.length > MAX_UNION_TERMS) return false;
    }
  }
  return out;
}

// ---- orienting faceted shells -----------------------------------------------

const pkey = (p) => `${p[0]},${p[1]},${p[2]}`;

/**
 * Turns faces so neighbours run their shared edge in opposite directions (a
 * consistently oriented shell), starting from each connected piece's first
 * face. Returns { faces, flipped, closed }: closed is false when an edge is
 * used by one face only or by more than two, or when no consistent turn
 * exists (a Moebius-like or self-touching shell); such a shell cannot be cut.
 */
export function orientShell(faces0) {
  const faces = faces0.map((f) => f.map((l) => l.slice()));
  const edges = new Map(); // undirected key -> [{face, forward}]
  // each point object keyed once: equal coordinates, one integer id
  const ids = new Map(), seen = new Map();
  const idOf = (p) => {
    let id = seen.get(p);
    if (id === undefined) {
      const k = pkey(p);
      id = ids.get(k);
      if (id === undefined) ids.set(k, (id = ids.size));
      seen.set(p, id);
    }
    return id;
  };
  faces.forEach((f, fi) => {
    for (const l of f) for (let i = 0; i < l.length; i++) {
      const a = idOf(l[i]), b = idOf(l[(i + 1) % l.length]);
      if (a === b) continue;
      const fwd = a < b;
      const key = fwd ? a * 67108864 + b : b * 67108864 + a;
      let e = edges.get(key);
      if (!e) edges.set(key, (e = []));
      e.push({ fi, fwd });
    }
  });
  let closed = true;
  const adj = faces.map(() => []);
  for (const e of edges.values()) {
    if (e.length !== 2) { closed = false; continue; }
    const [p, q] = e;
    if (p.fi === q.fi) continue;
    // same direction on both sides: one of the two must turn
    const mustFlip = p.fwd === q.fwd;
    adj[p.fi].push([q.fi, mustFlip]);
    adj[q.fi].push([p.fi, mustFlip]);
  }
  const turn = new Array(faces.length).fill(null);
  const piece = new Array(faces.length).fill(-1);
  let pieces = 0;
  let flipped = 0;
  for (let s = 0; s < faces.length; s++) {
    if (turn[s] !== null) continue;
    turn[s] = false;
    piece[s] = pieces;
    const stack = [s];
    while (stack.length) {
      const i = stack.pop();
      for (const [j, mustFlip] of adj[i]) {
        const want = turn[i] !== mustFlip;
        if (turn[j] === null) { turn[j] = want; piece[j] = pieces; stack.push(j); } else if (turn[j] !== want) closed = false;
      }
    }
    pieces++;
  }
  for (let i = 0; i < faces.length; i++) if (turn[i]) { faces[i] = faces[i].map((l) => l.slice().reverse()); flipped++; }
  return { faces, flipped, closed, piece, pieces, turned: turn };
}

/**
 * A shell's faces turned to agree with their neighbours. Each face is a list
 * of loops: its outer bound and any inner bounds. The loops of one face turn
 * together, an inner bound kept running against its outer bound (by their
 * Newell normals, whatever the file's orientation flags say): an inner bound
 * shares its edges with the hole's walls, not with its outer bound, so a
 * shell with a hole through a face (a stepped opening, a box with a hole)
 * falls into pieces that meet only through such faces, and turned one loop
 * at a time the pieces could come out turned against each other. Faces may
 * also be given as bare loops (one loop each). Returns { loops, flipped,
 * closed }: loops flattened; flipped counts the faces that end up reversed
 * from the file once the shell is also turned outward, 0 when the whole
 * shell was simply written inside out. A shell that is not closed keeps its
 * loops as given.
 */
export function orientLoops(faces0) {
  const faces = faces0.map((f) => (Array.isArray(f[0]?.[0]) ? matchInnerBounds(f) : [f]));
  const flat = (fs) => fs.flat();
  const o = orientShell(faces);
  if (!o.closed) return { loops: flat(faces), flipped: 0, closed: false };
  let out = o.faces;
  let flipped = o.flipped;
  let overlaps = 0;
  if (o.pieces > 1) {
    // A shell in several pieces (lumps one exporter wrote as one shell):
    // each piece was turned from its own first face, so each is turned
    // outward by itself; a void comes as its own shell, never as a piece.
    const box = Array.from({ length: o.pieces }, () => [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]);
    const vol = new Array(o.pieces).fill(0);
    out.forEach((f, i) => {
      const b = box[o.piece[i]];
      vol[o.piece[i]] += shellVolume(f);
      for (const l of f) for (const p of l) for (let k = 0; k < 3; k++) { if (p[k] < b[0][k]) b[0][k] = p[k]; if (p[k] > b[1][k]) b[1][k] = p[k]; }
    });
    out = out.map((f, i) => (vol[o.piece[i]] >= 0 ? f : f.map((l) => l.slice().reverse())));
    // pieces whose boxes share a volume may overlap: the overlap then counts once for each
    const size = (b) => Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]);
    for (let a = 0; a < o.pieces; a++) for (let b = a + 1; b < o.pieces; b++) {
      const A = box[a], B = box[b];
      const tol = 1e-6 * Math.max(size(A), size(B));
      let inter = 1;
      for (let k = 0; k < 3; k++) inter *= Math.max(0, Math.min(A[1][k], B[1][k]) - Math.max(A[0][k], B[0][k]) - tol);
      if (inter > 0) overlaps++;
    }
    flipped = 0;
    for (let i = 0; i < faces.length; i++) if (o.turned[i] !== (vol[o.piece[i]] < 0)) flipped++;
  } else if (shellVolume(flat(out)) < 0) { out = out.map((f) => f.map((l) => l.slice().reverse())); flipped = faces.length - flipped; }
  if (flipped === faces.length) flipped = 0;
  return { loops: flat(out), flipped, closed: true, pieces: o.pieces, overlaps };
}

function newell(l) {
  let n = [0, 0, 0];
  for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return n;
}

/** A face's loops with every inner bound running against the outer (the largest). */
function matchInnerBounds(face) {
  if (face.length < 2) return face;
  const ns = face.map(newell);
  let o = 0;
  ns.forEach((n, i) => { if (norm(n) > norm(ns[o])) o = i; });
  return face.map((l, i) => (i !== o && dot(ns[i], ns[o]) > 0 ? l.slice().reverse() : l));
}

/**
 * The faceted solid of some shells (sign +1 material, -1 a void): each
 * oriented, its volume from the oriented faces. Any shell not closed leaves
 * the solid without a section (its volume is kept as before).
 */
function faceted(parts, notes = []) {
  let v = 0, flipped = 0, open = false;
  const shells = [];
  let overlaps = 0;
  for (const { s, faces } of parts) {
    const o = orientLoops(faces);
    overlaps += o.overlaps ?? 0;
    const vs = shellVolume(o.loops);
    v += s * Math.abs(vs);
    flipped += o.flipped;
    open ||= !o.closed;
    shells.push({ s: s * (Math.sign(vs) || 1), loops: o.loops });
  }
  const n = notes.slice();
  if (flipped) n.push(`${flipped} face${flipped === 1 ? "" : "s"} of a faceted body turned to match their neighbours`);
  if (overlaps) n.push(`a shell in pieces that may overlap: any overlap is counted once for each piece`);
  return solid([], v, n, open ? null : shells);
}

/**
 * The same solid with its faceted part as polyhedral terms, so an opening, a
 * clip or a boolean can be taken from it exactly; null when its faces are not
 * all known (no shells) or it would take more than `limit` terms. A closed
 * convex shell is one term. Any other closed shell is a signed sum of
 * tetrahedra: every face fanned into triangles, each coned to the shell's
 * centre of vertices; the cones' signed indicator functions add up to the
 * shell's (as the fanned triangles of a concave profile do), so volumes,
 * sections and intersections stay exact. Volume and notes are unchanged.
 */
export function asTerms(s, limit = 4000) {
  if (!s.mesh) return s;
  if (!s.shells) return null;
  const terms = s.terms.slice();
  for (const sh of s.shells) {
    if (isConvexShell(sh.loops)) { terms.push({ s: sh.s, faces: sh.loops }); continue; }
    let c = [0, 0, 0], k = 0;
    for (const f of sh.loops) for (const p of f) { c = add(c, p); k++; }
    c = mulS(c, 1 / k);
    for (const f of sh.loops) {
      for (let i = 1; i + 1 < f.length; i++) {
        const a = f[0], b = f[i], d = f[i + 1];
        const v = dot(sub(a, c), cross(sub(b, c), sub(d, c)));
        if (Math.abs(v) <= 1e-12 * (norm(sub(a, c)) * norm(sub(b, c)) * norm(sub(d, c)) + 1e-300)) continue;
        const [p, q, r] = v > 0 ? [a, b, d] : [a, d, b];
        terms.push({ s: sh.s * Math.sign(v), faces: [[p, q, r], [c, q, p], [c, r, q], [c, p, r]] });
        if (terms.length > limit) return null;
      }
    }
  }
  const out = solid(terms, 0, s.notes);
  if (s.axis) { out.axis = s.axis; out.axisWeight = s.axisWeight; }
  return out;
}

/** True when every vertex of an outward-oriented closed shell lies on the inner side of every face's plane. */
export function isConvexShell(loops) {
  const planes = polyPlanes(loops);
  if (planes.length < 4) return false;
  const eps = 1e-7 * (scaleOf(loops) + 1);
  for (const [nn, k] of planes) for (const f of loops) for (const p of f) if (dot(nn, p) - k > eps) return false;
  return true;
}

/**
 * Points along a B-spline (de Boor), from its first parameter to its last:
 * 16 to a knot span. knots and mults as the file gives them; weights for a
 * rational curve.
 */
export function bsplinePoints(cp, p, mults, knots, weights = null) {
  const U = [];
  knots.forEach((k, i) => { for (let j = 0; j < mults[i]; j++) U.push(k); });
  const n = cp.length;
  const H = cp.map((c, i) => { const w = weights ? weights[i] : 1; return [c[0] * w, c[1] * w, c[2] * w, w]; });
  const at = (u) => {
    let k = p;
    while (k < n - 1 && u >= U[k + 1]) k++;
    const d = [];
    for (let j = 0; j <= p; j++) d.push(H[k - p + j].slice());
    for (let rr = 1; rr <= p; rr++) {
      for (let j = p; j >= rr; j--) {
        const i = k - p + j;
        const den = U[i + p - rr + 1] - U[i];
        const al = den ? (u - U[i]) / den : 0;
        for (let c = 0; c < 4; c++) d[j][c] = (1 - al) * d[j - 1][c] + al * d[j][c];
      }
    }
    const h = d[p];
    return [h[0] / h[3], h[1] / h[3], h[2] / h[3]];
  };
  const out = [];
  for (let k = p; k < n; k++) {
    const u0 = U[k], u1 = U[k + 1];
    if (u1 <= u0) continue;
    for (let s = 0; s < 16; s++) out.push(at(u0 + ((u1 - u0) * s) / 16));
  }
  out.push(at(U[n]));
  return out;
}

/**
 * Triangles (index triples) of a simple polygon by ear clipping. Points on a
 * straight run are kept (they are a neighbour face's vertices): when only
 * such points are left to clip, each goes as a triangle of no area, which
 * keeps every edge matched.
 */
export function earClip(P) {
  let idx = P.map((_, i) => i);
  if (signedArea(P) < 0) idx.reverse();
  let sc = 0;
  for (const p of P) sc = Math.max(sc, Math.abs(p[0]), Math.abs(p[1]));
  const eps = 1e-12 * (sc + 1) ** 2;
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const tris = [];
  let from = 0; // resume where the last ear was cut: a fan is then found at once
  while (idx.length > 3) {
    let cut = -1;
    for (const flat of [false, true]) {
      for (let s = 0; s < idx.length && cut < 0; s++) {
        const i = (from + s) % idx.length;
        const a = P[idx[(i + idx.length - 1) % idx.length]], b = P[idx[i]], c = P[idx[(i + 1) % idx.length]];
        const area = cr(a, b, c);
        if (flat ? area < -eps || area > eps : area <= eps) continue;
        const x0 = Math.min(a[0], b[0], c[0]) - 1e-9 * (sc + 1), x1 = Math.max(a[0], b[0], c[0]) + 1e-9 * (sc + 1);
        const y0 = Math.min(a[1], b[1], c[1]) - 1e-9 * (sc + 1), y1 = Math.max(a[1], b[1], c[1]) + 1e-9 * (sc + 1);
        let ok = true;
        for (const j of idx) {
          const q = P[j];
          if (q[0] < x0 || q[0] > x1 || q[1] < y0 || q[1] > y1) continue;
          if (q === a || q === b || q === c) continue;
          if ((q[0] === a[0] && q[1] === a[1]) || (q[0] === b[0] && q[1] === b[1]) || (q[0] === c[0] && q[1] === c[1])) continue;
          if (flat) { // a flat ear: no point on the span from a to c
            const t = ((q[0] - a[0]) * (c[0] - a[0]) + (q[1] - a[1]) * (c[1] - a[1])) / ((c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2 || 1);
            if (Math.abs(cr(a, c, q)) <= eps && t > 0 && t < 1) { ok = false; break; }
            continue;
          }
          if (cr(a, b, q) >= -eps && cr(b, c, q) >= -eps && cr(c, a, q) >= -eps) { ok = false; break; }
        }
        if (ok) cut = i;
      }
      if (cut >= 0) break;
    }
    if (cut < 0) throw new Unresolved("face could not be cut into triangles");
    const n = idx.length;
    tris.push([idx[(cut + n - 1) % n], idx[cut], idx[(cut + 1) % n]]);
    idx.splice(cut, 1);
    from = Math.max(0, cut - 1);
  }
  tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/**
 * Triangles of a loop that is monotone in angle (t = uv[i][0]): split at its
 * least and greatest angle into two chains along which t never falls, then
 * walked together by angle, so every triangle spans the angle between two
 * neighbouring points. null when the loop is not monotone.
 */
export function zipMonotone(uv, pts) {
  const n = uv.length;
  let lo = 0, hi = 0;
  for (let i = 1; i < n; i++) { if (uv[i][0] < uv[lo][0]) lo = i; if (uv[i][0] > uv[hi][0]) hi = i; }
  if (lo === hi) return null;
  const span = uv[hi][0] - uv[lo][0];
  const tol = 1e-9 * (Math.abs(span) + 1);
  const chain = (step) => {
    const c = [lo];
    for (let i = lo; i !== hi;) { i = (i + step + n) % n; c.push(i); }
    return c;
  };
  // a run of points at the least or greatest angle (a straight edge along the
  // axis) belongs to the chain it leads into; the walk handles it as steps
  // of no angle
  const A = chain(1), B = chain(-1);
  for (const c of [A, B]) for (let k = 1; k < c.length; k++) if (uv[c[k]][0] < uv[c[k - 1]][0] - tol) return null;
  const tris = [];
  let i = 0, j = 0;
  const push = (a, b, c) => { if (a !== b && b !== c && a !== c) tris.push([pts[a], pts[b], pts[c]]); };
  while (i < A.length - 1 || j < B.length - 1) {
    const ta = i < A.length - 1 ? uv[A[i + 1]][0] : Infinity;
    const tb = j < B.length - 1 ? uv[B[j + 1]][0] : Infinity;
    if (ta <= tb) { push(A[i], A[i + 1], B[j]); i++; } else { push(A[i], B[j + 1], B[j]); j++; }
  }
  return tris;
}

/**
 * Triangles between two closed loops that each go once round a cylinder (a
 * band, such as the side of a round hole): the two are walked together by
 * angle.
 */
function zipBand(P) {
  const TAU = 2 * Math.PI;
  const wrap = (d) => d - TAU * Math.round(d / TAU);
  // each ring as points with angles rising once round (a ring walked the
  // other way is reversed), starting where `start` says
  const ring = ({ pts, uv, winding }, start = 0, near = null) => {
    let p = pts, t = uv.map((x) => x[0]);
    if (winding < 0) { p = p.slice().reverse(); t = t.slice().reverse(); }
    const n = p.length;
    const q = [], a = [];
    for (let i = 0; i < n; i++) {
      const j = (start + i) % n;
      q.push(p[j]);
      a.push(i === 0 ? (near == null ? t[j] : near + wrap(t[j] - near)) : a[i - 1] + wrap(t[j] - t[(j + n - 1) % n]));
    }
    return { p: q, t: a, n };
  };
  const A = ring(P[0]);
  // B starts at its point nearest A's first angle
  const b0 = ring(P[1]);
  let best = 0;
  b0.t.forEach((x, i) => { if (Math.abs(wrap(x - A.t[0])) < Math.abs(wrap(b0.t[best] - A.t[0]))) best = i; });
  const B = ring(P[1], best, A.t[0]);
  const angA = (i) => (i < A.n ? A.t[i] : A.t[i - A.n] + TAU);
  const angB = (j) => (j < B.n ? B.t[j] : B.t[j - B.n] + TAU);
  const tris = [];
  let i = 0, j = 0;
  while (i < A.n || j < B.n) {
    if (i < A.n && (j >= B.n || angA(i + 1) <= angB(j + 1))) { tris.push([A.p[i % A.n], A.p[(i + 1) % A.n], B.p[j % B.n]]); i++; }
    else { tris.push([A.p[i % A.n], B.p[(j + 1) % B.n], B.p[j % B.n]]); j++; }
  }
  return tris;
}

// ---- 2D helpers ----------------------------------------------------------------

function closeLoop(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-12 * (Math.abs(p[0]) + 1) || Math.abs(q[1] - p[1]) > 1e-12 * (Math.abs(p[1]) + 1)) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) <= 1e-12 * (Math.abs(a[0]) + 1) && Math.abs(a[1] - b[1]) <= 1e-12 * (Math.abs(a[1]) + 1)) out.pop();
  }
  return out;
}

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function areaCentroid(pts) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = a[0] * b[1] - b[0] * a[1];
    A += c; cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c;
  }
  A /= 2;
  return { A, cx: cx / (6 * A), cy: cy / (6 * A) };
}

function isConvex(pts) {
  let sign = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-18) continue;
    const s = Math.sign(z);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** A loop as signed convex pieces, each counter-clockwise. */
export function convexPieces(pts0) {
  let pts = pts0;
  if (pts.length < 3) return [];
  let s = 1;
  if (signedArea(pts) < 0) pts = pts.slice().reverse();
  if (Math.abs(signedArea(pts)) === 0) return [];
  if (isConvex(pts)) return [{ s, pts }];
  const out = [];
  const o = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const tri = [o, pts[i], pts[i + 1]];
    const A = signedArea(tri);
    if (Math.abs(A) < 1e-18) continue;
    out.push(A > 0 ? { s, pts: tri } : { s: -s, pts: [o, pts[i + 1], pts[i]] });
  }
  return out;
}

/** A convex counter-clockwise polygon in z = 0 extruded by vector v. */
export function prism(pts, v) {
  const bottom = pts.map((p) => [p[0], p[1], 0]).reverse();
  const top = pts.map((p) => [p[0] + v[0], p[1] + v[1], v[2]]);
  const faces = [bottom, top];
  for (let i = 0; i < pts.length; i++) {
    const a = [pts[i][0], pts[i][1], 0], b = [pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], 0];
    faces.push([a, b, add(b, v), add(a, v)]);
  }
  if (v[2] < 0) for (const f of faces) f.reverse();
  return faces;
}

/** Rounds the corners at `idx` of a polygon with radius r (convex or concave corners). */
export function filletAll(pts, idx, r) {
  const out = [];
  const set = new Set(idx);
  for (let i = 0; i < pts.length; i++) {
    const V = pts[i];
    if (!set.has(i)) { out.push(V); continue; }
    const A = pts[(i - 1 + pts.length) % pts.length], B = pts[(i + 1) % pts.length];
    const u = [A[0] - V[0], A[1] - V[1]], w = [B[0] - V[0], B[1] - V[1]];
    const lu = Math.hypot(u[0], u[1]), lw = Math.hypot(w[0], w[1]);
    u[0] /= lu; u[1] /= lu; w[0] /= lw; w[1] /= lw;
    const phi = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1]))) / 2;
    const t = r / Math.tan(phi);
    if (t > lu || t > lw) { out.push(V); continue; }
    const bis = [u[0] + w[0], u[1] + w[1]];
    const lb = Math.hypot(bis[0], bis[1]);
    const c = [V[0] + (bis[0] / lb) * (r / Math.sin(phi)), V[1] + (bis[1] / lb) * (r / Math.sin(phi))];
    const p1 = [V[0] + u[0] * t, V[1] + u[1] * t], p2 = [V[0] + w[0] * t, V[1] + w[1] * t];
    const a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(d) / (2 * Math.PI)) * ARC_SEGS));
    for (let k = 0; k <= n; k++) { const a = a1 + (d * k) / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  }
  return out;
}

export { subtractCutters, cuttersOf, transformSolid, solid };
