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

import { AlignmentReader, AlignmentError, sectionedSolidHorizontal, fixedReferenceSweep } from "./alignment.mjs";

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

/**
 * Length of the circular arc from p through q to r, in 3D. The inscribed
 * angle at q subtends the chord pr; the arc through q spans 2pi minus twice
 * it. Three points in a line are read as the straight run p-q-r.
 */
export function arcLength3(p, q, r) {
  const u = sub(p, q), v = sub(r, q);
  const nu = norm(u), nv = norm(v), chord = norm(sub(r, p));
  const sinQ = norm(cross(u, v)) / (nu * nv || 1);
  if (!(nu > 0 && nv > 0) || sinQ < 1e-12) return nu + nv;
  const R = chord / (2 * sinQ);
  const Q = Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (nu * nv))));
  return R * (2 * Math.PI - 2 * Q);
}

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
  // Most planes miss the polyhedron (every point inside: the faces come back
  // as they are) or leave nothing of it (every point beyond: none). Telling
  // so from the points alone saves building a copy that would be thrown
  // away; the loop below gives the same answers (perf, 2026-11-21).
  let lo = Infinity, hi = -Infinity;
  for (const f of faces) for (const p of f) { const d = dot(n, p) - k; if (d < lo) lo = d; if (d > hi) hi = d; }
  if (hi <= eps) return faces;
  if (lo > eps) return [];
  const out = [];
  const cap = [];
  let anyOut = false;
  const ds = [];
  for (const f of faces) {
    const res = [];
    const m = f.length;
    for (let i = 0; i < m; i++) ds[i] = dot(n, f[i]) - k;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const a = f[i], da = ds[i], db = ds[j];
      if (da <= eps) res.push(a);
      if (da > eps) anyOut = true;
      if (Math.abs(da) <= eps) cap.push(a);
      if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
        const t = da / (da - db);
        const b = f[j];
        // add(a, mulS(sub(b, a), t)), one array instead of three
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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
      // each point's angle once; the comparator sees the same values as
      // when it took atan2 per comparison, so the stable sort's order holds
      const ang = new Map();
      for (const p of pts) { const r = sub(p, c); ang.set(p, Math.atan2(dot(r, v), dot(r, u))); }
      pts.sort((p, q) => ang.get(p) - ang.get(q));
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

export const clipByPlanes = (faces, planes) => {
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
//
// `loose` (optional) keeps the loops of faceted shells that are not closed
// (an exporter's 0.1 mm vertex gap is enough, and Revit writes sanitary
// fittings and furniture as open surface models): no section or area is taken
// from them, but their points still say where the body is, so its box and
// plan rectangle are known (solidPoints, solidExtent). Ported from PR #18042.

const solid = (terms = [], mesh = 0, notes = [], shells = mesh ? null : []) => ({ terms, mesh, notes, shells });

export function solidVolume(s) {
  let v = s.mesh;
  for (const t of s.terms) v += t.s * polyVolume(t.faces);
  return v;
}

function transformSolid(s, m) {
  const shells = s.shells ? s.shells.map((sh) => ({ s: sh.s, loops: transformPoly(sh.loops, m) })) : null;
  const out = solid(s.terms.map((t) => ({ s: t.s, faces: transformPoly(t.faces, m) })), s.mesh * Math.abs(det(m)), s.notes, shells);
  if (s.loose) out.loose = transformPoly(s.loose, m);
  if (s.lofted) out.lofted = true;
  if (s.axis) { out.axis = unit(applyDir(m, s.axis)); out.axisWeight = (s.axisWeight ?? 0) * Math.abs(det(m)); }
  if (s.sweepLength != null) out.sweepLength = s.sweepLength * Math.cbrt(Math.abs(det(m)));
  if (s.bars) {
    const k = Math.cbrt(Math.abs(det(m)));
    const lin = [m[0], m[1], m[2], 0, m[4], m[5], m[6], 0, m[8], m[9], m[10], 0];
    out.bars = s.bars.map((b) => ({ radius: b.radius * k, ...(b.tube ? { tube: true } : {}), segs: b.segs.map((g) => g.kind === "arc"
      ? { ...g, a: apply(m, g.a), b: apply(m, g.b), c: apply(m, g.c), r: g.r * k, n: mulS(unit(apply(lin, g.n)) ?? g.n, det(m) < 0 ? -1 : 1), length: g.length * k }
      : { ...g, a: apply(m, g.a), b: apply(m, g.b), length: g.length * k }) }));
  }
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
  if (s.loose) for (const f of s.loose) yield* f;
}

/**
 * A bar's centreline as a polyline: line pieces by their ends, arcs cut into
 * chords turning at most `maxTurn` radians each, repeated points dropped.
 * For drawing a swept disk (it has no faces) and finding where it is.
 * @param {object[]} segs path3 pieces ({kind: "line", a, b} or {kind: "arc", a, c, n, angle})
 */
export function barPolyline(segs, maxTurn = Math.PI / 12) {
  const pts = [];
  const push = (p) => {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-9 * (1 + Math.hypot(...p))) pts.push(p);
  };
  for (const g of segs) {
    if (!(g.length > 0)) continue;
    if (g.kind === "arc") {
      const u = sub(g.a, g.c), v = cross(g.n, u);
      const n = Math.max(1, Math.ceil(Math.abs(g.angle) / maxTurn));
      for (let i = 0; i <= n; i++) {
        const t = (g.angle * i) / n;
        push(add(g.c, add(mulS(u, Math.cos(t)), mulS(v, Math.sin(t)))));
      }
    } else { push(g.a); push(g.b); }
  }
  return pts;
}

/**
 * Smallest and largest n.x over swept-disk bars (`tube` bars): each piece of
 * the centreline widened by the disk's reach along n, r * sqrt(1 - (t.n)^2).
 * Arcs are read as their chords. [Infinity, -Infinity] when there is none.
 */
export function barExtent(bars, n) {
  const nn = unit(n);
  let lo = Infinity, hi = -Infinity;
  for (const b of bars || []) {
    if (!b.tube) continue;
    const P = barPolyline(b.segs);
    for (let i = 0; i + 1 < P.length; i++) {
      const t = unit(sub(P[i + 1], P[i]));
      if (!t) continue;
      const c = dot(t, nn);
      const reach = b.radius * Math.sqrt(Math.max(0, 1 - c * c));
      for (const p of [P[i], P[i + 1]]) {
        const d = dot(p, nn);
        lo = Math.min(lo, d - reach);
        hi = Math.max(hi, d + reach);
      }
    }
  }
  return [lo, hi];
}

/** Smallest and largest n.x over a solid's polyhedral terms and faceted shells. */
export function solidExtent(s, n) {
  const nn = unit(n);
  const x = nn[0], y = nn[1], z = nn[2];
  let lo = Infinity, hi = -Infinity;
  // plain loops over the same points solidPoints yields: a generator here
  // cost a third of the takeoff on fitting-heavy models (perf, 2026-11-21)
  const scan = (faces) => {
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      for (let j = 0; j < f.length; j++) {
        const p = f[j];
        const d = x * p[0] + y * p[1] + z * p[2];
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
    }
  };
  // keep in step with solidPoints (open shells' `loose` loops included)
  for (const t of s.terms) scan(t.faces);
  if (s.shells) for (const sh of s.shells) scan(sh.loops);
  if (s.loose) scan(s.loose);
  return [lo, hi];
}

/** The outward normals of a solid's faces, terms and shells alike. */
function* faceNormals(s) {
  for (const t of s.terms) for (const [n] of polyPlanes(t.faces)) yield n;
  if (s.shells) for (const sh of s.shells) for (const [n] of polyPlanes(sh.loops)) yield n;
}

/**
 * Whether a wall's faces bend round in plan: its faces standing along `up`
 * (leaving out those facing across the thickness direction `t`: its ends)
 * face in `minDirs` directions or more, both senses of a direction counted
 * once, and no one direction carries half their area. A straight wall has one
 * direction carrying nearly all of it, an arched opening's small faces
 * notwithstanding (schependomlaan's stud walls #79982 and #275217); a wall
 * built on an arc has one direction per facet (skolebygg's quarter-arc walls,
 * 90 or more, none over 2%).
 */
export function bendsInPlan(s, up, t, minDirs = 12) {
  const dirs = [];
  let total = 0;
  const loops = [];
  for (const tm of s.terms) loops.push(...tm.faces);
  if (s.shells) for (const sh of s.shells) loops.push(...sh.loops);
  for (const l of loops) {
    if (l.length < 3) continue;
    const a = newell(l);
    const w = norm(a) / 2;
    const n = w > 0 ? mulS(a, 0.5 / w) : null;
    if (!n || Math.abs(dot(n, up)) > 1e-3 || Math.abs(dot(n, t)) < 1e-3) continue;
    total += w;
    const d = dirs.find((q) => Math.abs(dot(q.n, n)) > 1 - 1e-6);
    if (d) d.w += w; else dirs.push({ n, w });
  }
  if (dirs.length < minDirs || !(total > 0)) return false;
  return Math.max(...dirs.map((d) => d.w)) < 0.5 * total;
}

/**
 * The two faces of a wall that bends in plan (`bendsInPlan`), measured on its
 * own facets: {outer, inner, rOuter, rInner, centre}, areas in model units.
 * The faces standing along `up` are summed plane by plane as signed area
 * vectors over every term and shell, so the faces convex pieces share cancel
 * and an opening's cutter (a negative term) takes its patch off the face it
 * crosses. The centre of the bend is where the facets' normals meet in plan
 * (least squares, weighted by area); a facet whose normal points away from
 * it is on the outer face, towards it the inner, and one at more than 25
 * degrees to the radius (an end, a reveal) on neither. rOuter and rInner are
 * the faces' area-weighted distances from the centre. A facet counts as
 * standing when it leans up to 2 degrees off `up` (triangles of a curved face
 * whose corners sit at different angles and heights). `swept` is the volume
 * the two faces enclose by the divergence theorem in plan (half the sum of
 * each facet's plan area times its distance from the centre, the inner face
 * negative): the body's volume when every face it has besides these two is
 * level or lies along a radius, whatever its section does up the wall (a
 * stepped or recessed wall included). `ends` is the same flux of the
 * standing planes on neither face (ends cut square, reveals; zero for one
 * along a radius) and `endArea` their area, so swept + ends is the volume
 * whenever every other face is level. A facet facing the centre or away
 * with more of the body beyond it (a duct's inside) is on neither face: its
 * area is `hidden`, though it still counts in `swept`. A plane whose area
 * lies more than 45 degrees from the foot of the perpendicular from the
 * centre (RMS, seen from the centre) is on neither face, whatever its
 * centroid says: a half ring's two ends on one plane, or the cuts of two
 * openings that share a plane. null when fewer than `minDirs` facets
 * stand on either face or the normals do not meet (a wall that is straight
 * after all).
 */
const LEAN = Math.sin((2 * Math.PI) / 180);

/**
 * Whether the ray from p along n's plan direction (n less its part along u)
 * passes through more of the solid: some distance ahead where the faces it
 * crosses do not cancel (an entry into a convex piece and the exit from its
 * neighbour through a shared face do; so do a face and a hole bound in it).
 * Terms count with their sign, shells with theirs.
 */
function rayHitsBody(s, p, n, u) {
  const d = unit(sub(n, mulS(u, dot(n, u))));
  if (!d) return false;
  let scale = 0;
  for (const q of solidPoints(s)) scale = Math.max(scale, Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), Math.abs(q[2] - p[2]));
  // a facet of a non-planar loop (a quad on a curved face) has its centre a
  // hair off its neighbours: crossings nearer than 1e-3 of the body's size
  // are the facet's own surface
  const eps = 1e-3 * (scale || 1);
  const hits = [];
  const test = (sg, l) => {
    if (l.length < 3) return;
    const a = newell(l), na = unit(a);
    if (!na) return;
    const dn = dot(na, d);
    if (Math.abs(dn) < 1e-9) return;
    const t = dot(na, sub(l[0], p)) / dn;
    if (!(t > eps)) return;
    const x = add(p, mulS(d, t));
    // point in polygon, projected on the plane's dominant axes
    const k = Math.abs(na[0]) > Math.abs(na[1]) ? (Math.abs(na[0]) > Math.abs(na[2]) ? 0 : 2) : Math.abs(na[1]) > Math.abs(na[2]) ? 1 : 2;
    const i = (k + 1) % 3, j = (k + 2) % 3;
    let inside = false;
    for (let m = 0, w = l.length - 1; m < l.length; w = m++) {
      const A = l[m], B = l[w];
      if ((A[j] > x[j]) !== (B[j] > x[j]) && x[i] < ((B[i] - A[i]) * (x[j] - A[j])) / (B[j] - A[j]) + A[i]) inside = !inside;
    }
    if (!inside) return;
    hits.push([t, sg * Math.sign(dn)]);
  };
  for (const t of s.terms) for (const f of t.faces) test(t.s, f);
  if (s.shells) for (const sh of s.shells) for (const l of sh.loops) test(sh.s, l);
  // crossings at one distance (within 1e-6 of the body's size) are summed
  hits.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < hits.length;) {
    let v = 0, j = i;
    while (j < hits.length && hits[j][0] - hits[i][0] <= 1e-6 * (scale || 1)) v += hits[j++][1];
    if (v !== 0) return true;
    i = j;
  }
  return false;
}
export function curvedFaces(s, up, minDirs = 6) {
  if (s.mesh && !s.shells) return null;
  const u = unit(up);
  if (!u) return null;
  const loops = [];
  for (const t of s.terms) for (const f of t.faces) loops.push([t.s, f]);
  if (s.shells) for (const sh of s.shells) for (const l of sh.loops) loops.push([sh.s, l]);
  let scale = 0;
  for (const [, l] of loops) for (const p of l) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const planes = new Map();
  for (const [sg, l] of loops) {
    if (l.length < 3) continue;
    const a = mulS(newell(l), 0.5 * sg);
    const n = unit(a);
    // standing, or leaning a little: a curved face triangulated between
    // vertices at different heights and angles (skolebygg's breps #1455746,
    // #1457200) has triangles 0.001-0.01 off the vertical
    if (!n || Math.abs(dot(n, u)) > LEAN) continue;
    const i = Math.abs(n[0]) > 1e-9 ? 0 : Math.abs(n[1]) > 1e-9 ? 1 : 2;
    const c = n[i] < 0 ? mulS(n, -1) : n;
    const r = (x, q) => Math.round(x / q);
    const key = `${r(c[0], 1e-6)},${r(c[1], 1e-6)},${r(c[2], 1e-6)},${r(dot(c, l[0]), 1e-6 * (scale || 1))}`;
    const m = mulS(l.reduce((q, p) => add(q, p), [0, 0, 0]), 1 / l.length);
    const v = planes.get(key) || { a: [0, 0, 0], loops: [] };
    v.a = add(v.a, a);
    v.loops.push([a, m, l, sg]);
    planes.set(key, v);
  }
  // each plane's net area, outward normal and a point on it (its loops'
  // centroids weighted by their signed share of the net area)
  const P = [];
  for (const v of planes.values()) {
    const area = norm(v.a);
    if (!(area > 1e-12 * (scale * scale || 1))) continue;
    const n = mulS(v.a, 1 / area);
    let w = 0, m = [0, 0, 0];
    for (const [a, c] of v.loops) { const x = dot(a, n); w += x; m = add(m, mulS(c, x)); }
    if (!(w > 0)) continue;
    P.push({ n, area, p: mulS(m, 1 / w), loops: v.loops });
  }
  if (P.length < 2 * minDirs) return null;
  // two directions across `up`
  const e1 = unit(cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const e2 = cross(u, e1);
  const to2 = (x) => [dot(x, e1), dot(x, e2)];
  // least-squares point nearest the facets' normal lines in plan, refitted
  // without the facets that do not face it: the ends, which pull it off when
  // cut square to the plan axes rather than along a radius (dental_clinic's
  // partitions #1674, #1675, whose ends meet the radius at about 52 degrees).
  // A facet of a circle faces its centre exactly; 25 degrees leaves room for
  // a facet drawn off a coarse polygon.
  const cosMax = Math.cos((25 * Math.PI) / 180);
  const fit = (fs) => {
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const f of fs) {
      const [nx, ny] = to2(f.n), [px, py] = to2(f.p);
      const h = Math.hypot(nx, ny);
      if (!(h > 0)) continue;
      const x = nx / h, y = ny / h, w = f.area;
      const m11 = 1 - x * x, m12 = -x * y, m22 = 1 - y * y;
      a11 += w * m11; a12 += w * m12; a22 += w * m22;
      b1 += w * (m11 * px + m12 * py); b2 += w * (m12 * px + m22 * py);
    }
    const D = a11 * a22 - a12 * a12;
    if (!(Math.abs(D) > 1e-9 * (a11 + a22) * (a11 + a22))) return null;
    return [(a22 * b1 - a12 * b2) / D, (a11 * b2 - a12 * b1) / D];
  };
  const facing = (f, C) => {
    const [nx, ny] = to2(f.n), [px, py] = to2(f.p);
    const dx = px - C[0], dy = py - C[1], d = Math.hypot(dx, dy), h = Math.hypot(nx, ny);
    if (!(d > 0) || !(h > 0)) return [0, 0];
    return [(nx * dx + ny * dy) / (h * d), Math.abs((nx * dx + ny * dy) / h)];
  };
  // RMS distance, along the plane and across `up`, of the plane's signed
  // area from the foot of the perpendicular from C: the second moment of
  // each loop in the plane's own (t, up) coordinates, t = up x n
  const spread = (f, C) => {
    const t = unit(cross(u, f.n));
    if (!t) return Infinity;
    const c3 = add(mulS(e1, C[0]), mulS(e2, C[1]));
    let I = 0, A = 0;
    for (const [, , l, sg] of f.loops) {
      let i2 = 0, a2 = 0;
      for (let k = 0; k < l.length; k++) {
        const P0 = l[k], P1 = l[(k + 1) % l.length];
        const x0 = dot(t, sub(P0, c3)), y0 = dot(u, P0), x1 = dot(t, sub(P1, c3)), y1 = dot(u, P1);
        const cr = x0 * y1 - x1 * y0;
        a2 += cr / 2;
        i2 += (cr * (x0 * x0 + x0 * x1 + x1 * x1)) / 12;
      }
      // (t, up) is right-handed about n: a loop running anticlockwise there
      // has its area along n; the term's sign on top
      const o = sg * Math.sign(dot(cross(t, u), f.n));
      I += o * i2; A += o * a2;
    }
    return A > 0 ? Math.sqrt(Math.max(0, I / A)) : Infinity;
  };
  let C = fit(P);
  if (!C) return null;
  for (let i = 0; i < 3; i++) C = fit(P.filter((f) => Math.abs(facing(f, C)[0]) > cosMax)) ?? C;
  let outer = 0, inner = 0, ro = 0, ri = 0, no = 0, ni = 0, swept = 0, hidden = 0, ends = 0, endArea = 0;
  const F = [];
  let dMax = -Infinity, dMin = Infinity;
  for (const f of P) {
    const [c, dist] = facing(f, C);
    // a standing plane that faces no centre is an end (or an opening's
    // jamb): its own flux in plan, exact for a plane (the distance along its
    // normal is the same at every point of it), so the faces plus the ends
    // still enclose the volume when the ends are cut square rather than
    // along a radius (eval/square-cut-ends-2026-11-23.md). A plane dropped
    // for facing the centre but spreading too far is not counted here
    if (Math.abs(c) <= cosMax) {
      const [nx, ny] = to2(f.n), [px, py] = to2(f.p);
      ends += f.area * (nx * (px - C[0]) + ny * (py - C[1]));
      endArea += f.area;
      continue;
    }
    // A plane's summed area can be patches far apart that only its point
    // (their centroid) makes look like a face: a half-round wall's two ends
    // lie on one plane through the centre, and the cuts two openings at
    // either end of it leave share two planes, each pair straddling the foot
    // of the perpendicular from the centre (ISSUE_129's 180-degree #36735
    // and #148665 read both ends, 5.58 m2, as outer face, and the cuts as
    // inner; eval/half-round-ends-2026-11-23.md). A facet of the face lies
    // round that foot, so the plane's area must stay within 45 degrees of it
    // seen from the centre: RMS distance from the foot along the plane (in
    // plan) no more than the plane's distance from the centre.
    if (!(spread(f, C) <= dist)) continue;
    F.push({ f, c, dist });
    if (c > 0) dMax = Math.max(dMax, dist); else dMin = Math.min(dMin, dist);
  }
  // a facet facing out with more of the body beyond it is not the wall's
  // face but a channel's or a recess's inside (skolebygg's #1455746: a vent
  // duct 0.25 x 0.75 m along the foot of the wall). Only facets short of the
  // outermost (or past the innermost) are cast, to keep this cheap.
  const tol = 1e-3 * Math.max(Math.abs(dMax), Math.abs(dMin), 1e-12);
  for (const { f, c, dist } of F) {
    // the facet's area seen from the centre (its plan component), for `swept`:
    // every facet facing the centre or away counts there, hidden ones too
    const ap = f.area * Math.sqrt(Math.max(0, 1 - dot(f.n, u) ** 2));
    swept += (c > 0 ? 1 : -1) * ap * dist;
    const inside = c > 0 ? dist < dMax - tol : dist > dMin + tol;
    if (inside && rayHitsBody(s, f.p, f.n, u)) { hidden += f.area; continue; }
    if (c > 0) { outer += f.area; ro += f.area * dist; no++; }
    else { inner += f.area; ri += f.area * dist; ni++; }
  }
  if (no < minDirs || ni < minDirs || !(outer > 0) || !(inner > 0)) return null;
  return { outer, inner, rOuter: ro / outer, rInner: ri / inner, centre: C, swept: swept / 2, hidden, ends: ends / 2, endArea };
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
  const P = planeAreas(s);
  if (!P) return null;
  let A = 0;
  for (const p of P) A += p.area;
  return A;
}

/**
 * The solid's boundary faces summed plane by plane: [{n, area}], one entry
 * per plane (both orientations of a plane share one), the area net of the
 * inner bounds that run against their face. null on the same terms as
 * surfaceArea. ArchiCAD stores some coverings' and walls' areas as one of
 * these (a sill's top, a coping's underside: eval/curved-and-faces-2026-11-22.md).
 * `signed` reads a body of several signed terms too (a profile with arcs is
 * built as a signed sum of pieces): each term's loops count with its sign,
 * so the faces pieces share cancel plane by plane and what is left is the
 * body's own boundary (eval/signed-faces-2026-11-24.md).
 */
export function planeAreas(s, signed = false) {
  if (s.mesh && !s.shells) return null;
  if (s.terms.length > 1 && !signed) return null;
  // every loop with its term's or shell's sign, without a pair per loop
  const each = (fn) => {
    for (const t of s.terms) for (const f of t.faces) fn(t.s, f);
    if (s.shells) for (const sh of s.shells) for (const l of sh.loops) fn(sh.s ?? 1, l);
  };
  let count = 0, scale = 0;
  each((sg, l) => { count++; for (const p of l) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])); });
  if (!count) return null;
  // planes keyed by their rounded normal and offset. The four rounded keys
  // are compared as SameValueZero, which matches the `${a},${b},${c},${d}`
  // strings this replaced (-0 and 0 one key, NaN one key), in an open
  // addressed table of plane numbers rather than a Map of strings, and the
  // vectors are worked in scalars with the same operations in the same
  // order, so no string or array is made for a loop that adds to a plane
  // already met (2.9 million loops, 2.1 million planes on Viadotto Acerno;
  // docs/history/ifc-takeoff-perf-2026-11-24.md). Planes come out in the
  // order first met, as before.
  const sums = [], K0 = [], K1 = [], K2 = [], K3 = [];
  let slots = new Int32Array(64), mask = 63;
  const hashOf = (a, b, c, d) => {
    let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(d | 0, 0x27d4eb2f);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return h;
  };
  const place = (j) => { let at = hashOf(K0[j], K1[j], K2[j], K3[j]) & mask; while (slots[at]) at = (at + 1) & mask; slots[at] = j + 1; };
  const r = (x, q) => Math.round(x / q);
  const same = (x, y) => x === y || (x !== x && y !== y);
  const q3 = 1e-6 * (scale || 1);
  each((sg, l) => {
    if (l.length < 3) return;
    // the loop's area vector: half its Newell normal (newell, mulS)
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i], q = l[(i + 1) % l.length];
      x += (p[1] - q[1]) * (p[2] + q[2]);
      y += (p[2] - q[2]) * (p[0] + q[0]);
      z += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const h = 0.5 * (signed ? sg : 1);
    const ax = x * h, ay = y * h, az = z * h;
    // its unit normal (unit), one key for both orientations of a plane
    const len = Math.hypot(ax, ay, az);
    if (!(len > 0)) return;
    const inv = 1 / len;
    let nx = ax * inv, ny = ay * inv, nz = az * inv;
    const lead = Math.abs(nx) > 1e-9 ? nx : Math.abs(ny) > 1e-9 ? ny : nz;
    if (lead < 0) { nx *= -1; ny *= -1; nz *= -1; }
    const o = l[0];
    const k0 = r(nx, 1e-6), k1 = r(ny, 1e-6), k2 = r(nz, 1e-6), k3 = r(nx * o[0] + ny * o[1] + nz * o[2], q3);
    let at = hashOf(k0, k1, k2, k3) & mask, j;
    while ((j = slots[at]) && !(same(K0[j - 1], k0) && same(K1[j - 1], k1) && same(K2[j - 1], k2) && same(K3[j - 1], k3))) at = (at + 1) & mask;
    if (j) { const v = sums[j - 1]; v[0] += ax; v[1] += ay; v[2] += az; return; }
    slots[at] = sums.length + 1;
    K0.push(k0); K1.push(k1); K2.push(k2); K3.push(k3); sums.push([ax, ay, az]);
    if (2 * sums.length > mask) {
      slots = new Int32Array(2 * (mask + 1)); mask = 2 * mask + 1;
      for (let i = 0; i < sums.length; i++) place(i);
    }
  });
  const out = [];
  for (const v of sums) { const area = norm(v); if (area > 0) out.push({ n: mulS(v, 1 / area), area }); }
  return out;
}

/**
 * The area of a body's boundary when it is a signed sum of pieces (an
 * extrusion less faceted cut-outs: S_Office's coped beams), or null when it
 * is a mesh or too large. planeAreas(s, true) sums each plane's loops as one
 * area vector, which is exact only while the body faces one way on that
 * plane. A cope's cut is flush with the flange: the flange's underside faces
 * down and the web's top, left by the cope, faces up on the same plane, and
 * the vector sum takes one from the other (SB-168, 0.0072 m2 short of
 * IfcOpenShell's faces; eval/coped-coating-2026-11-24.md). Here each plane's
 * loops are added as a winding function, each loop with its piece's sign and
 * its side of the plane, and the face area is the integral of |winding|:
 * pieces' shared faces cancel to 0, a face up and a face down on one plane
 * both count. The integral is taken in slabs between every vertex and edge
 * crossing, where the winding is constant between neighbouring edges, so it
 * is exact for polygons. Planes are grouped within 1e-4 in the cosine of
 * their normals and 2e-5 of the body's size in offset, as pieces clipped
 * from different cutters do not meet to the last bit.
 */
export function boundaryArea(s, maxLoops = 40000) {
  if (s.mesh && !s.shells) return null;
  const loops = [];
  for (const t of s.terms) for (const f of t.faces) loops.push([t.s, f]);
  if (s.shells) for (const sh of s.shells) for (const l of sh.loops) loops.push([sh.s ?? 1, l]);
  if (!loops.length || loops.length > maxLoops) return null;
  let scale = 0;
  for (const [, l] of loops) for (const p of l) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  // planes in two passes. First loops whose planes agree to 1e-7 (a face two
  // pieces share, read from the same points, lands here as a pair). Then
  // whole groups within 1e-4 in the cosine of their normals and 2e-5 of the
  // body's size in offset are joined, as pieces clipped by different cutters
  // do not meet to the last bit (S_Office's cutters sit 0.001 mm off the
  // flanges). Joining groups, never splitting one, keeps a shared face's two
  // loops together: a filleted profile's fan of near-parallel diagonals
  // (planes 1e-4 apart) split loop by loop would leave faces uncancelled.
  const scaleOf = scale || 1;
  const groups = cluster(loops.map(([sg, l]) => {
    if (l.length < 3) return null;
    const a = newell(l), len = norm(a);
    if (!(len > 0)) return null;
    // one sense per plane, led by its first component within 1e-6 of the
    // largest (a leading component of -2e-9, or a 45-degree plane's two
    // equal ones, must not split a plane in two)
    let n = mulS(a, 1 / len);
    const top = Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])) - 1e-6;
    const big = Math.abs(n[0]) >= top ? 0 : Math.abs(n[1]) >= top ? 1 : 2;
    if (n[big] < 0) n = mulS(n, -1);
    let c = [0, 0, 0];
    for (const p of l) c = add(c, p);
    return { n, d: dot(n, c) / l.length, loops: [[sg, l]] };
  }).filter(Boolean), 1e-7, 1e-7 * scaleOf);
  const planes = cluster(groups, 1e-4, 2e-5 * scaleOf);
  let A = 0;
  for (const P of planes) A += planeWindingArea(P);
  return A;
}

/**
 * Planes joined when their normals agree within `nt` (1 - cosine) and their
 * offsets within `dt`, transitively (union-find over neighbouring normal
 * cells); each item keeps its loops, a joined plane takes the first's n, d.
 */
function cluster(items, nt, dt) {
  // cells by rounded normal and offset, looked up with their neighbours
  const cd = Math.max(dt, 1e-12);
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const cells = new Map();
  items.forEach((P, i) => {
    for (const k of neighbourKeys(P.n, P.d, cd)) for (const j of cells.get(k) ?? []) {
      const Q = items[j];
      if (dot(P.n, Q.n) >= 1 - nt && Math.abs(P.d - Q.d) <= dt) { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    }
    const key = `${P.n.map((x) => Math.round(x * 1e2)).join(",")},${Math.round(P.d / cd)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });
  const out = new Map();
  items.forEach((P, i) => {
    const r = find(i);
    const o = out.get(r);
    if (o) o.loops.push(...P.loops); else out.set(r, { n: items[r].n, d: items[r].d, loops: P.loops.slice() });
  });
  return [...out.values()];
}

function neighbourKeys(n, d, cd) {
  const r = n.map((x) => Math.round(x * 1e2)), q = Math.round(d / cd), out = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) out.push(`${r[0] + i},${r[1] + j},${r[2] + k},${q + m}`);
  return out;
}

/** ∫|winding| over one plane's signed loops, in the plane's own units squared. */
function planeWindingArea(P) {
  const n = P.n;
  const ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
  const iu = (ax + 1) % 3, iv = (ax + 2) % 3, side = Math.sign(n[ax]), stretch = 1 / Math.abs(n[ax]);
  // a lone loop, or loops that all face one way: their summed area vector
  // (planeAreas' figure) is exact and needs no sweep
  let one = true, s0 = 0, vec = [0, 0, 0];
  for (const [sg, l] of P.loops) {
    const a = newell(l), w = sg * Math.sign(dot(a, n));
    if (!s0) s0 = w; else if (w !== s0) one = false;
    vec = add(vec, mulS(a, sg / 2));
  }
  if (one) return norm(vec);
  // edges in (u, v), x0 < x1, each with the winding it adds crossing it upwards
  const sums = new Map(), q = 1e-9 * (Math.abs(P.d) + 1);
  for (const [sg, l] of P.loops) {
    const c = sg * side;
    for (let i = 0; i < l.length; i++) {
      const p = l[i], r = l[(i + 1) % l.length];
      let x0 = p[iu], y0 = p[iv], x1 = r[iu], y1 = r[iv], w = c;
      if (x0 === x1) continue;
      if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; w = -w; }
      // an edge two pieces share, run both ways, cancels here
      const k = `${Math.round(x0 / q)},${Math.round(y0 / q)},${Math.round(x1 / q)},${Math.round(y1 / q)}`;
      const e = sums.get(k);
      if (e) e.w += w; else sums.set(k, { x0, y0, x1, y1, w });
    }
  }
  const E = [...sums.values()].filter((e) => e.w !== 0);
  if (!E.length) return 0;
  const xs = [];
  for (const e of E) xs.push(e.x0, e.x1);
  // edges cross only where both span the same x: sweep them sorted by x0
  E.sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    for (let j = i + 1; j < E.length && E[j].x0 < a.x1; j++) {
      const b = E[j], lo = Math.max(a.x0, b.x0), hi = Math.min(a.x1, b.x1);
      if (!(hi > lo)) continue;
      const ya = (x) => a.y0 + ((a.y1 - a.y0) * (x - a.x0)) / (a.x1 - a.x0), yb = (x) => b.y0 + ((b.y1 - b.y0) * (x - b.x0)) / (b.x1 - b.x0);
      const d0 = ya(lo) - yb(lo), d1 = ya(hi) - yb(hi);
      if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) xs.push(lo + ((hi - lo) * d0) / (d0 - d1));
    }
  }
  xs.sort((a, b) => a - b);
  let area = 0;
  const at = [];
  for (let s = 0; s + 1 < xs.length; s++) {
    const xa = xs[s], xb = xs[s + 1];
    if (!(xb > xa)) continue;
    const xm = (xa + xb) / 2;
    at.length = 0;
    for (let i = 0; i < E.length && E[i].x0 < xb; i++) {
      const e = E[i];
      if (e.x0 <= xm && e.x1 >= xm) at.push([e.y0 + ((e.y1 - e.y0) * (xm - e.x0)) / (e.x1 - e.x0), e.w]);
    }
    if (at.length < 2) continue;
    at.sort((a, b) => a[0] - b[0]);
    let w = 0, len = 0;
    for (let i = 0; i + 1 < at.length; i++) { w += at[i][1]; if (w) len += Math.abs(w) * (at[i + 1][0] - at[i][0]); }
    area += len * (xb - xa);
  }
  return area * stretch;
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
  if (a.lofted) out.lofted = true;
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

  /**
   * IfcLinearPlacement (IFC4X3): a station on an alignment curve
   * (alignment.mjs), in the coordinates of PlacementRelTo. When the curve
   * cannot be read, the exporter's cached CartesianPosition stands in.
   */
  linearPlacement(e) {
    this.alignments ??= new AlignmentReader(this);
    try {
      return this.alignments.axis2Linear(e.args[1]);
    } catch (err) {
      if (!(err instanceof AlignmentError)) throw err;
      if (e.args[2]) return this.placement(e.args[2]);
      throw new Unresolved(err.message);
    }
  }

  /** IfcLocalPlacement (and IfcLinearPlacement) chain -> matrix to world */
  objectPlacement(ref, depth = 0) {
    const e = this.get(ref);
    if (!e) return IDENTITY;
    if (depth > 100) throw new Unresolved("placement loop");
    let rel;
    if (e.type === "IFCLINEARPLACEMENT") rel = this.linearPlacement(e);
    else if (e.type === "IFCGRIDPLACEMENT") return this.gridPlacement(e, depth);
    else if (e.type !== "IFCLOCALPLACEMENT") throw new Unresolved(`object placement ${e.type}`);
    else rel = this.placement(e.args[1]);
    return e.args[0] ? mul(this.objectPlacement(e.args[0], depth + 1), rel) : rel;
  }

  /** The IfcGrid an IfcGridAxis belongs to (UAxes, VAxes or WAxes). */
  gridOf(axisId) {
    if (!this.axisGrid) {
      this.axisGrid = new Map();
      for (const [, g] of this.e) if (g.type === "IFCGRID") for (const k of [7, 8, 9]) for (const r of g.args[k] || []) this.axisGrid.set(r.ref ?? r, g);
    }
    return this.axisGrid.get(axisId) ?? null;
  }

  /**
   * IfcVirtualGridIntersection -> a point in the grid's coordinates: the
   * crossing of the two axes' curves, each moved sideways by its offset
   * (OffsetDistances[0] to the first axis, [1] to the second; positive to
   * the left of the axis's direction, as IfcOffsetCurve2D), raised by [2].
   */
  gridIntersection(ref) {
    const v = this.get(ref);
    const [a1, a2] = (v.args[0] || []).map((r) => this.get(r));
    if (!a1 || !a2) throw new Unresolved("grid intersection without two axes");
    const off = (v.args[1] || []).map((x) => this.num(x) ?? 0);
    const line = (ax, d) => {
      const pts = this.curve(ax.args[1]);
      if (pts.length < 2) throw new Unresolved("grid axis with no curve");
      let p = pts[0], q = pts[pts.length - 1];
      if (ax.args[2] === false) [p, q] = [q, p];
      const t = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(t[0], t[1]);
      if (!(L > 0)) throw new Unresolved("grid axis of zero length");
      const n = [-t[1] / L, t[0] / L];
      return { p: [p[0] + n[0] * d, p[1] + n[1] * d], t };
    };
    const A = line(a1, off[0] ?? 0), B = line(a2, off[1] ?? 0);
    const den = A.t[0] * B.t[1] - A.t[1] * B.t[0];
    if (Math.abs(den) < 1e-12 * Math.hypot(...A.t) * Math.hypot(...B.t)) throw new Unresolved("grid axes are parallel");
    const s = ((B.p[0] - A.p[0]) * B.t[1] - (B.p[1] - A.p[1]) * B.t[0]) / den;
    return { pt: [A.p[0] + A.t[0] * s, A.p[1] + A.t[1] * s, off[2] ?? 0], axis1: A.t, grid: this.gridOf(a1.id) };
  }

  /**
   * IfcGridPlacement: the origin at a virtual grid intersection, in the
   * grid's own placement; x toward PlacementRefDirection (a second
   * intersection or a direction), else along the first axis; z up.
   * IFC2X3/IFC4 write (Location, RefDirection); IFC4X3 puts PlacementRelTo first.
   */
  gridPlacement(e, depth) {
    const a = e.args.length >= 3 ? e.args : [null, ...e.args];
    const loc = this.gridIntersection(a[1]);
    let x = loc.axis1;
    const rd = a[2] != null ? this.get(a[2]) : null;
    if (rd?.type === "IFCVIRTUALGRIDINTERSECTION") { const t = this.gridIntersection(a[2]).pt; x = [t[0] - loc.pt[0], t[1] - loc.pt[1]]; }
    else if (rd?.type === "IFCDIRECTION") { const d = this.dir(a[2], [1, 0, 0]); x = [d[0], d[1]]; }
    const xx = unit([x[0], x[1], 0]) ?? [1, 0, 0];
    const rel = fromAxes(xx, [-xx[1], xx[0], 0], [0, 0, 1], loc.pt);
    const frame = a[0] ?? loc.grid?.args[5];
    return frame ? mul(this.objectPlacement(frame, depth + 1), rel) : rel;
  }

  // ---- curves to 2D point loops --------------------------------------------

  arcPoints(c, r1, r2, x, y, t0, t1, ccw) {
    // points of c + r1 cos t x + r2 sin t y from t0 to t1
    let span = ccw ? t1 - t0 : t0 - t1;
    while (span <= 1e-12) span += 2 * Math.PI;
    while (span > 2 * Math.PI + 1e-12) span -= 2 * Math.PI;
    // this.arcStep (polygonSections): equal chords of at most that angle,
    // the way an exporter polygonises a drawn arc before measuring it
    const n = this.arcStep ? Math.max(1, Math.ceil(span / this.arcStep - 1e-9)) : Math.max(2, Math.ceil((span / (2 * Math.PI)) * ARC_SEGS));
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
    // a derived or composite profile that names itself (or a longer loop)
    if (depth > 50) throw new Unresolved("profile nesting");
    const a = e.args;
    const n = (i) => this.num(a[i]);
    const rad = (i) => (opts?.plain ? 0 : (n(i) ?? 0));
    // toe (edge) radii: dropped with the fillets, or alone with opts.noToes
    const toe = (i) => (opts?.noToes ? 0 : rad(i));
    const pos = () => (a[2] ? this.placement(a[2]) : IDENTITY);
    const place = (loops) => {
      const m = pos();
      return loops.map((l) => ({ s: l.s, pts: l.pts.map((p) => { const q = apply(m, [p[0], p[1], 0]); return [q[0], q[1]]; }) }));
    };
    const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const circle = (r) => {
      if (opts?.sides) {
        // inscribed, or with opts.outside circumscribed (sides tangent to the circle)
        const R = opts.outside ? r / Math.cos(Math.PI / opts.sides) : r;
        return Array.from({ length: opts.sides }, (_, i) => { const t = (2 * Math.PI * i) / opts.sides; return [R * Math.cos(t), R * Math.sin(t)]; });
      }
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
        const w = n(3), d = n(4), tw = n(5), tf = n(6), r = rad(7), e = toe(8);
        if (n(9)) throw new Unresolved("sloped I flanges");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + tf], [tw / 2, -d / 2 + tf], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf], [-tw / 2, -d / 2 + tf], [-w / 2, -d / 2 + tf]];
        // FlangeEdgeRadius (IFC4) rounds each flange tip's inner corner
        return place([{ s: 1, pts: filletEach(pts, { 3: r, 4: r, 9: r, 10: r, 2: e, 5: e, 8: e, 11: e }) }]);
      }
      case "IFCLSHAPEPROFILEDEF": {
        const d = n(3), w = n(4) ?? n(3), t = n(5), r = rad(6), e = toe(7);
        if (n(8)) throw new Unresolved("sloped L legs");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + t], [-w / 2 + t, -d / 2 + t], [-w / 2 + t, d / 2], [-w / 2, d / 2]];
        // EdgeRadius rounds each leg's toe on its inner side (eval/edge-radii-2026-11-24.md)
        return place([{ s: 1, pts: filletEach(pts, { 3: r, 2: e, 4: e }) }]);
      }
      case "IFCTSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6), r = rad(7), fe = toe(8), we = toe(9);
        if (n(10) || n(11)) throw new Unresolved("sloped T");
        const pts = [[-tw / 2, -d / 2], [tw / 2, -d / 2], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf]];
        // FlangeEdgeRadius on the flange tips' inner corners, WebEdgeRadius on both corners of the web's foot
        return place([{ s: 1, pts: filletEach(pts, { 2: r, 7: r, 3: fe, 6: fe, 0: we, 1: we }) }]);
      }
      case "IFCUSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6), r = rad(7), e = toe(8);
        if (n(9)) throw new Unresolved("sloped U flanges");
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + tf], [-w / 2 + tw, -d / 2 + tf], [-w / 2 + tw, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2]];
        // EdgeRadius on each flange toe's inner corner
        return place([{ s: 1, pts: filletEach(pts, { 3: r, 4: r, 2: e, 5: e }) }]);
      }
      case "IFCCSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), t = n(5), g = n(6);
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + g], [w / 2 - t, -d / 2 + g], [w / 2 - t, -d / 2 + t], [-w / 2 + t, -d / 2 + t], [-w / 2 + t, d / 2 - t], [w / 2 - t, d / 2 - t], [w / 2 - t, d / 2 - g], [w / 2, d / 2 - g], [w / 2, d / 2], [-w / 2, d / 2]];
        return place([{ s: 1, pts }]);
      }
      case "IFCZSHAPEPROFILEDEF": {
        const d = n(3), w = n(4), tw = n(5), tf = n(6), r = rad(7), e = toe(8);
        const pts = [[-tw / 2, -d / 2], [w - tw / 2, -d / 2], [w - tw / 2, -d / 2 + tf], [tw / 2, -d / 2 + tf], [tw / 2, d / 2], [-w + tw / 2, d / 2], [-w + tw / 2, d / 2 - tf], [-tw / 2, d / 2 - tf]];
        // FilletRadius at the two inner roots, EdgeRadius on each flange toe's inner corner
        return place([{ s: 1, pts: filletEach(pts, { 3: r, 7: r, 2: e, 6: e }) }]);
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
    tryOne("no edge radii", { noToes: true });
    for (const sides of SECTION_POLYGON_SIDES) {
      tryOne(`${sides}-gon circles`, { sides });
      tryOne(`no fillets, ${sides}-gon circles`, { plain: true, sides });
    }
    return out;
  }

  /**
   * Polygonised sections an exporter is seen to measure, each as the ratio of
   * its area to the exact one, kept however small the difference (more than
   * 1e-6): explainChecks names a stored volume that equals one to 1e-4, which
   * is far tighter than the 2% agreement and so not met by chance.
   *   "arcs as 45-degree chords": every arc of a drawn profile replaced by
   *     equal chords of at most 45 degrees (ArchiCAD's End Surface Area and
   *     Net Volume of profiled elements: schependomlaan's L100x10 beams and
   *     spekband sills, to 7 digits; eval/archicad-polygon-sections-2026-11-23.md);
   *   "circles as circumscribed 20-gons": a circle profile as the 20-sided
   *     polygon whose sides touch it (ArchiCAD's round columns: C20's D200,
   *     volume and perimeter to 10 digits).
   */
  polygonSections(ref) {
    const area = (loops) => loops.reduce((x, l) => x + l.s * Math.abs(signedArea(l.pts)), 0);
    if (!this.get(ref)) return [];
    let exact;
    try { exact = area(this.profile(ref)); } catch { return []; }
    if (!(exact > 0)) return [];
    const out = [];
    const add = (label, f) => {
      let v;
      try { v = f(); } catch { return; }
      const ratio = v / exact;
      if (v > 0 && Math.abs(ratio - 1) > 1e-6) out.push({ label, ratio });
    };
    const keep = this.arcStep;
    this.arcStep = Math.PI / 4;
    try { add("arcs as 45-degree chords", () => area(this.profile(ref))); } finally { this.arcStep = keep; }
    add("circles as circumscribed 20-gons", () => area(this.profile(ref, 0, { sides: 20, outside: true })));
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
        // a round bar drawn as an extruded circle (Allplan's straight bars in
        // pragmaticBIM's sample): a straight path for the bar schedule
        const prof = this.get(a[0]);
        const round = prof?.type === "IFCCIRCLEPROFILEDEF" ? this.num(prof.args[3]) : roundLoop(loops);
        if (round > 0) {
          const p0 = apply(m, [0, 0, 0]), p1 = apply(m, mulS(d, depthV));
          out.sweepLength = depthV;
          out.bars = [{ radius: round, segs: [{ kind: "line", a: p0, b: p1, length: norm(sub(p1, p0)), span: 1 }] }];
        }
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
      case "IFCSECTIONEDSOLIDHORIZONTAL": {
        // a deck, girder or pavement course lofted along an IFC4X3 alignment (alignment.mjs)
        this.alignments ??= new AlignmentReader(this);
        let loft;
        try { loft = sectionedSolidHorizontal(this.alignments, e, (r) => this.profile(r)); } catch (err) {
          if (err instanceof AlignmentError) throw new Unresolved(err.message);
          throw err;
        }
        const out = orientedShells(loft.parts, loft.notes);
        out.lofted = true; // no plane cut fits a deck that curves and climbs: computeAreas measures its top faces
        return out;
      }
      case "IFCFIXEDREFERENCESWEPTAREASOLID": {
        // a profile swept along a curve with its x axis held toward one
        // direction (IFC4X3 kerbs, barriers and ditches along a gradient curve)
        this.alignments ??= new AlignmentReader(this);
        let sweep;
        try { sweep = fixedReferenceSweep(this.alignments, e, (r) => this.profile(r)); } catch (err) {
          if (err instanceof AlignmentError) throw new Unresolved(err.message);
          throw err;
        }
        const out = orientedShells(sweep.parts, sweep.notes);
        return a[1] ? transformSolid(out, this.placement(a[1])) : out;
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
        const out = faceted(parts);
        out.mesh += bulgeVolume(parts, out.shells);
        const oe = offEdges(parts);
        if (oe.bound > 1e-3 * Math.abs(out.mesh)) {
          out.notes.push(`curved faces stand up to ${(oe.max * 1000).toPrecision(2)} mm off the edges that bound them (the exporter's approximation): volume read from the faces; a figure fitted to the edges can differ by up to ${(100 * oe.bound / Math.abs(out.mesh || 1)).toPrecision(2)}%`);
        }
        return out;
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
        const r = this.num(a[1]), ri = this.num(a[2]) ?? 0;
        const path = this.path3(a[0]);
        const segs = trimPath(path, this.num(a[3]), this.num(a[4]));
        const len = segs.reduce((s, g) => s + g.length, 0);
        const out = solid([], Math.PI * (r * r - ri * ri) * len);
        // the directrix's length: a reinforcing bar's cut length (qto memberLength)
        out.sweepLength = len;
        // the bar's path and radius, for the bar schedule (rebar.mjs)
        out.bars = [{ radius: r, segs, tube: true }];
        return out;
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
        // a circle centred on the axis sweeps a sphere: any direction in its
        // plane across the axis serves as the meridian frame's X0
        if (norm(sub(ref, mulS(D, dot(ref, D)))) < 1e-12) ref = cross(N, D);
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
    // A pole: a boundary point where the surface pinches (all of one
    // parameter's line maps to one point, as at the tip of a ruled B-spline
    // face that narrows to a point, or where a surface of revolution meets
    // its axis). Its (u, v) is a whole segment, which the loop must run
    // along: the point is written twice, at the pinched parameter of the
    // point before it and of the point after it.
    const h = 1e-6;
    const scaleAt = (q, k) => { const d = k ? [0, h] : [h, 0]; return norm(sub(S.at(q[0] + d[0], q[1] + d[1]), S.at(q[0] - d[0], q[1] - d[1]))) / (2 * h); };
    const ref = [0, 1].map((k) => Math.max(...uv.map((q) => scaleAt(q, k))));
    const pinched = uv.map((q) => [0, 1].map((k) => scaleAt(q, k) <= 1e-6 * ref[k]));
    // A pinched periodic parameter (the angle at a point on the axis) is
    // arbitrary there, and the loop may come back from the pole at any
    // angle: half of a domed bowl bottom runs half a turn round the rim, down
    // a meridian to the axis and up the opposite meridian, half a turn away.
    // Unwrapping cannot tell +1/2 from -1/2 of a turn at that step, so the
    // angle is unwrapped from the last point where it means something, and
    // the turn across the pole is the one that closes the loop. Without
    // this, such a face read as a face round the whole surface.
    for (let k = 0; k < 2; k++) {
      if (!S.periods[k]) continue;
      const P = S.periods[k];
      let last = null, firstPole = -1;
      for (let i = 0; i < n; i++) {
        if (pinched[i][k]) { if (firstPole < 0 && last !== null) firstPole = i; if (last !== null) uv[i][k] = last; continue; }
        if (last !== null) uv[i][k] = last + wrapTo(uv[i][k] - last, P);
        last = uv[i][k];
      }
      const free = uv.filter((_, i) => !pinched[i][k]);
      if (free.length < 2) continue;
      const m = free.length;
      let total = free[m - 1][k] - free[0][k] + wrapTo(free[0][k] - free[m - 1][k], P);
      if (Math.abs(total) > P / 2 && firstPole >= 0) {
        const shift = -P * Math.round(total / P);
        for (let i = firstPole + 1; i < n; i++) if (!pinched[i][k]) uv[i][k] += shift;
        total += shift;
      }
      if (Math.abs(total) > P / 2) throw new Unresolved(`face round a closed ${surf.type}`);
    }
    {
      for (let i = n - 1; i >= 0; i--) {
        for (let k = 0; k < 2; k++) {
          if (!pinched[i][k]) continue;
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
    // edges then pair with their neighbours' at the one point.
    // Each triangle also carries its edges' sag: the surface at the middle
    // of each edge (in (u, v)) less the middle of the surface's own chord,
    // edges a-b, b-c, c-a. The flat triangles lie inside a convex patch, so
    // their volume is light by about the sag times the area (0.17-0.29% on
    // the five breps of eval/turned-figure-2026-11-23.md, halving with the
    // tolerance); bulgeVolume() adds the patch's quadratic part back.
    const onS = UV.map(() => null);
    const sAt = (i) => onS[i] ?? (onS[i] = S.at(UV[i][0], UV[i][1]));
    const sagOf = (i, j) => sub(S.at((UV[i][0] + UV[j][0]) / 2, (UV[i][1] + UV[j][1]) / 2), mulS(add(sAt(i), sAt(j)), 0.5));
    const tris = [];
    for (const [i, j, k] of out) {
      if (V3[i] === V3[j] || V3[j] === V3[k] || V3[i] === V3[k]) continue;
      const t = [V3[i], V3[j], V3[k]];
      t.sag = [sagOf(i, j), sagOf(j, k), sagOf(k, i)];
      // how far the surface stands off the edges bounding this face, for
      // offEdges(): a mesh fitted to the edges instead can differ by that
      t.off = off;
      tris.push(t);
    }
    return tris;
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

  /**
   * A directrix in 3D as straight and circular pieces: {kind: "line", a, b,
   * length} and {kind: "arc", a, b, c (centre), r, angle (radians), n (the
   * axis the arc turns about, right hand), length}, end to end, with span,
   * the sum of the pieces' parameter ranges (a line's in its own parameter,
   * an arc's in the file's plane angle unit) that a swept disk's StartParam
   * and EndParam are read against. Reads polylines, indexed poly curves
   * (line and arc segments), lines and circles trimmed by parameter or by
   * point, and composite curves of those.
   */
  path3(ref, depth = 0) {
    const e = this.get(ref);
    if (depth > 20) throw new Unresolved("directrix nesting");
    const a = e.args;
    const line = (p, q, span = 1) => ({ kind: "line", a: p, b: q, length: norm(sub(q, p)), span });
    const arcOf = (p, q, r) => {
      // circle through three points, from p through q to r
      const u = sub(q, p), v = sub(r, p);
      const w = cross(u, v), ww = dot(w, w);
      if (!(ww > 1e-24 * dot(u, u) * dot(v, v))) return [line(p, q), line(q, r)];
      const c = add(p, mulS(add(mulS(cross(w, u), dot(v, v)), mulS(cross(v, w), dot(u, u))), 1 / (2 * ww)));
      const rad = norm(sub(p, c));
      const n = unit(w);
      const ang = (x) => { const d = sub(x, c); const e1 = unit(sub(p, c)), e2 = cross(n, e1); let t = Math.atan2(dot(d, e2), dot(d, e1)); if (t < 0) t += 2 * Math.PI; return t; };
      const angle = ang(r);
      return [{ kind: "arc", a: p, b: r, c, r: rad, angle, n, length: rad * angle, span: 1 }];
    };
    switch (e.type) {
      case "IFCPOLYLINE": {
        const P = a[0].map((p) => this.point(p));
        const segs = [];
        for (let i = 1; i < P.length; i++) if (norm(sub(P[i], P[i - 1])) > 0) segs.push(line(P[i - 1], P[i]));
        return { segs, span: segs.length };
      }
      case "IFCINDEXEDPOLYCURVE": {
        const pl = this.get(a[0]);
        const P = pl.args[0].map((c) => [this.num(c[0]), this.num(c[1]), this.num(c[2]) ?? 0]);
        const segs = [];
        if (!a[1]) { for (let i = 1; i < P.length; i++) segs.push(line(P[i - 1], P[i])); return { segs, span: segs.length }; }
        for (const seg of a[1]) {
          const idx = (seg.value || []).map((i) => this.num(i) - 1);
          if (idx.some((i) => !P[i])) throw new Unresolved("indexed directrix point out of range");
          if (seg.typed === "IFCLINEINDEX") for (let i = 1; i < idx.length; i++) segs.push(line(P[idx[i - 1]], P[idx[i]]));
          else if (seg.typed === "IFCARCINDEX") segs.push(...arcOf(P[idx[0]], P[idx[1]], P[idx[2]]));
          else throw new Unresolved(`directrix segment ${seg.typed}`);
        }
        return { segs, span: segs.length };
      }
      case "IFCCOMPOSITECURVE": {
        const segs = [];
        let span = 0;
        for (const sref of a[0]) {
          const s = this.get(sref);
          const part = this.path3(s.args[2], depth + 1);
          span += part.span;
          if (s.args[1] === false) segs.push(...part.segs.slice().reverse().map(reverseSeg));
          else segs.push(...part.segs);
        }
        return { segs, span };
      }
      case "IFCTRIMMEDCURVE": {
        const basis = this.get(a[0]);
        const master = a[4] && a[4].enum;
        const p1 = this.trimValue(a[1], "point"), p2 = this.trimValue(a[2], "point");
        const t1 = this.trimValue(a[1], "param"), t2 = this.trimValue(a[2], "param");
        const useCart = p1 && p2 && (master !== "PARAMETER" || t1 == null || t2 == null);
        const sense = a[3] !== false;
        if (basis.type === "IFCLINE") {
          const o = this.point(basis.args[0]);
          const v = this.get(basis.args[1]);
          const d = this.dir(v.args[0], [1, 0, 0]);
          const mag = this.num(v.args[1]) ?? 1;
          const at = (t) => add(o, mulS(d, mag * t));
          if (useCart) { const sp = t1 != null && t2 != null ? Math.abs(t2 - t1) : norm(sub(p2, p1)) / (mag || 1); return { segs: [line(p1, p2, sp)], span: sp }; }
          if (t1 == null || t2 == null) throw new Unresolved("line trimmed by nothing usable");
          return { segs: [line(at(t1), at(t2), Math.abs(t2 - t1))], span: Math.abs(t2 - t1) };
        }
        if (basis.type === "IFCCIRCLE") {
          const m = this.placement(basis.args[0]);
          const c = [m[3], m[7], m[11]], x = [m[0], m[4], m[8]], y = [m[1], m[5], m[9]], z = [m[2], m[6], m[10]];
          const r = this.num(basis.args[1]);
          const angOf = (p) => Math.atan2(dot(sub(p, c), y), dot(sub(p, c), x));
          let a0, a1;
          if (useCart) { a0 = angOf(p1); a1 = angOf(p2); } else if (t1 != null && t2 != null) { a0 = t1 * this.angle; a1 = t2 * this.angle; } else throw new Unresolved("arc trimmed by nothing usable");
          let sweep = sense ? a1 - a0 : a0 - a1;
          while (sweep <= 1e-12) sweep += 2 * Math.PI;
          while (sweep > 2 * Math.PI + 1e-12) sweep -= 2 * Math.PI;
          const at = (t) => add(c, add(mulS(x, r * Math.cos(t)), mulS(y, r * Math.sin(t))));
          // its parameter range is the angle it sweeps, in the file's unit
          // (Revit trims 270 to 90 degrees: 180 of them)
          const seg = { kind: "arc", a: at(a0), b: at(sense ? a0 + sweep : a0 - sweep), c, r, angle: sweep, n: sense ? z : mulS(z, -1), length: r * sweep, span: sweep / this.angle };
          return { segs: [seg], span: seg.span };
        }
        throw new Unresolved(`directrix trimmed ${basis.type}`);
      }
      default:
        throw new Unresolved(`directrix ${e.type}`);
    }
  }

  curveLength3(ref) {
    const e = this.get(ref);
    // in 3D: a trimmed line or circle out of the xy plane (Tekla's bars run
    // down z) has no length in the plane curve() draws
    if (e.type === "IFCCOMPOSITECURVE" || (e.type === "IFCTRIMMEDCURVE" && /^IFC(LINE|CIRCLE)$/.test(this.get(e.args[0])?.type))) return this.path3(ref).segs.reduce((s, g) => s + g.length, 0);
    if (e.type === "IFCPOLYLINE") {
      const pts = e.args[0].map((p) => this.point(p));
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += norm(sub(pts[i], pts[i - 1]));
      return L;
    }
    if (e.type === "IFCINDEXEDPOLYCURVE") {
      const pl = this.get(e.args[0]);
      const pts = pl.args[0].map((c) => [this.num(c[0]), this.num(c[1]), this.num(c[2]) ?? 0]);
      let L = 0;
      if (!e.args[1]) {
        for (let i = 1; i < pts.length; i++) L += norm(sub(pts[i], pts[i - 1]));
        return L;
      }
      // segments: IfcLineIndex runs point to point, IfcArcIndex is the
      // circular arc from its first point through its second to its third
      // (a reinforcing bar's bends, buildingSMART reinforcing-stirrup)
      for (const seg of e.args[1]) {
        const idx = (seg.value || []).map((i) => this.num(i) - 1);
        if (idx.some((i) => !pts[i])) throw new Unresolved("indexed directrix point out of range");
        if (seg.typed === "IFCLINEINDEX") for (let i = 1; i < idx.length; i++) L += norm(sub(pts[idx[i]], pts[idx[i - 1]]));
        else if (seg.typed === "IFCARCINDEX") L += arcLength3(pts[idx[0]], pts[idx[1]], pts[idx[2]]);
        else throw new Unresolved(`directrix segment ${seg.typed}`);
      }
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
    let sweepLength = 0;
    let bars = [];
    let lofted = true;
    const known = [], loose = [];
    for (const it of r.args[3]) {
      const s = this.item(it, depth + 1);
      lofted = lofted && !!s.lofted;
      if (s.bars) bars.push(...s.bars);
      sweepLength = sweepLength != null && s.sweepLength != null ? sweepLength + s.sweepLength : null;
      // the body is the union of its items: where two overlap (a cabinet's
      // carcass and doors drawn as solids that run into each other, a door
      // leaf set into its frame) the shared part counts once, A + B - (A n B)
      const u = !s.mesh && terms.length && s.terms.length ? unionTerms(terms, s.terms) : null;
      if (u === false) unjoined++;
      else if (u && u.length) { joined++; terms.push(...u); }
      terms.push(...s.terms);
      mesh += s.mesh;
      shells = shells && s.shells ? shells.concat(s.shells) : null;
      if (s.shells) known.push(...s.shells);
      if (s.loose) loose.push(...s.loose);
      notes.push(...s.notes);
      if (s.axis && (s.axisWeight ?? 0) > axisWeight) { axis = s.axis; axisWeight = s.axisWeight ?? 0; }
    }
    if (joined) notes.push(`${joined} overlapping body item${joined > 1 ? "s" : ""} joined: the shared part counted once`);
    if (unjoined) notes.push(`${unjoined} body item${unjoined > 1 ? "s" : ""} too detailed to join: any overlap with the others is counted twice`);
    const out = solid(guard(terms), mesh, notes, shells);
    // one open item leaves the whole body without shells; every item's
    // faces still count towards where it is
    if (!shells) for (const sh of known) loose.push(...sh.loops);
    if (loose.length) out.loose = loose;
    if (axis) { out.axis = axis; out.axisWeight = axisWeight; }
    if (sweepLength) out.sweepLength = sweepLength;
    if (bars.length) out.bars = bars;
    if (lofted && r.args[3].length) out.lofted = true;
    return out;
  }
}

/**
 * A swept disk's directrix between its StartParam and EndParam (path3's
 * pieces, each with its parameter range). Read as the whole directrix: no
 * parameters, 0 to the whole range (Tekla), and 0 to 1 on a directrix of more
 * than one piece (Allplan writes 0 to 1 on every bar, a normalised range: a
 * bar cut to its first facet would be no bar). Otherwise cut at the
 * parameters; an EndParam past the parameter range but within the curve's
 * length is read as a length along it (Revit writes 3500 on a 6,096 mm line
 * whose bar is 3,500 mm long).
 */
export function trimPath(path, t0, t1) {
  const { segs, span } = path;
  const tol = 1e-6 * Math.max(1, span);
  const lo = t0 ?? 0, hi = t1 ?? span;
  if (Math.abs(lo) <= tol && (Math.abs(hi - span) <= tol || (hi === 1 && segs.length > 1))) return segs;
  if (!(hi > lo)) throw new Unresolved("swept disk with trimmed directrix");
  const total = segs.reduce((s, g) => s + g.length, 0);
  let measure;
  if (hi <= span + tol) measure = (g) => g.span ?? 1;
  else if (hi <= total * (1 + 1e-6)) measure = (g) => g.length;
  else throw new Unresolved("swept disk with trimmed directrix");
  const out = [];
  let at = 0;
  for (const g of segs) {
    const m = measure(g), a = at, b = at + m;
    at = b;
    if (b <= lo + tol || a >= hi - tol || !(m > 0)) continue;
    const f0 = Math.max(0, (lo - a) / m), f1 = Math.min(1, (hi - a) / m);
    out.push(f0 <= 1e-12 && f1 >= 1 - 1e-12 ? g : cutSeg(g, f0, f1));
  }
  if (!out.length) throw new Unresolved("swept disk with trimmed directrix");
  return out;
}

/** The part of a directrix piece from fraction f0 to f1 of it. */
function cutSeg(g, f0, f1) {
  if (g.kind === "line") {
    const d = sub(g.b, g.a);
    return { ...g, a: add(g.a, mulS(d, f0)), b: add(g.a, mulS(d, f1)), length: g.length * (f1 - f0), span: (g.span ?? 1) * (f1 - f0) };
  }
  const u = sub(g.a, g.c), v = cross(g.n, u);
  const at = (t) => add(g.c, add(mulS(u, Math.cos(t)), mulS(v, Math.sin(t))));
  return { ...g, a: at(g.angle * f0), b: at(g.angle * f1), angle: g.angle * (f1 - f0), length: g.length * (f1 - f0), span: (g.span ?? 1) * (f1 - f0) };
}

/**
 * The radius of a profile that is one round loop: a circle, or a polygon of
 * 12 or more vertices all within 1% of one distance from their centre (a
 * circle written as a polyline). Null otherwise.
 */
export function roundLoop(loops) {
  if (loops.length !== 1 || loops[0].s < 0) return null;
  let pts = loops[0].pts;
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  if (pts.length < 12) return null;
  const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const rs = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const mean = rs.reduce((t, r) => t + r, 0) / rs.length;
  return mean > 0 && rs.every((r) => Math.abs(r - mean) <= 0.01 * mean) ? mean : null;
}

/** A directrix piece run the other way. */
function reverseSeg(g) {
  return g.kind === "arc" ? { ...g, a: g.b, b: g.a, n: mulS(g.n, -1) } : { ...g, a: g.b, b: g.a };
}

// terms a union adds for the part two term lists share
export const MAX_UNION_TERMS = 4000;
const termBox = (t) => {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const f of t.faces) for (const p of f) for (let i = 0; i < 3; i++) { if (p[i] < b[i]) b[i] = p[i]; if (p[i] > b[i + 3]) b[i + 3] = p[i]; }
  return b;
};

/**
 * True when one of the planes has every point of the faces beyond it by at
 * least twice clipPoly's tolerance, so clipByPlanes would come back empty
 * (it does for 3 in 4 pairs whose boxes overlap on ARK_NUS). Clipping keeps
 * points inside the faces' hull, so a later clip's tolerance is no larger
 * and its points no nearer the plane, bar rounding far below the margin.
 * Answers without building the clipped copies (perf, 2026-11-21).
 */
export function beyondAPlane(faces, planes) {
  const sc = scaleOf(faces);
  for (const [n, k] of planes) {
    const lim = 2 * EPS_REL * (sc * norm(n) + Math.abs(k) + 1);
    let all = true;
    for (let i = 0; all && i < faces.length; i++) {
      const f = faces[i];
      for (let j = 0; j < f.length; j++) if (!(dot(n, f[j]) - k > lim)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

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
      if (beyondAPlane(B[j].faces, planes)) continue;
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

/**
 * Turns faces so neighbours run their shared edge in opposite directions (a
 * consistently oriented shell), starting from each connected piece's first
 * face. Returns { faces, flipped, closed }: closed is false when an edge is
 * used by one face only or by more than two, or when no consistent turn
 * exists (a Moebius-like or self-touching shell); such a shell cannot be cut.
 */
export function orientShell(faces0) {
  const faces = faces0.map((f) => f.map((l) => l.slice()));
  // undirected edge key -> slot; per slot, how many face sides use the edge
  // and the first two as face * 2 + forward (numbers, not objects: the
  // takeoff spent much of its time collecting garbage here, perf 2026-11-21)
  // The edges sit in an open addressed table by their two point ids, not a
  // Map keyed lo * 2^26 + hi: keys above 2^31 are heap numbers, and the Map
  // was a third of the takeoff's own time on FM_ARC_DigitalHub
  // (docs/history/ifc-takeoff-perf-2026-11-24.md). Slots are numbered in
  // the order edges are first met, as before.
  const uses = [], sideA = [], sideB = [], edgeLo = [], edgeHi = [];
  let table = new Int32Array(256), mask = 255;
  const hashOf = (lo, hi) => { let h = Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi, 0x85ebca77); h ^= h >>> 15; return Math.imul(h, 0x2c1b3c6d) ^ (h >>> 13); };
  const slotOf = (lo, hi) => {
    let at = hashOf(lo, hi) & mask, k;
    while ((k = table[at]) && !(edgeLo[k - 1] === lo && edgeHi[k - 1] === hi)) at = (at + 1) & mask;
    if (k) return k - 1;
    table[at] = uses.length + 1;
    edgeLo.push(lo); edgeHi.push(hi);
    if (2 * (uses.length + 1) > mask) {
      table = new Int32Array(2 * (mask + 1)); mask = 2 * mask + 1;
      for (let e = 0; e <= uses.length; e++) { let p = hashOf(edgeLo[e], edgeHi[e]) & mask; while (table[p]) p = (p + 1) & mask; table[p] = e + 1; }
    }
    return -1;
  };
  // each point object keyed once: equal coordinates, one integer id. Keyed
  // by x, then y, then z: Map keys compare as SameValueZero, which matches
  // the `${x},${y},${z}` strings this replaced (0 and -0 one key, NaN one key)
  const ids = new Map(), seen = new Map();
  let nIds = 0;
  const idOf = (p) => {
    let id = seen.get(p);
    if (id === undefined) {
      let my = ids.get(p[0]);
      if (my === undefined) ids.set(p[0], (my = new Map()));
      let mz = my.get(p[1]);
      if (mz === undefined) my.set(p[1], (mz = new Map()));
      id = mz.get(p[2]);
      if (id === undefined) mz.set(p[2], (id = nIds++));
      seen.set(p, id);
    }
    return id;
  };
  for (let fi = 0; fi < faces.length; fi++) {
    for (const l of faces[fi]) for (let i = 0; i < l.length; i++) {
      const a = idOf(l[i]), b = idOf(l[(i + 1) % l.length]);
      if (a === b) continue;
      const fwd = a < b;
      const side = fi * 2 + (fwd ? 1 : 0);
      const k = fwd ? slotOf(a, b) : slotOf(b, a);
      if (k < 0) { uses.push(1); sideA.push(side); sideB.push(-1); }
      else if (uses[k]++ === 1) sideB[k] = side;
    }
  }
  let closed = true;
  const adj = faces.map(() => []);
  for (let k = 0; k < uses.length; k++) {
    if (uses[k] !== 2) { closed = false; continue; }
    const pfi = sideA[k] >> 1, qfi = sideB[k] >> 1;
    if (pfi === qfi) continue;
    // same direction on both sides: one of the two must turn
    const mustFlip = (sideA[k] & 1) === (sideB[k] & 1);
    // neighbour * 2 + must-flip, a number rather than a pair per edge
    adj[pfi].push(qfi * 2 + (mustFlip ? 1 : 0));
    adj[qfi].push(pfi * 2 + (mustFlip ? 1 : 0));
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
      for (const e of adj[i]) {
        const j = e >> 1, mustFlip = (e & 1) === 1;
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
  // summed component by component in the same order as adding [x, y, z]
  // terms, without two arrays per edge (planeAreas runs it on every loop of
  // every body; docs/history/ifc-takeoff-perf-2026-11-24.md)
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
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
/**
 * The volume between curved faces and the flat triangles they were cut into
 * (surfaceTriangles marks each with its edges' sag). Over a triangle of
 * vector area N (its vertices' order) whose edges' middles stand d1, d2, d3
 * off the chords, the quadratic patch through those six points encloses
 * (d1 + d2 + d3) . N / 3 more than the flat triangle: the quadratic shape
 * functions of a six-node triangle integrate to 0 at its corners and to a
 * third of its area at each edge's middle. Summed on the oriented shells, so
 * a face turned to match its neighbours turns its share too; a shell that is
 * not closed (shells null) is left as it was. Exact for a quadratic patch,
 * so the inscribed mesh's error falls from the sag (about the tolerance) to
 * its next order.
 */
/**
 * How far an advanced brep's curved faces stand off the edges that bound
 * them: exporters write B-spline faces that only approximate the circles
 * their edges follow (kleine_Wohnung #207997's half cones, cubic B-splines
 * with every weight 1, enclose 0.12% less than the circular frustum their
 * edges and caps describe; eval/off-edges-2026-11-23.md). Returns the
 * largest distance and the sum over each face's triangles of that face's
 * distance times the triangle's area: the most volume a solid fitted to the
 * edges instead of the faces can differ by.
 */
export function offEdges(parts) {
  let max = 0, bound = 0;
  for (const { faces } of parts) for (const f of faces) for (const t of f) if (t.off > 0) {
    max = Math.max(max, t.off);
    bound += t.off * norm(cross(sub(t[1], t[0]), sub(t[2], t[0]))) / 2;
  }
  return { max, bound };
}

function bulgeVolume(parts, shells) {
  if (!shells) return 0;
  const sags = new Map();
  for (const { faces } of parts) for (const f of faces) for (const t of f) if (t.sag) {
    let m = sags.get(t[0]);
    if (!m) sags.set(t[0], (m = new Map()));
    m.set(t[1], t);
  }
  if (!sags.size) return 0;
  let v = 0;
  for (const sh of shells) {
    let w = 0;
    for (const l of sh.loops) {
      if (l.length !== 3) continue;
      // the loop as marked, or turned (the same triangle walked backwards)
      let t = null, turn = 1;
      for (let r = 0; r < 3 && !t; r++) {
        const a = l[r], b = l[(r + 1) % 3], c = l[(r + 2) % 3];
        const f = sags.get(a)?.get(b);
        if (f && f[2] === c) t = f;
        const g = sags.get(b)?.get(a);
        if (!t && g && g[2] === c) { t = g; turn = -1; }
      }
      if (!t) continue;
      const N = cross(sub(t[1], t[0]), sub(t[2], t[0]));
      w += turn * (dot(t.sag[0], N) + dot(t.sag[1], N) + dot(t.sag[2], N)) / 6;
    }
    v += sh.s * w;
  }
  return v;
}

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
  const out = solid([], v, n, open ? null : shells);
  if (open) out.loose = shells.flatMap((sh) => sh.loops);
  return out;
}

/**
 * Closed shells whose faces are already oriented one way round (the lofts of
 * alignment.mjs): only the sign is settled, by the enclosed volume, so the
 * neighbour search faceted() runs is skipped (Viadotto Acerno 30 s to 6 s).
 */
/**
 * The plan area of a solid's closed, outward-facing shells: each face's area
 * projected along `up`, summed over the faces that look up (n . up > 0); a
 * closed shell's projections sum to zero, so this is its top as seen from
 * above. For lofted decks and courses, where a cut at one height catches only
 * the part of a crowned, graded, curving deck that crosses it.
 */
export function shellPlanArea(s, up) {
  if (!s.shells?.length) return null;
  let a = 0;
  for (const sh of s.shells) {
    let top = 0;
    for (const f of sh.loops) {
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < f.length; i++) {
        const p = f[i], q = f[(i + 1) % f.length];
        nx += (p[1] - q[1]) * (p[2] + q[2]);
        ny += (p[2] - q[2]) * (p[0] + q[0]);
        nz += (p[0] - q[0]) * (p[1] + q[1]);
      }
      const d = (nx * up[0] + ny * up[1] + nz * up[2]) / 2;
      if (d > 0) top += d;
    }
    a += sh.s * top;
  }
  return a;
}

function orientedShells(parts, notes = []) {
  let v = 0;
  const shells = [];
  for (const { s, faces } of parts) {
    let vs = shellVolume(faces);
    const loops = vs < 0 ? faces.map((f) => f.slice().reverse()) : faces;
    vs = Math.abs(vs);
    v += s * vs;
    shells.push({ s, loops });
  }
  return solid([], v, notes.slice(), shells);
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
  return filletEach(pts, Object.fromEntries(idx.map((i) => [i, r])));
}

/**
 * Round the corners of a polygon, each by its own radius: radii maps a vertex
 * index to a radius (absent or 0 leaves the corner sharp). Parametric steel
 * sections round the root (FilletRadius) and the toes (EdgeRadius,
 * FlangeEdgeRadius, WebEdgeRadius) by different radii.
 */
export function filletEach(pts, radii) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const V = pts[i];
    const r = radii[i];
    if (!(r > 0)) { out.push(V); continue; }
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
