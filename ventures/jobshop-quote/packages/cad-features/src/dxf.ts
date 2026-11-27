// ASCII DXF → flat-part features (outer perimeter, area, holes, bend lines).
//
// What a DXF gives us is lines and arcs with layer names; meaning is inferred:
//  - cut geometry is everything not on an ignored, bend or etch layer;
//  - closed contours come from closed polylines, circles, closed splines/ellipses and from
//    chaining open LINE/ARC/polyline pieces end to end;
//  - the part is the largest contour that no other contour contains; contours directly inside it
//    are holes; anything else outside it means the file holds several parts or views (flagged);
//  - bend lines are straight lines on a /bend/i layer, or, failing that, dashed lines inside the
//    part (low confidence).
// Arcs are kept exact (bulge form) so perimeter, area and hole diameters do not depend on a
// tessellation tolerance; ellipses and splines are tessellated and flagged as approximated.

import {
  arcOf,
  bbox2,
  bsplineAt,
  bsplineDomain,
  chainArea,
  dist2,
  type Edge2,
  edgeLength,
  pointInPolygon,
  tessellateChain,
} from "./geom.ts";
import {
  type BendLine,
  type CircularHoleGroup,
  type Confidence,
  type ExtractOptions,
  type Flag,
  type FlatFeatures,
  type FlatHole,
  type LengthUnit,
  MM_PER,
  type PartFeatures,
  type Vec2,
} from "./types.ts";

type Pair = [number, string];

interface RawEntity {
  type: string;
  pairs: Pair[];
}

/** One drawable thing in world coordinates, after block expansion. */
type Prim =
  | {
      kind: "edges";
      layer: string;
      linetype: string;
      edges: Edge2[];
      closed: boolean;
      source: string;
    }
  | { kind: "circle"; layer: string; linetype: string; c: Vec2; r: number; source: string };

/** 2D affine map: x' = a x + c y + e, y' = b x + d y + f */
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function compose(m: Affine, n: Affine): Affine {
  // m ∘ n (apply n first)
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function apply(m: Affine, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

const det = (m: Affine): number => m.a * m.d - m.b * m.c;

function isSimilarity(m: Affine): boolean {
  const sx = m.a * m.a + m.b * m.b;
  const sy = m.c * m.c + m.d * m.d;
  const tol = 1e-9 * Math.max(sx, sy, 1);
  return Math.abs(sx - sy) < tol && Math.abs(m.a * m.c + m.b * m.d) < tol;
}

const MIRROR_X: Affine = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const INSUNITS: Record<number, LengthUnit> = {
  1: "in",
  2: "ft",
  4: "mm",
  5: "cm",
  6: "m",
  13: "um",
};

/** Entities read and measured. */
const MEASURED = new Set([
  "LINE",
  "ARC",
  "CIRCLE",
  "LWPOLYLINE",
  "POLYLINE",
  "ELLIPSE",
  "SPLINE",
  "INSERT",
]);
/** Annotation and non-geometry: skipped without a flag. */
const ANNOTATION = new Set([
  "TEXT",
  "MTEXT",
  "DIMENSION",
  "ARC_DIMENSION",
  "HATCH",
  "LEADER",
  "MLEADER",
  "MULTILEADER",
  "ATTRIB",
  "ATTDEF",
  "POINT",
  "VIEWPORT",
  "IMAGE",
  "WIPEOUT",
  "TOLERANCE",
  "ACAD_TABLE",
  "SOLID",
  "XLINE",
  "RAY",
  "OLE2FRAME",
  "SEQEND",
  "VERTEX",
]);

const DASHED = /center|dash|hidden|phantom|dot|divide|border/i;

function readPairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\n|\r/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt((lines[i] as string).trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push([code, (lines[i + 1] as string).trim()]);
  }
  return pairs;
}

interface Parsed {
  insunits: number;
  entities: RawEntity[];
  blocks: Map<string, { base: Vec2; entities: RawEntity[] }>;
  layerLinetype: Map<string, string>;
}

function parse(text: string): Parsed {
  const pairs = readPairs(text);
  let insunits = 0;
  const entities: RawEntity[] = [];
  const blocks = new Map<string, { base: Vec2; entities: RawEntity[] }>();
  const layerLinetype = new Map<string, string>();
  let section = "";
  let curBlock: { name: string; base: Vec2; entities: RawEntity[] } | null = null;
  let i = 0;
  while (i < pairs.length) {
    const [code, value] = pairs[i] as Pair;
    if (code === 0 && value === "SECTION") {
      const next = pairs[i + 1];
      section = next && next[0] === 2 ? next[1] : "";
      i += 2;
      continue;
    }
    if (code === 0 && value === "ENDSEC") {
      section = "";
      i++;
      continue;
    }
    if (section === "HEADER") {
      if (code === 9 && value === "$INSUNITS") {
        insunits = Number.parseInt(pairs[i + 1]?.[1] ?? "0", 10) || 0;
      }
      i++;
      continue;
    }
    if (code !== 0) {
      i++;
      continue;
    }
    // an entity / table record: collect its pairs up to the next code 0
    let j = i + 1;
    while (j < pairs.length && (pairs[j] as Pair)[0] !== 0) j++;
    const ent: RawEntity = { type: value, pairs: pairs.slice(i + 1, j) };
    i = j;
    if (section === "TABLES") {
      if (value === "LAYER") {
        const name = get(ent, 2);
        const lt = get(ent, 6);
        if (name !== undefined && lt !== undefined) layerLinetype.set(name, lt);
      }
    } else if (section === "BLOCKS") {
      if (value === "BLOCK") {
        curBlock = {
          name: get(ent, 2) ?? "",
          base: { x: num(ent, 10), y: num(ent, 20) },
          entities: [],
        };
      } else if (value === "ENDBLK") {
        if (curBlock)
          blocks.set(curBlock.name, { base: curBlock.base, entities: curBlock.entities });
        curBlock = null;
      } else if (curBlock) {
        curBlock.entities.push(ent);
      }
    } else if (section === "ENTITIES") {
      entities.push(ent);
    }
  }
  return { insunits, entities, blocks, layerLinetype };
}

function get(e: RawEntity, code: number): string | undefined {
  for (const [c, v] of e.pairs) if (c === code) return v;
  return undefined;
}

function num(e: RawEntity, code: number, dflt = 0): number {
  const v = get(e, code);
  if (v === undefined) return dflt;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
}

function nums(e: RawEntity, code: number): number[] {
  const out: number[] = [];
  for (const [c, v] of e.pairs) if (c === code) out.push(Number.parseFloat(v));
  return out;
}

/** OCS → WCS for an extrusion of (0,0,-1): x is mirrored. Other tilts are rare in flat parts. */
function ocs(e: RawEntity): Affine {
  return num(e, 230, 1) < 0 ? MIRROR_X : IDENTITY;
}

interface Collect {
  prims: Prim[];
  unsupported: Record<string, number>;
  approximated: number;
  nonUniform: number;
  /** Entity visits left, counting each block-insert instance; guards against "billion laughs" files. */
  budget: number;
  truncated: boolean;
}

/**
 * Most entity visits one file may cost, after expanding block inserts and insert arrays. Outline
 * nesting downstream is roughly quadratic: 20k visits measured ~0.45 s in Node, 50k ~1.4 s, 250k ~40 s,
 * so a larger cap would let one hostile upload use up a Worker request. One flat part is far below it.
 */
export const DXF_ENTITY_BUDGET = 20_000;

function bump(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}

function transformEdges(edges: Edge2[], m: Affine, out: Collect): Edge2[] {
  if (m === IDENTITY) return edges;
  const flip = det(m) < 0 ? -1 : 1;
  if (isSimilarity(m) || edges.every((e) => e.bulge === 0)) {
    return edges.map((e) => ({ a: apply(m, e.a), b: apply(m, e.b), bulge: e.bulge * flip }));
  }
  // non-uniform scale turns arcs into ellipse arcs: tessellate then map
  out.nonUniform++;
  const res: Edge2[] = [];
  for (const e of edges) {
    if (e.bulge === 0) {
      res.push({ a: apply(m, e.a), b: apply(m, e.b), bulge: 0 });
      continue;
    }
    const arc = arcOf(e);
    const pts = tessellateChain([e], (arc?.r ?? 1) * 1e-4);
    pts.push(e.b);
    for (let k = 0; k + 1 < pts.length; k++) {
      res.push({ a: apply(m, pts[k] as Vec2), b: apply(m, pts[k + 1] as Vec2), bulge: 0 });
    }
  }
  return res;
}

function polylineToEdges(pts: Vec2[], bulges: number[], closed: boolean): Edge2[] {
  const edges: Edge2[] = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const last = k === n - 1;
    if (last && !closed) break;
    const a = pts[k] as Vec2;
    const b = pts[last ? 0 : k + 1] as Vec2;
    if (a.x === b.x && a.y === b.y) continue;
    edges.push({ a, b, bulge: bulges[k] ?? 0 });
  }
  return edges;
}

function circleEdges(c: Vec2, r: number): Edge2[] {
  const p0 = { x: c.x + r, y: c.y };
  const p1 = { x: c.x - r, y: c.y };
  return [
    { a: p0, b: p1, bulge: 1 },
    { a: p1, b: p0, bulge: 1 },
  ];
}

function arcEdge(c: Vec2, r: number, startDeg: number, endDeg: number): Edge2 {
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360;
  while (sweep > 360) sweep -= 360;
  const s = (startDeg * Math.PI) / 180;
  const t = (endDeg * Math.PI) / 180;
  return {
    a: { x: c.x + r * Math.cos(s), y: c.y + r * Math.sin(s) },
    b: { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) },
    bulge: Math.tan((sweep * Math.PI) / 180 / 4),
  };
}

function straightEdges(pts: Vec2[], closed: boolean): Edge2[] {
  return polylineToEdges(pts, [], closed);
}

function collect(
  parsed: Parsed,
  list: RawEntity[],
  m: Affine,
  parentLayer: string | null,
  depth: number,
  out: Collect,
): void {
  for (let idx = 0; idx < list.length; idx++) {
    if (out.budget <= 0) {
      out.truncated = true;
      return;
    }
    out.budget--;
    const e = list[idx] as RawEntity;
    let layer = get(e, 8) ?? "0";
    if (parentLayer !== null && layer === "0") layer = parentLayer;
    let linetype = get(e, 6) ?? "BYLAYER";
    if (/^bylayer$/i.test(linetype) || /^byblock$/i.test(linetype)) {
      linetype = parsed.layerLinetype.get(layer) ?? "CONTINUOUS";
    }
    const pushEdges = (edges: Edge2[], closed: boolean, local: Affine): void => {
      const mm = compose(m, local);
      const t = transformEdges(edges, mm, out);
      if (t.length)
        out.prims.push({ kind: "edges", layer, linetype, edges: t, closed, source: e.type });
    };
    switch (e.type) {
      case "LINE": {
        const a = { x: num(e, 10), y: num(e, 20) };
        const b = { x: num(e, 11), y: num(e, 21) };
        if (a.x !== b.x || a.y !== b.y) pushEdges([{ a, b, bulge: 0 }], false, IDENTITY);
        break;
      }
      case "ARC": {
        const r = num(e, 40);
        if (r > 0) {
          const edge = arcEdge({ x: num(e, 10), y: num(e, 20) }, r, num(e, 50), num(e, 51));
          pushEdges([edge], false, ocs(e));
        }
        break;
      }
      case "CIRCLE": {
        const r = num(e, 40);
        if (r <= 0) break;
        const mm = compose(m, ocs(e));
        const c = apply(mm, { x: num(e, 10), y: num(e, 20) });
        if (isSimilarity(mm)) {
          out.prims.push({
            kind: "circle",
            layer,
            linetype,
            c,
            r: r * Math.sqrt(Math.abs(det(mm))),
            source: e.type,
          });
        } else {
          const t = transformEdges(circleEdges({ x: num(e, 10), y: num(e, 20) }, r), mm, out);
          out.prims.push({
            kind: "edges",
            layer,
            linetype,
            edges: t,
            closed: true,
            source: e.type,
          });
        }
        break;
      }
      case "LWPOLYLINE": {
        const pts: Vec2[] = [];
        const bulges: number[] = [];
        for (const [c, v] of e.pairs) {
          if (c === 10) {
            pts.push({ x: Number.parseFloat(v), y: 0 });
            bulges.push(0);
          } else if (c === 20 && pts.length) (pts[pts.length - 1] as Vec2).y = Number.parseFloat(v);
          else if (c === 42 && bulges.length) bulges[bulges.length - 1] = Number.parseFloat(v);
        }
        const closed = (num(e, 70) & 1) === 1;
        pushEdges(polylineToEdges(pts, bulges, closed), closed, ocs(e));
        break;
      }
      case "POLYLINE": {
        const flags = num(e, 70);
        const pts: Vec2[] = [];
        const bulges: number[] = [];
        let k = idx + 1;
        for (; k < list.length; k++) {
          const v = list[k] as RawEntity;
          if (v.type === "SEQEND") break;
          if (v.type !== "VERTEX") break;
          const vf = num(v, 70);
          if (vf & 16) continue; // spline frame control point
          pts.push({ x: num(v, 10), y: num(v, 20) });
          bulges.push(num(v, 42));
        }
        idx = k;
        if (flags & (16 | 64)) {
          bump(out.unsupported, flags & 64 ? "POLYLINE(polyface)" : "POLYLINE(mesh)");
          break;
        }
        const closed = (flags & 1) === 1;
        pushEdges(polylineToEdges(pts, bulges, closed), closed, flags & 8 ? IDENTITY : ocs(e));
        break;
      }
      case "ELLIPSE": {
        const c = { x: num(e, 10), y: num(e, 20) };
        const maj = { x: num(e, 11), y: num(e, 21) };
        const ratio = num(e, 40, 1);
        let t0 = num(e, 41, 0);
        let t1 = num(e, 42, Math.PI * 2);
        if (num(e, 230, 1) < 0) {
          // mirrored OCS: parameters run the other way
          [t0, t1] = [-t1, -t0];
          maj.x = -maj.x;
        }
        while (t1 <= t0) t1 += Math.PI * 2;
        const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-9;
        const a = Math.hypot(maj.x, maj.y);
        const ux = maj.x / (a || 1);
        const uy = maj.y / (a || 1);
        const n = Math.max(16, Math.ceil(((t1 - t0) / (Math.PI * 2)) * 256));
        const pts: Vec2[] = [];
        for (let s = 0; s <= (full ? n - 1 : n); s++) {
          const t = t0 + ((t1 - t0) * s) / n;
          const x = a * Math.cos(t);
          const y = a * ratio * Math.sin(t);
          pts.push({ x: c.x + x * ux - y * uy, y: c.y + x * uy + y * ux });
        }
        out.approximated++;
        pushEdges(straightEdges(pts, full), full, IDENTITY);
        break;
      }
      case "SPLINE": {
        const flags = num(e, 70);
        const degree = num(e, 71, 3);
        const knots = nums(e, 40);
        const weights = nums(e, 41);
        const cx = nums(e, 10);
        const cy = nums(e, 20);
        const controls = cx.map((x, k) => ({ x, y: cy[k] ?? 0, z: 0 }));
        const fx = nums(e, 11);
        const fy = nums(e, 21);
        let pts: Vec2[] = [];
        const spline = {
          degree,
          knots,
          controls,
          ...(weights.length === controls.length ? { weights } : {}),
        };
        if (controls.length > degree && knots.length === controls.length + degree + 1) {
          const [lo, hi] = bsplineDomain(spline);
          const n = Math.max(32, controls.length * 16);
          for (let s = 0; s <= n; s++) {
            const p = bsplineAt(spline, lo + ((hi - lo) * s) / n);
            if (p) pts.push({ x: p.x, y: p.y });
          }
        } else if (fx.length >= 2) {
          pts = fx.map((x, k) => ({ x, y: fy[k] ?? 0 }));
        }
        if (pts.length < 2) {
          bump(out.unsupported, "SPLINE(unreadable)");
          break;
        }
        const first = pts[0] as Vec2;
        const last = pts[pts.length - 1] as Vec2;
        const closed = (flags & 1) === 1 || (first.x === last.x && first.y === last.y);
        if (closed && first.x === last.x && first.y === last.y) pts.pop();
        out.approximated++;
        pushEdges(straightEdges(pts, closed), closed, IDENTITY);
        break;
      }
      case "INSERT": {
        const name = get(e, 2) ?? "";
        const block = parsed.blocks.get(name);
        if (!block || depth > 8) {
          bump(out.unsupported, block ? "INSERT(too deep)" : "INSERT(missing block)");
          break;
        }
        const sx = num(e, 41, 1);
        const sy = num(e, 42, 1);
        const rot = (num(e, 50) * Math.PI) / 180;
        const cols = Math.max(1, num(e, 70, 1));
        const rows = Math.max(1, num(e, 71, 1));
        const dc = num(e, 44);
        const dr = num(e, 45);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        for (let ci = 0; ci < cols; ci++) {
          for (let ri = 0; ri < rows; ri++) {
            if (out.budget <= 0) {
              out.truncated = true;
              return;
            }
            out.budget--;
            const ox = ci * dc;
            const oy = ri * dr;
            const ix = num(e, 10) + ox * cos - oy * sin;
            const iy = num(e, 20) + ox * sin + oy * cos;
            // T(ins) · R(rot) · S(sx, sy) · T(-base)
            const local: Affine = {
              a: cos * sx,
              b: sin * sx,
              c: -sin * sy,
              d: cos * sy,
              e: 0,
              f: 0,
            };
            local.e = ix - (local.a * block.base.x + local.c * block.base.y);
            local.f = iy - (local.b * block.base.x + local.d * block.base.y);
            const mm = compose(m, compose(ocs(e), local));
            collect(parsed, block.entities, mm, layer, depth + 1, out);
          }
        }
        break;
      }
      default:
        if (!MEASURED.has(e.type) && !ANNOTATION.has(e.type)) bump(out.unsupported, e.type);
    }
  }
}

// ---- contour building ----

interface Loop {
  edges: Edge2[];
  area: number;
  perimeter: number;
  poly: Vec2[];
  circle: { c: Vec2; r: number } | null;
  slot: { width: number; length: number } | null;
  parent: number;
  depth: number;
}

function makeLoop(edges: Edge2[], tol: number, circle: { c: Vec2; r: number } | null): Loop {
  const area = Math.abs(chainArea(edges));
  const perimeter = edges.reduce((s, e) => s + edgeLength(e), 0);
  const poly = tessellateChain(edges, tol);
  return {
    edges,
    area,
    perimeter,
    poly,
    circle: circle ?? detectCircle(edges, tol),
    slot: detectSlot(edges, tol),
    parent: -1,
    depth: 0,
  };
}

function detectCircle(edges: Edge2[], tol: number): { c: Vec2; r: number } | null {
  let sweep = 0;
  let ref: { c: Vec2; r: number } | null = null;
  for (const e of edges) {
    const arc = arcOf(e);
    if (!arc) return null;
    if (!ref) ref = { c: arc.c, r: arc.r };
    else if (dist2(ref.c, arc.c) > tol * 10 || Math.abs(ref.r - arc.r) > tol * 10) return null;
    sweep += arc.sweep;
  }
  return ref && Math.abs(Math.abs(sweep) - 2 * Math.PI) < 1e-3 ? ref : null;
}

function detectSlot(edges: Edge2[], tol: number): { width: number; length: number } | null {
  if (edges.length !== 4) return null;
  const arcs = edges.map(arcOf);
  const arcIdx = arcs.flatMap((a, k) => (a ? [k] : []));
  if (arcIdx.length !== 2) return null;
  const [i0, i1] = arcIdx as [number, number];
  const a0 = arcs[i0];
  const a1 = arcs[i1];
  if (!a0 || !a1 || (i1 - i0) % 2 !== 0) return null;
  if (Math.abs(a0.r - a1.r) > tol * 10) return null;
  if (
    Math.abs(Math.abs(a0.sweep) - Math.PI) > 1e-3 ||
    Math.abs(Math.abs(a1.sweep) - Math.PI) > 1e-3
  ) {
    return null;
  }
  return { width: 2 * a0.r, length: dist2(a0.c, a1.c) + 2 * a0.r };
}

/** Join open edges end to end into closed loops; returns loops, open chain count and branching. */
function chainEdges(
  edges: Edge2[],
  tol: number,
): { loops: Edge2[][]; open: number; branching: boolean } {
  const cell = tol * 2;
  const grid = new Map<string, number[]>();
  const nodes: Vec2[] = [];
  const nodeOf = (p: Vec2): number => {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (dist2(nodes[id] as Vec2, p) <= tol) return id;
        }
      }
    }
    const id = nodes.length;
    nodes.push(p);
    const key = `${gx},${gy}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(id);
    else grid.set(key, [id]);
    return id;
  };
  interface E {
    e: Edge2;
    n0: number;
    n1: number;
    used: boolean;
  }
  const list: E[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    const n0 = nodeOf(e.a);
    const n1 = nodeOf(e.b);
    if (n0 === n1 && Math.abs(e.bulge) < 1e-9) continue;
    // drop exact duplicates (same nodes, same bulge either direction)
    const k1 = `${n0}|${n1}|${e.bulge.toFixed(9)}`;
    const k2 = `${n1}|${n0}|${(-e.bulge).toFixed(9)}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1);
    list.push({ e, n0, n1, used: false });
  }
  const at = new Map<number, number[]>();
  list.forEach((x, k) => {
    for (const n of [x.n0, x.n1]) {
      const l = at.get(n);
      if (l) l.push(k);
      else at.set(n, [k]);
    }
  });
  const branching = [...at.values()].some((l) => l.length > 2);
  const loops: Edge2[][] = [];
  let open = 0;
  for (const start of list) {
    if (start.used) continue;
    start.used = true;
    const path: Edge2[] = [start.e];
    const origin = start.n0;
    let cur = start.n1;
    let closed = cur === origin;
    while (!closed) {
      const nextIdx = (at.get(cur) ?? []).find((k) => !(list[k] as E).used);
      if (nextIdx === undefined) break;
      const nx = list[nextIdx] as E;
      nx.used = true;
      if (nx.n0 === cur) {
        path.push(nx.e);
        cur = nx.n1;
      } else {
        path.push({ a: nx.e.b, b: nx.e.a, bulge: -nx.e.bulge });
        cur = nx.n0;
      }
      closed = cur === origin;
    }
    if (closed) {
      // snap the joints so the chain is exactly closed
      for (let k = 0; k < path.length; k++) {
        const e = path[k] as Edge2;
        const next = path[(k + 1) % path.length] as Edge2;
        path[k] = { a: e.a, b: next.a, bulge: e.bulge };
      }
      loops.push(path);
    } else {
      open++;
    }
  }
  return { loops, open, branching };
}

function insideLoop(inner: Loop, outer: Loop): boolean {
  if (inner.area >= outer.area) return false;
  // majority vote over a few boundary samples: robust to touching contours
  const n = inner.poly.length;
  const picks = [0, Math.floor(n / 3), Math.floor((2 * n) / 3)];
  let yes = 0;
  for (const k of picks) if (pointInPolygon(inner.poly[k] as Vec2, outer.poly)) yes++;
  return yes >= 2;
}

const round = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d;

function minConf(...c: Confidence[]): Confidence {
  if (c.includes("low")) return "low";
  if (c.includes("medium")) return "medium";
  return "high";
}

/** Read an ASCII DXF and measure the flat part it draws. */
export function extractDxf(text: string, opts: ExtractOptions = {}): PartFeatures {
  const flags: Flag[] = [];
  const bendLayer = opts.bendLayer ?? /bend/i;
  const etchLayer = opts.etchLayer ?? /etch|mark|engrav|scribe/i;
  const ignoreLayer = opts.ignoreLayer ?? /^defpoints$|dim|text|anno|title|border|frame|note/i;

  if (text.startsWith("AutoCAD Binary DXF")) {
    flags.push({
      code: "binary-dxf",
      message: "Binary DXF is not read; save the file as ASCII DXF.",
    });
    return emptyResult(flags);
  }

  const parsed = parse(text);
  const declared = INSUNITS[parsed.insunits];
  const sourceUnits: LengthUnit = declared ?? opts.assumeUnits ?? "mm";
  const unitsAssumed = declared === undefined;
  if (unitsAssumed) {
    flags.push({
      code: "units-unknown",
      message: `The file does not declare its units ($INSUNITS=${parsed.insunits}); assumed ${sourceUnits}.`,
    });
  }
  const k = MM_PER[sourceUnits];

  const out: Collect = {
    prims: [],
    unsupported: {},
    approximated: 0,
    nonUniform: 0,
    budget: DXF_ENTITY_BUDGET,
    truncated: false,
  };
  collect(parsed, parsed.entities, IDENTITY, null, 0, out);
  if (out.truncated) {
    flags.push({
      code: "expansion-limit",
      message: `Block inserts expand to more than ${DXF_ENTITY_BUDGET} entities; measuring stopped there, so every figure is incomplete.`,
    });
  }

  if (out.approximated) {
    flags.push({
      code: "approximated-curves",
      message: `${out.approximated} spline/ellipse entities were tessellated; their lengths and areas are close, not exact.`,
    });
  }
  if (out.nonUniform) {
    flags.push({
      code: "non-uniform-scale",
      message: `${out.nonUniform} block inserts were scaled unevenly; their arcs were tessellated.`,
    });
  }
  const unsupportedTotal = Object.values(out.unsupported).reduce((s, v) => s + v, 0);
  if (unsupportedTotal) {
    flags.push({
      code: "unsupported-entities",
      message: `Not measured: ${Object.entries(out.unsupported)
        .map(([t, n]) => `${t}×${n}`)
        .join(", ")}.`,
    });
  }

  // sort primitives by role
  const cut: Prim[] = [];
  const bendPrims: Prim[] = [];
  const dashed: Prim[] = [];
  let etchLength = 0;
  for (const p of out.prims) {
    if (ignoreLayer.test(p.layer)) continue;
    if (bendLayer.test(p.layer)) {
      bendPrims.push(p);
      continue;
    }
    if (etchLayer.test(p.layer)) {
      etchLength +=
        p.kind === "circle" ? 2 * Math.PI * p.r : p.edges.reduce((s, e) => s + edgeLength(e), 0);
      continue;
    }
    if (p.kind === "edges" && p.source === "LINE" && DASHED.test(p.linetype)) {
      dashed.push(p);
      continue;
    }
    cut.push(p);
  }

  // tolerance from the drawing's extent
  const allPts: Vec2[] = [];
  for (const p of cut) {
    if (p.kind === "circle") {
      allPts.push({ x: p.c.x - p.r, y: p.c.y - p.r }, { x: p.c.x + p.r, y: p.c.y + p.r });
    } else for (const e of p.edges) allPts.push(e.a, e.b);
  }
  const ext = allPts.length ? bbox2(allPts) : { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const diag = Math.hypot(ext.max.x - ext.min.x, ext.max.y - ext.min.y);
  const tol = Math.max(diag * 1e-6, 1e-9);
  const joinTol = Math.max(diag * 1e-5, 1e-6);

  const loops: Loop[] = [];
  const openEdges: Edge2[] = [];
  for (const p of cut) {
    if (p.kind === "circle") loops.push(makeLoop(circleEdges(p.c, p.r), tol, { c: p.c, r: p.r }));
    else if (p.closed) loops.push(makeLoop(p.edges, tol, null));
    else openEdges.push(...p.edges);
  }
  const chained = chainEdges(openEdges, joinTol);
  for (const l of chained.loops) loops.push(makeLoop(l, tol, null));
  if (chained.open) {
    flags.push({
      code: "open-chains",
      message: `${chained.open} chains of lines/arcs do not close; they are left out of area and perimeter.`,
    });
  }
  if (chained.branching) {
    flags.push({
      code: "branching-geometry",
      message:
        "Some endpoints join three or more entities (overlaps or construction lines); contours may be wrong.",
    });
  }

  // containment tree: parent = smallest loop that contains this one
  const order = loops
    .map((_, i) => i)
    .sort((a, b) => (loops[b] as Loop).area - (loops[a] as Loop).area);
  for (let oi = 0; oi < order.length; oi++) {
    const li = order[oi] as number;
    const l = loops[li] as Loop;
    for (let pj = oi - 1; pj >= 0; pj--) {
      const cand = loops[order[pj] as number] as Loop;
      if (insideLoop(l, cand)) {
        l.parent = order[pj] as number;
        l.depth = cand.depth + 1;
        break;
      }
    }
  }
  const roots = loops.filter((l) => l.depth === 0 && l.area > 0);
  const islands = loops.filter((l) => l.depth >= 2);
  if (roots.length > 1) {
    flags.push({
      code: "multiple-outlines",
      message: `${roots.length} separate outer contours (a nest, several parts or several views); measured the largest.`,
    });
  }
  if (islands.length) {
    flags.push({
      code: "nested-islands",
      message: `${islands.length} contours sit inside holes (parts nested in cut-outs); not counted as holes.`,
    });
  }

  const main = roots.reduce<Loop | null>(
    (best, l) => (!best || l.area > best.area ? l : best),
    null,
  );
  const mainIdx = main ? loops.indexOf(main) : -1;

  let flat: FlatFeatures | null = null;
  let bendSource: FlatFeatures["bendLineSource"] = "none";
  if (!main) {
    flags.push({ code: "no-closed-outline", message: "No closed outer contour was found." });
  } else {
    const holesL = loops.filter((l) => l.parent === mainIdx);
    const holes: FlatHole[] = holesL.map((h) => {
      const bb = bbox2(h.poly);
      const center = h.circle
        ? h.circle.c
        : { x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2 };
      const base = {
        perimeter: round(h.perimeter * k),
        area: round(h.area * k * k),
        center: { x: round(center.x * k), y: round(center.y * k) },
      };
      if (h.circle) return { kind: "circle", diameter: round(2 * h.circle.r * k), ...base };
      if (h.slot) {
        return {
          kind: "slot",
          diameter: round(h.slot.width * k),
          length: round(h.slot.length * k),
          ...base,
        };
      }
      return { kind: "other", ...base };
    });
    const groups = new Map<number, number>();
    for (const h of holes) {
      if (h.kind === "circle" && h.diameter !== undefined) {
        groups.set(h.diameter, (groups.get(h.diameter) ?? 0) + 1);
      }
    }
    const circularHoles: CircularHoleGroup[] = [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([diameter, count]) => ({ diameter, count }));

    const bendLines: BendLine[] = [];
    const toBend = (p: Prim): void => {
      if (p.kind !== "edges") return;
      for (const e of p.edges) {
        if (e.bulge !== 0) continue;
        bendLines.push({
          layer: p.layer,
          length: round(dist2(e.a, e.b) * k),
          start: { x: round(e.a.x * k), y: round(e.a.y * k) },
          end: { x: round(e.b.x * k), y: round(e.b.y * k) },
        });
      }
    };
    if (bendPrims.length) {
      bendSource = "layer";
      bendPrims.forEach(toBend);
    } else {
      const inside = dashed.filter(
        (p) =>
          p.kind === "edges" &&
          p.edges.every((e) =>
            pointInPolygon({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, main.poly),
          ),
      );
      if (inside.length) {
        bendSource = "linetype";
        inside.forEach(toBend);
        flags.push({
          code: "bend-lines-by-linetype",
          message: `No bend layer; ${bendLines.length} dashed/centre lines inside the part were taken as bend lines.`,
        });
      }
    }

    const holeArea = holesL.reduce((s, h) => s + h.area, 0);
    const holePerim = holesL.reduce((s, h) => s + h.perimeter, 0);
    const bb = bbox2(main.poly);
    flat = {
      outerPerimeter: round(main.perimeter * k),
      grossArea: round(main.area * k * k),
      netArea: round((main.area - holeArea) * k * k),
      blank: { width: round((bb.max.x - bb.min.x) * k), height: round((bb.max.y - bb.min.y) * k) },
      holes,
      holeCount: holes.length,
      circularHoles,
      cutLength: round((main.perimeter + holePerim) * k),
      pierceCount: 1 + holes.length,
      bendLines,
      bendLineSource: bendSource,
      etchLength: round(etchLength * k),
      outlineCount: roots.length,
      openChainCount: chained.open,
    };
  }

  const bbSource = main ? main.poly : allPts;
  const bb = bbSource.length ? bbox2(bbSource) : null;
  const boundingBox = bb
    ? {
        min: { x: round(bb.min.x * k), y: round(bb.min.y * k), z: 0 },
        max: { x: round(bb.max.x * k), y: round(bb.max.y * k), z: 0 },
        size: { x: round((bb.max.x - bb.min.x) * k), y: round((bb.max.y - bb.min.y) * k), z: 0 },
      }
    : null;

  const units: Confidence = unitsAssumed ? "low" : "high";
  let measures: Confidence = "high";
  if (!main) measures = "low";
  else {
    if (
      out.approximated ||
      out.nonUniform ||
      roots.length > 1 ||
      chained.open ||
      unsupportedTotal
    ) {
      measures = "medium";
    }
    if (chained.branching) measures = "low";
  }
  const holesConf: Confidence = !flat
    ? "low"
    : minConf(measures, flat.holes.some((h) => h.kind === "other") ? "medium" : "high");
  const bends: Confidence =
    bendSource === "layer" ? "high" : bendSource === "linetype" ? "low" : "medium";
  const fieldConfidence = {
    units,
    boundingBox: main
      ? minConf(measures, roots.length > 1 ? "medium" : "high")
      : bb
        ? "low"
        : "low",
    measures,
    holes: holesConf,
    bends,
  } as const;
  return {
    format: "dxf",
    units: "mm",
    sourceUnits,
    unitsAssumed,
    boundingBox,
    flat,
    solid: null,
    confidence: out.truncated ? "low" : minConf(units, measures),
    fieldConfidence,
    flags,
    unsupported: out.unsupported,
  };
}

function emptyResult(flags: Flag[]): PartFeatures {
  return {
    format: "dxf",
    units: "mm",
    sourceUnits: "unknown",
    unitsAssumed: true,
    boundingBox: null,
    flat: null,
    solid: null,
    confidence: "low",
    fieldConfidence: {
      units: "low",
      boundingBox: "low",
      measures: "low",
      holes: "low",
      bends: "low",
    },
    flags,
    unsupported: {},
  };
}
