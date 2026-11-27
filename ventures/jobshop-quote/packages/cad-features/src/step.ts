// STEP B-rep → solid features: bounding box, volume where the face types allow, cylinders.
//
// Bounding box: every edge of every solid is sampled along its real curve (line, circle,
// ellipse, B-spline). Faces on planes, cylinders and cones reach their extremes on their edges,
// so the box is exact for them; spheres, tori and free-form surfaces can bulge past their edges
// and are flagged.
//
// Volume (divergence theorem): V = ⅓ ∮ p·n dA, summed face by face from boundary integrals:
//  - plane: p·n is constant, so the flux is (n·o)·net area of its loops;
//  - cylinder: p·n = r + o·n, so flux = r·area + o·∫n dA, with the patch area from Stokes'
//    theorem (W = t·θ̂) and ∫n dA = ½∮p×dp, both from the edge loops;
//  - cone: p·n = apex·n, so flux = apex·∫n dA.
// That covers prismatic and turned parts: plates, brackets, drilled and countersunk holes,
// straight bends. Spheres, tori (corner fillets), revolved and free-form faces are reported as
// unsupported rather than guessed.

import {
  add3,
  Box3,
  type BSpline,
  bsplineAt,
  bsplineDomain,
  cross3,
  dot3,
  expandKnots,
  len3,
  norm3,
  perp3,
  sampleBSpline,
  scale3,
  sub3,
  v3,
} from "./geom.ts";
import {
  type Instance,
  isEnum,
  isRef,
  isTyped,
  type Part,
  parseStep,
  part,
  type StepFile,
  type Value,
} from "./step-parse.ts";
import type {
  Confidence,
  CylinderGroup,
  ExtractOptions,
  Flag,
  HoleAxis,
  LengthUnit,
  PartFeatures,
  SolidBody,
  Vec3,
} from "./types.ts";
import { MM_PER } from "./types.ts";

interface Frame {
  o: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

/** surfaces whose extremes lie on their boundary edges (ruled surfaces) */
const RULED = new Set([
  "PLANE",
  "CYLINDRICAL_SURFACE",
  "CONICAL_SURFACE",
  "SURFACE_OF_LINEAR_EXTRUSION",
]);
const FULL_CIRCLE_SAMPLES = 1440;

class Model {
  readonly f: StepFile;
  constructor(f: StepFile) {
    this.f = f;
  }

  get(v: Value | undefined): Instance | undefined {
    return isRef(v) ? this.f.instances.get(v.ref) : undefined;
  }

  point(v: Value | undefined): Vec3 | null {
    const e = this.get(v);
    if (!e) return null;
    if (e.type === "VERTEX_POINT") return this.point(e.args[1]);
    if (e.type !== "CARTESIAN_POINT") return null;
    const c = e.args[1];
    if (!Array.isArray(c)) return null;
    return v3(Number(c[0] ?? 0), Number(c[1] ?? 0), Number(c[2] ?? 0));
  }

  dir(v: Value | undefined): Vec3 | null {
    const e = this.get(v);
    if (!e) return null;
    if (e.type === "VECTOR") return this.dir(e.args[1]);
    if (e.type !== "DIRECTION") return null;
    const c = e.args[1];
    if (!Array.isArray(c)) return null;
    return norm3(v3(Number(c[0] ?? 0), Number(c[1] ?? 0), Number(c[2] ?? 0)));
  }

  frame(v: Value | undefined): Frame | null {
    const e = this.get(v);
    if (!e || (e.type !== "AXIS2_PLACEMENT_3D" && e.type !== "AXIS1_PLACEMENT")) return null;
    const o = this.point(e.args[1]);
    if (!o) return null;
    const z = this.dir(e.args[2]) ?? v3(0, 0, 1);
    const ref = e.type === "AXIS2_PLACEMENT_3D" ? this.dir(e.args[3]) : null;
    let x = ref ? sub3(ref, scale3(z, dot3(ref, z))) : perp3(z);
    if (len3(x) < 1e-12) x = perp3(z);
    x = norm3(x);
    return { o, x, y: cross3(z, x), z };
  }
}

const bool = (v: Value | undefined): boolean => !(isEnum(v) && v.enum === "F");
const numOf = (v: Value | undefined): number => {
  if (typeof v === "number") return v;
  if (isTyped(v)) return numOf(v.value);
  return Number.NaN;
};

// ---- units ----

const SI_PREFIX_MM: Record<string, number> = {
  MICRO: 1e-3,
  MILLI: 1,
  CENTI: 10,
  DECI: 100,
  KILO: 1e6,
};

function lengthUnitMm(m: Model, unit: Instance | undefined, depth = 0): number | null {
  if (!unit || depth > 4) return null;
  const si = part(unit, "SI_UNIT");
  if (si && part(unit, "LENGTH_UNIT")) {
    if (isEnum(si.args[1]) && si.args[1].enum !== "METRE") return null;
    const prefix = si.args[0];
    if (isEnum(prefix)) return SI_PREFIX_MM[prefix.enum] ?? null;
    return 1000;
  }
  const conv = part(unit, "CONVERSION_BASED_UNIT");
  if (conv && part(unit, "LENGTH_UNIT")) {
    const measure = m.get(conv.args[1]);
    if (measure) {
      const value = numOf(measure.parts[0]?.args[0]);
      const base = lengthUnitMm(m, m.get(measure.parts[0]?.args[1]), depth + 1);
      if (Number.isFinite(value) && base !== null) return value * base;
    }
    const name = String(conv.args[0] ?? "").toUpperCase();
    if (name.startsWith("INCH")) return 25.4;
    if (name.startsWith("FOOT")) return 304.8;
  }
  return null;
}

function contextUnitMm(m: Model, ctx: Instance | undefined): number | null {
  const g = part(ctx, "GLOBAL_UNIT_ASSIGNED_CONTEXT");
  const units = g?.args[0];
  if (!Array.isArray(units)) return null;
  for (const u of units) {
    const mm = lengthUnitMm(m, m.get(u));
    if (mm !== null) return mm;
  }
  return null;
}

function unitName(mm: number): LengthUnit | "unknown" {
  const table: [LengthUnit, number][] = [
    ["mm", 1],
    ["m", 1000],
    ["in", 25.4],
    ["cm", 10],
    ["ft", 304.8],
    ["um", 0.001],
  ];
  for (const [n, v] of table) if (Math.abs(mm - v) < 1e-9 * v) return n;
  return "unknown";
}

// ---- curves ----

function angleIn(fr: Frame, p: Vec3, sx = 1, sy = 1): number {
  const d = sub3(p, fr.o);
  return Math.atan2(dot3(d, fr.y) / sy, dot3(d, fr.x) / sx);
}

function sweepBetween(t0: number, t1: number, closed: boolean, sense: boolean): number {
  const TWO = Math.PI * 2;
  if (closed) return sense ? TWO : -TWO;
  let d = sense ? t1 - t0 : t0 - t1;
  while (d <= 1e-12) d += TWO;
  while (d > TWO + 1e-12) d -= TWO;
  return sense ? d : -d;
}

function bsplineOf(m: Model, e: Instance): BSpline | null {
  const base = e.type === "COMPLEX" ? part(e, "B_SPLINE_CURVE") : e;
  const knotsPart: Part | undefined =
    e.type === "COMPLEX" ? part(e, "B_SPLINE_CURVE_WITH_KNOTS") : e;
  if (!base || !knotsPart) return null;
  // simple: (name, degree, pts, form, closed, self_int, mults, knots, spec)
  // complex: B_SPLINE_CURVE(degree, pts, form, closed, self_int), WITH_KNOTS(mults, knots, spec)
  const off = e.type === "COMPLEX" ? 0 : 1;
  const degree = Number(base.args[off]);
  const pts = base.args[off + 1];
  const kOff = e.type === "COMPLEX" ? 0 : 6;
  const mults = knotsPart.args[kOff];
  const knots = knotsPart.args[kOff + 1];
  if (!Array.isArray(pts) || !Array.isArray(mults) || !Array.isArray(knots)) return null;
  const controls = pts.map((p) => m.point(p)).filter((p): p is Vec3 => p !== null);
  const rational = part(e, "RATIONAL_B_SPLINE_CURVE");
  const w = rational?.args[0];
  const weights = Array.isArray(w) ? w.map(Number) : undefined;
  return {
    degree,
    controls,
    knots: expandKnots(knots.map(Number), mults.map(Number)),
    ...(weights ? { weights } : {}),
  };
}

function nearestParam(s: BSpline, p: Vec3): number {
  const [lo, hi] = bsplineDomain(s);
  const n = Math.max(64, s.controls.length * 8);
  let best = lo;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= n; i++) {
    const t = lo + ((hi - lo) * i) / n;
    const q = bsplineAt(s, t);
    if (!q) continue;
    const d = len3(sub3(q, p));
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  // golden-section refine in the bracketing interval
  let a = Math.max(lo, best - (hi - lo) / n);
  let b = Math.min(hi, best + (hi - lo) / n);
  const dist = (t: number): number => {
    const q = bsplineAt(s, t);
    return q ? len3(sub3(q, p)) : Number.POSITIVE_INFINITY;
  };
  for (let k = 0; k < 40; k++) {
    const c = b - (b - a) * 0.618;
    const d = a + (b - a) * 0.618;
    if (dist(c) < dist(d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}

interface Sampled {
  pts: Vec3[];
  exact: boolean;
}

function sampleCurve(
  m: Model,
  curve: Instance | undefined,
  p0: Vec3,
  p1: Vec3,
  sense: boolean,
  depth = 0,
): Sampled {
  if (!curve || depth > 4) return { pts: [p0, p1], exact: false };
  const closed = len3(sub3(p0, p1)) < 1e-9 * Math.max(1, len3(p0));
  switch (curve.type) {
    case "LINE":
      return { pts: [p0, p1], exact: true };
    case "CIRCLE":
    case "ELLIPSE": {
      const fr = m.frame(curve.args[1]);
      if (!fr) return { pts: [p0, p1], exact: false };
      const a = numOf(curve.args[2]);
      const b = curve.type === "ELLIPSE" ? numOf(curve.args[3]) : a;
      const t0 = angleIn(fr, p0, a, b);
      const t1 = angleIn(fr, p1, a, b);
      const sweep = sweepBetween(t0, t1, closed, sense);
      const n = Math.max(4, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * FULL_CIRCLE_SAMPLES));
      const pts: Vec3[] = [p0];
      for (let i = 1; i < n; i++) {
        const t = t0 + (sweep * i) / n;
        pts.push(add3(fr.o, add3(scale3(fr.x, a * Math.cos(t)), scale3(fr.y, b * Math.sin(t)))));
      }
      pts.push(p1);
      return { pts, exact: true };
    }
    case "SURFACE_CURVE":
    case "SEAM_CURVE":
    case "INTERSECTION_CURVE":
    case "TRIMMED_CURVE":
      return sampleCurve(m, m.get(curve.args[1]), p0, p1, sense, depth + 1);
    case "POLYLINE": {
      const list = curve.args[1];
      const pts = Array.isArray(list)
        ? list.map((p) => m.point(p)).filter((p): p is Vec3 => !!p)
        : [];
      if (pts.length < 2) return { pts: [p0, p1], exact: false };
      if (!sense) pts.reverse();
      return { pts: [p0, ...pts.slice(1, -1), p1], exact: true };
    }
    default: {
      const s =
        curve.type === "B_SPLINE_CURVE_WITH_KNOTS" || curve.type === "COMPLEX"
          ? bsplineOf(m, curve)
          : null;
      if (!s || s.controls.length <= s.degree) return { pts: [p0, p1], exact: false };
      const [lo, hi] = bsplineDomain(s);
      const n = Math.max(16, s.controls.length * 6);
      if (closed) {
        const pts = sampleBSpline(s, lo, hi, n);
        if (!sense) pts.reverse();
        return { pts, exact: true };
      }
      let t0 = nearestParam(s, p0);
      let t1 = nearestParam(s, p1);
      if (!sense) [t0, t1] = [t1, t0];
      let pts: Vec3[];
      if (t1 >= t0) pts = sampleBSpline(s, t0, t1, n);
      else pts = [...sampleBSpline(s, t0, hi, n), ...sampleBSpline(s, lo, t1, n).slice(1)];
      if (!sense) pts.reverse();
      return { pts: [p0, ...pts.slice(1, -1), p1], exact: true };
    }
  }
}

// ---- faces ----

interface LoopPts {
  pts: Vec3[];
  outer: boolean;
}

interface Body {
  name: string;
  faces: Instance[];
  voids: Instance[][];
  surfaceModel: boolean;
}

function shellFaces(m: Model, shell: Instance | undefined): Instance[] {
  if (!shell) return [];
  if (shell.type === "ORIENTED_CLOSED_SHELL" || shell.type === "ORIENTED_OPEN_SHELL") {
    return shellFaces(m, m.get(shell.args[2]));
  }
  const list = shell.args[1];
  return Array.isArray(list) ? list.map((f) => m.get(f)).filter((f): f is Instance => !!f) : [];
}

function findBodies(m: Model): Body[] {
  const bodies: Body[] = [];
  for (const e of m.f.instances.values()) {
    const name = typeof e.args[0] === "string" ? e.args[0] : "";
    if (e.type === "MANIFOLD_SOLID_BREP" || e.type === "FACETED_BREP") {
      bodies.push({ name, faces: shellFaces(m, m.get(e.args[1])), voids: [], surfaceModel: false });
    } else if (e.type === "BREP_WITH_VOIDS") {
      const voids = Array.isArray(e.args[2]) ? e.args[2].map((v) => shellFaces(m, m.get(v))) : [];
      bodies.push({ name, faces: shellFaces(m, m.get(e.args[1])), voids, surfaceModel: false });
    } else if (e.type === "SHELL_BASED_SURFACE_MODEL") {
      const shells = Array.isArray(e.args[1]) ? e.args[1] : [];
      const faces = shells.flatMap((s) => shellFaces(m, m.get(s)));
      bodies.push({ name, faces, voids: [], surfaceModel: true });
    }
  }
  return bodies;
}

/** Context (for units) of each representation item. */
function itemContexts(m: Model): Map<number, Instance> {
  const out = new Map<number, Instance>();
  for (const e of m.f.instances.values()) {
    if (!e.type.endsWith("REPRESENTATION") || !Array.isArray(e.args[1])) continue;
    const ctx = m.get(e.args[2]);
    if (!ctx) continue;
    for (const it of e.args[1]) if (isRef(it)) out.set(it.ref, ctx);
  }
  return out;
}

interface FaceInfo {
  surfaceType: string;
  surface: Instance | undefined;
  sameSense: boolean;
  loops: LoopPts[];
  exact: boolean;
}

class Sampler {
  private cache = new Map<number, Sampled>();
  box = new Box3();
  private readonly m: Model;
  constructor(m: Model) {
    this.m = m;
  }

  edge(edgeCurve: Instance): Sampled {
    const hit = this.cache.get(edgeCurve.id);
    if (hit) return hit;
    const p0 = this.m.point(edgeCurve.args[1]);
    const p1 = this.m.point(edgeCurve.args[2]);
    let s: Sampled;
    if (!p0 || !p1) s = { pts: [], exact: false };
    else s = sampleCurve(this.m, this.m.get(edgeCurve.args[3]), p0, p1, bool(edgeCurve.args[4]));
    for (const p of s.pts) this.box.add(p);
    this.cache.set(edgeCurve.id, s);
    return s;
  }

  face(face: Instance): FaceInfo {
    const bounds = Array.isArray(face.args[1]) ? face.args[1] : [];
    const surface = this.m.get(face.args[2]);
    const surfaceType = surface
      ? surface.type === "COMPLEX"
        ? complexSurfaceName(surface)
        : surface.type
      : "NONE";
    const loops: LoopPts[] = [];
    let exact = true;
    for (const b of bounds) {
      const bound = this.m.get(b);
      if (!bound) continue;
      const loop = this.m.get(bound.args[1]);
      const boundSense = bool(bound.args[2]);
      const pts: Vec3[] = [];
      if (loop?.type === "EDGE_LOOP" && Array.isArray(loop.args[1])) {
        for (const oe of loop.args[1]) {
          const oriented = this.m.get(oe);
          const ec = this.m.get(oriented?.args[3]);
          if (!oriented || !ec) continue;
          const s = this.edge(ec);
          if (!s.exact) exact = false;
          const seq = bool(oriented.args[4]) ? s.pts : [...s.pts].reverse();
          for (const p of seq) {
            const last = pts[pts.length - 1];
            if (!last || len3(sub3(last, p)) > 1e-12) pts.push(p);
          }
        }
      } else if (loop?.type === "POLY_LOOP" && Array.isArray(loop.args[1])) {
        for (const p of loop.args[1]) {
          const q = this.m.point(p);
          if (q) {
            pts.push(q);
            this.box.add(q);
          }
        }
      } else if (loop?.type === "VERTEX_LOOP") {
        const q = this.m.point(loop.args[1]);
        if (q) this.box.add(q);
        continue;
      }
      if (!boundSense) pts.reverse();
      loops.push({ pts, outer: bound.type === "FACE_OUTER_BOUND" });
    }
    return { surfaceType, surface, sameSense: bool(face.args[3]), loops, exact };
  }
}

function complexSurfaceName(e: Instance): string {
  const names = e.parts.map((p) => p.type);
  return names.find((n) => n.endsWith("_SURFACE") && n !== "BOUNDED_SURFACE") ?? "COMPLEX_SURFACE";
}

/** Area and centroid of a planar loop, in the plane's frame. Signed by winding around fr.z. */
function planarMoments(pts: Vec3[], fr: Frame): { area: number; cx: number; cy: number } {
  let a2 = 0;
  let mx = 0;
  let my = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = sub3(pts[i] as Vec3, fr.o);
    const q = sub3(pts[(i + 1) % n] as Vec3, fr.o);
    const px = dot3(p, fr.x);
    const py = dot3(p, fr.y);
    const qx = dot3(q, fr.x);
    const qy = dot3(q, fr.y);
    const c = px * qy - qx * py;
    a2 += c;
    mx += (px + qx) * c;
    my += (py + qy) * c;
  }
  const area = a2 / 2;
  if (area === 0) return { area: 0, cx: 0, cy: 0 };
  return { area, cx: mx / (6 * area), cy: my / (6 * area) };
}

/** Newell normal × area of a polygon (orientation from the winding). */
function newell(pts: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as Vec3;
    const q = pts[(i + 1) % pts.length] as Vec3;
    x += (p.y - q.y) * (p.z + q.z);
    y += (p.z - q.z) * (p.x + q.x);
    z += (p.x - q.x) * (p.y + q.y);
  }
  return v3(x / 2, y / 2, z / 2);
}

/** ½ ∮ p × dp over closed loops: ∫ n dA of the surface they bound (n by the loops' winding). */
function vectorArea(loops: LoopPts[]): Vec3 {
  let a = v3(0, 0, 0);
  for (const l of loops) {
    const n = l.pts.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      a = add3(a, cross3(l.pts[i] as Vec3, l.pts[(i + 1) % n] as Vec3));
    }
  }
  return scale3(a, 0.5);
}

/**
 * Signed area of a cylindrical patch from its boundary (Stokes with W = t·θ̂, curl W · r̂ = -1):
 * positive when the loops wind counter-clockwise about the outward radial direction.
 */
function cylinderPatchArea(loops: LoopPts[], fr: Frame): number {
  let circ = 0;
  for (const l of loops) {
    const n = l.pts.length;
    for (let i = 0; i < n; i++) {
      const p = l.pts[i] as Vec3;
      const q = l.pts[(i + 1) % n] as Vec3;
      const mid = sub3(scale3(add3(p, q), 0.5), fr.o);
      const t = dot3(mid, fr.z);
      const radial = sub3(mid, scale3(fr.z, t));
      if (len3(radial) === 0) continue;
      const theta = cross3(fr.z, norm3(radial));
      circ += t * dot3(theta, sub3(q, p));
    }
  }
  return -circ;
}

/**
 * ∫ p·n dA over one face, n outward. Planes use the face's own normal and loop areas (robust to
 * loop winding); cylinders and cones use boundary integrals that only need the face's loops to
 * wind consistently with each other.
 */
function faceFlux(m: Model, f: FaceInfo, degrees: boolean): number | string {
  if (!f.exact) return "an edge curve type could not be sampled";
  const sign = f.sameSense ? 1 : -1;
  switch (f.surfaceType) {
    case "PLANE": {
      const fr = m.frame(f.surface?.args[1]);
      if (!fr) return "plane without a placement";
      const usable = f.loops.filter((l) => l.pts.length >= 3);
      if (!usable.length) return 0;
      const areas = usable.map((l) => Math.abs(planarMoments(l.pts, fr).area));
      let outerIdx = usable.findIndex((l) => l.outer);
      if (outerIdx < 0) outerIdx = areas.indexOf(Math.max(...areas));
      const net = areas.reduce((s, a, i) => s + (i === outerIdx ? a : -a), 0);
      return sign * dot3(fr.z, fr.o) * net;
    }
    case "CYLINDRICAL_SURFACE": {
      const fr = m.frame(f.surface?.args[1]);
      const r = numOf(f.surface?.args[2]);
      if (!fr || !(r > 0)) return "cylinder without placement or radius";
      const raw = cylinderPatchArea(f.loops, fr);
      const sigma = raw >= 0 ? 1 : -1;
      // p·r̂ = r + o·r̂ on the surface; ∫ r̂ dA = σ · vector area of the loops
      return sign * (r * Math.abs(raw) + sigma * dot3(fr.o, vectorArea(f.loops)));
    }
    case "CONICAL_SURFACE": {
      const fr = m.frame(f.surface?.args[1]);
      const r = numOf(f.surface?.args[2]);
      let alpha = numOf(f.surface?.args[3]);
      if (!fr || !Number.isFinite(r) || !Number.isFinite(alpha)) return "cone without parameters";
      if (degrees) alpha = (alpha * Math.PI) / 180;
      if (Math.abs(Math.tan(alpha)) < 1e-12) return "degenerate cone";
      // on a cone p·n = apex·n, so the flux is apex · ∫ n dA
      const apex = sub3(fr.o, scale3(fr.z, r / Math.tan(alpha)));
      const va = vectorArea(f.loops);
      const az = dot3(va, fr.z);
      if (Math.abs(az) < 1e-12 * Math.max(1, len3(va))) return "cone patch with no axial extent";
      // natural normal ∝ r̂ − tan(α)·z, so the loops' winding agrees with it when va·z has the
      // sign of −tan(α)
      const sigma = Math.sign(az) === -Math.sign(Math.tan(alpha)) ? 1 : -1;
      return sign * sigma * dot3(apex, va);
    }
    case "NONE": {
      // faceted face without a surface: trust the loop winding
      let flux = 0;
      for (const l of f.loops) if (l.pts.length >= 3) flux += dot3(newell(l.pts), l.pts[0] as Vec3);
      return flux;
    }
    default:
      return `face type ${f.surfaceType} is not integrated`;
  }
}

/** True when the file's plane angle unit is the degree (cone semi-angles are then in degrees). */
function usesDegrees(file: StepFile): boolean {
  for (const e of file.instances.values()) {
    if (!part(e, "PLANE_ANGLE_UNIT")) continue;
    const conv = part(e, "CONVERSION_BASED_UNIT");
    if (conv && /DEG/i.test(String(conv.args[0] ?? ""))) return true;
  }
  return false;
}

function shellVolume(
  m: Model,
  faces: FaceInfo[],
  degrees: boolean,
): { volume: number | null; note?: string } {
  let flux = 0;
  for (const f of faces) {
    const v = faceFlux(m, f, degrees);
    if (typeof v === "string") return { volume: null, note: v };
    flux += v;
  }
  return { volume: Math.abs(flux) / 3 };
}

// ---- cylinders ----

interface CylFace {
  r: number;
  hole: boolean;
  axisDir: Vec3;
  axisPt: Vec3;
  frame: Frame;
  pts: Vec3[];
}

function cylinders(
  m: Model,
  faces: FaceInfo[],
  k: number,
): { groups: CylinderGroup[]; holeAxes: HoleAxis[]; partial: number } {
  const cyl: CylFace[] = [];
  for (const f of faces) {
    if (f.surfaceType !== "CYLINDRICAL_SURFACE") continue;
    const fr = m.frame(f.surface?.args[1]);
    const r = numOf(f.surface?.args[2]);
    if (!fr || !(r > 0)) continue;
    // canonical axis: direction with positive leading component, point on the axis nearest origin
    let z = fr.z;
    if (
      z.x < -1e-9 ||
      (Math.abs(z.x) <= 1e-9 && (z.y < -1e-9 || (Math.abs(z.y) <= 1e-9 && z.z < 0)))
    ) {
      z = scale3(z, -1);
    }
    const axisPt = sub3(fr.o, scale3(z, dot3(fr.o, z)));
    cyl.push({
      r,
      hole: !f.sameSense,
      axisDir: z,
      axisPt,
      frame: fr,
      pts: f.loops.flatMap((l) => l.pts),
    });
  }
  // group faces sharing an axis line and radius
  const groups: CylFace[][] = [];
  for (const c of cyl) {
    const tol = Math.max(1e-6, c.r * 1e-6);
    const g = groups.find((gr) => {
      const h = gr[0] as CylFace;
      return (
        h.hole === c.hole &&
        Math.abs(h.r - c.r) <= tol &&
        len3(cross3(h.axisDir, c.axisDir)) < 1e-6 &&
        len3(sub3(h.axisPt, c.axisPt)) <= tol * 10
      );
    });
    if (g) g.push(c);
    else groups.push([c]);
  }
  const full = new Map<string, CylinderGroup>();
  // full hole cylinders by axis line, whatever their radius (a counterbore is one location)
  const axes: { dir: Vec3; pt: Vec3; diameters: Set<number>; lo: number; hi: number }[] = [];
  let partial = 0;
  for (const g of groups) {
    const h = g[0] as CylFace;
    const angles: number[] = [];
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const f of g) {
      for (const p of f.pts) {
        angles.push(angleIn(h.frame, p));
        const t = dot3(sub3(p, h.frame.o), h.frame.z);
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
    angles.sort((a, b) => a - b);
    let gap = angles.length
      ? (angles[0] as number) + 2 * Math.PI - (angles[angles.length - 1] as number)
      : 2 * Math.PI;
    for (let i = 1; i < angles.length; i++)
      gap = Math.max(gap, (angles[i] as number) - (angles[i - 1] as number));
    const coverageDeg = ((2 * Math.PI - gap) * 180) / Math.PI;
    if (coverageDeg < 350) {
      partial += g.length;
      continue;
    }
    const diameter = Math.round(2 * h.r * k * 1000) / 1000;
    const kind = h.hole ? "hole" : "boss";
    const key = `${kind}:${diameter}`;
    const depth = Math.round((hi - lo) * k * 1000) / 1000;
    const prev = full.get(key);
    if (prev) {
      prev.count++;
      prev.depth = Math.max(prev.depth, depth);
    } else full.set(key, { diameter, kind, count: 1, depth });
    if (h.hole) {
      // extent along the canonical axis, from the canonical axis point, so groups compare
      let a0 = Number.POSITIVE_INFINITY;
      let a1 = Number.NEGATIVE_INFINITY;
      for (const f of g) {
        for (const p of f.pts) {
          const t = dot3(sub3(p, h.axisPt), h.axisDir);
          a0 = Math.min(a0, t);
          a1 = Math.max(a1, t);
        }
      }
      const tol = Math.max(1e-6, h.r * 1e-6) * 10;
      const axis = axes.find(
        (x) => len3(cross3(x.dir, h.axisDir)) < 1e-6 && len3(sub3(x.pt, h.axisPt)) <= tol,
      );
      if (axis) {
        axis.diameters.add(diameter);
        axis.lo = Math.min(axis.lo, a0);
        axis.hi = Math.max(axis.hi, a1);
      } else
        axes.push({
          dir: h.axisDir,
          pt: h.axisPt,
          diameters: new Set([diameter]),
          lo: a0,
          hi: a1,
        });
    }
  }
  const holeAxes: HoleAxis[] = axes
    .map((x) => ({
      diameters: [...x.diameters].sort((a, b) => a - b),
      depth: Math.round((x.hi - x.lo) * k * 1000) / 1000,
    }))
    .sort(
      (a, b) =>
        (a.diameters[0] as number) - (b.diameters[0] as number) ||
        a.diameters.length - b.diameters.length ||
        a.depth - b.depth,
    );
  return {
    holeAxes,
    groups: [...full.values()].sort(
      (a, b) => a.diameter - b.diameter || a.kind.localeCompare(b.kind),
    ),
    partial,
  };
}

function minConf(...c: Confidence[]): Confidence {
  if (c.includes("low")) return "low";
  if (c.includes("medium")) return "medium";
  return "high";
}

/** Read a STEP (AP203/AP214/AP242) file and measure its solids. */
export function extractStep(text: string, opts: ExtractOptions = {}): PartFeatures {
  const flags: Flag[] = [];
  const file = parseStep(text);
  const m = new Model(file);
  if (file.errors) {
    flags.push({
      code: "parse-errors",
      message: `${file.errors} STEP statements could not be read and were skipped.`,
    });
  }
  const ctxOf = itemContexts(m);
  const bodies = findBodies(m);
  const assemblyUsages = [...file.instances.values()].filter(
    (e) => e.type === "NEXT_ASSEMBLY_USAGE_OCCURRENCE",
  ).length;

  // units: from the first body's context, else any length unit in the file
  const unitSet = new Set<number>();
  for (const e of file.instances.values()) {
    if (
      e.type === "MANIFOLD_SOLID_BREP" ||
      e.type === "BREP_WITH_VOIDS" ||
      e.type === "FACETED_BREP" ||
      e.type === "SHELL_BASED_SURFACE_MODEL"
    ) {
      const mm = contextUnitMm(m, ctxOf.get(e.id));
      if (mm !== null) unitSet.add(mm);
    }
  }
  if (!unitSet.size) {
    for (const e of file.instances.values()) {
      const mm = e.type === "COMPLEX" ? lengthUnitMm(m, e) : null;
      if (mm !== null) {
        unitSet.add(mm);
        break;
      }
    }
  }
  const declared = [...unitSet][0];
  const assumed = opts.assumeUnits ?? "mm";
  const k = declared ?? MM_PER[assumed];
  const sourceUnits = declared !== undefined ? unitName(declared) : assumed;
  if (declared === undefined) {
    flags.push({ code: "units-unknown", message: `No length unit found; assumed ${assumed}.` });
  }
  if (unitSet.size > 1) {
    flags.push({
      code: "units-mixed",
      message: "Solids use different length units; the first was applied to all.",
    });
  }

  const sampler = new Sampler(m);
  const degrees = usesDegrees(file);
  const out: SolidBody[] = [];
  const unsupported: Record<string, number> = {};
  let doublyCurved = false;
  let anyInexact = false;
  for (const b of bodies) {
    const bodyBox = new Box3();
    const local = new Sampler(m);
    const infos = b.faces.map((f) => local.face(f));
    const voidInfos = b.voids.map((v) => v.map((f) => local.face(f)));
    bodyBox.merge(local.box);
    sampler.box.merge(local.box);
    const surfaceTypes: Record<string, number> = {};
    for (const f of [...infos, ...voidInfos.flat()]) {
      surfaceTypes[f.surfaceType] = (surfaceTypes[f.surfaceType] ?? 0) + 1;
      if (!RULED.has(f.surfaceType) && f.surfaceType !== "NONE") {
        doublyCurved = true;
        unsupported[f.surfaceType] = (unsupported[f.surfaceType] ?? 0) + 1;
      }
      if (!f.exact) anyInexact = true;
    }
    let volume: number | null = null;
    let volumeNote: string | undefined;
    if (b.surfaceModel) {
      volumeNote = "surface model (open shell): no volume";
    } else {
      const v = shellVolume(m, infos, degrees);
      volume = v.volume;
      volumeNote = v.note;
      if (volume !== null) {
        for (const vf of voidInfos) {
          const vv = shellVolume(m, vf, degrees);
          if (vv.volume === null) {
            volume = null;
            volumeNote = `void: ${vv.note}`;
            break;
          }
          volume -= vv.volume;
        }
      }
      if (volume !== null) {
        volume *= k * k * k;
        const bb = bodyBox.toBox(k);
        const boxVol = bb ? bb.size.x * bb.size.y * bb.size.z : 0;
        if (!(volume > 0) || volume > boxVol * (1 + 1e-6)) {
          volumeNote = `integrated volume ${volume.toExponential(3)} mm³ failed the bounding-box check`;
          volume = null;
          flags.push({
            code: "volume-failed-check",
            message: `${b.name || "a body"}: ${volumeNote}.`,
          });
        }
      }
    }
    const cyl = cylinders(m, infos, k);
    const body: SolidBody = {
      name: b.name,
      faceCount: infos.length,
      boundingBox: roundBox(bodyBox.toBox(k)),
      volume: volume === null ? null : Math.round(volume * 1000) / 1000,
      surfaceTypes,
      cylinders: cyl.groups,
      holeAxes: cyl.holeAxes,
      partialCylinderFaces: cyl.partial,
    };
    if (volumeNote) body.volumeNote = volumeNote;
    out.push(body);
  }

  let box = sampler.box;
  if (!bodies.length) {
    flags.push({
      code: "no-solid",
      message: "No B-rep solid or surface model found; box is from all points in the file.",
    });
    box = new Box3();
    for (const e of file.instances.values()) {
      if (e.type === "CARTESIAN_POINT") {
        const c = e.args[1];
        if (Array.isArray(c) && c.length === 3)
          box.add(v3(Number(c[0]), Number(c[1]), Number(c[2])));
      }
    }
  }
  if (bodies.some((b) => b.surfaceModel)) {
    flags.push({
      code: "surface-model",
      message: "The file holds surfaces, not a closed solid; no volume.",
    });
  }
  if (bodies.length > 1) {
    flags.push({
      code: "multiple-solids",
      message: `${bodies.length} solid bodies; the box covers all of them.`,
    });
  }
  const placementIgnored =
    assemblyUsages > 0 || [...file.instances.values()].some((e) => e.type === "MAPPED_ITEM");
  if (placementIgnored) {
    flags.push({
      code: "assembly-placement-ignored",
      message:
        "Assembly placements (NAUO / mapped items) are not applied; each body is measured in its own coordinates.",
    });
  }
  if (doublyCurved) {
    flags.push({
      code: "bbox-may-underestimate",
      message:
        "Some faces are spheres, tori or free-form; they can bulge past their edges, so the box may be slightly small.",
    });
  }
  const noVolume = out.filter(
    (b) => b.volume === null && !bodies.find((x) => x.name === b.name)?.surfaceModel,
  );
  if (noVolume.length) {
    flags.push({
      code: "volume-unsupported",
      message: `Volume not computed for ${noVolume.length} bodies: ${[...new Set(noVolume.map((b) => b.volumeNote))].join("; ")}.`,
    });
  }

  const vols = out.map((b) => b.volume);
  const totalVolume =
    vols.length && vols.every((v) => v !== null)
      ? Math.round((vols as number[]).reduce((s, v) => s + v, 0) * 1000) / 1000
      : null;

  const units: Confidence = declared !== undefined && unitSet.size === 1 ? "high" : "low";
  let boundingBox: Confidence = "high";
  if (!bodies.length || (placementIgnored && bodies.length > 1)) boundingBox = "low";
  else if (doublyCurved || anyInexact || file.errors) boundingBox = "medium";
  const measures: Confidence =
    !out.length || totalVolume === null
      ? vols.some((v) => v !== null)
        ? "medium"
        : "low"
      : file.errors
        ? "medium"
        : "high";
  const holes: Confidence = !out.length ? "low" : doublyCurved || anyInexact ? "medium" : "high";
  return {
    format: "step",
    units: "mm",
    sourceUnits,
    unitsAssumed: declared === undefined,
    boundingBox: roundBox(box.toBox(k)),
    flat: null,
    solid: { schema: file.schema, bodies: out, totalVolume, assemblyUsages },
    confidence: minConf(units, boundingBox, measures === "low" ? "medium" : measures),
    fieldConfidence: { units, boundingBox, measures, holes, bends: "low" },
    flags,
    unsupported,
  };
}

function roundBox(b: ReturnType<Box3["toBox"]>): ReturnType<Box3["toBox"]> {
  if (!b) return null;
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;
  const rv = (p: Vec3): Vec3 => v3(r(p.x), r(p.y), r(p.z));
  return { min: rv(b.min), max: rv(b.max), size: rv(b.size) };
}
