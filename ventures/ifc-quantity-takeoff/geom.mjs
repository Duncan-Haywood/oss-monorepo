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
  let v = 0;
  for (const f of faces) {
    const a = f[0];
    for (let i = 1; i + 1 < f.length; i++) v += dot(a, cross(f[i], f[i + 1]));
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

// ---- solids: { terms: [{s, faces}], mesh: number, notes: [] } ------------
//
// A faceted part keeps its closed shells as well as its volume: `shells` is a
// list of { s, faces } with each face a list of point loops (outer and inner
// bounds, oriented so the face's own normal points out of the shell), and
// `open` is set when some of the mesh volume has no shell to cut (a swept
// disk, a revolved area, a CSG primitive) or a clip or opening was not taken
// from a shell it reaches. A solid whose mesh is all in shells and not open
// can still be cut by a plane (shellSection).

const solid = (terms = [], mesh = 0, notes = [], shells = [], open = mesh !== 0 && !shells.length) => ({ terms, mesh, notes, shells, open });

/** The mesh part of a, carried onto out (which has a's terms already handled). */
const keepMesh = (out, a, open = false) => { out.shells = a.shells; out.open = a.open || open; return out; };

/** Whether any shell vertex lies strictly on the material side of every plane (n.x <= k) of a cutter. */
function meshMeets(shells, planes) {
  if (!shells.length) return false;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const sh of shells) for (const f of sh.faces) for (const l of f) for (const p of l) for (let i = 0; i < 3; i++) { if (p[i] < lo[i]) lo[i] = p[i]; if (p[i] > hi[i]) hi[i] = p[i]; }
  // the cutter misses the shells' box when some plane has the whole box outside it
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1);
  for (const [n, k] of planes) {
    let m = 0;
    for (let i = 0; i < 3; i++) m += n[i] * (n[i] >= 0 ? lo[i] : hi[i]);
    if (m >= k - 1e-9 * size) return false;
  }
  return true;
}

export function solidVolume(s) {
  let v = s.mesh;
  for (const t of s.terms) v += t.s * polyVolume(t.faces);
  return v;
}

function transformSolid(s, m) {
  const flip = det(m) < 0;
  const shells = (s.shells || []).map((sh) => ({ s: sh.s, faces: sh.faces.map((f) => f.map((l) => { const g = l.map((p) => apply(m, p)); return flip ? g.reverse() : g; })) }));
  const out = solid(s.terms.map((t) => ({ s: t.s, faces: transformPoly(t.faces, m) })), s.mesh * Math.abs(det(m)), s.notes, shells, s.open);
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
// Qto_BeamBaseQuantities). Faceted parts are cut shell by shell (shellSection);
// a solid with mesh volume no shell accounts for has no section.

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
 * Signed area the plane n.x = k cuts from a closed shell of planar faces,
 * positive when the faces point outward. Each face loop crosses the plane
 * along a line; its crossings, sorted along that line, pair up into the
 * stretches inside the loop (the loop is a simple polygon). Every stretch is a
 * piece of the section's boundary, run in the direction n x f (f the loop's
 * own normal), which is counter-clockwise seen from +n for an outward face,
 * so Green's theorem sums the area from the pieces without joining them up.
 * A hole loop runs the other way and so takes its stretches back out.
 */
export function shellSection(faces, n, k) {
  const nn = unit(n);
  const u = unit(Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]));
  const v = cross(nn, u);
  let A = 0;
  for (const f of faces) for (const l of f) {
    const m = l.length;
    if (m < 3) continue;
    const xs = [];
    let prev = dot(nn, l[m - 1]) - k;
    for (let i = 0; i < m; i++) {
      const a = l[(i + m - 1) % m], b = l[i];
      const db = dot(nn, b) - k;
      // a vertex on the plane counts as below it, so crossings come in pairs
      if ((prev > 0) !== (db > 0)) xs.push(add(a, mulS(sub(b, a), prev / (prev - db))));
      prev = db;
    }
    if (xs.length < 2) continue;
    let fn = [0, 0, 0];
    for (let i = 0; i < m; i++) {
      const a = l[i], b = l[(i + 1) % m];
      fn = add(fn, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
    }
    const d = cross(nn, fn);
    if (!(norm(d) > 0)) continue;
    xs.sort((p, q) => dot(d, p) - dot(d, q));
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const p = xs[i], q = xs[i + 1];
      A += (dot(p, u) * dot(q, v) - dot(p, v) * dot(q, u)) / 2;
    }
  }
  return A;
}

/** Smallest and largest n.x over a solid's polyhedral terms and shells. */
export function solidExtent(s, n) {
  const nn = unit(n);
  let lo = Infinity, hi = -Infinity;
  for (const t of s.terms) for (const f of t.faces) for (const p of f) { const d = dot(nn, p); if (d < lo) lo = d; if (d > hi) hi = d; }
  for (const sh of s.shells || []) for (const f of sh.faces) for (const p of f[0]) { const d = dot(nn, p); if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
}

/** Whether a plane section of the solid can be measured (no uncut mesh volume). */
export const sectionable = (s) => !s.open && (s.terms.length > 0 || (s.shells || []).length > 0);

/**
 * Area of the section of a solid by the plane normal to n through the middle
 * of its extent along n (or at offset k when given). null when the solid has a
 * faceted part, which has no polyhedral terms to cut.
 */
export function sectionArea(s, n, k = null) {
  if (!sectionable(s)) return null;
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
  for (const sh of s.shells || []) A += sh.s * shellSection(sh.faces, nn, at);
  return Math.abs(A);
}

/**
 * The direction, among the solid's own face normals that pass `keep`, along
 * which the solid is thinnest: a wall's width direction when only horizontal
 * normals are kept, a slab's thickness direction otherwise.
 */
export function thinnestNormal(s, keep = () => true) {
  const seen = [];
  const planes = [];
  for (const t of s.terms) planes.push(...polyPlanes(t.faces));
  for (const sh of s.shells || []) for (const f of sh.faces) planes.push(...polyPlanes([f[0]]));
  for (const [n] of planes) {
    const m = n[2] < -1e-9 || (Math.abs(n[2]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[0] < 0))) ? mulS(n, -1) : n;
    if (!keep(m)) continue;
    if (!seen.some((q) => Math.abs(dot(q, m)) > 1 - 1e-9)) seen.push(m);
    if (seen.length > 200) break;
  }
  let best = null, bestW = Infinity;
  for (const n of seen) {
    const [lo, hi] = solidExtent(s, n);
    const w = hi - lo;
    if (w < bestW - 1e-12 * Math.max(1, Math.abs(bestW === Infinity ? w : bestW))) { bestW = w; best = n; }
  }
  return best ? { n: best, width: bestW } : null;
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
  const meets = a.mesh !== 0 && (a.open && !a.shells.length ? true : cutters.some((c) => c.s !== 0 && meshMeets(a.shells, c.planes)));
  if (meets) notes.push(`${what} not taken from a faceted part`);
  const out = keepMesh(solid(guard(terms), a.mesh, notes), a, meets);
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

  /** -> [{s: +1|-1, pts: [[x,y],...]}] in the profile's own position */
  profile(ref, depth = 0) {
    const e = this.get(ref);
    const a = e.args;
    const n = (i) => this.num(a[i]);
    const pos = () => (a[2] ? this.placement(a[2]) : IDENTITY);
    const place = (loops) => {
      const m = pos();
      return loops.map((l) => ({ s: l.s, pts: l.pts.map((p) => { const q = apply(m, [p[0], p[1], 0]); return [q[0], q[1]]; }) }));
    };
    const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const circle = (r) => {
      const k = Math.sqrt((2 * Math.PI) / (ARC_SEGS * Math.sin((2 * Math.PI) / ARC_SEGS)));
      const pts = [];
      for (let i = 0; i < ARC_SEGS; i++) { const t = (2 * Math.PI * i) / ARC_SEGS; pts.push([k * r * Math.cos(t), k * r * Math.sin(t)]); }
      return pts;
    };
    switch (e.type) {
      case "IFCRECTANGLEPROFILEDEF":
        return place([{ s: 1, pts: rect(n(3), n(4)) }]);
      case "IFCROUNDEDRECTANGLEPROFILEDEF": {
        const r = n(5) ?? 0;
        let pts = rect(n(3), n(4));
        if (r > 0) pts = filletAll(pts, [0, 1, 2, 3], r);
        return place([{ s: 1, pts }]);
      }
      case "IFCRECTANGLEHOLLOWPROFILEDEF": {
        const w = n(3), h = n(4), t = n(5);
        let outer = rect(w, h), inner = rect(w - 2 * t, h - 2 * t);
        const ri = n(6) ?? 0, ro = n(7) ?? 0;
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
        const w = n(3), d = n(4), tw = n(5), tf = n(6), r = n(7) ?? 0;
        if (n(9)) throw new Unresolved("sloped I flanges");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + tf], [tw / 2, -d / 2 + tf], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf], [-tw / 2, -d / 2 + tf], [-w / 2, -d / 2 + tf]];
        return place([{ s: 1, pts: r > 0 ? filletAll(pts, [3, 4, 9, 10], r) : pts }]);
      }
      case "IFCLSHAPEPROFILEDEF": {
        const d = n(3), w = n(4) ?? n(3), t = n(5), r = n(6) ?? 0;
        if (n(8)) throw new Unresolved("sloped L legs");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + t], [-w / 2 + t, -d / 2 + t], [-w / 2 + t, d / 2], [-w / 2, d / 2]];
        return place([{ s: 1, pts: r > 0 ? filletAll(pts, [3], r) : pts }]);
      }
      case "IFCTSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6), r = n(7) ?? 0;
        if (n(10) || n(11)) throw new Unresolved("sloped T");
        const pts = [[-tw / 2, -d / 2], [tw / 2, -d / 2], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf]];
        return place([{ s: 1, pts: r > 0 ? filletAll(pts, [2, 7], r) : pts }]);
      }
      case "IFCUSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6), r = n(7) ?? 0;
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
        return this.profile(a[2], depth + 1).map((l) => ({ s: l.s, pts: l.pts.map((p) => { const q = apply(m, [p[0], p[1], 0]); return [q[0], q[1]]; }) }));
      }
      case "IFCCOMPOSITEPROFILEDEF":
        return a[2].flatMap((p) => this.profile(p, depth + 1));
      default:
        throw new Unresolved(`profile ${e.type}`);
    }
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
        const outer = shellOf(this.shellFaces(a[0]), 1);
        const parts = [outer];
        if (e.type === "IFCFACETEDBREPWITHVOIDS") for (const s of a[1] || []) parts.push(shellOf(this.shellFaces(s), -1));
        return meshSolid(parts);
      }
      case "IFCSHELLBASEDSURFACEMODEL":
      case "IFCFACEBASEDSURFACEMODEL": {
        const parts = [];
        for (const s of a[0]) {
          const sh = this.get(s);
          if (sh.type !== "IFCCLOSEDSHELL" && sh.type !== "IFCCONNECTEDFACESET") throw new Unresolved("open shell");
          parts.push(shellOf(this.shellFaces(s), 1));
        }
        const out = meshSolid(parts);
        out.notes.push("surface model read as closed shells");
        return out;
      }
      case "IFCPOLYGONALFACESET":
      case "IFCTRIANGULATEDFACESET":
      case "IFCTRIANGULATEDIRREGULARNETWORK":
        return meshSolid([shellOf(this.faceSetFaces(e), 1)]);
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
        const meets = first.mesh !== 0 && (!first.shells.length || meshMeets(first.shells, [[mulS(n, -1), -k]]));
        if (meets) notes.push("half-space clip not taken from a faceted part");
        return keepMesh(solid(terms, first.mesh, notes), first, meets);
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
    const b = this.item(second.id, depth + 1);
    if (b.mesh) throw new Unresolved("difference with a faceted solid");
    return subtractCutters(first, cuttersOf(b), "boolean difference");
  }

  /** A shell's faces as point loops, the outer bound first. */
  shellFaces(ref) {
    const sh = this.get(ref);
    const faces = [];
    for (const fref of sh.args[0]) {
      const f = this.get(fref);
      const loops = [];
      for (const bref of f.args[0]) {
        const b = this.get(bref);
        const loop = this.get(b.args[0]);
        if (loop.type !== "IFCPOLYLOOP") throw new Unresolved(`face bound ${loop.type}`);
        let pts = loop.args[0].map((p) => this.point(p));
        if (b.args[1] === false) pts = pts.slice().reverse();
        if (b.type === "IFCFACEOUTERBOUND") loops.unshift(pts); else loops.push(pts);
      }
      if (loops.length) faces.push(loops);
    }
    return faces;
  }

  shellVolume(ref) {
    return facesVolume(this.shellFaces(ref));
  }

  faceSetVolume(e) {
    return facesVolume(this.faceSetFaces(e));
  }

  /** A tessellated face set's faces as point loops, the outer bound first. */
  faceSetFaces(e) {
    const a = e.args;
    const P = this.get(a[0]).args[0].map((c) => [this.num(c[0]), this.num(c[1]), this.num(c[2])]);
    // faces as lists of index loops (1-based into P, after PnIndex)
    let faces = [];
    if (e.type === "IFCPOLYGONALFACESET") {
      for (const fref of a[2]) {
        const f = this.get(fref);
        const loops = [f.args[0].map((i) => this.num(i))];
        if (f.type === "IFCINDEXEDPOLYGONALFACEWITHVOIDS") for (const inner of f.args[1]) loops.push(inner.map((i) => this.num(i)).reverse());
        faces.push(loops);
      }
      if (a[3]) {
        const pn = a[3].map((i) => this.num(i));
        faces = faces.map((f) => f.map((l) => l.map((j) => pn[j - 1])));
      }
    } else {
      for (const t of a[3]) faces.push([t.map((i) => this.num(i))]);
      const pnAt = e.type === "IFCTRIANGULATEDFACESET" ? a[4] : null;
      if (pnAt) {
        const pn = pnAt.map((i) => this.num(i));
        faces = faces.map((f) => f.map((l) => l.map((j) => pn[j - 1])));
      }
    }
    return faces.map((f) => f.map((l) => l.map((j) => {
      const p = P[j - 1];
      if (!p) throw new Unresolved(`face set index ${j} out of range`);
      return p;
    })));
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
    const notes = [];
    const shells = [];
    let open = false;
    let axis = null, axisWeight = -1;
    for (const it of r.args[3]) {
      const s = this.item(it, depth + 1);
      terms.push(...s.terms);
      mesh += s.mesh;
      notes.push(...s.notes);
      shells.push(...(s.shells || []));
      open ||= s.open;
      if (s.axis && (s.axisWeight ?? 0) > axisWeight) { axis = s.axis; axisWeight = s.axisWeight ?? 0; }
    }
    const out = solid(guard(terms), mesh, notes, shells, open);
    if (axis) { out.axis = axis; out.axisWeight = axisWeight; }
    return out;
  }
}

// ---- faceted shells ------------------------------------------------------------

/** Signed volume enclosed by faces (point loops), by the divergence theorem. */
function facesVolume(faces) {
  let v = 0;
  for (const f of faces) for (const l of f) {
    const o = l[0];
    for (let i = 1; i + 1 < l.length; i++) v += dot(o, cross(l[i], l[i + 1]));
  }
  return v / 6;
}

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
  faces.forEach((f, fi) => {
    for (const l of f) for (let i = 0; i < l.length; i++) {
      const a = pkey(l[i]), b = pkey(l[(i + 1) % l.length]);
      if (a === b) continue;
      const fwd = a < b;
      const key = fwd ? `${a}|${b}` : `${b}|${a}`;
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
  let flipped = 0;
  for (let s = 0; s < faces.length; s++) {
    if (turn[s] !== null) continue;
    turn[s] = false;
    const stack = [s];
    while (stack.length) {
      const i = stack.pop();
      for (const [j, mustFlip] of adj[i]) {
        const want = turn[i] !== mustFlip;
        if (turn[j] === null) { turn[j] = want; stack.push(j); } else if (turn[j] !== want) closed = false;
      }
    }
  }
  for (let i = 0; i < faces.length; i++) if (turn[i]) { faces[i] = faces[i].map((l) => l.slice().reverse()); flipped++; }
  return { faces, flipped, closed };
}

/**
 * A shell with sign s (+1 material, -1 a void): oriented consistently, then
 * turned outward if it encloses a negative volume. A shell that is not
 * closed keeps its volume (as before) but has no section.
 */
function shellOf(faces, s) {
  const o = orientShell(faces);
  let use = o.closed ? o.faces : faces;
  let v = facesVolume(use);
  let flipped = o.closed ? o.flipped : 0;
  // turned outward as a whole: the faces that end up reversed from the file
  // are then the ones the walk did not turn
  if (v < 0) { use = use.map((f) => f.map((l) => l.slice().reverse())); v = -v; if (o.closed) flipped = faces.length - flipped; }
  // a shell written inside out as a whole is not worth a note
  if (flipped === faces.length) flipped = 0;
  return { s, faces: use, volume: v, closed: o.closed, flipped };
}

function meshSolid(parts) {
  let v = 0;
  const notes = [];
  for (const p of parts) v += p.s * p.volume;
  const open = parts.some((p) => !p.closed);
  const flipped = parts.reduce((n, p) => n + p.flipped, 0);
  if (flipped) notes.push(`${flipped} face${flipped === 1 ? "" : "s"} of a faceted body turned to match their neighbours`);
  return solid([], v, notes, parts.map((p) => ({ s: p.s, faces: p.faces })), open);
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
