/**
 * Stock size from a customer's CAD file, read in the browser.
 *
 * Reads a STEP file (ISO 10303-21, AP203/AP214/AP242 B-rep) or an STL mesh and
 * returns the part's bounding box, the smallest round bar that holds it along
 * each axis, and the stock you would cut it from. Nothing is uploaded: the
 * page passes the file's bytes to these functions in the visitor's browser.
 *
 * How the STEP box is found (no CAD kernel, no tessellation):
 *   - every vertex of every edge is on the part, so it is in the box;
 *   - a circle or ellipse edge adds the extremes it actually reaches: the arc
 *     runs from its start vertex to its end vertex the way the STEP edge says
 *     (EDGE_CURVE same_sense), and an axis extreme counts only if the arc
 *     passes through it. A concave scallop whose full circle would poke out of
 *     the part therefore adds nothing it does not reach;
 *   - a B-spline edge adds its control points (the curve lies inside their
 *     convex hull, so this can only make the box larger, never smaller);
 *   - faces on planes, cylinders and cones reach their extremes on their
 *     edges (a linear function on those surfaces has no interior maximum that
 *     is not matched on the boundary), so they add nothing more;
 *   - spheres, tori, B-spline surfaces and surfaces of revolution can bulge
 *     past their edges, so they add a box known to contain them.
 * The result is two boxes: `edgeBox` (only points on the part, so it is never
 * too big) and `box` (never too small). When they agree the box is exact; when
 * they differ the page says so and sizes stock from `box`.
 *
 * Stock is sized from the user's own allowance, rounding increment and
 * cut-off; the module states no material price.
 */

const EPS = 1e-9;

// ---------- vector helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const n = norm(a);
  return n > EPS ? scale(a, 1 / n) : null;
};
const TAU = 2 * Math.PI;

// ---------- STEP Part 21 reader ----------

/** Strip /* comments *\/ outside strings and return the DATA section text. */
function dataSection(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "*") {
      const j = text.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
    } else {
      out += c;
      i++;
    }
  }
  const m = /\bDATA\b\s*(\([^;]*\))?\s*;/.exec(out);
  if (!m) throw new Error("not a STEP file: no DATA section (expected ISO-10303-21)");
  const start = m.index + m[0].length;
  return out.slice(start);
}

/** Parse one parameter value starting at s[i]; returns [value, nextIndex]. */
function parseValue(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  const c = s[i];
  if (c === "'") {
    let j = i + 1, v = "";
    while (j < s.length) {
      if (s[j] === "'") {
        if (s[j + 1] === "'") { v += "'"; j += 2; continue; }
        break;
      }
      v += s[j++];
    }
    return [{ s: v }, j + 1];
  }
  if (c === "(") return parseList(s, i);
  if (c === "#") {
    let j = i + 1;
    while (j < s.length && /[0-9]/.test(s[j])) j++;
    return [{ ref: Number(s.slice(i + 1, j)) }, j];
  }
  if (c === "$" || c === "*") return [null, i + 1];
  if (c === ".") {
    const j = s.indexOf(".", i + 1);
    return [{ e: s.slice(i + 1, j) }, j + 1];
  }
  if (c === '"') {
    const j = s.indexOf('"', i + 1);
    return [{ bin: s.slice(i + 1, j) }, j + 1];
  }
  if (/[A-Za-z_]/.test(c)) {
    let j = i;
    while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
    const name = s.slice(i, j).toUpperCase();
    let k = j;
    while (k < s.length && /\s/.test(s[k])) k++;
    if (s[k] === "(") {
      const [args, next] = parseList(s, k);
      return [{ type: name, args }, next];
    }
    return [{ e: name }, j];
  }
  let j = i;
  while (j < s.length && /[-+0-9.eE]/.test(s[j])) j++;
  if (j === i) throw new Error(`unexpected '${c}' in STEP data`);
  return [Number(s.slice(i, j)), j];
}

function parseList(s, i) {
  // s[i] === "("
  const items = [];
  i++;
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] === ")") return [items, i + 1];
    const [v, j] = parseValue(s, i);
    items.push(v);
    i = j;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] === ",") { i++; continue; }
    if (s[i] === ")") return [items, i + 1];
    // complex-entity lists are space-separated: A() B()
    if (i >= s.length) throw new Error("unterminated list in STEP data");
  }
}

/**
 * Parse the DATA section into a Map id -> entity. A simple entity is
 * { type, args }; a complex one (#5=(A(..)B(..));) is { type: "", parts: {A: args, B: args} }.
 */
export function parseStep(text) {
  const body = dataSection(String(text));
  const ents = new Map();
  const re = /#(\d+)\s*=\s*/g;
  let m;
  while ((m = re.exec(body))) {
    const id = Number(m[1]);
    let i = re.lastIndex;
    while (/\s/.test(body[i])) i++;
    let ent;
    if (body[i] === "(") {
      const [list, next] = parseList(body, i);
      const parts = {};
      for (const p of list) if (p && p.type) parts[p.type] = p.args;
      ent = { type: "", parts };
      re.lastIndex = next;
    } else {
      const [v, next] = parseValue(body, i);
      if (!v || !v.type) throw new Error(`entity #${id} has no type`);
      ent = { type: v.type, args: v.args };
      re.lastIndex = next;
    }
    ents.set(id, ent);
    if (body.slice(re.lastIndex, re.lastIndex + 40).match(/^\s*ENDSEC\b/)) break;
  }
  if (!ents.size) throw new Error("no entities found in the STEP DATA section");
  return ents;
}

// ---------- units ----------

const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12 };

/** Millimetres per file length unit for a unit entity, or null if it is not a length unit. */
function lengthUnitMm(ents, id, depth = 0) {
  const e = ents.get(id);
  if (!e || depth > 8) return null;
  const parts = e.type ? { [e.type]: e.args } : e.parts;
  const isLength = "LENGTH_UNIT" in parts || (e.type && /LENGTH_UNIT/.test(e.type));
  if (!isLength) return null;
  if (parts.SI_UNIT) {
    const [prefix, name] = parts.SI_UNIT.length === 2 ? parts.SI_UNIT : parts.SI_UNIT.slice(-2);
    if (name && name.e === "METRE") return 1000 * (prefix && prefix.e && Object.hasOwn(SI_PREFIX, prefix.e) ? SI_PREFIX[prefix.e] : 1);
  }
  if (parts.CONVERSION_BASED_UNIT) {
    const [label, factorRef] = parts.CONVERSION_BASED_UNIT;
    const f = factorRef && factorRef.ref ? ents.get(factorRef.ref) : null;
    if (f) {
      const args = f.type ? f.args : Object.values(f.parts).find((a) => a.length === 2) || [];
      const raw = args[0];
      const value = typeof raw === "number" ? raw : raw && raw.args ? raw.args[0] : null;
      const base = args[1] && args[1].ref ? lengthUnitMm(ents, args[1].ref, depth + 1) : null;
      if (typeof value === "number" && base) return value * base;
    }
    const name = (label && label.s || "").toUpperCase();
    if (/^INCH/.test(name)) return 25.4;
    if (/^(FOOT|FEET)/.test(name)) return 304.8;
  }
  return null;
}

/** The length unit of the geometry, from GLOBAL_UNIT_ASSIGNED_CONTEXT. */
export function stepLengthUnit(ents) {
  const found = [];
  for (const e of ents.values()) {
    const units = e.type === "GLOBAL_UNIT_ASSIGNED_CONTEXT" ? e.args[0] : e.parts && e.parts.GLOBAL_UNIT_ASSIGNED_CONTEXT ? e.parts.GLOBAL_UNIT_ASSIGNED_CONTEXT[0] : null;
    if (!Array.isArray(units)) continue;
    for (const u of units) {
      const mm = u && u.ref ? lengthUnitMm(ents, u.ref) : null;
      if (mm) found.push(mm);
    }
  }
  if (!found.length) return { mm: 1, name: "mm", assumed: true, mixed: false };
  const mm = found[0];
  const name = Math.abs(mm - 25.4) < 1e-9 ? "in" : Math.abs(mm - 1) < 1e-12 ? "mm" : Math.abs(mm - 1000) < 1e-9 ? "m" : Math.abs(mm - 10) < 1e-12 ? "cm" : Math.abs(mm - 304.8) < 1e-9 ? "ft" : `${mm} mm`;
  return { mm, name, assumed: false, mixed: found.some((f) => Math.abs(f - mm) > 1e-12) };
}


// ---------- B-spline curves ----------

/** Full knot vector from STEP multiplicities and distinct knots. */
function expandKnots(mults, knots) {
  const U = [];
  mults.forEach((m, i) => { for (let j = 0; j < m; j++) U.push(knots[i]); });
  return U;
}

/** Point on a (rational) B-spline at u, by de Boor on homogeneous points [wx, wy, wz, w]. */
export function deBoor(p, H, U, u) {
  const n = H.length;
  let k = p;
  while (k < n - 1 && u >= U[k + 1]) k++;
  const d = [];
  for (let j = 0; j <= p; j++) d.push(H[k - p + j].slice());
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1] - U[i];
      const a = den > 0 ? (u - U[i]) / den : 0;
      for (let c = 0; c < 4; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
  }
  const h = d[p];
  return [h[0] / h[3], h[1] / h[3], h[2] / h[3]];
}

/** Insert knot u once (Boehm). Returns new [H, U]. */
function insertKnot(p, H, U, u) {
  const n = H.length;
  let k = p;
  while (k < n - 1 && u >= U[k + 1]) k++;
  const out = [];
  for (let i = 0; i <= k - p; i++) out.push(H[i]);
  for (let i = k - p + 1; i <= k; i++) {
    const den = U[i + p] - U[i];
    const a = den > 0 ? (u - U[i]) / den : 0;
    out.push(H[i].map((x, c) => (1 - a) * H[i - 1][c] + a * x));
  }
  for (let i = k; i < n; i++) out.push(H[i]);
  const U2 = U.slice(0, k + 1).concat([u], U.slice(k + 1));
  return [out, U2];
}

/** Parameter on the curve nearest to point q (dense sample, then golden-section). */
function invert(p, H, U, q) {
  const lo = U[p], hi = U[H.length];
  const M = Math.max(64, 16 * (H.length - p));
  const d2 = (u) => { const c = deBoor(p, H, U, u); return (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; };
  let best = lo, bd = Infinity;
  for (let i = 0; i <= M; i++) {
    const u = lo + ((hi - lo) * i) / M;
    const v = d2(u);
    if (v < bd) { bd = v; best = u; }
  }
  let a = Math.max(lo, best - (hi - lo) / M), b = Math.min(hi, best + (hi - lo) / M);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 60; it++) {
    const x1 = b - g * (b - a), x2 = a + g * (b - a);
    if (d2(x1) < d2(x2)) b = x2; else a = x1;
  }
  return (a + b) / 2;
}

/**
 * Points that bound the part of a B-spline curve an edge uses. `bound`:
 * refined control points (on each span the curve lies in the convex hull of
 * the p+1 control points acting there, weights positive); `on`: points on the
 * curve between the edge's end vertices. Each span is split `split` times by
 * knot insertion, so the hull closes in on the curve. With no vertices (a
 * closed edge) the whole curve is used.
 */
export function bsplineBounds(p, ctrl, weights, U, { from = null, to = null, sense = true, split = 16 } = {}) {
  let H = ctrl.map((q, i) => {
    const w = weights ? weights[i] : 1;
    return [q[0] * w, q[1] * w, q[2] * w, w];
  });
  const n = H.length;
  const lo = U[p], hi = U[n];
  let ranges = [[lo, hi]];
  if (from && to && Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]) > 1e-9) {
    let a = invert(p, H, U, from), b = invert(p, H, U, to);
    if (!sense) [a, b] = [b, a];
    ranges = a <= b ? [[a, b]] : [[a, hi], [lo, b]];
  }
  const on = [];
  for (const [a, b] of ranges) {
    const m = split * Math.max(1, n - p);
    for (let j = 0; j <= m; j++) on.push(deBoor(p, H, U, Math.min(a + ((b - a) * j) / m, hi)));
  }
  let K = U.slice();
  if (n * split < 20000) {
    const spans = [];
    for (let i = p; i < n; i++) if (U[i + 1] > U[i]) spans.push([U[i], U[i + 1]]);
    for (const [a, b] of spans) for (let j = 1; j < split; j++) [H, K] = insertKnot(p, H, K, a + ((b - a) * j) / split);
  }
  // cut the curve at the edge's ends (knot of multiplicity p), so control
  // points of the unused part of the curve stop counting
  for (const u of ranges.flat()) {
    if (u <= lo || u >= hi) continue;
    let mult = K.filter((x) => x === u).length;
    while (mult < p) { [H, K] = insertKnot(p, H, K, u); mult++; }
  }
  const bound = [];
  for (let i = 0; i < H.length; i++) {
    const active = ranges.some(([a, b]) => K[i + p + 1] > a && K[i] < b) || ranges.some(([a, b]) => a === b && K[i] <= a && K[i + p + 1] >= a);
    if (active) bound.push([H[i][0] / H[i][3], H[i][1] / H[i][3], H[i][2] / H[i][3]]);
  }
  return { bound, on };
}

// ---------- geometry extraction ----------

/**
 * Walk the B-rep and return primitives in millimetres:
 *   points:  [{p, exact}]   exact = on the part (vertices); else a bound (control points)
 *   arcs:    [{c, u, v, a, b, t0, t1, n}]  circle/ellipse edges, t1 > t0, span <= 2pi
 *   bulges:  [{kind, ...}]  surfaces that can pass their edges, with a containing shape
 *   planeNormals, axes: directions for the oriented-box search
 */
export function stepPrimitives(text) {
  const ents = parseStep(text);
  const units = stepLengthUnit(ents);
  const k = units.mm;
  const warnings = [];
  if (units.assumed) warnings.push("The file names no length unit; millimetres assumed.");
  if (units.mixed) warnings.push("The file has more than one length unit; the first one was used.");

  const get = (r) => (r && r.ref ? ents.get(r.ref) : null);
  const argsOf = (e, type) => (e.type === type ? e.args : e.parts ? e.parts[type] : null);
  const point = (r) => {
    const e = get(r);
    const a = e && argsOf(e, "CARTESIAN_POINT");
    if (!a) return null;
    const c = a[1];
    if (!Array.isArray(c) || c.length !== 3) return null;
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  const direction = (r, dflt) => {
    const e = get(r);
    const a = e && argsOf(e, "DIRECTION");
    if (!a || !Array.isArray(a[1]) || a[1].length !== 3) return dflt;
    return unit(a[1]) || dflt;
  };
  const placement = (r) => {
    const e = get(r);
    const a = e && argsOf(e, "AXIS2_PLACEMENT_3D");
    if (!a) return null;
    const c = point(a[1]);
    const n = direction(a[2], [0, 0, 1]);
    let x = direction(a[3], null);
    if (!x || Math.abs(dot(x, n)) > 1 - 1e-12) x = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    // project ref direction onto the plane normal to n, as STEP specifies
    const u = unit(sub(x, scale(n, dot(x, n))));
    const v = cross(n, u);
    return { c, n, u, v };
  };
  const ctrlPoints = (e) => {
    const out = [];
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && v.ref) {
        const p = point(v);
        if (p) out.push(p);
      }
    };
    if (e.type) walk(e.args);
    else Object.values(e.parts).forEach(walk);
    return out;
  };
  // degree, control points, weights and knots of a B-spline or Bezier curve entity, or null
  const splineOf = (e, ends = {}) => {
    const P = e.parts || { [e.type]: e.args };
    let deg, refs, mults, knots, weights = null;
    if (P.B_SPLINE_CURVE_WITH_KNOTS && P.B_SPLINE_CURVE_WITH_KNOTS.length >= 8) {
      const a = P.B_SPLINE_CURVE_WITH_KNOTS; // simple form: name, degree, pts, form, closed, self, mults, knots, spec
      [deg, refs, mults, knots] = [a[1], a[2], a[6], a[7]];
    } else if (P.B_SPLINE_CURVE) {
      const b = P.B_SPLINE_CURVE;
      const off = b.length >= 6 ? 1 : 0;
      deg = b[off]; refs = b[off + 1];
      if (P.B_SPLINE_CURVE_WITH_KNOTS) [mults, knots] = P.B_SPLINE_CURVE_WITH_KNOTS;
      if (P.RATIONAL_B_SPLINE_CURVE) weights = P.RATIONAL_B_SPLINE_CURVE[0];
    } else if (P.BEZIER_CURVE) {
      const b = P.BEZIER_CURVE;
      deg = b[1]; refs = b[2];
    }
    if (!Array.isArray(refs) || typeof deg !== "number") return null;
    const ctrl = refs.map((r) => point(r));
    if (ctrl.some((q) => !q)) return null;
    if (!mults) { mults = [deg + 1, deg + 1]; knots = [0, 1]; }
    const U = expandKnots(mults, knots);
    if (U.length !== ctrl.length + deg + 1) return null;
    if (weights && (weights.length !== ctrl.length || weights.some((w) => !(w > 0)))) return null;
    return bsplineBounds(deg, ctrl, weights, U, ends);
  };
  const isBspline = (e) => (e.type ? /^(B_SPLINE|BEZIER|QUASI_UNIFORM|UNIFORM|RATIONAL_B_SPLINE)/.test(e.type) : Object.keys(e.parts).some((t) => /B_SPLINE|BEZIER/.test(t)));

  const points = [];
  const arcs = [];
  const bulges = [];
  const planeNormals = [];
  const axes = [];
  let edgeCount = 0, solids = 0, faces = 0;
  const unknownCurves = new Set();
  const unknownSurfaces = new Set();

  const vertexCache = new Map();
  const vertex = (r) => {
    if (!r || !r.ref) return null;
    if (vertexCache.has(r.ref)) return vertexCache.get(r.ref);
    const e = get(r);
    const a = e && argsOf(e, "VERTEX_POINT");
    const p = a ? point(a[1]) : null;
    vertexCache.set(r.ref, p);
    return p;
  };

  const edgeSamples = new Map(); // edge id -> points on the edge
  let curEdge = null;
  const sample = (q) => { if (curEdge) curEdge.push(q); };
  const addArc = (pl, a, b, ps, pe, sense, closed) => {
    const angle = (p) => {
      const d = sub(p, pl.c);
      return Math.atan2(dot(d, pl.v) / b, dot(d, pl.u) / a);
    };
    let t0 = 0, t1 = TAU;
    if (!closed && ps && pe) {
      let s = angle(ps), f = angle(pe);
      if (!sense) [s, f] = [f, s];
      while (f <= s + 1e-12) f += TAU;
      t0 = s; t1 = f;
    }
    arcs.push({ c: pl.c, u: pl.u, v: pl.v, n: pl.n, a, b, t0, t1 });
    const m = Math.max(2, Math.ceil((t1 - t0) / (TAU / 128)));
    for (let i = 0; i <= m; i++) {
      const t = t0 + ((t1 - t0) * i) / m;
      sample(add(pl.c, add(scale(pl.u, a * Math.cos(t)), scale(pl.v, b * Math.sin(t)))));
    }
    axes.push(pl.n);
  };

  const curveOf = (r, ps, pe, sense, closed) => {
    let e = get(r);
    for (let guard = 0; e && guard < 5; guard++) {
      const sc = argsOf(e, "SURFACE_CURVE") || argsOf(e, "SEAM_CURVE") || argsOf(e, "INTERSECTION_CURVE");
      if (sc) { e = get(sc[1]); continue; }
      const tc = argsOf(e, "TRIMMED_CURVE");
      if (tc) { e = get(tc[1]); continue; }
      break;
    }
    if (!e) return;
    const circ = argsOf(e, "CIRCLE");
    if (circ) {
      const pl = placement(circ[1]);
      const r0 = circ[2] * k;
      if (pl && pl.c && r0 > 0) addArc(pl, r0, r0, ps, pe, sense, closed);
      return;
    }
    const ell = argsOf(e, "ELLIPSE");
    if (ell) {
      const pl = placement(ell[1]);
      if (pl && pl.c) addArc(pl, ell[2] * k, ell[3] * k, ps, pe, sense, closed);
      return;
    }
    if (argsOf(e, "LINE")) return; // the vertices bound a line segment
    if (argsOf(e, "POLYLINE")) {
      for (const p of ctrlPoints(e)) { points.push({ p, exact: true }); sample(p); }
      return;
    }
    if (isBspline(e)) {
      const sp = splineOf(e, closed ? {} : { from: ps, to: pe, sense });
      if (sp) {
        for (const p of sp.bound) points.push({ p, exact: false });
        for (const p of sp.on) { points.push({ p, exact: true }); sample(p); }
      } else {
        for (const p of ctrlPoints(e)) points.push({ p, exact: false });
      }
      return;
    }
    unknownCurves.add(e.type || Object.keys(e.parts).join("+"));
    for (const p of ctrlPoints(e)) points.push({ p, exact: false });
  };

  let curFace = null;
  const torusFaces = [];
  const surfaceOf = (r) => {
    const e = get(r);
    if (!e) return;
    const pl = argsOf(e, "PLANE");
    if (pl) {
      const p = placement(pl[1]);
      if (p) planeNormals.push(p.n);
      return;
    }
    const cy = argsOf(e, "CYLINDRICAL_SURFACE");
    if (cy) {
      const p = placement(cy[1]);
      if (p) axes.push(p.n);
      return;
    }
    if (argsOf(e, "CONICAL_SURFACE")) return;
    const sp = argsOf(e, "SPHERICAL_SURFACE");
    if (sp) {
      const p = placement(sp[1]);
      if (p && p.c) bulges.push({ kind: "sphere", c: p.c, r: sp[2] * k });
      return;
    }
    const to = argsOf(e, "TOROIDAL_SURFACE") || argsOf(e, "DEGENERATE_TOROIDAL_SURFACE");
    if (to) {
      const p = placement(to[1]);
      if (p && p.c) {
        const t = { kind: "torus", c: p.c, n: p.n, u: p.u, v: p.v, R: to[2] * k, r: to[3] * k };
        bulges.push(t);
        if (curFace) torusFaces.push([t, curFace]);
      }
      if (p) axes.push(p.n);
      return;
    }
    const rev = argsOf(e, "SURFACE_OF_REVOLUTION");
    if (rev) {
      const ax = get(rev[2]);
      const aa = ax && argsOf(ax, "AXIS1_PLACEMENT");
      if (aa) {
        const o = point(aa[1]);
        const n = direction(aa[2], [0, 0, 1]);
        const pts = [];
        const collect = (cr) => {
          const ce = get(cr);
          if (!ce) return;
          const circ = argsOf(ce, "CIRCLE") || argsOf(ce, "ELLIPSE");
          if (circ) {
            const p = placement(circ[1]);
            const R = Math.max(circ[2], circ[3] || 0) * k;
            for (const d of [p.u, p.v]) { pts.push(add(p.c, scale(d, R))); pts.push(sub(p.c, scale(d, R))); }
            pts.push(add(p.c, scale(p.n, 0)));
            // the whole circle sits inside the square around it, which these four points span
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(add(p.c, add(scale(p.u, sx * R), scale(p.v, sy * R))));
            return;
          }
          const tc = argsOf(ce, "TRIMMED_CURVE");
          if (tc) return collect(tc[1]);
          pts.push(...ctrlPoints(ce));
        };
        collect(rev[1]);
        if (o && pts.length) {
          let rho = 0, hmin = Infinity, hmax = -Infinity;
          for (const q of pts) {
            const d = sub(q, o);
            const h = dot(d, n);
            rho = Math.max(rho, norm(sub(d, scale(n, h))));
            hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
          }
          bulges.push({ kind: "revolution", o, n, rho, hmin, hmax });
          axes.push(n);
        }
      }
      return;
    }
    const ext = argsOf(e, "SURFACE_OF_LINEAR_EXTRUSION");
    if (ext) return; // its extremes are on its edges
    if (isBspline(e)) {
      for (const p of ctrlPoints(e)) points.push({ p, exact: false });
      return;
    }
    const off = argsOf(e, "OFFSET_SURFACE");
    if (off) {
      unknownSurfaces.add("OFFSET_SURFACE");
      return;
    }
    unknownSurfaces.add(e.type || Object.keys(e.parts).join("+"));
  };

  for (const [id, e] of ents) {
    const ec = argsOf(e, "EDGE_CURVE");
    if (ec) {
      edgeCount++;
      const ps = vertex(ec[1]);
      const pe = vertex(ec[2]);
      if (ps) points.push({ p: ps, exact: true });
      if (pe && ec[2].ref !== ec[1].ref) points.push({ p: pe, exact: true });
      const closed = ec[1].ref === ec[2].ref || (ps && pe && norm(sub(ps, pe)) < 1e-9 * Math.max(1, norm(ps)));
      const sense = !(ec[4] && ec[4].e === "F");
      curEdge = [];
      if (ps) curEdge.push(ps);
      if (pe) curEdge.push(pe);
      curveOf(ec[3], ps, pe, sense, closed);
      edgeSamples.set(id, curEdge);
      curEdge = null;
      continue;
    }
    const af = argsOf(e, "ADVANCED_FACE") || argsOf(e, "FACE_SURFACE");
    if (af) {
      faces++;
      curFace = af;
      surfaceOf(af[2]);
      curFace = null;
      continue;
    }
    if (argsOf(e, "MANIFOLD_SOLID_BREP") || argsOf(e, "BREP_WITH_VOIDS")) solids++;
  }

  // A torus face lies within r of its spine circle, and only of the stretch of
  // spine its own boundary spans: bound it by that arc (widened by one sample
  // step each side) instead of the whole ring.
  const step = TAU / 128;
  for (const [t, af] of torusFaces) {
    const pts = [];
    for (const b of Array.isArray(af[1]) ? af[1] : []) {
      const fb = get(b);
      const fa = fb && (argsOf(fb, "FACE_OUTER_BOUND") || argsOf(fb, "FACE_BOUND"));
      const loop = fa && get(fa[1]);
      const la = loop && argsOf(loop, "EDGE_LOOP");
      if (!la) continue;
      for (const oe of la[1]) {
        const o = get(oe);
        const oa = o && argsOf(o, "ORIENTED_EDGE");
        const s = oa && oa[3] && edgeSamples.get(oa[3].ref);
        if (s) pts.push(...s);
      }
    }
    if (pts.length < 2) continue;
    const ang = pts.map((q) => {
      const d = sub(q, t.c);
      return (Math.atan2(dot(d, t.v), dot(d, t.u)) + TAU) % TAU;
    }).sort((x, y) => x - y);
    let gap = ang[0] + TAU - ang[ang.length - 1], at = 0;
    for (let i = 1; i < ang.length; i++) if (ang[i] - ang[i - 1] > gap) { gap = ang[i] - ang[i - 1]; at = i; }
    if (gap <= 2 * step + 1e-9) continue; // goes all the way round
    const t0 = ang[at] - step;
    let t1 = (at === 0 ? ang[ang.length - 1] : ang[at - 1] + TAU) + step;
    while (t1 <= t0) t1 += TAU;
    t.spine = { c: t.c, u: t.u, v: t.v, n: t.n, a: t.R, b: t.R, t0, t1 };
  }

  let assembly = false;
  for (const e of ents.values()) {
    if (argsOf(e, "CONTEXT_DEPENDENT_SHAPE_REPRESENTATION") || argsOf(e, "NEXT_ASSEMBLY_USAGE_OCCURRENCE")) { assembly = true; break; }
  }
  if (assembly) warnings.push("This looks like an assembly: parts are measured where each is modelled, not where the assembly places them. Export the single part you are quoting.");
  if (solids > 1) warnings.push(`The file holds ${solids} solids; the box covers all of them.`);

  if (!edgeCount) {
    // faceted or wireframe only: every 3D point in the file
    for (const e of ents.values()) {
      const a = argsOf(e, "CARTESIAN_POINT");
      if (a && Array.isArray(a[1]) && a[1].length === 3) points.push({ p: scale(a[1], k), exact: true });
    }
    if (points.length) warnings.push("No B-rep edges found; the box is taken from every 3D point in the file.");
  }
  if (unknownCurves.size) warnings.push(`Curve types bounded by their points only: ${[...unknownCurves].join(", ")}.`);
  if (unknownSurfaces.size) warnings.push(`Surface types not checked for bulges past their edges: ${[...unknownSurfaces].join(", ")}. Check the box against the drawing.`);
  if (!points.length && !arcs.length) throw new Error("no geometry found in the STEP file");

  return { format: "step", units, points, arcs, bulges, planeNormals, axes, counts: { edges: edgeCount, faces, solids }, warnings };
}

// ---------- STL ----------

/** Parse ASCII or binary STL into a flat Float64Array of triangle vertices (9 per triangle). */
export function parseStl(input) {
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : new TextEncoder().encode(String(input));
  const isBinary = (() => {
    if (bytes.length < 84) return false;
    const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    if (84 + n * 50 === bytes.length) return true;
    const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512)));
    return !/^\s*solid\b/i.test(head) || !/facet\b/i.test(new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096))));
  })();
  if (isBinary) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = dv.getUint32(80, true);
    if (84 + n * 50 > bytes.length) throw new Error(`binary STL says ${n} triangles but the file is too short`);
    const out = new Float64Array(n * 9);
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12;
      for (let j = 0; j < 9; j++) out[t * 9 + j] = dv.getFloat32(o + j * 4, true);
    }
    return out;
  }
  const text = new TextDecoder().decode(bytes);
  const nums = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9) throw new Error("ASCII STL has no complete triangles");
  return Float64Array.from(nums);
}

/** Volume, area, closed check and primitives for a mesh. STL has no units: `mmPerUnit` is the user's answer. */
export function stlPrimitives(tris, mmPerUnit = 1) {
  const n = tris.length / 9;
  const points = [];
  let vol = 0, area = 0;
  const normals = new Map();
  const edgeUse = new Map();
  const key = (i) => `${tris[i]},${tris[i + 1]},${tris[i + 2]}`;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const a = [tris[o], tris[o + 1], tris[o + 2]].map((x) => x * mmPerUnit);
    const b = [tris[o + 3], tris[o + 4], tris[o + 5]].map((x) => x * mmPerUnit);
    const c = [tris[o + 6], tris[o + 7], tris[o + 8]].map((x) => x * mmPerUnit);
    points.push({ p: a, exact: true }, { p: b, exact: true }, { p: c, exact: true });
    vol += dot(a, cross(b, c)) / 6;
    const nn = cross(sub(b, a), sub(c, a));
    const ar = norm(nn) / 2;
    area += ar;
    const un = unit(nn);
    if (un) {
      const sgn = un[0] < -1e-9 || (Math.abs(un[0]) <= 1e-9 && (un[1] < -1e-9 || (Math.abs(un[1]) <= 1e-9 && un[2] < 0))) ? -1 : 1;
      const d = scale(un, sgn);
      const kk = d.map((x) => x.toFixed(4)).join(",");
      const cur = normals.get(kk);
      if (cur) cur.w += ar; else normals.set(kk, { d, w: ar });
    }
    const ks = [key(o), key(o + 3), key(o + 6)];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const e = ks[i] < ks[j] ? ks[i] + "|" + ks[j] : ks[j] + "|" + ks[i];
      edgeUse.set(e, (edgeUse.get(e) || 0) + 1);
    }
  }
  let open = 0;
  for (const v of edgeUse.values()) if (v !== 2) open++;
  const planeNormals = [...normals.values()].sort((x, y) => y.w - x.w).slice(0, 24).map((x) => x.d);
  const warnings = [];
  if (open) warnings.push(`The mesh has ${open} edge${open === 1 ? "" : "s"} not shared by exactly two triangles, so it is not closed; the volume and weight may be wrong.`);
  return { format: "stl", units: { mm: mmPerUnit, name: null, assumed: true }, points, arcs: [], bulges: [], planeNormals, axes: [], volume: Math.abs(vol), area, closed: open === 0, counts: { triangles: n }, warnings };
}

// ---------- boxes ----------

/** Extent of an arc along direction d: [min, max] of dot(point, d) over the arc. */
function arcRange(arc, d) {
  const cd = dot(arc.c, d);
  const A = arc.a * dot(arc.u, d);
  const B = arc.b * dot(arc.v, d);
  const f = (t) => cd + A * Math.cos(t) + B * Math.sin(t);
  let lo = Math.min(f(arc.t0), f(arc.t1));
  let hi = Math.max(f(arc.t0), f(arc.t1));
  const amp = Math.hypot(A, B);
  if (amp > 0) {
    const phi = Math.atan2(B, A); // max at t = phi, min at phi + pi
    const inArc = (t) => {
      let x = t;
      while (x < arc.t0) x += TAU;
      while (x >= arc.t0 + TAU) x -= TAU;
      return x <= arc.t1 + 1e-12;
    };
    if (arc.t1 - arc.t0 >= TAU - 1e-12 || inArc(phi)) hi = cd + amp;
    if (arc.t1 - arc.t0 >= TAU - 1e-12 || inArc(phi + Math.PI)) lo = cd - amp;
  }
  return [lo, hi];
}

function bulgeRange(b, d) {
  if (b.kind === "sphere") {
    const c = dot(b.c, d);
    return [c - b.r, c + b.r];
  }
  if (b.kind === "torus" && b.spine) {
    const [lo, hi] = arcRange(b.spine, d);
    return [lo - b.r, hi + b.r];
  }
  if (b.kind === "torus") {
    const c = dot(b.c, d);
    const s = Math.sqrt(Math.max(0, 1 - dot(b.n, d) ** 2));
    const h = b.R * s + b.r;
    return [c - h, c + h];
  }
  // revolution: inside the cylinder of radius rho between hmin and hmax
  const s = Math.sqrt(Math.max(0, 1 - dot(b.n, d) ** 2)) * b.rho;
  const p0 = dot(b.o, d) + b.hmin * dot(b.n, d);
  const p1 = dot(b.o, d) + b.hmax * dot(b.n, d);
  return [Math.min(p0, p1) - s, Math.max(p0, p1) + s];
}

/** Box in a frame (three orthonormal directions). Returns {min, max, edgeMin, edgeMax}. */
export function boxInFrame(prims, frame = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const emin = [Infinity, Infinity, Infinity], emax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 3; i++) {
    const d = frame[i];
    for (const { p, exact } of prims.points) {
      const x = dot(p, d);
      if (x < min[i]) min[i] = x;
      if (x > max[i]) max[i] = x;
      if (exact) {
        if (x < emin[i]) emin[i] = x;
        if (x > emax[i]) emax[i] = x;
      }
    }
    for (const a of prims.arcs) {
      const [lo, hi] = arcRange(a, d);
      if (lo < min[i]) min[i] = lo;
      if (hi > max[i]) max[i] = hi;
      if (lo < emin[i]) emin[i] = lo;
      if (hi > emax[i]) emax[i] = hi;
    }
    for (const b of prims.bulges) {
      const [lo, hi] = bulgeRange(b, d);
      if (lo < min[i]) min[i] = lo;
      if (hi > max[i]) max[i] = hi;
    }
  }
  return { min, max, edgeMin: emin, edgeMax: emax };
}

const dims = (b) => b.max.map((x, i) => x - b.min[i]);

/**
 * Smallest-volume box over frames built from the part's own plane normals and
 * hole/turning axes (a part modelled at an angle is usually cut from stock
 * squared to one of its faces). The world frame is always a candidate.
 */
export function orientedBox(prims, maxDirs = 16) {
  const world = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const dirs = [];
  const seen = (d) => dirs.some((e) => Math.abs(dot(d, e)) > 1 - 1e-6);
  for (const d of [...prims.planeNormals, ...prims.axes]) {
    const u = unit(d);
    if (u && !seen(u)) dirs.push(u);
    if (dirs.length >= maxDirs) break;
  }
  let best = { frame: world, box: boxInFrame(prims, world) };
  let bestVol = dims(best.box).reduce((a, b) => a * b, 1);
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      if (Math.abs(dot(dirs[i], dirs[j])) > 1e-6) continue;
      const frame = [dirs[i], dirs[j], cross(dirs[i], dirs[j])];
      const box = boxInFrame(prims, frame);
      const vol = dims(box).reduce((a, b) => a * b, 1);
      if (vol < bestVol * (1 - 1e-9)) { best = { frame, box }; bestVol = vol; }
    }
    // a lone direction (e.g. a turned part's axis) paired with any perpendicular
    const d = dirs[i];
    const p = unit(cross(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const frame = [d, p, cross(d, p)];
    const box = boxInFrame(prims, frame);
    const vol = dims(box).reduce((a, b) => a * b, 1);
    if (vol < bestVol * (1 - 1e-9)) { best = { frame, box }; bestVol = vol; }
  }
  return best;
}

// ---------- round envelope ----------

/** Max distance from the line (o, e) over all primitives: never less than the true value. */
export function radialMax(prims, o, e) {
  const radial = (p) => {
    const d = sub(p, o);
    return norm(sub(d, scale(e, dot(d, e))));
  };
  let r = 0;
  for (const { p } of prims.points) r = Math.max(r, radial(p));
  for (const a of prims.arcs) {
    const coaxialPlane = Math.abs(dot(a.n, e)) > 1 - 1e-9;
    if (coaxialPlane && Math.abs(a.a - a.b) < 1e-12) {
      // circle in a plane normal to the axis: exact
      const off = sub(a.c, o);
      const oo = sub(off, scale(e, dot(off, e)));
      const ox = dot(oo, a.u), oy = dot(oo, a.v);
      const dist = (t) => Math.hypot(ox + a.a * Math.cos(t), oy + a.a * Math.sin(t));
      let m = Math.max(dist(a.t0), dist(a.t1));
      const phi = Math.atan2(oy, ox);
      let x = phi;
      while (x < a.t0) x += TAU;
      while (x >= a.t0 + TAU) x -= TAU;
      if (a.t1 - a.t0 >= TAU - 1e-12 || x <= a.t1 + 1e-12) m = Math.max(m, Math.hypot(ox, oy) + a.a);
      r = Math.max(r, m);
      continue;
    }
    // any other arc: split into pieces of at most 2pi/128; each piece lies in the
    // triangle of its end points and the meeting point of their tangents, and
    // distance from a line is convex, so those three points bound the piece
    const span = a.t1 - a.t0;
    const m = Math.max(1, Math.ceil(span / (TAU / 128)));
    const step = span / m;
    const out = 1 / Math.cos(step / 2);
    const at = (t, s) => add(a.c, add(scale(a.u, a.a * Math.cos(t) * s), scale(a.v, a.b * Math.sin(t) * s)));
    for (let i = 0; i <= m; i++) {
      r = Math.max(r, radial(at(a.t0 + i * step, 1)));
      if (i < m) r = Math.max(r, radial(at(a.t0 + (i + 0.5) * step, out)));
    }
  }
  for (const b of prims.bulges) {
    if (b.kind === "sphere") r = Math.max(r, radial(b.c) + b.r);
    else if (b.kind === "torus" && b.spine) r = Math.max(r, radialMax({ points: [], arcs: [b.spine], bulges: [] }, o, e) + b.r);
    else if (b.kind === "torus") r = Math.max(r, radial(b.c) + b.R + b.r);
    else {
      const p0 = add(b.o, scale(b.n, b.hmin)), p1 = add(b.o, scale(b.n, b.hmax));
      r = Math.max(r, Math.max(radial(p0), radial(p1)) + b.rho);
    }
  }
  return r;
}

/**
 * For each direction of the frame, the smallest round bar (diameter) that holds
 * the part turning about a line along that direction. Candidate lines: through
 * the centre of the box, and through the centres of circles, tori and
 * revolutions whose axis runs that way (a turned part's own axis).
 */
export function roundEnvelopes(prims, frame, box) {
  const centre = frame.reduce((acc, d, i) => add(acc, scale(d, (box.min[i] + box.max[i]) / 2)), [0, 0, 0]);
  return frame.map((e) => {
    const cands = [centre];
    const take = (c) => {
      if (!c) return;
      if (cands.some((q) => norm(sub(sub(q, c), scale(e, dot(sub(q, c), e)))) < 1e-6)) return;
      cands.push(c);
    };
    const arcs = prims.arcs.filter((a) => Math.abs(dot(a.n, e)) > 1 - 1e-9).sort((x, y) => y.a - x.a);
    for (const a of arcs.slice(0, 12)) take(a.c);
    for (const b of prims.bulges) if (b.kind !== "sphere" && Math.abs(dot(b.n, e)) > 1 - 1e-9) take(b.c || b.o);
    let best = Infinity;
    for (const o of cands) best = Math.min(best, 2 * radialMax(prims, o, e));
    return best;
  });
}

// ---------- the whole reading ----------

/** Read a file's bytes. `name` picks the format by extension; STL needs mmPerUnit. */
export function readPart(bytes, name = "", { mmPerUnit = 1 } = {}) {
  const lower = String(name).toLowerCase();
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder().decode(u8.subarray(0, 64));
  let prims;
  if (/\.(stp|step|p21)$/.test(lower) || /^\s*ISO-10303-21/.test(head)) {
    prims = stepPrimitives(new TextDecoder().decode(u8));
  } else if (/\.stl$/.test(lower) || /^\s*solid\b/i.test(head) || u8.length >= 84) {
    prims = stlPrimitives(parseStl(u8), mmPerUnit);
  } else {
    throw new Error("Unrecognised file: send a STEP (.step, .stp) or STL (.stl) file.");
  }
  const world = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const worldBox = boxInFrame(prims, world);
  const oriented = orientedBox(prims);
  const env = roundEnvelopes(prims, oriented.frame, oriented.box);
  const size = dims(oriented.box);
  const edgeSize = oriented.box.edgeMax.map((x, i) => x - oriented.box.edgeMin[i]);
  const gap = Math.max(...size.map((s, i) => s - edgeSize[i]));
  return {
    format: prims.format,
    units: prims.units,
    counts: prims.counts,
    warnings: prims.warnings,
    volume: prims.volume ?? null,
    area: prims.area ?? null,
    closed: prims.closed ?? null,
    worldBox: { min: worldBox.min, max: worldBox.max, size: dims(worldBox) },
    frame: oriented.frame,
    rotated: oriented.frame !== world && !oriented.frame.every((d, i) => Math.abs(d[i]) > 1 - 1e-9),
    size,
    exact: gap <= 1e-6 * Math.max(1, ...size),
    maxOverstatement: gap,
    envelopes: env,
  };
}

// ---------- stock ----------

const roundUp = (x, inc) => (inc > 0 ? Math.ceil(x / inc - 1e-9) * inc : x);

/**
 * Stock options from a reading and the shop's own allowances (all in mm):
 *   allowance: added to each side of the cross-section (so twice per dimension)
 *   lengthExtra: facing + cut-off/saw kerf added once to the length
 *   increment: round each cross-section size up to this (e.g. 3.175 for 1/8 in)
 * Returns options sorted by stock volume, each {shape, axis, cross, length, volume}.
 */
export function stockOptions(reading, { allowance = 0, lengthExtra = 0, increment = 0 } = {}) {
  const s = reading.size;
  const out = [];
  // rectangular bar or plate: length along the longest side
  const order = [0, 1, 2].sort((a, b) => s[a] - s[b]);
  const t = roundUp(s[order[0]] + 2 * allowance, increment);
  const w = roundUp(s[order[1]] + 2 * allowance, increment);
  const L = s[order[2]] + lengthExtra;
  out.push({ shape: "rect", axis: order[2], cross: [t, w], length: L, volume: t * w * L });
  // round bar along each axis
  for (let i = 0; i < 3; i++) {
    const d = roundUp(reading.envelopes[i] + 2 * allowance, increment);
    const len = s[i] + lengthExtra;
    if (out.some((o) => o.shape === "round" && Math.abs(o.cross[0] - d) < 1e-9 && Math.abs(o.length - len) < 1e-9)) continue; // same bar as a side already listed
    out.push({ shape: "round", axis: i, cross: [d], length: len, volume: (Math.PI / 4) * d * d * len });
  }
  return out.sort((a, b) => a.volume - b.volume);
}

/**
 * Material cost per part from the user's own price. density in g/cm3; price
 * either per kg, per lb, per metre or per foot of that bar.
 */
export function materialCost(option, { density = 0, price = 0, per = "kg" } = {}) {
  const grams = (option.volume / 1000) * density;
  const kg = grams / 1000;
  let cost = 0;
  if (per === "kg") cost = kg * price;
  else if (per === "lb") cost = (kg / 0.45359237) * price;
  else if (per === "m") cost = (option.length / 1000) * price;
  else if (per === "ft") cost = (option.length / 304.8) * price;
  return { kg, lb: kg / 0.45359237, cost };
}
