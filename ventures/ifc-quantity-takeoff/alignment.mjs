// IFC4X3 alignment curves and IfcLinearPlacement.
//
// Bridges, roads and rail in IFC4X3 place their parts by station along an
// alignment: an IfcLinearPlacement whose IfcAxis2PlacementLinear names an
// IfcPointByDistanceExpression (distance along, lateral, vertical and
// longitudinal offsets) on a basis curve. The basis curve is usually an
// IfcGradientCurve: a horizontal IfcCompositeCurve of IfcCurveSegment pieces
// (lines, circular arcs, clothoids) with a vertical profile of the same kind
// laid over it, drawn in (distance along, elevation).
//
// What is read here (IFC 4.3 ADD2):
// - IfcCurveSegment(Transition, Placement, SegmentStart, SegmentLength,
//   ParentCurve): the parent curve from SegmentStart for SegmentLength (a
//   negative length runs the parent backwards), moved so its point and
//   direction of travel at SegmentStart sit on Placement. Only the parent's
//   own shape matters, so where an exporter put the parent curve is ignored.
// - Parent curves: IfcLine, IfcCircle, IfcClothoid (tangent angle
//   s^2 / (2 A |A|) from the inflection point), IfcCosineSpiral (curvature
//   1/A1 cos(pi s / L) + 1/A0, L the IfcCurveSegment's length: a 300 to
//   1000 m transition ends where buildingSMART's sample places the next
//   segment, to 5e-7 m), IfcPolyline.
// - IfcCompositeCurve of IfcCurveSegment (the horizontal), IfcGradientCurve
//   (horizontal + vertical), IfcPolyline as a bare basis curve.
// - IfcSegmentedReferenceCurve (cant) over a gradient curve: each segment's
//   Placement holds (distance along, deviating elevation) in its Location and
//   the cross slope in its Axis (theta = atan2(Axis z, Axis y), roll
//   pi/2 - theta, positive when the right rail is the high one, so the frame's
//   z leans to the left). Between one segment's placement and the next (or
//   EndPoint) the elevation and theta move by the parent curve's own
//   function: buildingSMART's sample text (IFC4.3.x-sample-models,
//   segmented-reference-curve/README.md) gives a cosine parent
//   D(s) = L/A0 + L/A1 cos(pi s / L), L times its curvature; a clothoid's L
//   times its curvature is linear (a linear cant run-off). Read here as
//   w(s) = (f(s) - f(0)) / (f(L) - f(0)), elevation y0 + (y1 - y0) w and
//   theta t0 + (t1 - t0) w, which is the sample's text exactly and stays
//   joined to the next placement for any parent; a parent whose function
//   does not change (a line: constant cant) moves linearly. The elevation's
//   slope adds to the gradient. eval/cant-2026-11-23.md.
// - The frame at a station: x along the curve's tangent (with its gradient),
//   y level to the left, z perpendicular to the tangent in the vertical plane
//   through it: the frame IfcPointByDistanceExpression's offsets are measured
//   in. Axis and RefDirection, when given, turn the frame within that one.
//   This is also IfcOpenShell 0.8's reading (eval/linear-placement-*.md).
//
// What is not (each throws Unresolved, so the element is "not read" and the
// rest of the file still is): spirals other than the clothoid and the
// cosine (sine, polynomial spirals), IfcPolynomialCurve,
// IfcOffsetCurveByDistances, a segmented reference curve over anything but
// a gradient or composite curve.

const GAUSS = [
  [-0.906179845938664, 0.236926885056189],
  [-0.538469310105683, 0.478628670499366],
  [0, 0.568888888888889],
  [0.538469310105683, 0.478628670499366],
  [0.906179845938664, 0.236926885056189],
];

/** integral of f over [a, b], five-point Gauss-Legendre on n equal pieces */
function integrate(f, a, b, n) {
  let sum = 0;
  const h = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const m = a + h * (i + 0.5);
    for (const [x, w] of GAUSS) sum += w * f(m + (h / 2) * x);
  }
  return (sum * h) / 2;
}

export class AlignmentError extends Error {}

const typedName = (v) => (v && typeof v === "object" && "typed" in v ? v.typed : null);

/**
 * A curve in the plane, by arc length: { length, at(s) -> {p:[x,y], t:[tx,ty]} }.
 * `at` extends the curve along its end tangents outside [0, length].
 */
function planeFrame(o, d) {
  // 2D placement: origin o, x direction d
  return { o, x: d, y: [-d[1], d[0]] };
}
const onFrame = (F, p) => [F.o[0] + p[0] * F.x[0] + p[1] * F.y[0], F.o[1] + p[0] * F.x[1] + p[1] * F.y[1]];
const dirOnFrame = (F, t) => [t[0] * F.x[0] + t[1] * F.y[0], t[0] * F.x[1] + t[1] * F.y[1]];

/** the level-left and up axes of a station's frame turned by a cant's roll about the tangent (z toward the left for a positive roll) */
function rolled(Y, Z, roll) {
  if (!roll) return [Y, Z];
  const c = Math.cos(roll), s = Math.sin(roll);
  return [[0, 1, 2].map((i) => c * Y[i] - s * Z[i]), [0, 1, 2].map((i) => c * Z[i] + s * Y[i])];
}

export class AlignmentReader {
  /** @param {import("./geom.mjs").Geometry} geo for get/num/point/dir and the plane-angle unit */
  constructor(geo) {
    this.geo = geo;
    this.cache = new Map();
  }

  fail(msg) { throw new AlignmentError(msg); }

  place2(ref) {
    const g = this.geo;
    const e = g.get(ref);
    if (!e) return planeFrame([0, 0], [1, 0]);
    if (e.type !== "IFCAXIS2PLACEMENT2D" && e.type !== "IFCAXIS2PLACEMENT3D") this.fail(`curve placement ${e.type}`);
    const o = g.point(e.args[0]);
    const xr = e.type === "IFCAXIS2PLACEMENT2D" ? e.args[1] : e.args[2];
    const x = g.dir(xr, [1, 0, 0]);
    const n = Math.hypot(x[0], x[1]) || 1;
    return planeFrame([o[0], o[1]], [x[0] / n, x[1] / n]);
  }

  /**
   * a parent curve's point and unit tangent at arc length s (and how a
   * parameter value maps to s); L is the curve segment's length, which the
   * IFC 4.3 spirals other than the clothoid are written against. `fn`, where
   * given, is L times the curvature at s: the function a cant segment reads.
   */
  parent(ref, L = 1) {
    const g = this.geo;
    const e = g.get(ref);
    if (!e) this.fail("missing parent curve");
    switch (e.type) {
      case "IFCLINE": {
        const p = g.point(e.args[0]);
        const v = g.get(e.args[1]);
        const d = v ? g.dir(v.args[0], [1, 0, 0]) : [1, 0, 0];
        const mag = v ? Math.abs(g.num(v.args[1]) ?? 1) || 1 : 1;
        const n = Math.hypot(d[0], d[1]) || 1;
        const t = [d[0] / n, d[1] / n];
        return { at: (s) => ({ p: [p[0] + s * t[0], p[1] + s * t[1]], t }), param: (u) => u * mag, fn: () => 0, dfn: () => 0 };
      }
      case "IFCCIRCLE": {
        const F = this.place2(e.args[0]);
        const R = g.num(e.args[1]);
        if (!(R > 0)) this.fail("circle with no radius");
        return {
          at: (s) => {
            const a = s / R;
            return { p: onFrame(F, [R * Math.cos(a), R * Math.sin(a)]), t: dirOnFrame(F, [-Math.sin(a), Math.cos(a)]) };
          },
          param: (u) => u * g.angle * R,
        };
      }
      case "IFCCLOTHOID": {
        const F = this.place2(e.args[0]);
        const A = g.num(e.args[1]);
        if (!A) this.fail("clothoid with no constant");
        const k = 1 / (2 * A * Math.abs(A));
        const theta = (s) => k * s * s;
        return {
          at: (s) => {
            const n = Math.max(4, Math.ceil(Math.abs(theta(s)) * 8 + Math.abs(s) / 50));
            const x = integrate((u) => Math.cos(theta(u)), 0, s, n);
            const y = integrate((u) => Math.sin(theta(u)), 0, s, n);
            const th = theta(s);
            return { p: onFrame(F, [x, y]), t: dirOnFrame(F, [Math.cos(th), Math.sin(th)]) };
          },
          param: (u) => u,
          fn: (s) => (L * s) / (A * Math.abs(A)),
          dfn: () => L / (A * Math.abs(A)),
        };
      }
      case "IFCCOSINESPIRAL": {
        // IfcCosineSpiral(Position, CosineTerm A1, ConstantTerm A0):
        // curvature 1/A1 cos(pi s / L) + 1/A0, so the tangent turns through
        // s/A0 + L/(pi A1) sin(pi s / L)
        const F = this.place2(e.args[0]);
        const A1 = g.num(e.args[1]), A0 = g.num(e.args[2]);
        if (!A1) this.fail("cosine spiral with no cosine term");
        // a zero-length closing segment (exporters write one at the end) has no shape to draw
        if (!(L > 0)) return { at: () => ({ p: onFrame(F, [0, 0]), t: F.x }), param: (u) => u, fn: () => 0, dfn: () => 0 };
        const c0 = A0 ? 1 / A0 : 0;
        const theta = (s) => s * c0 + (L / (Math.PI * A1)) * Math.sin((Math.PI * s) / L);
        return {
          at: (s) => {
            const n = Math.max(8, Math.ceil(Math.abs(theta(s)) * 16 + Math.abs(s) / 10));
            const x = integrate((u) => Math.cos(theta(u)), 0, s, n);
            const y = integrate((u) => Math.sin(theta(u)), 0, s, n);
            const th = theta(s);
            return { p: onFrame(F, [x, y]), t: dirOnFrame(F, [Math.cos(th), Math.sin(th)]) };
          },
          param: (u) => u,
          fn: (s) => L * c0 + (L / A1) * Math.cos((Math.PI * s) / L),
          dfn: (s) => -(Math.PI / A1) * Math.sin((Math.PI * s) / L),
        };
      }
      case "IFCPOLYLINE": {
        const pl = this.polyline(e);
        return { at: pl.at, param: (u) => pl.paramToLength(u) };
      }
      default:
        this.fail(`alignment segment ${e.type}`);
    }
  }

  polyline(e) {
    const g = this.geo;
    const pts = (e.args[0] || []).map((r) => g.point(r));
    if (pts.length < 2) this.fail("polyline with fewer than two points");
    // distance along a 3D polyline is its 3D length (a girder's directrix
    // climbing with the deck); t is the level heading, g the grade
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 1e-12 && cum[i] > cum[i - 1]) this.fail("polyline with a plumb piece");
    const at = (s) => {
      let i = 0;
      while (i < pts.length - 2 && s > cum[i + 1]) i++;
      const L = cum[i + 1] - cum[i] || 1;
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], dz = pts[i + 1][2] - pts[i][2];
      const h = Math.hypot(dx, dy) || 1;
      const u = (s - cum[i]) / L;
      return { p: [pts[i][0] + u * dx, pts[i][1] + u * dy], t: [dx / h, dy / h], z: pts[i][2] + u * dz, g: dz / h };
    };
    // IfcPolyline's parameter runs 0..1 on each piece
    const paramToLength = (u) => {
      const i = Math.max(0, Math.min(pts.length - 2, Math.floor(u)));
      return cum[i] + (u - i) * (cum[i + 1] - cum[i]);
    };
    return { length: cum[cum.length - 1], at, paramToLength };
  }

  /** IfcCurveSegment -> { length, at(u) } with u from 0 to |SegmentLength| */
  segment(ref) {
    const g = this.geo;
    const e = g.get(ref);
    if (!e || e.type !== "IFCCURVESEGMENT") this.fail(`composite curve part ${e ? e.type : "missing"}`);
    const P = this.place2(e.args[1]);
    const par = this.parent(e.args[4], Math.abs(g.num(e.args[3]) ?? 0));
    const toS = (v) => {
      const n = g.num(v) ?? 0;
      return typedName(v) === "IFCPARAMETERVALUE" ? par.param(n) : n;
    };
    const s0 = toS(e.args[2]);
    const L = toS(e.args[3]);
    const sign = L < 0 ? -1 : 1;
    const start = par.at(s0);
    const t0 = [start.t[0] * sign, start.t[1] * sign];
    // the parent's frame at the start, in the direction of travel
    const inv = (q) => {
      const d = [q[0] - start.p[0], q[1] - start.p[1]];
      return [d[0] * t0[0] + d[1] * t0[1], -d[0] * t0[1] + d[1] * t0[0]];
    };
    const invDir = (t) => [t[0] * t0[0] + t[1] * t0[1], -t[0] * t0[1] + t[1] * t0[0]];
    return {
      length: Math.abs(L),
      at: (u) => {
        const q = par.at(s0 + sign * u);
        const t = invDir([q.t[0] * sign, q.t[1] * sign]);
        return { p: onFrame(P, inv(q.p)), t: dirOnFrame(P, t) };
      },
    };
  }

  /** a horizontal or vertical curve made of segments, by arc length */
  composite(ref) {
    const g = this.geo;
    const e = g.get(ref);
    if (!e) this.fail("missing composite curve");
    if (e.type === "IFCPOLYLINE") return this.polyline(e);
    if (e.type !== "IFCCOMPOSITECURVE" && e.type !== "IFCGRADIENTCURVE") this.fail(`basis curve ${e.type}`);
    const segs = [];
    let cum = 0;
    for (const r of e.args[0] || []) {
      const s = this.segment(r);
      segs.push({ start: cum, ...s });
      cum += s.length;
    }
    if (!segs.length) this.fail("composite curve with no segments");
    // a zero-length closing segment (exporters write one at the end) adds nothing
    const real = segs.filter((s) => s.length > 0);
    if (!real.length) this.fail("composite curve of zero length");
    const at = (s) => {
      let k = 0;
      while (k < real.length - 1 && s > real[k].start + real[k].length) k++;
      const seg = real[k];
      const u = s - seg.start;
      if (u >= 0 && u <= seg.length) return seg.at(u);
      // past either end: carry on along the end tangent
      const edge = seg.at(u < 0 ? 0 : seg.length);
      const over = u < 0 ? u : u - seg.length;
      return { p: [edge.p[0] + over * edge.t[0], edge.p[1] + over * edge.t[1]], t: edge.t };
    };
    return { length: cum, at, segments: real };
  }

  /**
   * A basis curve read once: frame(d) -> { p: [x, y, z], t: [tx, ty] } at
   * distance d along its horizontal.
   */
  basis(ref) {
    if (this.cache.has(ref)) return this.cache.get(ref);
    const g = this.geo;
    const e = g.get(ref);
    if (!e) this.fail("missing basis curve");
    let out;
    if (e.type === "IFCGRADIENTCURVE") {
      const H = this.composite(e.args[2]);
      const V = this.composite(ref); // its own Segments are the vertical, in (distance, elevation)
      const elevation = (d) => {
        // the vertical is drawn against distance along: find u with x(u) = d
        let lo = 0, hi = V.length;
        const a = V.at(lo), b = V.at(hi);
        const slope = (q) => q.t[1] / (q.t[0] || 1);
        if (d <= a.p[0]) return { z: a.p[1] + (d - a.p[0]) * slope(a), g: slope(a) };
        if (d >= b.p[0]) return { z: b.p[1] + (d - b.p[0]) * slope(b), g: slope(b) };
        for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
          const m = (lo + hi) / 2;
          if (V.at(m).p[0] < d) lo = m; else hi = m;
        }
        const q = V.at((lo + hi) / 2);
        return { z: q.p[1], g: slope(q) };
      };
      out = { kind: "gradient", length: H.length, frame: (d) => { const h = H.at(d); const v = elevation(d); return { p: [h.p[0], h.p[1], v.z], t: h.t, g: v.g }; } };
    } else if (e.type === "IFCSEGMENTEDREFERENCECURVE") {
      out = this.segmentedReference(e);
    } else if (e.type === "IFCCOMPOSITECURVE" || e.type === "IFCPOLYLINE") {
      const H = this.composite(ref);
      out = { kind: e.type === "IFCPOLYLINE" ? "polyline" : "horizontal", length: H.length, frame: (d) => { const h = H.at(d); return { p: [h.p[0], h.p[1], h.z ?? 0], t: h.t, g: h.g ?? 0 }; } };
    } else {
      this.fail(`basis curve ${e.type}`);
    }
    this.cache.set(ref, out);
    return out;
  }

  /**
   * IfcSegmentedReferenceCurve(Segments, SelfIntersect, BaseCurve, EndPoint)
   * -> the base curve's frame raised by the deviating elevation, with the
   * cant's roll (see the head of this file).
   */
  segmentedReference(e) {
    const g = this.geo;
    const [segRefs, , baseRef, endRef] = e.args;
    if (!baseRef) this.fail("segmented reference curve with no base curve");
    const base = this.basis(baseRef.ref ?? baseRef);
    const knot = (ref) => {
      const pl = g.get(ref);
      if (!pl) return null;
      const o = g.point(pl.args[0]);
      // a 2D placement (the sample's own closing segment is one) holds no cross slope: level
      if (pl.type === "IFCAXIS2PLACEMENT2D") return { d: o[0], y: o[1], roll: 0 };
      if (pl.type !== "IFCAXIS2PLACEMENT3D") this.fail(`cant placement ${pl.type}`);
      const ax = g.dir(pl.args[1], [0, 0, 1]);
      // roll: pi/2 - atan2(Axis z, Axis y)
      return { d: o[0], y: o[1], roll: Math.atan2(ax[1], ax[2]) };
    };
    const segs = [];
    let cum = 0;
    for (const r of segRefs || []) {
      const se = g.get(r);
      if (!se || se.type !== "IFCCURVESEGMENT") this.fail(`cant segment ${se ? se.type : "missing"}`);
      const L = Math.abs(g.num(se.args[3]) ?? 0);
      const par = this.parent(se.args[4], L);
      if (!par.fn) this.fail(`cant parent curve ${g.get(se.args[4])?.type}`);
      const s0 = g.num(se.args[2]) ?? 0;
      segs.push({ start: cum, L, k: knot(se.args[1]) ?? { d: cum, y: 0, roll: 0 }, s0, fn: par.fn, dfn: par.dfn, sign: (g.num(se.args[3]) ?? 0) < 0 ? -1 : 1 });
      cum += L;
    }
    if (!segs.length) this.fail("segmented reference curve with no segments");
    const endK = endRef ? knot(endRef) : null;
    for (let i = 0; i < segs.length; i++) segs[i].next = i + 1 < segs.length ? segs[i + 1].k : endK ?? segs[i].k;
    const real = segs.filter((s) => s.L > 0);
    if (!real.length) this.fail("segmented reference curve of zero length");
    // the share w of the way from this placement to the next at u along, and dw/du
    const share = (sg, u) => {
      const f = (x) => sg.fn(sg.s0 + sg.sign * x);
      const f0 = f(0), f1 = f(sg.L);
      if (Math.abs(f1 - f0) < 1e-12) return { w: u / sg.L, dw: 1 / sg.L };
      return { w: (f(u) - f0) / (f1 - f0), dw: (sg.sign * sg.dfn(sg.s0 + sg.sign * u)) / (f1 - f0) };
    };
    const cant = (d) => {
      let k = 0;
      while (k < real.length - 1 && d > real[k].start + real[k].L) k++;
      const sg = real[k];
      const u = Math.min(sg.L, Math.max(0, d - sg.start));
      const { w, dw: dwIn } = share(sg, u);
      // past either end the cant holds its end value
      const dw = d - sg.start < 0 || d - sg.start > sg.L ? 0 : dwIn;
      return { y: sg.k.y + (sg.next.y - sg.k.y) * w, dy: (sg.next.y - sg.k.y) * dw, roll: sg.k.roll + (sg.next.roll - sg.k.roll) * w };
    };
    return {
      kind: "cant",
      length: base.length,
      cant,
      frame: (d) => {
        const f = base.frame(d);
        const c = cant(d);
        return { p: [f.p[0], f.p[1], f.p[2] + c.y], t: f.t, g: (f.g ?? 0) + c.dy, roll: c.roll };
      },
    };
  }

  /** IfcAxis2PlacementLinear -> 3x4 matrix (row-major, as geom.mjs) in the basis curve's coordinates */
  axis2Linear(ref) {
    const g = this.geo;
    const e = g.get(ref);
    if (!e || e.type !== "IFCAXIS2PLACEMENTLINEAR") this.fail(`linear placement ${e ? e.type : "missing"}`);
    const pe = g.get(e.args[0]);
    if (!pe || pe.type !== "IFCPOINTBYDISTANCEEXPRESSION") this.fail(`linear location ${pe ? pe.type : "missing"}`);
    const [dist, lat, vert, lon, curve] = pe.args;
    const d = g.num(dist) ?? 0;
    const B = this.basis(curve.ref ?? curve);
    const f = B.frame(d);
    const tx = f.t, left = [-tx[1], tx[0]];
    // the curve's frame at the station: x along the tangent (climbing with
    // the gradient), y level to the left, z perpendicular to the tangent in
    // the vertical plane through it (IfcPointByDistanceExpression,
    // OffsetVertical), so a vertical offset on a 1.3% grade leans 1.3%
    const gr = f.g ?? 0, c = 1 / Math.hypot(1, gr);
    const X = [tx[0] * c, tx[1] * c, gr * c];
    const [Y, Z] = rolled([left[0], left[1], 0], [-gr * tx[0] * c, -gr * tx[1] * c, c], f.roll);
    // OffsetLongitudinal is a straight step along that tangent after the
    // other two offsets, not a further distance along the curve
    const ol = g.num(lat) ?? 0, ov = g.num(vert) ?? 0, og = g.num(lon) ?? 0;
    const o = [0, 1, 2].map((i) => f.p[i] + ol * Y[i] + ov * Z[i] + og * X[i]);
    const inF = (v) => [0, 1, 2].map((i) => v[0] * X[i] + v[1] * Y[i] + v[2] * Z[i]);
    let z = inF(g.dir(e.args[1], [0, 0, 1]));
    let x = inF(g.dir(e.args[2], Math.abs(g.dir(e.args[1], [0, 0, 1])[0]) > 0.99 ? [0, 1, 0] : [1, 0, 0]));
    const dt = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
    x = [x[0] - dt * z[0], x[1] - dt * z[1], x[2] - dt * z[2]];
    const n = Math.hypot(...x) || 1;
    x = x.map((c) => c / n);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]];
  }
}

/**
 * IfcSectionedSolidHorizontal(Directrix, CrossSections, CrossSectionPositions)
 * as closed faceted tubes, one per profile loop (signed as the loop: a hole
 * is a tube subtracted). Each cross-section stands square to the
 * directrix's tangent at its station, in the frame axis2Linear gives it:
 * profile x along the level y axis (SIGN_X: to the left), profile y along z
 * (the spec's "profile Y axis is the direction of Axis"; on a 1.3% grade a 2 m
 * girder's top sits 2.6 cm up-station of its foot, as IfcOpenShell draws it). Between two
 * stations the profile's points move linearly with the station (a ruled loft)
 * and the solid is cut into slices at most MAX_TURN apart in heading, so a
 * curved deck follows its arc.
 *
 * @param {AlignmentReader} A
 * @param {object} e the IFCSECTIONEDSOLIDHORIZONTAL entity
 * @param {(ref) => {s: number, pts: number[][]}[]} loopsOf profile -> loops (geom.mjs profile)
 * @returns {{parts: {s: number, faces: number[][][]}[], slices: number, notes: string[]}} parts for geom.mjs faceted()
 */
export const MAX_TURN = (0.25 * Math.PI) / 180;
export const SIGN_X = 1;
export function sectionedSolidHorizontal(A, e, loopsOf) {
  const g = A.geo;
  const [dirRef, secRefs, posRefs] = e.args;
  if (!secRefs || !posRefs || secRefs.length !== posRefs.length || secRefs.length < 2) A.fail("sectioned solid: sections and positions do not pair");
  const B = A.basis(dirRef.ref ?? dirRef);
  const stations = posRefs.map((r) => {
    const pl = g.get(r);
    if (!pl || pl.type !== "IFCAXIS2PLACEMENTLINEAR") A.fail(`sectioned solid position ${pl ? pl.type : "missing"}`);
    if (pl.args[1] || pl.args[2]) A.fail("sectioned solid: a turned cross-section (Axis or RefDirection)");
    const pe = g.get(pl.args[0]);
    const [dist, lat, vert, lon] = pe.args;
    if (g.num(lon)) A.fail("sectioned solid: a longitudinal offset");
    return { d: g.num(dist) ?? 0, lat: g.num(lat) ?? 0, vert: g.num(vert) ?? 0 };
  });
  for (let i = 1; i < stations.length; i++) if (!(stations[i].d > stations[i - 1].d)) A.fail("sectioned solid: stations not increasing");
  // a station off either end of its directrix: carried on along the end
  // tangent, and said (Viadotto Acerno's span-4 diaphragms run 0.20 m past
  // their 0.505 m polylines; IfcOpenShell 0.8 stops them at the end)
  const notes = [];
  const past = Math.max(0, -stations[0].d, stations[stations.length - 1].d - B.length);
  if (past > 1e-6) notes.push(`a cross-section ${past.toFixed(3)} m past the end of its directrix: the solid carries on along the end tangent`);
  const sections = secRefs.map((r) => loopsOf(r).map((l) => {
    const p = l.pts.slice();
    const f = p[0], z = p[p.length - 1];
    if (p.length > 1 && Math.hypot(f[0] - z[0], f[1] - z[1]) < 1e-12) p.pop();
    return { s: l.s, pts: p };
  }));
  const shape = sections[0].map((l) => l.pts.length).join(",");
  for (const s of sections) if (s.map((l) => l.pts.length).join(",") !== shape) A.fail("sectioned solid: cross-sections with different point counts");

  // every slice: station d, its frame, and the profile there
  const slices = [];
  const at = (d, i, t) => {
    const f = B.frame(d);
    const a = stations[i], b = stations[i + 1] ?? a;
    const lat = a.lat + t * (b.lat - a.lat), vert = a.vert + t * (b.vert - a.vert);
    const left = [-f.t[1], f.t[0]];
    // the station's frame (axis2Linear): profile x along the level y axis,
    // profile y along z, square to the tangent in its vertical plane
    const gr = f.g ?? 0, c = 1 / Math.hypot(1, gr);
    const [Y, Z] = rolled([left[0], left[1], 0], [-gr * f.t[0] * c, -gr * f.t[1] * c, c], f.roll);
    const loops = sections[i].map((l, k) => ({
      s: l.s,
      pts: l.pts.map((p, j) => {
        const q = t ? sections[i + 1][k].pts[j] : p;
        const x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]);
        const side = lat + SIGN_X * x, up = vert + y;
        return [f.p[0] + side * Y[0] + up * Z[0], f.p[1] + side * Y[1] + up * Z[1], f.p[2] + side * Y[2] + up * Z[2]];
      }),
    }));
    return loops;
  };
  for (let i = 0; i + 1 < stations.length; i++) {
    const d0 = stations[i].d, d1 = stations[i + 1].d;
    // the heading turned through between the two stations, sampled
    let turn = 0, prev = B.frame(d0).t;
    for (let k = 1; k <= 16; k++) {
      const t = B.frame(d0 + ((d1 - d0) * k) / 16).t;
      turn += Math.abs(Math.atan2(prev[0] * t[1] - prev[1] * t[0], prev[0] * t[0] + prev[1] * t[1]));
      prev = t;
    }
    const n = Math.min(400, Math.max(1, Math.ceil(turn / MAX_TURN)));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const t = k / n;
      slices.push(t === 1 && i + 2 < stations.length ? at(d1, i + 1, 0) : at(d0 + (d1 - d0) * t, i, t));
    }
  }
  // tubes
  const parts = [];
  for (let k = 0; k < sections[0].length; k++) {
    const faces = [];
    const first = slices[0][k].pts, last = slices[slices.length - 1][k].pts;
    faces.push(first.slice().reverse(), last.slice());
    for (let j = 0; j + 1 < slices.length; j++) {
      const P = slices[j][k].pts, Q = slices[j + 1][k].pts, N = P.length;
      for (let m = 0; m < N; m++) {
        const m1 = (m + 1) % N;
        // a side between two slices is a bilinear (twisted) quad when the
        // profile changes (a crossfall turning over): four triangles about its
        // mean point enclose the patch's volume exactly, where one diagonal
        // is off by the twist (a 4 cm course whose edge rises 0.26 m: 55%)
        const c = [0, 1, 2].map((x) => (P[m][x] + P[m1][x] + Q[m1][x] + Q[m][x]) / 4);
        faces.push([P[m], P[m1], c], [P[m1], Q[m1], c], [Q[m1], Q[m], c], [Q[m], P[m], c]);
      }
    }
    parts.push({ s: sections[0][k].s, faces });
  }
  return { parts, slices: slices.length, notes };
}

/**
 * IfcFixedReferenceSweptAreaSolid(SweptArea, Position, Directrix, StartParam,
 * EndParam, FixedReference) on a curve the AlignmentReader reads (gradient,
 * horizontal composite, polyline), as closed faceted tubes like
 * sectionedSolidHorizontal. At each slice the profile stands square to the
 * directrix's 3D tangent T: its x axis is FixedReference projected onto the
 * plane normal to T, its y axis T x X (the IFC 4.3 text). Slices at most
 * MAX_TURN apart in heading, and at least every 1/64 of the run.
 *
 * @returns {{parts: {s: number, faces: number[][][]}[], slices: number, notes: string[]}}
 */
export function fixedReferenceSweep(A, e, loopsOf) {
  const g = A.geo;
  const [areaRef, , dirRef, startP, endP, refDir] = e.args;
  const B = A.basis(dirRef.ref ?? dirRef);
  const d0 = g.num(startP) ?? 0, d1 = g.num(endP) ?? B.length;
  if (!(d1 > d0)) A.fail("fixed reference sweep: EndParam not past StartParam");
  const notes = [];
  if (d0 < -1e-6 || d1 > B.length + 1e-6) notes.push(`the sweep runs ${Math.max(-d0, d1 - B.length).toFixed(3)} past the end of its directrix: carried on along the end tangent`);
  const R = g.dir(refDir, [0, 0, 1]);
  const loops = loopsOf(areaRef).map((l) => {
    const p = l.pts.slice();
    const f = p[0], z = p[p.length - 1];
    if (p.length > 1 && Math.hypot(f[0] - z[0], f[1] - z[1]) < 1e-12) p.pop();
    return { s: l.s, pts: p };
  });
  const frameAt = (d) => {
    const f = B.frame(d);
    const gr = f.g ?? 0, c = 1 / Math.hypot(1, gr);
    const T = [f.t[0] * c, f.t[1] * c, gr * c];
    const k = R[0] * T[0] + R[1] * T[1] + R[2] * T[2];
    let X = [R[0] - k * T[0], R[1] - k * T[1], R[2] - k * T[2]];
    const n = Math.hypot(...X);
    if (!(n > 1e-9)) A.fail("fixed reference sweep: FixedReference along the directrix");
    X = X.map((x) => x / n);
    const Y = [T[1] * X[2] - T[2] * X[1], T[2] * X[0] - T[0] * X[2], T[0] * X[1] - T[1] * X[0]];
    return loops.map((l) => ({ s: l.s, pts: l.pts.map(([u, v]) => [0, 1, 2].map((i) => f.p[i] + u * X[i] + v * Y[i])) }));
  };
  let turn = 0, prev = B.frame(d0).t;
  for (let k = 1; k <= 64; k++) {
    const t = B.frame(d0 + ((d1 - d0) * k) / 64).t;
    turn += Math.abs(Math.atan2(prev[0] * t[1] - prev[1] * t[0], prev[0] * t[0] + prev[1] * t[1]));
    prev = t;
  }
  const n = Math.min(4000, Math.max(64, Math.ceil(turn / MAX_TURN)));
  const slices = [];
  for (let k = 0; k <= n; k++) slices.push(frameAt(d0 + ((d1 - d0) * k) / n));
  const parts = [];
  for (let k = 0; k < loops.length; k++) {
    const faces = [slices[0][k].pts.slice().reverse(), slices[n][k].pts.slice()];
    for (let j = 0; j < n; j++) {
      const P = slices[j][k].pts, Q = slices[j + 1][k].pts, N = P.length;
      for (let m = 0; m < N; m++) {
        const m1 = (m + 1) % N;
        const c = [0, 1, 2].map((x) => (P[m][x] + P[m1][x] + Q[m1][x] + Q[m][x]) / 4);
        faces.push([P[m], P[m1], c], [P[m1], Q[m1], c], [Q[m1], Q[m], c], [Q[m], P[m], c]);
      }
    }
    parts.push({ s: loops[k].s, faces });
  }
  return { parts, slices: slices.length, notes };
}
