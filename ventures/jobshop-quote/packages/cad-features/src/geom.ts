// Small, dependency-free geometry used by both parsers.

import type { BoundingBox, Vec2, Vec3 } from "./types.ts";

/**
 * A 2D edge: a straight segment when bulge is 0, otherwise a circular arc from a to b.
 * bulge = tan(sweep / 4), positive for counter-clockwise (the DXF LWPOLYLINE convention).
 */
export interface Edge2 {
  a: Vec2;
  b: Vec2;
  bulge: number;
}

export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Centre and radius of a bulged edge; null for a straight one. */
export function arcOf(e: Edge2): { c: Vec2; r: number; sweep: number } | null {
  if (Math.abs(e.bulge) < 1e-12) return null;
  const chord = dist2(e.a, e.b);
  if (chord === 0) return null;
  const sweep = 4 * Math.atan(e.bulge);
  const r = chord / (2 * Math.abs(Math.sin(sweep / 2)));
  // centre sits on the chord's perpendicular bisector, offset by the sagitta-derived distance
  const mx = (e.a.x + e.b.x) / 2;
  const my = (e.a.y + e.b.y) / 2;
  const ux = (e.b.x - e.a.x) / chord;
  const uy = (e.b.y - e.a.y) / chord;
  // distance from chord midpoint to centre, signed towards the left of a→b for a CCW arc < 180°
  const d = (chord / 2) * ((1 - e.bulge * e.bulge) / (2 * e.bulge));
  return { c: { x: mx - uy * d, y: my + ux * d }, r, sweep };
}

export function edgeLength(e: Edge2): number {
  const arc = arcOf(e);
  if (!arc) return dist2(e.a, e.b);
  return arc.r * Math.abs(arc.sweep);
}

/** Signed area enclosed by a closed chain of edges (CCW positive), exact for arcs. */
export function chainArea(edges: readonly Edge2[]): number {
  let twice = 0;
  let seg = 0;
  for (const e of edges) {
    twice += e.a.x * e.b.y - e.b.x * e.a.y;
    const arc = arcOf(e);
    if (arc) seg += ((arc.sweep - Math.sin(arc.sweep)) * arc.r * arc.r) / 2;
  }
  return twice / 2 + seg;
}

/** Points along an edge, a included, b excluded; arcs split so the chord error stays under tol. */
export function tessellateEdge(e: Edge2, tol: number): Vec2[] {
  const arc = arcOf(e);
  if (!arc) return [e.a];
  const maxStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / arc.r)));
  const n = Math.max(2, Math.min(720, Math.ceil(Math.abs(arc.sweep) / Math.max(maxStep, 1e-3))));
  const a0 = Math.atan2(e.a.y - arc.c.y, e.a.x - arc.c.x);
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + (arc.sweep * i) / n;
    out.push({ x: arc.c.x + arc.r * Math.cos(t), y: arc.c.y + arc.r * Math.sin(t) });
  }
  return out;
}

export function tessellateChain(edges: readonly Edge2[], tol: number): Vec2[] {
  const pts: Vec2[] = [];
  for (const e of edges) pts.push(...tessellateEdge(e, tol));
  return pts;
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec2;
    const b = poly[j] as Vec2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function bbox2(pts: readonly Vec2[]): { min: Vec2; max: Vec2 } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export class Box3 {
  min: Vec3 = {
    x: Number.POSITIVE_INFINITY,
    y: Number.POSITIVE_INFINITY,
    z: Number.POSITIVE_INFINITY,
  };
  max: Vec3 = {
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
    z: Number.NEGATIVE_INFINITY,
  };
  add(p: Vec3): void {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    if (p.x < this.min.x) this.min.x = p.x;
    if (p.y < this.min.y) this.min.y = p.y;
    if (p.z < this.min.z) this.min.z = p.z;
    if (p.x > this.max.x) this.max.x = p.x;
    if (p.y > this.max.y) this.max.y = p.y;
    if (p.z > this.max.z) this.max.z = p.z;
  }
  get empty(): boolean {
    return this.min.x > this.max.x;
  }
  merge(o: Box3): void {
    if (o.empty) return;
    this.add(o.min);
    this.add(o.max);
  }
  toBox(scale = 1): BoundingBox | null {
    if (this.empty) return null;
    const min = { x: this.min.x * scale, y: this.min.y * scale, z: this.min.z * scale };
    const max = { x: this.max.x * scale, y: this.max.y * scale, z: this.max.z * scale };
    return { min, max, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
  }
}

// ---- 3D vector helpers ----

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export function norm3(a: Vec3): Vec3 {
  const l = len3(a);
  return l === 0 ? a : scale3(a, 1 / l);
}

/** Any unit vector perpendicular to n. */
export function perp3(n: Vec3): Vec3 {
  const t = Math.abs(n.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  return norm3(cross3(n, t));
}

// ---- B-splines (DXF SPLINE and STEP B_SPLINE_CURVE_WITH_KNOTS) ----

export interface BSpline {
  degree: number;
  /** full knot vector (multiplicities expanded), length = controls + degree + 1 */
  knots: number[];
  controls: Vec3[];
  /** rational weights, same length as controls, or undefined */
  weights?: number[];
}

export function bsplineDomain(s: BSpline): [number, number] {
  return [s.knots[s.degree] as number, s.knots[s.knots.length - s.degree - 1] as number];
}

/** De Boor evaluation; returns null for an inconsistent spline. */
export function bsplineAt(s: BSpline, t: number): Vec3 | null {
  const p = s.degree;
  const n = s.controls.length;
  if (p < 1 || s.knots.length !== n + p + 1) return null;
  const [lo, hi] = bsplineDomain(s);
  const u = Math.min(Math.max(t, lo), hi);
  let k = p;
  while (k < n - 1 && (s.knots[k + 1] as number) <= u) k++;
  const d: { x: number; y: number; z: number; w: number }[] = [];
  for (let j = 0; j <= p; j++) {
    const c = s.controls[j + k - p];
    if (!c) return null;
    const w = s.weights ? (s.weights[j + k - p] ?? 1) : 1;
    d.push({ x: c.x * w, y: c.y * w, z: c.z * w, w });
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const kl = s.knots[j + k - p] as number;
      const kr = s.knots[j + 1 + k - r] as number;
      const den = kr - kl;
      const alpha = den === 0 ? 0 : (u - kl) / den;
      const a = d[j - 1] as { x: number; y: number; z: number; w: number };
      const b = d[j] as { x: number; y: number; z: number; w: number };
      d[j] = {
        x: (1 - alpha) * a.x + alpha * b.x,
        y: (1 - alpha) * a.y + alpha * b.y,
        z: (1 - alpha) * a.z + alpha * b.z,
        w: (1 - alpha) * a.w + alpha * b.w,
      };
    }
  }
  const r = d[p] as { x: number; y: number; z: number; w: number };
  if (r.w === 0) return null;
  return { x: r.x / r.w, y: r.y / r.w, z: r.z / r.w };
}

/** Sample a B-spline over [t0, t1] with n intervals (n + 1 points). */
export function sampleBSpline(s: BSpline, t0: number, t1: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = bsplineAt(s, t0 + ((t1 - t0) * i) / n);
    if (p) out.push(p);
  }
  return out;
}

/** Expand STEP-style (distinct knots, multiplicities) into a full knot vector. */
export function expandKnots(knots: readonly number[], mults: readonly number[]): number[] {
  const out: number[] = [];
  knots.forEach((k, i) => {
    for (let m = 0; m < (mults[i] ?? 1); m++) out.push(k);
  });
  return out;
}
