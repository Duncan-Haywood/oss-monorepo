// IGES 5.x (ASCII, fixed 80-column form): units and the part's bounding box, from the trimmed
// surfaces and B-rep faces most CAD systems write, and from wireframe curves.
//
// How the box is found. A face's surface is usually bigger than the face (a plane or B-spline patch
// trimmed down), so the untrimmed surface would overstate the part. Each face is measured from what
// bounds it:
// - its model-space edges (142 CPTR, 141 model curves, 504 edges), sampled along the real curve
//   (lines, arcs, conics, copious data, parametric splines and rational B-splines); and
// - for a B-spline surface (128) with parameter-space trim curves, its interior: a grid over the
//   surface's (u, v) domain, kept where it falls inside the outer trim loop and outside the holes.
// A ruled surface (plane, ruled, tabulated cylinder, a B-spline linear in one direction, a surface
// of revolution of a straight line) can never bulge past its edges, so its edges give its box. For
// any other face we also compute an outer bound (the B-spline's control points, the full sweep of a
// surface of revolution, a sphere's or torus's own box). When the outer bounds stay inside the box
// we measured, the box stands; when one reaches past it, the box is kept and `bbox-may-underestimate`
// says on which axis and by how much at most. Never a guess.
//
// Not read: volume (IGES does not say a set of faces is closed; ask for STEP), holes, assembly or
// subfigure placements (408/308), a parent entity's transformation matrix applied to its children
// (flagged when one is present), compressed and binary IGES. Pure; no Node APIs.

import type {
  BoundingBox,
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

export class IgesError extends Error {}

/** Files with more directory entries than this are not measured (a Worker request has little CPU). */
export const MAX_IGES_ENTITIES = 200_000;
/** Total surface evaluations allowed for trimmed-face interiors across the file. */
const SURFACE_SAMPLE_BUDGET = 400_000;

/** True when text reads like an ASCII IGES file: the first record is a Start or Flag line ("S      1" in columns 73-80). */
export function looksLikeIges(text: string): boolean {
  const first = /^[^\r\n]*/.exec(text)?.[0] ?? "";
  if (first.length < 74) return false;
  return /^[SCB] {0,6}0*1$/.test(first.slice(72, 80).trimEnd());
}

// ---------------------------------------------------------------------------------------------
// Physical file: sections, global parameters, directory entries, parameter data

interface DirEntry {
  /** sequence number of the entry's first line: 1, 3, 5, ... (what pointers refer to) */
  de: number;
  type: number;
  form: number;
  pdPointer: number;
  pdCount: number;
  transform: number;
  blank: number;
  subordinate: number;
  use: number;
  label: string;
}

type Token = string | null;

interface IgesFile {
  global: Token[];
  entries: Map<number, DirEntry>;
  params: Map<number, Token[]>;
  startText: string;
}

function splitRecords(text: string): string[] {
  let lines = text.split(/\r\n|\r|\n/);
  // A file written without line breaks is one long run of 80-column records.
  if (lines.filter((l) => l.length).length === 1 && (lines[0] ?? "").length > 80) {
    const one = lines[0] ?? "";
    lines = [];
    for (let i = 0; i < one.length; i += 80) lines.push(one.slice(i, i + 80));
  }
  return lines.filter((l) => l.trim().length > 0).map((l) => l.padEnd(80, " "));
}

/**
 * Free-format parameter tokens: Hollerith strings (nH...), numbers (a D exponent read as E), and
 * empty (defaulted) fields as null. Stops at the record delimiter.
 */
export function tokenize(text: string, pd: string, rd: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && text[i] === " ") i++;
    if (i >= n) break;
    const h = /^(\d+)H/.exec(text.slice(i, i + 12));
    let tok: string;
    if (h) {
      const len = Number(h[1]);
      const start = i + (h[0]?.length ?? 0);
      tok = text.slice(start, start + len);
      i = start + len;
      while (i < n && text[i] === " ") i++;
    } else {
      let j = i;
      while (j < n && text[j] !== pd && text[j] !== rd) j++;
      tok = text.slice(i, j).trim();
      i = j;
    }
    out.push(tok === "" && !h ? null : tok);
    if (i >= n) break;
    const d = text[i];
    i++;
    if (d === rd) return out;
    if (d !== pd) {
      // a stray character after a Hollerith string: skip to the next delimiter
      while (i < n && text[i] !== pd && text[i] !== rd) i++;
      if (i < n && text[i++] === rd) return out;
    }
  }
  return out;
}

/** The parameter and record delimiters from the start of the Global section (defaults "," and ";"). */
function globalDelimiters(g: string): { pd: string; rd: string } {
  const s = g.trimStart();
  let pd = ",";
  let i = 0;
  if (s.startsWith("1H")) {
    pd = s[2] ?? ",";
    i = 3;
  }
  if (s[i] === pd) i++;
  while (s[i] === " ") i++;
  const rd = s.startsWith("1H", i) ? (s[i + 2] ?? ";") : ";";
  return { pd, rd };
}

function parseFile(text: string): IgesFile {
  const records = splitRecords(text);
  if (!records.length) throw new IgesError("The IGES file is empty.");
  const kind = records[0]?.[72];
  if (kind === "B") throw new IgesError("Binary IGES is not read; export ASCII IGES or STEP.");
  if (kind === "C")
    throw new IgesError("Compressed ASCII IGES is not read; export fixed-format IGES or STEP.");
  const S: string[] = [];
  const G: string[] = [];
  const D: string[] = [];
  const P: string[] = [];
  for (const r of records) {
    const sec = r[72];
    if (sec === "S") S.push(r.slice(0, 72));
    else if (sec === "G") G.push(r.slice(0, 72));
    else if (sec === "D") D.push(r);
    else if (sec === "P") P.push(r);
  }
  if (!D.length) throw new IgesError("The IGES file has no Directory Entry section.");
  if (D.length / 2 > MAX_IGES_ENTITIES)
    throw new IgesError(
      `${D.length / 2} entities; files over ${MAX_IGES_ENTITIES} are not measured.`,
    );
  const gText = G.join("");
  const { pd, rd } = globalDelimiters(gText);
  const global = tokenize(gText, pd, rd);

  const field = (line: string, k: number): string => line.slice(k * 8, k * 8 + 8);
  const int = (s: string): number => {
    const t = s.trim();
    if (!t) return 0;
    const v = Number.parseInt(t, 10);
    return Number.isFinite(v) ? v : 0;
  };
  const entries = new Map<number, DirEntry>();
  for (let i = 0; i + 1 < D.length; i += 2) {
    const a = D[i] ?? "";
    const b = D[i + 1] ?? "";
    const status = field(a, 8).replace(/ /g, "0").padStart(8, "0");
    const e: DirEntry = {
      de: i + 1,
      type: int(field(a, 0)),
      pdPointer: int(field(a, 1)),
      transform: int(field(a, 6)),
      blank: Number(status.slice(0, 2)) || 0,
      subordinate: Number(status.slice(2, 4)) || 0,
      use: Number(status.slice(4, 6)) || 0,
      pdCount: int(field(b, 3)),
      form: int(field(b, 4)),
      label: field(b, 7).trim(),
    };
    entries.set(e.de, e);
  }
  // Parameter data: columns 1-64 carry the data, 66-72 the entry's DE pointer.
  const params = new Map<number, Token[]>();
  for (const e of entries.values()) {
    if (e.pdPointer < 1) continue;
    const lines = P.slice(e.pdPointer - 1, e.pdPointer - 1 + Math.max(1, e.pdCount));
    if (!lines.length) continue;
    params.set(e.de, tokenize(lines.map((l) => l.slice(0, 64)).join(""), pd, rd));
  }
  return { global, entries, params, startText: S.join(" ").trim() };
}

const UNIT_FLAGS: Record<number, { unit: LengthUnit; mm: number }> = {
  1: { unit: "in", mm: 25.4 },
  2: { unit: "mm", mm: 1 },
  4: { unit: "ft", mm: 304.8 },
  5: { unit: "mi", mm: 1_609_344 },
  6: { unit: "m", mm: 1000 },
  7: { unit: "km", mm: 1_000_000 },
  8: { unit: "mil", mm: 0.0254 },
  9: { unit: "um", mm: 0.001 },
  10: { unit: "cm", mm: 10 },
  11: { unit: "uin", mm: 0.0000254 },
};
const UNIT_NAMES: Record<string, number> = {
  IN: 1,
  INCH: 1,
  INCHES: 1,
  MM: 2,
  FT: 4,
  MI: 5,
  M: 6,
  KM: 7,
  MIL: 8,
  UM: 9,
  MICRON: 9,
  CM: 10,
  UIN: 11,
};

// ---------------------------------------------------------------------------------------------
// Small vector and transform helpers

type M34 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
const IDENTITY: M34 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const apply = (m: M34, p: Vec3): Vec3 => ({
  x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
  y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
  z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11],
});
const applyDir = (m: M34, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[4] * v.x + m[5] * v.y + m[6] * v.z,
  z: m[8] * v.x + m[9] * v.y + m[10] * v.z,
});
/** a then b: the matrix of p -> b(a(p)) */
function compose(b: M34, a: M34): M34 {
  const B = (i: number) => b[i] as number;
  const A = (i: number) => a[i] as number;
  const r: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++)
      r[i * 4 + j] = B(i * 4) * A(j) + B(i * 4 + 1) * A(4 + j) + B(i * 4 + 2) * A(8 + j);
    r[i * 4 + 3] = B(i * 4) * A(3) + B(i * 4 + 1) * A(7) + B(i * 4 + 2) * A(11) + B(i * 4 + 3);
  }
  return r as M34;
}
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => {
  const l = norm(a);
  return l > 0 ? scale(a, 1 / l) : a;
};
const AXES = ["x", "y", "z"] as const;

class Box {
  lo = [Infinity, Infinity, Infinity];
  hi = [-Infinity, -Infinity, -Infinity];
  get empty(): boolean {
    return !((this.lo[0] as number) <= (this.hi[0] as number));
  }
  add(p: Vec3): void {
    const v = [p.x, p.y, p.z];
    for (let d = 0; d < 3; d++) {
      const c = v[d] as number;
      if (!Number.isFinite(c)) continue;
      if (c < (this.lo[d] as number)) this.lo[d] = c;
      if (c > (this.hi[d] as number)) this.hi[d] = c;
    }
  }
  merge(b: Box): void {
    if (b.empty) return;
    this.add({ x: b.lo[0] as number, y: b.lo[1] as number, z: b.lo[2] as number });
    this.add({ x: b.hi[0] as number, y: b.hi[1] as number, z: b.hi[2] as number });
  }
}

// ---------------------------------------------------------------------------------------------
// NURBS

/** Knot span index (The NURBS Book, A2.1) for parameter u, degree p, n = last control point index. */
function findSpan(n: number, p: number, u: number, U: number[]): number {
  if (u >= (U[n + 1] as number)) {
    let s = n;
    while (s > p && (U[s] as number) >= (U[n + 1] as number)) s--;
    return s;
  }
  if (u <= (U[p] as number)) {
    let s = p;
    while (s < n && (U[s + 1] as number) <= u) s++;
    return s;
  }
  let lo = p;
  let hi = n + 1;
  let mid = (lo + hi) >> 1;
  while (u < (U[mid] as number) || u >= (U[mid + 1] as number)) {
    if (u < (U[mid] as number)) hi = mid;
    else lo = mid;
    mid = (lo + hi) >> 1;
  }
  return mid;
}

/** Non-zero basis functions at u (A2.2). */
function basis(span: number, u: number, p: number, U: number[]): number[] {
  const N = [1];
  const left = [0];
  const right = [0];
  for (let j = 1; j <= p; j++) {
    left[j] = u - (U[span + 1 - j] as number);
    right[j] = (U[span + j] as number) - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const den = (right[r + 1] as number) + (left[j - r] as number);
      const temp = den === 0 ? 0 : (N[r] as number) / den;
      N[r] = saved + (right[r + 1] as number) * temp;
      saved = (left[j - r] as number) * temp;
    }
    N[j] = saved;
  }
  return N;
}

interface NurbsCurve {
  p: number;
  n: number;
  knots: number[];
  w: number[];
  pts: Vec3[];
  t0: number;
  t1: number;
}

function evalCurve(c: NurbsCurve, t: number): Vec3 {
  const span = findSpan(c.n, c.p, t, c.knots);
  const N = basis(span, t, c.p, c.knots);
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  for (let j = 0; j <= c.p; j++) {
    const i = span - c.p + j;
    const b = (N[j] as number) * (c.w[i] as number);
    const q = c.pts[i] as Vec3;
    x += b * q.x;
    y += b * q.y;
    z += b * q.z;
    w += b;
  }
  return w === 0
    ? { x: Number.NaN, y: Number.NaN, z: Number.NaN }
    : { x: x / w, y: y / w, z: z / w };
}

/** Parameters along [t0, t1]: every distinct knot inside it plus `per` steps per knot span. */
function knotSamples(knots: number[], t0: number, t1: number, per: number, cap: number): number[] {
  const ks = [...new Set(knots.filter((k) => k > t0 && k < t1))].sort((a, b) => a - b);
  const edges = [t0, ...ks, t1];
  const spans = Math.max(1, edges.length - 1);
  const step = Math.max(1, Math.min(per, Math.floor(cap / spans)));
  const out: number[] = [];
  for (let s = 0; s < edges.length - 1; s++) {
    const a = edges[s] as number;
    const b = edges[s + 1] as number;
    for (let k = 0; k < step; k++) out.push(a + ((b - a) * k) / step);
  }
  out.push(t1);
  return out;
}

interface NurbsSurface {
  p: number;
  q: number;
  n: number;
  m: number;
  uk: number[];
  vk: number[];
  w: number[];
  pts: Vec3[];
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

function evalSurface(s: NurbsSurface, u: number, v: number): Vec3 {
  const su = findSpan(s.n, s.p, u, s.uk);
  const sv = findSpan(s.m, s.q, v, s.vk);
  const Nu = basis(su, u, s.p, s.uk);
  const Nv = basis(sv, v, s.q, s.vk);
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  for (let l = 0; l <= s.q; l++) {
    const j = sv - s.q + l;
    for (let k = 0; k <= s.p; k++) {
      const i = su - s.p + k;
      const idx = j * (s.n + 1) + i;
      const b = (Nu[k] as number) * (Nv[l] as number) * (s.w[idx] as number);
      const q = s.pts[idx] as Vec3;
      x += b * q.x;
      y += b * q.y;
      z += b * q.z;
      w += b;
    }
  }
  return w === 0
    ? { x: Number.NaN, y: Number.NaN, z: Number.NaN }
    : { x: x / w, y: y / w, z: z / w };
}

/** True when the surface is linear in u or in v (degree 1, equal weights along that direction): a ruled surface. */
function surfaceIsRuled(s: NurbsSurface): boolean {
  const flatW = (alongU: boolean): boolean => {
    for (let j = 0; j <= s.m; j++)
      for (let i = 0; i <= s.n; i++) {
        const w = s.w[j * (s.n + 1) + i] as number;
        const first = alongU ? (s.w[j * (s.n + 1)] as number) : (s.w[i] as number);
        if (Math.abs(w - first) > 1e-12 * Math.max(1, Math.abs(first))) return false;
      }
    return true;
  };
  return (s.p === 1 && flatW(true)) || (s.q === 1 && flatW(false));
}

// ---------------------------------------------------------------------------------------------
// The model: entity readers

const CURVE_TYPES = new Set([100, 102, 104, 106, 110, 112, 126, 130]);
const SURFACE_TYPES = new Set([108, 114, 118, 120, 122, 128, 140, 190, 192, 194, 196, 198]);
const PARENT_TYPES = new Set([102, 141, 142, 143, 144, 186, 502, 504, 508, 510, 514]);
/** Entities that carry no part geometry: annotation, properties, associativity, views, colour, notes. */
const NON_GEOMETRY = new Set([
  0, 124, 116, 202, 206, 208, 210, 212, 214, 216, 218, 220, 222, 228, 230, 302, 304, 306, 310, 312,
  314, 316, 320, 322, 402, 404, 406, 410, 412, 414, 416, 418, 420, 422, 430,
]);
const SURFACE_NAMES: Record<number, string> = {
  108: "plane",
  114: "parametric spline surface",
  118: "ruled surface",
  120: "surface of revolution",
  122: "tabulated cylinder",
  128: "B-spline surface",
  140: "offset surface",
  190: "plane surface",
  192: "cylindrical surface",
  194: "conical surface",
  196: "spherical surface",
  198: "toroidal surface",
};

interface Face {
  surface: number;
  /** model-space boundary curves */
  edges: number[];
  /** parameter-space loops: outer first (null when the outer boundary is the surface's own) */
  outer: number | null;
  inner: number[];
  natural: boolean;
}

class Model {
  unsupported: Record<string, number> = {};
  notes = new Set<string>();
  parentTransforms = 0;
  budget = SURFACE_SAMPLE_BUDGET;
  budgetHit = false;
  private tcache = new Map<number, M34>();

  private f: IgesFile;
  constructor(f: IgesFile) {
    this.f = f;
  }

  entry(de: number): DirEntry | undefined {
    return this.f.entries.get(de);
  }
  tok(de: number): Token[] {
    return this.f.params.get(de) ?? [];
  }
  num(de: number, i: number, fallback = 0): number {
    const t = this.tok(de)[i];
    if (t == null) return fallback;
    const v = Number(t.replace(/[dD]/, "E"));
    return Number.isFinite(v) ? v : fallback;
  }
  ptr(de: number, i: number): number {
    return Math.trunc(this.num(de, i, 0));
  }
  count(type: number, form: number, why = ""): void {
    const k = `${type}${form ? ` form ${form}` : ""}${why ? ` (${why})` : ""}`;
    this.unsupported[k] = (this.unsupported[k] ?? 0) + 1;
  }

  /** The entity's own transformation matrix, chained through the matrices it points to. */
  transformOf(de: number, depth = 0): M34 {
    const e = this.entry(de);
    if (!e || e.transform <= 0 || depth > 16) return IDENTITY;
    const cached = this.tcache.get(de);
    if (cached) return cached;
    const t = this.entry(e.transform);
    if (t?.type !== 124) return IDENTITY;
    const r = (i: number) => this.num(t.de, i);
    const own: M34 = [r(1), r(2), r(3), r(4), r(5), r(6), r(7), r(8), r(9), r(10), r(11), r(12)];
    const m = compose(this.transformOf(t.de, depth + 1), own);
    this.tcache.set(de, m);
    return m;
  }

  // -- curves ----------------------------------------------------------------------------------

  /** Points along a curve in its parent's space (its own matrix applied); arcs include their exact extremes. */
  curvePoints(de: number, depth = 0): Vec3[] {
    const e = this.entry(de);
    if (!e || depth > 32) return [];
    const T = this.transformOf(de);
    const out: Vec3[] = [];
    const push = (p: Vec3) => out.push(apply(T, p));
    switch (e.type) {
      case 110: {
        if (e.form !== 0) {
          this.count(110, e.form, "unbounded line");
          return [];
        }
        push({ x: this.num(de, 1), y: this.num(de, 2), z: this.num(de, 3) });
        push({ x: this.num(de, 4), y: this.num(de, 5), z: this.num(de, 6) });
        return out;
      }
      case 100: {
        const zt = this.num(de, 1);
        const c = { x: this.num(de, 2), y: this.num(de, 3), z: zt };
        const s = { x: this.num(de, 4), y: this.num(de, 5), z: zt };
        const t = { x: this.num(de, 6), y: this.num(de, 7), z: zt };
        const r = Math.hypot(s.x - c.x, s.y - c.y);
        const a0 = Math.atan2(s.y - c.y, s.x - c.x);
        let a1 = Math.atan2(t.y - c.y, t.x - c.x);
        while (a1 <= a0 + 1e-12) a1 += 2 * Math.PI;
        if (Math.hypot(s.x - t.x, s.y - t.y) <= 1e-9 * Math.max(1, r)) a1 = a0 + 2 * Math.PI;
        return ellipsePoints(T, c, { x: r, y: 0, z: 0 }, { x: 0, y: r, z: 0 }, a0, a1);
      }
      case 104: {
        // Conic arc in standard position: A x² + B xy + C y² + D x + E y + F = 0 at z = ZT.
        const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map((i) => this.num(de, i)) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        const zt = this.num(de, 7);
        const s = { x: this.num(de, 8), y: this.num(de, 9), z: zt };
        const t = { x: this.num(de, 10), y: this.num(de, 11), z: zt };
        const standardEllipse =
          e.form === 1 && Math.abs(B) + Math.abs(D) + Math.abs(E) < 1e-12 && A * F < 0 && C * F < 0;
        if (!standardEllipse) {
          this.count(
            104,
            e.form,
            "conic other than an ellipse in standard position: endpoints only",
          );
          this.notes.add("conic");
          push(s);
          push(t);
          return out;
        }
        const a = Math.sqrt(-F / A);
        const b = Math.sqrt(-F / C);
        const a0 = Math.atan2(s.y / b, s.x / a);
        let a1 = Math.atan2(t.y / b, t.x / a);
        while (a1 <= a0 + 1e-12) a1 += 2 * Math.PI;
        if (Math.hypot(s.x - t.x, s.y - t.y) <= 1e-9 * Math.max(a, b)) a1 = a0 + 2 * Math.PI;
        return ellipsePoints(
          T,
          { x: 0, y: 0, z: zt },
          { x: a, y: 0, z: 0 },
          { x: 0, y: b, z: 0 },
          a0,
          a1,
        );
      }
      case 102: {
        const n = this.ptr(de, 1);
        for (let i = 0; i < n; i++)
          for (const p of this.curvePoints(this.ptr(de, 2 + i), depth + 1)) out.push(apply(T, p));
        if (e.transform > 0 && n) this.parentTransforms++;
        return out;
      }
      case 106: {
        const ip = this.ptr(de, 1);
        const n = this.ptr(de, 2);
        if (![1, 2, 3, 11, 12, 13, 63].includes(e.form)) {
          return []; // centrelines, sections, witness lines: drafting, not part geometry
        }
        if (ip === 1) {
          const zt = this.num(de, 3);
          for (let i = 0; i < n; i++)
            push({ x: this.num(de, 4 + 2 * i), y: this.num(de, 5 + 2 * i), z: zt });
        } else {
          const stride = ip === 3 ? 6 : 3;
          for (let i = 0; i < n; i++)
            push({
              x: this.num(de, 3 + stride * i),
              y: this.num(de, 4 + stride * i),
              z: this.num(de, 5 + stride * i),
            });
        }
        return out;
      }
      case 112: {
        // Parametric spline: N cubic segments, coefficients per axis, s from 0 to T(i+1) - T(i).
        const n = this.ptr(de, 4);
        const T0 = 5;
        const coef = T0 + n + 1;
        for (let i = 0; i < n; i++) {
          const len = this.num(de, T0 + i + 1) - this.num(de, T0 + i);
          const base = coef + 12 * i;
          const c = (axis: number, k: number) => this.num(de, base + 4 * axis + k);
          const ss = new Set([0, len]);
          for (let axis = 0; axis < 3; axis++) {
            // extremes where b + 2c s + 3d s² = 0
            const b1 = c(axis, 1);
            const c1 = c(axis, 2);
            const d1 = c(axis, 3);
            for (const r of quadRoots(3 * d1, 2 * c1, b1)) if (r > 0 && r < len) ss.add(r);
          }
          for (let k = 1; k < 8; k++) ss.add((len * k) / 8);
          for (const s of ss) {
            const at = (axis: number) =>
              c(axis, 0) + s * (c(axis, 1) + s * (c(axis, 2) + s * c(axis, 3)));
            push({ x: at(0), y: at(1), z: at(2) });
          }
        }
        return out;
      }
      case 126: {
        const c = this.nurbsCurve(de);
        if (!c) return [];
        for (const t of knotSamples(c.knots, c.t0, c.t1, Math.max(8, 4 * c.p), 4000))
          push(evalCurve(c, t));
        return out;
      }
      case 130: {
        this.count(130, e.form, "offset curve");
        return [];
      }
      default:
        if (!NON_GEOMETRY.has(e.type)) this.count(e.type, e.form, "not a curve");
        return [];
    }
  }

  nurbsCurve(de: number): NurbsCurve | null {
    const K = this.ptr(de, 1);
    const p = this.ptr(de, 2);
    if (K < 0 || p < 1 || K < p) return null;
    const nk = K + p + 2;
    const k0 = 7;
    const knots = Array.from({ length: nk }, (_, i) => this.num(de, k0 + i));
    const w0 = k0 + nk;
    const rational = this.ptr(de, 5) === 0;
    const w = Array.from({ length: K + 1 }, (_, i) => (rational ? this.num(de, w0 + i, 1) : 1));
    const c0 = w0 + K + 1;
    const pts = Array.from({ length: K + 1 }, (_, i) => ({
      x: this.num(de, c0 + 3 * i),
      y: this.num(de, c0 + 3 * i + 1),
      z: this.num(de, c0 + 3 * i + 2),
    }));
    let t0 = this.num(de, c0 + 3 * (K + 1), knots[p] as number);
    let t1 = this.num(de, c0 + 3 * (K + 1) + 1, knots[K + 1] as number);
    t0 = Math.max(t0, knots[p] as number);
    t1 = Math.min(t1, knots[K + 1] as number);
    if (!(t1 > t0)) return null;
    return { p, n: K, knots, w, pts, t0, t1 };
  }

  nurbsSurface(de: number): NurbsSurface | null {
    const K1 = this.ptr(de, 1);
    const K2 = this.ptr(de, 2);
    const p = this.ptr(de, 3);
    const q = this.ptr(de, 4);
    if (K1 < p || K2 < q || p < 1 || q < 1) return null;
    const rational = this.ptr(de, 7) === 0;
    const nu = K1 + p + 2;
    const nv = K2 + q + 2;
    let i = 10;
    const uk = Array.from({ length: nu }, (_, k) => this.num(de, i + k));
    i += nu;
    const vk = Array.from({ length: nv }, (_, k) => this.num(de, i + k));
    i += nv;
    const np = (K1 + 1) * (K2 + 1);
    const w0 = i;
    const w = Array.from({ length: np }, (_, k) => (rational ? this.num(de, w0 + k, 1) : 1));
    i += np;
    const c0 = i;
    const pts = Array.from({ length: np }, (_, k) => ({
      x: this.num(de, c0 + 3 * k),
      y: this.num(de, c0 + 3 * k + 1),
      z: this.num(de, c0 + 3 * k + 2),
    }));
    i += 3 * np;
    const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const ulo = uk[p] as number;
    const uhi = uk[K1 + 1] as number;
    const vlo = vk[q] as number;
    const vhi = vk[K2 + 1] as number;
    const u0 = clampTo(this.num(de, i, ulo), ulo, uhi);
    const u1 = clampTo(this.num(de, i + 1, uhi), ulo, uhi);
    const v0 = clampTo(this.num(de, i + 2, vlo), vlo, vhi);
    const v1 = clampTo(this.num(de, i + 3, vhi), vlo, vhi);
    if (!(u1 > u0 && v1 > v0)) return null;
    return { p, q, n: K1, m: K2, uk, vk, w, pts, u0, u1, v0, v1 };
  }

  // -- surfaces --------------------------------------------------------------------------------

  /** Whether the surface can bulge past its edges; null when the type is not understood. */
  isRuled(de: number): boolean | null {
    const e = this.entry(de);
    if (!e) return null;
    switch (e.type) {
      case 108:
      case 118:
      case 122:
      case 190:
      case 192:
      case 194:
        return true;
      case 120: {
        const g = this.entry(this.ptr(de, 2));
        return g ? g.type === 110 : null;
      }
      case 128: {
        const s = this.nurbsSurface(de);
        return s ? surfaceIsRuled(s) : null;
      }
      case 196:
      case 198:
      case 114:
      case 140:
        return false;
      default:
        return null;
    }
  }

  /** A box the whole untrimmed surface lies inside (null when it cannot be bounded). */
  outerBound(de: number): Box | null {
    const e = this.entry(de);
    if (!e) return null;
    const T = this.transformOf(de);
    const box = new Box();
    switch (e.type) {
      case 128: {
        const s = this.nurbsSurface(de);
        if (!s) return null;
        // Convex hull property: a B-spline surface lies inside its control points' hull (positive weights).
        if (s.w.some((w) => !(w > 0))) return null;
        for (const p of s.pts) box.add(apply(T, p));
        return box;
      }
      case 120: {
        const axis = this.curvePoints(this.ptr(de, 1));
        const gen = this.curvePoints(this.ptr(de, 2));
        if (axis.length < 2 || !gen.length) return null;
        const a0 = axis[0] as Vec3;
        const dir = unit(sub(axis[axis.length - 1] as Vec3, a0));
        let sa = this.num(de, 3, 0);
        let ta = this.num(de, 4, 2 * Math.PI);
        if (!(ta > sa)) [sa, ta] = [ta, sa];
        for (const p of gen) {
          const rel = sub(p, a0);
          const along = dot(rel, dir);
          const c = add(a0, scale(dir, along));
          const u = sub(p, c);
          const r = norm(u);
          if (r < 1e-12) {
            box.add(apply(T, p));
            continue;
          }
          const v = cross(dir, u);
          for (const q of ellipsePoints(T, c, u, v, sa, ta)) box.add(q);
        }
        return box;
      }
      case 196:
      case 198: {
        const centre = this.pointEntity(this.ptr(de, 1));
        if (!centre) return null;
        if (e.type === 196) {
          const r = this.num(de, 2);
          return transformedBallBox(T, centre, { x: 0, y: 0, z: 1 }, 0, r);
        }
        const axis = this.directionEntity(this.ptr(de, 2)) ?? { x: 0, y: 0, z: 1 };
        return transformedBallBox(T, centre, axis, this.num(de, 3), this.num(de, 4));
      }
      case 118: {
        for (const p of this.curvePoints(this.ptr(de, 1))) box.add(apply(T, p));
        for (const p of this.curvePoints(this.ptr(de, 2))) box.add(apply(T, p));
        return box.empty ? null : box;
      }
      case 122: {
        const d = this.curvePoints(this.ptr(de, 1));
        if (!d.length) return null;
        const L = { x: this.num(de, 2), y: this.num(de, 3), z: this.num(de, 4) };
        const off = sub(L, d[0] as Vec3);
        for (const p of d) {
          box.add(apply(T, p));
          box.add(apply(T, add(p, off)));
        }
        return box;
      }
      default:
        return null;
    }
  }

  pointEntity(de: number): Vec3 | null {
    const e = this.entry(de);
    if (e?.type !== 116) return null;
    return apply(this.transformOf(de), {
      x: this.num(de, 1),
      y: this.num(de, 2),
      z: this.num(de, 3),
    });
  }
  directionEntity(de: number): Vec3 | null {
    const e = this.entry(de);
    if (e?.type !== 123) return null;
    return unit(
      applyDir(this.transformOf(de), {
        x: this.num(de, 1),
        y: this.num(de, 2),
        z: this.num(de, 3),
      }),
    );
  }

  /**
   * Interior points of a B-spline face: a grid over its domain, kept inside the trim loops (in the
   * surface's (u, v) space). Null when the face cannot be sampled (not a B-spline, loops not closed).
   */
  faceInterior(face: Face): Vec3[] | null {
    const e = this.entry(face.surface);
    if (e?.type !== 128) return null;
    const s = this.nurbsSurface(face.surface);
    if (!s) return null;
    const outer = face.natural || face.outer === null ? null : this.loopUV(face.outer);
    if (!face.natural && face.outer !== null && !outer) return null;
    const holes: [number, number][][] = [];
    for (const h of face.inner) {
      const l = this.loopUV(h);
      if (!l) return null;
      holes.push(l);
    }
    const per = 6;
    const us = knotSamples(s.uk, s.u0, s.u1, per, 48);
    const vs = knotSamples(s.vk, s.v0, s.v1, per, 48);
    if (us.length * vs.length > this.budget) {
      this.budgetHit = true;
      return null;
    }
    this.budget -= us.length * vs.length;
    const T = this.transformOf(face.surface);
    const out: Vec3[] = [];
    for (const u of us)
      for (const v of vs) {
        if (outer && !insidePolygon(outer, u, v)) continue;
        if (holes.some((h) => insidePolygon(h, u, v))) continue;
        out.push(apply(T, evalSurface(s, u, v)));
      }
    return out;
  }

  /** A closed parameter-space loop as a (u, v) polygon, from a 142 curve on surface or a bare curve. */
  loopUV(de: number): [number, number][] | null {
    const e = this.entry(de);
    if (!e) return null;
    const curve = e.type === 142 ? this.ptr(de, 3) : de;
    if (curve <= 0) return null;
    const pts = this.curvePoints(curve);
    if (pts.length < 3) return null;
    const a = pts[0] as Vec3;
    const b = pts[pts.length - 1] as Vec3;
    let span = 0;
    for (const p of pts) span = Math.max(span, Math.abs(p.x - a.x), Math.abs(p.y - a.y));
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-4 * Math.max(span, 1e-9)) return null;
    return pts.map((p) => [p.x, p.y] as [number, number]);
  }

  /** Model-space points of a 142 curve on surface: its CPTR curve, else its parameter curve mapped through the surface. */
  boundaryPoints(de: number): Vec3[] | null {
    const e = this.entry(de);
    if (!e) return null;
    if (e.type !== 142) return this.curvePoints(de);
    if (e.transform > 0) this.parentTransforms++;
    const cptr = this.ptr(de, 4);
    if (cptr > 0) return this.curvePoints(cptr);
    const sptr = this.ptr(de, 2);
    const s = this.entry(sptr)?.type === 128 ? this.nurbsSurface(sptr) : null;
    const bptr = this.ptr(de, 3);
    if (!s || bptr <= 0) return null;
    const T = this.transformOf(sptr);
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    return this.curvePoints(bptr).map((p) =>
      apply(T, evalSurface(s, clamp(p.x, s.u0, s.u1), clamp(p.y, s.v0, s.v1))),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Holes: cylinders, and whether the material is outside them (a hole) or inside (a boss)

/** A cylinder in model space: a point on its axis, the axis direction (unit) and the radius. */
interface Cyl {
  pt: Vec3;
  dir: Vec3;
  r: number;
}

/** Model-space cylinder a surface is, or null: 192, a 120 revolving a line parallel to its axis, or a 128 that samples as one. */
function cylinderOf(m: Model, de: number): Cyl | null {
  const e = m.entry(de);
  if (!e) return null;
  const T = m.transformOf(de);
  // Only rigid placements keep a cylinder round with the same radius.
  if (!rigid(T)) return null;
  const place = (c: Cyl | null): Cyl | null =>
    c && c.r > 0 && Number.isFinite(c.r)
      ? { pt: apply(T, c.pt), dir: unit(applyDir(T, c.dir)), r: c.r }
      : null;
  switch (e.type) {
    case 192: {
      const pt = m.pointEntity(m.ptr(de, 1));
      const dir = m.directionEntity(m.ptr(de, 2));
      if (!pt || !dir) return null;
      return place({ pt, dir, r: m.num(de, 3) });
    }
    case 120: {
      if (m.entry(m.ptr(de, 1))?.type !== 110 || m.entry(m.ptr(de, 2))?.type !== 110) return null;
      const a = m.curvePoints(m.ptr(de, 1));
      const g = m.curvePoints(m.ptr(de, 2));
      if (a.length < 2 || g.length < 2) return null;
      const dir = unit(sub(a[1] as Vec3, a[0] as Vec3));
      const gd = sub(g[1] as Vec3, g[0] as Vec3);
      const gl = norm(gd);
      if (!(gl > 0) || norm(dir) === 0) return null;
      if (norm(cross(dir, gd)) > 1e-9 * gl) return null; // not parallel: a cone or a disc
      const rel = sub(g[0] as Vec3, a[0] as Vec3);
      const r = norm(sub(rel, scale(dir, dot(rel, dir))));
      return place({ pt: a[0] as Vec3, dir, r });
    }
    case 128: {
      const s = m.nurbsSurface(de);
      if (!s || !surfaceIsRuled(s)) return null;
      const N = 7;
      const grid: Vec3[][] = [];
      for (let i = 0; i < N; i++) {
        const row: Vec3[] = [];
        for (let j = 0; j < N; j++)
          row.push(
            evalSurface(
              s,
              s.u0 + ((s.u1 - s.u0) * i) / (N - 1),
              s.v0 + ((s.v1 - s.v0) * j) / (N - 1),
            ),
          );
        grid.push(row);
      }
      const box = new Box();
      for (const row of grid) for (const p of row) box.add(p);
      const span = Math.max(...[0, 1, 2].map((d) => (box.hi[d] as number) - (box.lo[d] as number)));
      const tol = 1e-6 * Math.max(span, 1e-9);
      // try each parameter direction as the straight one
      for (const across of [false, true]) {
        const at = (i: number, j: number) => (across ? grid[j]?.[i] : grid[i]?.[j]) as Vec3;
        const d = sub(at(0, N - 1), at(0, 0));
        const dl = norm(d);
        if (!(dl > tol)) continue;
        const du = scale(d, 1 / dl);
        let straight = true;
        for (let i = 0; i < N && straight; i++) {
          const di = sub(at(i, N - 1), at(i, 0));
          if (norm(sub(di, d)) > tol) straight = false;
          for (let j = 1; j < N - 1 && straight; j++) {
            const rel = sub(at(i, j), at(i, 0));
            if (norm(cross(rel, du)) > tol) straight = false;
          }
        }
        if (!straight) continue;
        // the curved direction must be a circle about a line along du
        const flat = (p: Vec3) => sub(p, scale(du, dot(p, du)));
        // 0, 1/3 and 2/3 of the way round: a closed surface's two ends are the same point
        const c = circleThrough(flat(at(0, 0)), flat(at(2, 0)), flat(at(4, 0)));
        if (!c) continue;
        let round = true;
        for (let i = 0; i < N && round; i++)
          if (Math.abs(norm(sub(flat(at(i, 0)), c.c)) - c.r) > tol) round = false;
        if (!round) continue;
        return place({ pt: c.c, dir: du, r: c.r });
      }
      return null;
    }
    default:
      return null;
  }
}

/** Centre and radius of the circle through three points, or null when they are (nearly) in a line. */
function circleThrough(a: Vec3, b: Vec3, c: Vec3): { c: Vec3; r: number } | null {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const n = cross(ab, ac);
  const n2 = dot(n, n);
  if (!(n2 > 1e-24 * dot(ab, ab) * dot(ac, ac))) return null;
  const off = scale(
    add(scale(cross(n, ab), dot(ac, ac)), scale(cross(ac, n), dot(ab, ab))),
    1 / (2 * n2),
  );
  return { c: add(a, off), r: norm(off) };
}

/** A cone in model space: radius r0 + slope·t at axial distance t from pt along dir. */
interface Cone {
  pt: Vec3;
  dir: Vec3;
  r0: number;
  slope: number;
}

/** Model-space cone a surface is, or null: 194, or a 120 revolving a line that meets its axis at an angle (not a disc). */
function coneOf(m: Model, de: number): Cone | null {
  const e = m.entry(de);
  if (!e) return null;
  const T = m.transformOf(de);
  if (!rigid(T)) return null;
  const place = (c: Cone): Cone | null =>
    Number.isFinite(c.r0) && Number.isFinite(c.slope) && Math.abs(c.slope) > 1e-9
      ? { ...c, pt: apply(T, c.pt), dir: unit(applyDir(T, c.dir)) }
      : null;
  if (e.type === 194) {
    const pt = m.pointEntity(m.ptr(de, 1));
    const dir = m.directionEntity(m.ptr(de, 2));
    const ang = m.num(de, 4);
    if (!pt || !dir || !(ang > 0 && ang < 90)) return null;
    return place({ pt, dir, r0: m.num(de, 3), slope: Math.tan((ang * Math.PI) / 180) });
  }
  if (e.type !== 120) return null;
  if (m.entry(m.ptr(de, 1))?.type !== 110 || m.entry(m.ptr(de, 2))?.type !== 110) return null;
  const a = m.curvePoints(m.ptr(de, 1));
  const g = m.curvePoints(m.ptr(de, 2));
  if (a.length < 2 || g.length < 2) return null;
  const dir = unit(sub(a[1] as Vec3, a[0] as Vec3));
  const a0 = a[0] as Vec3;
  const g0 = sub(g[0] as Vec3, a0);
  const g1 = sub(g[1] as Vec3, a0);
  const gl = norm(sub(g1, g0));
  if (!(gl > 0)) return null;
  // the generatrix must lie in a plane with the axis (a skew line sweeps a hyperboloid)
  if (Math.abs(dot(cross(dir, sub(g1, g0)), g0)) > 1e-9 * gl * Math.max(norm(g0), gl)) return null;
  const t0 = dot(g0, dir);
  const t1 = dot(g1, dir);
  if (Math.abs(t1 - t0) < 1e-9 * gl) return null; // a disc
  const r0 = norm(sub(g0, scale(dir, t0)));
  const r1 = norm(sub(g1, scale(dir, t1)));
  const slope = (r1 - r0) / (t1 - t0);
  return place({ pt: a0, dir, r0: r0 - slope * t0, slope });
}

/** Whether a 124 matrix is a rigid motion (keeps circles round and radii unchanged). */
function rigid(T: M34): boolean {
  const cols = [0, 1, 2].map((c) => ({
    x: T[c] as number,
    y: T[4 + c] as number,
    z: T[8 + c] as number,
  }));
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) {
      const d = dot(cols[a] as Vec3, cols[b] as Vec3);
      if (Math.abs(d - (a === b ? 1 : 0)) > 1e-6) return false;
    }
  return true;
}

/** How far round its axis (degrees) and over which axial range a face's edge points reach. */
function wrapOf(pts: Vec3[], pt: Vec3, dir: Vec3): { deg: number; lo: number; hi: number } {
  const x = perp3(dir);
  const y = cross(dir, x);
  const angles: number[] = [];
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    const rel = sub(p, pt);
    const t = dot(rel, dir);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
    const radial = sub(rel, scale(dir, t));
    if (norm(radial) > 1e-12) angles.push(Math.atan2(dot(radial, y), dot(radial, x)));
  }
  if (!angles.length) return { deg: 0, lo, hi };
  angles.sort((a, b) => a - b);
  let gap = (angles[0] as number) + 2 * Math.PI - (angles[angles.length - 1] as number);
  for (let i = 1; i < angles.length; i++)
    gap = Math.max(gap, (angles[i] as number) - (angles[i - 1] as number));
  return { deg: ((2 * Math.PI - gap) * 180) / Math.PI, lo, hi };
}

/** A face as the ray test sees it: a plane with its edge segments, or a box the ray must miss. */
interface RayFace {
  cyl: Cyl | null;
  /** a cone face and how far its edges reach, crossed exactly by rays parallel to its axis */
  cone: (Cone & { full: boolean; lo: number; hi: number }) | null;
  plane: { n: Vec3; d: number; u: Vec3; v: Vec3; segs: [number, number, number, number][] } | null;
  /** where a non-planar face may be; null when it cannot be bounded */
  box: Box | null;
}

function rayFace(m: Model, face: Face, cyl: Cyl | null): RayFace {
  const polylines: Vec3[][] = [];
  let ok = face.edges.length > 0;
  for (const ed of face.edges) {
    const pts = m.boundaryPoints(ed);
    if (!pts || pts.length < 2) ok = false;
    else polylines.push(pts);
  }
  const box = new Box();
  for (const l of polylines) for (const p of l) box.add(p);
  const k = ok && !cyl ? coneOf(m, face.surface) : null;
  let cone: RayFace["cone"] = null;
  if (k) {
    const w = wrapOf(polylines.flat(), k.pt, k.dir);
    cone = { ...k, full: w.deg >= 330, lo: w.lo, hi: w.hi };
  }
  const se = m.entry(face.surface);
  const planarType = se?.type === 108 || se?.type === 190 || se?.type === 128;
  if (ok && planarType) {
    const pts = polylines.flat();
    const p0 = pts[0] as Vec3;
    let p1 = p0;
    for (const p of pts) if (norm(sub(p, p0)) > norm(sub(p1, p0))) p1 = p;
    let n = { x: 0, y: 0, z: 0 };
    for (const p of pts) {
      const c = cross(sub(p1, p0), sub(p, p0));
      if (norm(c) > norm(n)) n = c;
    }
    const span = norm(sub(p1, p0));
    if (norm(n) > 1e-12 * span * span) {
      n = unit(n);
      const d = dot(n, p0);
      const tol = 1e-6 * Math.max(span, 1e-9);
      let flat = pts.every((p) => Math.abs(dot(n, p) - d) <= tol);
      if (flat && se?.type === 128) {
        const s = m.nurbsSurface(face.surface);
        const T = m.transformOf(face.surface);
        flat = !!s && s.pts.every((p) => Math.abs(dot(n, apply(T, p)) - d) <= tol * 10);
      }
      if (flat) {
        const u = perp3(n);
        const v = cross(n, u);
        const segs: [number, number, number, number][] = [];
        for (const l of polylines)
          for (let i = 1; i < l.length; i++) {
            const a = l[i - 1] as Vec3;
            const b = l[i] as Vec3;
            segs.push([dot(a, u), dot(a, v), dot(b, u), dot(b, v)]);
          }
        return { cyl, cone, plane: { n, d, u, v, segs }, box };
      }
    }
  }
  if (!ok) return { cyl, cone, plane: null, box: null };
  if (m.isRuled(face.surface) !== true) {
    const ob = m.outerBound(face.surface);
    if (!ob) return { cyl, cone, plane: null, box: null };
    box.merge(ob);
  }
  return { cyl, cone, plane: null, box };
}

function perp3(n: Vec3): Vec3 {
  const t = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  return unit(cross(n, t));
}

/** Whether the half-line from p along d passes through the box (grown by tol). */
function rayHitsBox(p: Vec3, d: Vec3, b: Box, tol: number): boolean {
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  const P = [p.x, p.y, p.z];
  const D = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    const lo = (b.lo[i] as number) - tol;
    const hi = (b.hi[i] as number) + tol;
    const o = P[i] as number;
    const dd = D[i] as number;
    if (Math.abs(dd) < 1e-15) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let a = (lo - o) / dd;
    let c = (hi - o) / dd;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * How many faces the half-line from p along d crosses, or null when it passes where a curved face
 * may be (its crossings are not counted exactly). An odd count means p is inside the material.
 */
function crossings(p: Vec3, d: Vec3, faces: RayFace[], tol: number): number | null {
  let n = 0;
  for (const f of faces) {
    if (f.cyl && norm(cross(f.cyl.dir, d)) < 1e-9) continue; // parallel cylinders never cross it
    if (f.plane) {
      const pl = f.plane;
      const den = dot(pl.n, d);
      if (Math.abs(den) < 1e-12) continue;
      const t = (pl.d - dot(pl.n, p)) / den;
      if (t <= tol) continue;
      const x = add(p, scale(d, t));
      const u = dot(x, pl.u);
      const v = dot(x, pl.v);
      let inside = false;
      for (const [x1, y1, x2, y2] of pl.segs)
        if (y1 > v !== y2 > v && u < ((x2 - x1) * (v - y1)) / (y2 - y1) + x1) inside = !inside;
      if (inside) n++;
      continue;
    }
    if (f.cone && norm(cross(f.cone.dir, d)) < 1e-9) {
      // parallel to the cone's axis at distance rho: it meets the cone where r0 + slope·t = rho
      const c = f.cone;
      const rel = sub(p, c.pt);
      const tp = dot(rel, c.dir);
      const rho = norm(sub(rel, scale(c.dir, tp)));
      const t = (rho - c.r0) / c.slope;
      const ahead = (t - tp) * dot(d, c.dir) > tol;
      if (!ahead || t < c.lo - tol || t > c.hi + tol) continue;
      if (!c.full) return null; // a partial cone: whether the hit is on the face is not checked
      n++;
      continue;
    }
    if (!f.box || rayHitsBox(p, d, f.box, tol)) return null;
  }
  return n;
}

interface IgesCylFace {
  cyl: Cyl;
  pts: Vec3[];
}

/**
 * Full cylinders of one body's faces, grouped like STEP's (by axis line and radius), each told
 * apart as a hole or a boss by casting a ray along its axis from just inside its wall: an odd
 * number of face crossings means the wall's inside is material (a boss), even means a hole. A
 * ray that passes where a curved face may be is not counted; with both directions blocked, or
 * the two disagreeing (faces that do not close a solid), the cylinder is left unclassified.
 */
function igesCylinders(
  m: Model,
  faces: Face[],
  k: number,
): {
  groups: CylinderGroup[];
  holeAxes: HoleAxis[];
  partial: number;
  unknown: number[];
  oneSided: number;
} {
  const rays: RayFace[] = [];
  const cyls: IgesCylFace[] = [];
  const box = new Box();
  for (const f of faces) {
    const c = cylinderOf(m, f.surface);
    const rf = rayFace(m, f, c);
    rays.push(rf);
    if (rf.box) box.merge(rf.box);
    if (!c) continue;
    // canonical axis: positive leading component, the axis point nearest the origin
    let dir = c.dir;
    if (
      dir.x < -1e-9 ||
      (Math.abs(dir.x) <= 1e-9 && (dir.y < -1e-9 || (Math.abs(dir.y) <= 1e-9 && dir.z < 0)))
    )
      dir = scale(dir, -1);
    const pt = sub(c.pt, scale(dir, dot(c.pt, dir)));
    const pts: Vec3[] = [];
    for (const ed of f.edges) for (const p of m.boundaryPoints(ed) ?? []) pts.push(p);
    cyls.push({ cyl: { pt, dir, r: c.r }, pts });
  }
  const span = box.empty
    ? 1
    : Math.max(...[0, 1, 2].map((d) => (box.hi[d] as number) - (box.lo[d] as number)), 1e-9);
  const rayTol = span * 1e-9;
  const groups: IgesCylFace[][] = [];
  for (const c of cyls) {
    const tol = Math.max(1e-6, c.cyl.r * 1e-6);
    const g = groups.find((gr) => {
      const h = (gr[0] as IgesCylFace).cyl;
      return (
        Math.abs(h.r - c.cyl.r) <= tol &&
        norm(cross(h.dir, c.cyl.dir)) < 1e-6 &&
        norm(sub(h.pt, c.cyl.pt)) <= tol * 10
      );
    });
    if (g) g.push(c);
    else groups.push([c]);
  }
  const full = new Map<string, CylinderGroup>();
  const axes: { dir: Vec3; pt: Vec3; diameters: Set<number>; lo: number; hi: number }[] = [];
  const unknown: number[] = [];
  let partial = 0;
  let oneSided = 0;
  for (const g of groups) {
    const h = (g[0] as IgesCylFace).cyl;
    const x = perp3(h.dir);
    const y = cross(h.dir, x);
    const angles: number[] = [];
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const f of g)
      for (const p of f.pts) {
        const rel = sub(p, h.pt);
        const t = dot(rel, h.dir);
        const radial = sub(rel, scale(h.dir, t));
        if (Math.abs(norm(radial) - h.r) > Math.max(1e-6, h.r * 1e-3)) continue; // not on the wall
        angles.push(Math.atan2(dot(radial, y), dot(radial, x)));
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    if (!angles.length) {
      partial += g.length;
      continue;
    }
    angles.sort((a, b) => a - b);
    let gap = (angles[0] as number) + 2 * Math.PI - (angles[angles.length - 1] as number);
    let gapEnd = angles[0] as number;
    for (let i = 1; i < angles.length; i++) {
      const gg = (angles[i] as number) - (angles[i - 1] as number);
      if (gg > gap) {
        gap = gg;
        gapEnd = angles[i] as number;
      }
    }
    // Edges are sampled (a full circle every 11.25°, a NURBS circle per knot span), so a full wall
    // shows gaps up to the sample step; partial walls (fillets, slot ends) wrap 180° or less.
    if (((2 * Math.PI - gap) * 180) / Math.PI < 330) {
      partial += g.length;
      continue;
    }
    // Probe from just inside the wall, at several heights along the longest face and three angles
    // (opposite the widest gap first): the first probe clear from both ends decides; probes that
    // disagree, or no clear probe at all, leave the cylinder unclassified.
    let a0 = lo;
    let a1 = hi;
    let bestLen = -1;
    for (const f of g) {
      let a = Number.POSITIVE_INFINITY;
      let b = Number.NEGATIVE_INFINITY;
      for (const p of f.pts) {
        const t = dot(sub(p, h.pt), h.dir);
        a = Math.min(a, t);
        b = Math.max(b, t);
      }
      if (b - a > bestLen) {
        bestLen = b - a;
        a0 = a;
        a1 = b;
      }
    }
    const theta = gapEnd - gap / 2 + Math.PI;
    /** Air (even crossings) or material (odd) at a point, from rays both ways along the axis. */
    const state = (p: Vec3): { air: boolean | null; strong: boolean; conflict: boolean } => {
      const up = crossings(p, h.dir, rays, rayTol);
      const down = crossings(p, scale(h.dir, -1), rays, rayTol);
      if (up !== null && down !== null)
        return up % 2 !== down % 2
          ? { air: null, strong: false, conflict: true }
          : { air: up % 2 === 0, strong: true, conflict: false };
      const one = up ?? down;
      return { air: one === null ? null : one % 2 === 0, strong: false, conflict: false };
    };
    const votes = new Set<boolean>();
    let strong = false;
    probing: for (const frac of [0.5, 0.25, 0.75, 0.1, 0.9])
      for (const turn of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
        const th = theta + turn;
        const at = add(h.pt, scale(h.dir, a0 + (a1 - a0) * frac));
        const radial = add(scale(x, Math.cos(th)), scale(y, Math.sin(th)));
        const inner = state(add(at, scale(radial, 0.98 * h.r)));
        const outer = state(add(at, scale(radial, 1.02 * h.r)));
        // The wall must part material from air: the same state on both sides, or rays that
        // disagree, mean the faces do not close a solid here.
        if (inner.conflict || outer.conflict || (inner.air !== null && inner.air === outer.air)) {
          votes.add(true).add(false);
          break probing;
        }
        if (inner.air === null) continue;
        votes.add(inner.air);
        if (inner.strong && outer.strong) {
          strong = true;
          break probing;
        }
      }
    const hole: boolean | null = votes.size === 1 ? [...votes][0] === true : null;
    if (hole !== null && !strong) oneSided++;
    const diameter = Math.round(2 * h.r * k * 1000) / 1000;
    if (hole === null) {
      unknown.push(diameter);
      continue;
    }
    const kind = hole ? "hole" : "boss";
    const key = `${kind}:${diameter}`;
    const depth = Math.round((hi - lo) * k * 1000) / 1000;
    const prev = full.get(key);
    if (prev) {
      prev.count++;
      prev.depth = Math.max(prev.depth, depth);
    } else full.set(key, { diameter, kind, count: 1, depth });
    if (hole) {
      const tol = Math.max(1e-6, h.r * 1e-6) * 10;
      const axis = axes.find(
        (a) => norm(cross(a.dir, h.dir)) < 1e-6 && norm(sub(a.pt, h.pt)) <= tol,
      );
      if (axis) {
        axis.diameters.add(diameter);
        axis.lo = Math.min(axis.lo, lo);
        axis.hi = Math.max(axis.hi, hi);
      } else axes.push({ dir: h.dir, pt: h.pt, diameters: new Set([diameter]), lo, hi });
    }
  }
  const holeAxes: HoleAxis[] = axes
    .map((a) => ({
      diameters: [...a.diameters].sort((p, q) => p - q),
      depth: Math.round((a.hi - a.lo) * k * 1000) / 1000,
    }))
    .sort(
      (a, b) =>
        (a.diameters[0] as number) - (b.diameters[0] as number) ||
        a.diameters.length - b.diameters.length ||
        a.depth - b.depth,
    );
  return {
    groups: [...full.values()].sort(
      (a, b) => a.diameter - b.diameter || a.kind.localeCompare(b.kind),
    ),
    holeAxes,
    partial,
    unknown: unknown.sort((a, b) => a - b),
    oneSided,
  };
}

/** Points on c + cos(t)·u + sin(t)·v for t in [a0, a1], mapped by T, including each axis's extremes. */
function ellipsePoints(T: M34, c: Vec3, u: Vec3, v: Vec3, a0: number, a1: number): Vec3[] {
  const C = apply(T, c);
  const U = applyDir(T, u);
  const V = applyDir(T, v);
  const ts = new Set([a0, a1]);
  for (const axis of AXES) {
    const base = Math.atan2(V[axis], U[axis]);
    for (let k = -4; k <= 4; k++) {
      const t = base + k * Math.PI;
      if (t > a0 && t < a1) ts.add(t);
    }
  }
  const steps = Math.max(4, Math.ceil(((a1 - a0) / (2 * Math.PI)) * 32));
  for (let k = 1; k < steps; k++) ts.add(a0 + ((a1 - a0) * k) / steps);
  // in order along the arc: the hole test reads edges as polylines
  return [...ts]
    .sort((p, q) => p - q)
    .map((t) => add(C, add(scale(U, Math.cos(t)), scale(V, Math.sin(t)))));
}

/** Box of a torus (major R, minor r, axis a) about centre c, or of a sphere (R = 0), after T. */
function transformedBallBox(T: M34, c: Vec3, axis: Vec3, R: number, r: number): Box {
  const box = new Box();
  const a = unit(axis);
  // A circle of radius R in the plane normal to a, swept by a ball of radius r. Under an affine map
  // the extent along each axis is |circle's ellipse extent| + the ball's mapped extent.
  const ref = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = scale(unit(cross(a, ref)), R);
  const v = scale(unit(cross(a, u)), R);
  const C = apply(T, c);
  const U = applyDir(T, u);
  const V = applyDir(T, v);
  const rows = [
    [T[0], T[1], T[2]],
    [T[4], T[5], T[6]],
    [T[8], T[9], T[10]],
  ];
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  AXES.forEach((k, d) => {
    const ring = Math.hypot(U[k], V[k]);
    const row = rows[d] as number[];
    const ball = r * Math.hypot(row[0] as number, row[1] as number, row[2] as number);
    lo[d] = C[k] - ring - ball;
    hi[d] = C[k] + ring + ball;
  });
  box.add({ x: lo[0] as number, y: lo[1] as number, z: lo[2] as number });
  box.add({ x: hi[0] as number, y: hi[1] as number, z: hi[2] as number });
  return box;
}

const VERSIONS: Record<string, string> = {
  "6": "4.0",
  "7": "ASME Y14.26M-1989",
  "8": "5.0",
  "9": "5.1",
  "10": "5.2",
  "11": "5.3",
};
const igesVersion = (flag: Token): string => {
  const v = VERSIONS[(flag ?? "").trim()];
  return v ? `IGES ${v}` : "IGES";
};

function quadRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-300) return Math.abs(b) < 1e-300 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)];
}

/** Even-odd test of (u, v) against a closed polygon. */
function insidePolygon(poly: [number, number][], u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as [number, number];
    const [xj, yj] = poly[j] as [number, number];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------------------------
// Extraction

/** Extract features from an ASCII IGES file. Lengths come out in mm, from the units the file declares. */
export function extractIges(text: string, opts: ExtractOptions = {}): PartFeatures {
  const file = parseFile(text);
  const model = new Model(file);
  const flags: Flag[] = [];

  // Units: Global parameter 14 (flag) and 15 (name); 13 is the model-space scale.
  const g = (i: number): Token => file.global[i - 1] ?? null;
  let unitFlag = Number(g(14) ?? "1");
  const unitName = (g(15) ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (unitFlag === 3 || !UNIT_FLAGS[unitFlag]) unitFlag = UNIT_NAMES[unitName] ?? Number.NaN;
  let unitsAssumed = false;
  let sourceUnits: LengthUnit;
  let k: number;
  const known = UNIT_FLAGS[unitFlag];
  if (known) {
    sourceUnits = known.unit;
    k = known.mm;
  } else {
    unitsAssumed = true;
    sourceUnits = opts.assumeUnits ?? "in";
    k = MM_PER[sourceUnits];
    flags.push({
      code: "units-unknown",
      message: `The file's units ("${g(14) ?? ""}", "${g(15) ?? ""}") are not recognised; read as ${sourceUnits}. Check the size against the drawing.`,
    });
  }
  const modelScale = Number((g(13) ?? "1").replace(/[dD]/, "E"));
  if (Number.isFinite(modelScale) && modelScale > 0 && Math.abs(modelScale - 1) > 1e-9) {
    k /= modelScale;
    flags.push({
      code: "model-space-scale",
      message: `The file declares a model-space scale of ${modelScale}; sizes were divided by it to give real size.`,
    });
  }

  // References: every curve a face, trim loop or surface definition owns is measured through its
  // owner (edges) or not at all (parameter-space loops, a revolved surface's axis), never as free wireframe.
  const entries = [...file.entries.values()];
  const referenced = new Set<number>();
  const faces: Face[] = [];
  const bodies: { name: string; faces: Face[] }[] = [];
  const refCurveTree = (de: number, depth = 0) => {
    const e = model.entry(de);
    if (!e || depth > 32) return;
    referenced.add(de);
    if (e.type === 102) {
      const n = model.ptr(de, 1);
      for (let i = 0; i < n; i++) refCurveTree(model.ptr(de, 2 + i), depth + 1);
    }
  };

  /** A 142 curve on surface: its model curve is an edge, its parameter curve a trim loop. */
  const curveOnSurface = (de: number) => {
    referenced.add(de);
    const b = model.ptr(de, 3);
    const c = model.ptr(de, 4);
    if (b > 0) refCurveTree(b); // a parameter-space trim loop: (u, v), never model space
    if (c > 0) refCurveTree(c);
  };

  // Faces built from B-rep entities (186 -> 514 -> 510 -> 508 -> 504).
  const brepFace = (de: number): Face | null => {
    const surf = model.ptr(de, 1);
    const nLoops = model.ptr(de, 2);
    referenced.add(de);
    referenced.add(surf);
    const edges: number[] = [];
    for (let i = 0; i < nLoops; i++) {
      const loop = model.ptr(de, 4 + i);
      referenced.add(loop);
      const nEdges = model.ptr(loop, 1);
      let j = 2;
      for (let q = 0; q < nEdges; q++) {
        const type = model.ptr(loop, j);
        const list = model.ptr(loop, j + 1);
        const idx = model.ptr(loop, j + 2);
        const kCurves = model.ptr(loop, j + 4);
        referenced.add(list);
        if (type === 0 && model.entry(list)?.type === 504) {
          const curve = model.ptr(list, 2 + 5 * (idx - 1));
          if (curve > 0) {
            refCurveTree(curve);
            edges.push(curve);
          }
        }
        for (let c = 0; c < kCurves; c++) {
          const pc = model.ptr(loop, j + 6 + 2 * c);
          refCurveTree(pc);
        }
        j += 5 + 2 * kCurves;
      }
    }
    return { surface: surf, edges, outer: null, inner: [], natural: false };
  };

  for (const e of entries) {
    if (e.type === 186) {
      referenced.add(e.de);
      if (e.transform > 0) model.parentTransforms++;
      const shells = [model.ptr(e.de, 1)];
      const nVoids = model.ptr(e.de, 3);
      for (let i = 0; i < nVoids; i++) shells.push(model.ptr(e.de, 4 + 2 * i));
      const bodyFaces: Face[] = [];
      for (const sh of shells) {
        if (model.entry(sh)?.type !== 514) continue;
        referenced.add(sh);
        const n = model.ptr(sh, 1);
        for (let i = 0; i < n; i++) {
          const fde = model.ptr(sh, 2 + 2 * i);
          if (model.entry(fde)?.type !== 510) continue;
          const f = brepFace(fde);
          if (f) bodyFaces.push(f);
        }
      }
      faces.push(...bodyFaces);
      bodies.push({ name: e.label || `solid ${bodies.length + 1}`, faces: bodyFaces });
    }
  }
  const trimmed: Face[] = [];
  for (const e of entries) {
    if (e.type === 144) {
      referenced.add(e.de);
      if (e.transform > 0) model.parentTransforms++;
      const surf = model.ptr(e.de, 1);
      referenced.add(surf);
      const n1 = model.ptr(e.de, 2);
      const n2 = model.ptr(e.de, 3);
      const pto = model.ptr(e.de, 4);
      const inner = Array.from({ length: n2 }, (_, i) => model.ptr(e.de, 5 + i));
      const loops = [...(pto > 0 ? [pto] : []), ...inner];
      for (const l of loops) if (model.entry(l)?.type === 142) curveOnSurface(l);
      trimmed.push({
        surface: surf,
        edges: loops,
        outer: n1 === 0 || pto <= 0 ? null : pto,
        inner,
        natural: n1 === 0,
      });
    } else if (e.type === 143) {
      referenced.add(e.de);
      if (e.transform > 0) model.parentTransforms++;
      const surf = model.ptr(e.de, 2);
      referenced.add(surf);
      const n = model.ptr(e.de, 3);
      const edges: number[] = [];
      const uvLoops: number[] = [];
      for (let i = 0; i < n; i++) {
        const b = model.ptr(e.de, 4 + i);
        if (model.entry(b)?.type !== 141) continue;
        referenced.add(b);
        const nc = model.ptr(b, 4);
        let j = 5;
        let uv: number | null = null;
        let uvParts = 0;
        for (let c = 0; c < nc; c++) {
          const crv = model.ptr(b, j);
          const kk = model.ptr(b, j + 2);
          refCurveTree(crv);
          edges.push(crv);
          for (let q = 0; q < kk; q++) {
            const pc = model.ptr(b, j + 3 + q);
            refCurveTree(pc);
            uv = pc;
            uvParts++;
          }
          j += 3 + kk;
        }
        // A boundary made of one parameter curve can serve as a trim loop; several pieces are not chained here.
        uvLoops.push(uvParts === 1 && uv !== null ? uv : -1);
      }
      const usable = uvLoops.every((l) => l > 0);
      trimmed.push({
        surface: surf,
        edges,
        outer: usable && uvLoops.length ? (uvLoops[0] as number) : null,
        inner: usable ? uvLoops.slice(1) : [],
        natural: false,
      });
      if (!usable) (trimmed[trimmed.length - 1] as Face).outer = -1;
    }
  }
  faces.push(...trimmed);
  // Curves and points that define a surface (axis, generatrix, rails, directrix) are not edges.
  for (const e of entries) {
    if (!SURFACE_TYPES.has(e.type)) continue;
    const defs: number[] =
      e.type === 118
        ? [1, 2]
        : e.type === 120
          ? [1, 2]
          : e.type === 122
            ? [1]
            : e.type === 108
              ? []
              : [];
    for (const i of defs) refCurveTree(model.ptr(e.de, i));
    if (e.type === 140) referenced.add(model.ptr(e.de, 5));
    if (e.type === 108 && e.form === 1) {
      // a bounded plane's boundary curve is model-space part edge
      referenced.add(model.ptr(e.de, 5));
    }
    if (e.type >= 190 && e.type <= 198)
      for (let i = 1; i <= 3; i++) referenced.add(model.ptr(e.de, i));
  }

  // Measure.
  const lower = new Box(); // points that are on the part
  const upper = new Box(); // a box the part surely lies inside, where one is known
  let unboundedFaces = 0;
  let sampledFaces = 0;
  let curvedFaces = 0;
  const surfaceTypes: Record<string, number> = {};
  const faceBox = (face: Face, into: Box): void => {
    const fbox = new Box();
    const se = model.entry(face.surface);
    const name = se ? (SURFACE_NAMES[se.type] ?? `type ${se.type}`) : "missing surface";
    surfaceTypes[name] = (surfaceTypes[name] ?? 0) + 1;
    let boundaryOk = true;
    for (const ed of face.edges) {
      const pts = model.boundaryPoints(ed);
      if (!pts) {
        boundaryOk = false;
        continue;
      }
      for (const p of pts) fbox.add(p);
    }
    const ruled = model.isRuled(face.surface);
    let exact = ruled === true && boundaryOk && face.edges.length > 0;
    if (!exact && se?.type === 128) {
      const inside = model.faceInterior(face);
      if (inside) {
        for (const p of inside) fbox.add(p);
        sampledFaces++;
        exact = boundaryOk || face.natural;
      }
    }
    if (ruled !== true) curvedFaces++;
    lower.merge(fbox);
    into.merge(fbox);
    if (exact) {
      upper.merge(fbox);
      return;
    }
    const ob = model.outerBound(face.surface);
    if (ob) {
      upper.merge(ob);
      return;
    }
    unboundedFaces++;
    if (fbox.empty) model.count(se?.type ?? 0, se?.form ?? 0, "surface not measured");
  };

  const bodyBoxes: { name: string; box: Box; faces: number; list?: Face[] }[] = [];
  for (const b of bodies) {
    const box = new Box();
    for (const f of b.faces) faceBox(f, box);
    bodyBoxes.push({ name: b.name, box, faces: b.faces.length, list: b.faces });
  }
  if (trimmed.length) {
    const box = new Box();
    for (const f of trimmed) faceBox(f, box);
    bodyBoxes.push({ name: "trimmed surfaces", box, faces: trimmed.length, list: trimmed });
  }

  // Free-standing geometry: surfaces nobody trims, and wireframe curves nobody owns.
  const freeBox = new Box();
  let freeSurfaces = 0;
  for (const e of entries) {
    if (referenced.has(e.de)) continue;
    if (e.use === 1 || e.use === 2 || e.use === 5 || e.use === 6) {
      continue;
    }
    if (e.blank === 1 && e.subordinate === 0) continue;
    if (SURFACE_TYPES.has(e.type)) {
      freeSurfaces++;
      const name = SURFACE_NAMES[e.type] ?? `type ${e.type}`;
      surfaceTypes[name] = (surfaceTypes[name] ?? 0) + 1;
      if (e.type === 128) {
        const inside = model.faceInterior({
          surface: e.de,
          edges: [],
          outer: null,
          inner: [],
          natural: true,
        });
        if (inside?.length) {
          for (const p of inside) {
            freeBox.add(p);
            lower.add(p);
            upper.add(p);
          }
          sampledFaces++;
          if (!model.isRuled(e.de)) curvedFaces++;
          continue;
        }
      }
      if (e.type === 108 && e.form === 1) {
        const pts = model.curvePoints(model.ptr(e.de, 5));
        for (const p of pts) {
          freeBox.add(p);
          lower.add(p);
          upper.add(p);
        }
        if (pts.length) continue;
      }
      const ob = model.outerBound(e.de);
      if (
        ob &&
        (e.type === 118 || e.type === 122 || e.type === 120 || e.type === 196 || e.type === 198)
      ) {
        // an untrimmed surface is all of itself: its full extent is the part
        freeBox.merge(ob);
        lower.merge(ob);
        upper.merge(ob);
        if (e.type !== 118 && e.type !== 122) curvedFaces++;
        continue;
      }
      model.count(e.type, e.form, "untrimmed surface not measured");
      unboundedFaces++;
      continue;
    }
    if (CURVE_TYPES.has(e.type)) {
      const pts = model.curvePoints(e.de);
      if (!pts.length) continue;
      for (const p of pts) {
        freeBox.add(p);
        lower.add(p);
        upper.add(p);
      }
      continue;
    }
    if (e.type === 408 || e.type === 308)
      model.count(e.type, e.form, "subfigure placement not applied");
    else if (
      !NON_GEOMETRY.has(e.type) &&
      !PARENT_TYPES.has(e.type) &&
      e.type !== 123 &&
      e.type !== 142
    )
      model.count(e.type, e.form);
  }
  if (!freeBox.empty)
    bodyBoxes.push({
      name: freeSurfaces ? "free surfaces and curves" : "wireframe curves",
      box: freeBox,
      faces: freeSurfaces,
    });

  // Flags and confidence.
  const unsupportedCount = Object.values(model.unsupported).reduce((s, v) => s + v, 0);
  let boxConf: Confidence = "medium";
  if (lower.empty) {
    flags.push({
      code: "no-solid",
      message:
        "No part geometry found: no trimmed surfaces, B-rep faces or curves that could be measured.",
    });
  }
  const mm = (v: number) => Math.round(v * k * 1000) / 1000;
  if (!lower.empty) {
    const gaps: string[] = [];
    let worst = 0;
    const span = Math.max(
      ...[0, 1, 2].map((d) => (lower.hi[d] as number) - (lower.lo[d] as number)),
    );
    const tol = Math.max(span * 1e-4, 1e-6);
    AXES.forEach((axis, d) => {
      if (upper.empty) return;
      const below = (lower.lo[d] as number) - (upper.lo[d] as number);
      const above = (upper.hi[d] as number) - (lower.hi[d] as number);
      const gap = Math.max(below, 0) + Math.max(above, 0);
      if (gap > tol) {
        gaps.push(`${axis} by up to ${mm(gap)} mm`);
        worst = Math.max(worst, gap / Math.max(span, 1e-12));
      }
    });
    if (gaps.length || unboundedFaces) {
      flags.push({
        code: "bbox-may-underestimate",
        message: `Some curved faces can reach past the edges measured: the box may be short on ${gaps.length ? gaps.join(", ") : "an unknown amount"}${unboundedFaces ? ` (${unboundedFaces} faces could not be bounded)` : ""}. Check the size against the drawing.`,
      });
      if (unboundedFaces || worst > 0.01) boxConf = "low";
    }
  }
  if (model.parentTransforms) {
    flags.push({
      code: "assembly-placement-ignored",
      message: `${model.parentTransforms} grouping entities carry their own transformation matrix, which was not applied to their members: the box may be in the wrong place or size.`,
    });
    boxConf = "low";
  }
  if (model.budgetHit) {
    flags.push({
      code: "expansion-limit",
      message:
        "The file has more surface detail than is sampled in one request: some faces were measured from their edges only.",
    });
  }
  if (sampledFaces || curvedFaces || model.notes.has("conic"))
    flags.push({
      code: "approximated-curves",
      message:
        "Curved edges and faces were sampled: the box can be short of the exact surface by a sliver (well under 0.1% on typical parts).",
    });
  if (unsupportedCount)
    flags.push({
      code: "unsupported-entities",
      message: `${unsupportedCount} entities were not measured: ${Object.entries(model.unsupported)
        .map(([t, n]) => `${n} × ${t}`)
        .join(", ")}.`,
    });
  if (bodyBoxes.filter((b) => b.faces > 0).length > 1 || bodies.length > 1)
    flags.push({
      code: "multiple-solids",
      message: `${Math.max(bodies.length, bodyBoxes.length)} separate bodies or surface groups; the box covers all of them.`,
    });
  flags.push({
    code: "volume-unsupported",
    message:
      "IGES does not say whether its faces close a solid, so no volume is given. Ask for a STEP file for volume.",
  });

  // Holes: full cylinders per body, told apart as holes or bosses by a ray along each axis.
  const holesOf = bodyBoxes.map((b) => (b.list?.length ? igesCylinders(model, b.list, k) : null));
  const unknownCyl = holesOf.flatMap((h) => h?.unknown ?? []);
  const oneSided = holesOf.reduce((n, h) => n + (h?.oneSided ?? 0), 0);
  const fullCyl = holesOf.reduce(
    (n, h) => n + (h ? h.groups.reduce((c, g) => c + g.count, 0) + h.unknown.length : 0),
    0,
  );
  if (unknownCyl.length)
    flags.push({
      code: "hole-sense-unknown",
      message: `${unknownCyl.length} full cylinders (${[...new Set(unknownCyl)].map((d) => `Ø${d}`).join(", ")} mm) could not be told apart as holes or bosses: curved faces lie along their axes, or the faces do not close a solid. They are not counted as holes; check the drawing.`,
    });

  const toBox = (b: Box): BoundingBox | null => {
    if (b.empty) return null;
    const r = (v: number) => Math.round(v * k * 1e4) / 1e4;
    const min = { x: r(b.lo[0] as number), y: r(b.lo[1] as number), z: r(b.lo[2] as number) };
    const max = { x: r(b.hi[0] as number), y: r(b.hi[1] as number), z: r(b.hi[2] as number) };
    const s = (v: number) => Math.round(v * 1e4) / 1e4;
    return { min, max, size: { x: s(max.x - min.x), y: s(max.y - min.y), z: s(max.z - min.z) } };
  };

  const solidBodies: SolidBody[] = bodyBoxes.map((b, i) => ({
    name: b.name,
    faceCount: b.faces,
    boundingBox: toBox(b.box),
    volume: null,
    surfaceTypes,
    cylinders: holesOf[i]?.groups ?? [],
    holeAxes: holesOf[i]?.holeAxes ?? [],
    partialCylinderFaces: holesOf[i]?.partial ?? 0,
    volumeNote: "IGES: volume not computed",
  }));
  const box = toBox(lower);
  const unitsConf: Confidence = unitsAssumed ? "low" : "high";
  return {
    format: "iges",
    units: "mm",
    sourceUnits,
    unitsAssumed,
    boundingBox: box,
    flat: null,
    solid: {
      schema: igesVersion(g(23)),
      bodies: solidBodies,
      totalVolume: null,
      assemblyUsages: 0,
    },
    confidence: box ? (boxConf === "medium" && !unitsAssumed ? "medium" : "low") : "low",
    fieldConfidence: {
      units: unitsConf,
      boundingBox: box ? boxConf : "low",
      measures: "low",
      // every full cylinder classified from both ends: high; some from one end, or unclassified: medium
      holes: !faces.length
        ? "low"
        : unknownCyl.length || oneSided || model.parentTransforms
          ? fullCyl > unknownCyl.length
            ? "medium"
            : "low"
          : "high",
      bends: "low",
    },
    flags,
    unsupported: model.unsupported,
  };
}
