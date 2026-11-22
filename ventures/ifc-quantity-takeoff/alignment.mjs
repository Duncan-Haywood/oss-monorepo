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
//   s^2 / (2 A |A|) from the inflection point), IfcPolyline.
// - IfcCompositeCurve of IfcCurveSegment (the horizontal), IfcGradientCurve
//   (horizontal + vertical), IfcPolyline as a bare basis curve.
// - The frame at a station: x along the curve's tangent (with its gradient),
//   y level to the left, z perpendicular to the tangent in the vertical plane
//   through it: the frame IfcPointByDistanceExpression's offsets are measured
//   in. Axis and RefDirection, when given, turn the frame within that one.
//   This is also IfcOpenShell 0.8's reading (eval/linear-placement-*.md).
//
// What is not (each throws Unresolved, so the element is "not read" and the
// rest of the file still is): IfcSegmentedReferenceCurve (cant), spirals
// other than the clothoid, IfcPolynomialCurve, IfcOffsetCurveByDistances.

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

  /** a parent curve's point and unit tangent at arc length s (and how a parameter value maps to s) */
  parent(ref) {
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
        return { at: (s) => ({ p: [p[0] + s * t[0], p[1] + s * t[1]], t }), param: (u) => u * mag };
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
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const at = (s) => {
      let i = 0;
      while (i < pts.length - 2 && s > cum[i + 1]) i++;
      const L = cum[i + 1] - cum[i] || 1;
      const t = [(pts[i + 1][0] - pts[i][0]) / L, (pts[i + 1][1] - pts[i][1]) / L];
      const u = s - cum[i];
      return { p: [pts[i][0] + u * t[0], pts[i][1] + u * t[1]], t, z: pts[i][2] + (u / L) * (pts[i + 1][2] - pts[i][2]) };
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
    const par = this.parent(e.args[4]);
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
    } else if (e.type === "IFCCOMPOSITECURVE" || e.type === "IFCPOLYLINE") {
      const H = this.composite(ref);
      out = { kind: "horizontal", length: H.length, frame: (d) => { const h = H.at(d); return { p: [h.p[0], h.p[1], h.z ?? 0], t: h.t }; } };
    } else {
      this.fail(`basis curve ${e.type}`);
    }
    this.cache.set(ref, out);
    return out;
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
    const X = [tx[0] * c, tx[1] * c, gr * c], Y = [left[0], left[1], 0], Z = [-gr * tx[0] * c, -gr * tx[1] * c, c];
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
