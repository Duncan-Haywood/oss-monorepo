// Triangles to draw an element with, from the same solids its volume comes
// from (geom.mjs).
//
// A solid here is a signed sum of convex polyhedra ("terms"): a concave
// profile is fanned into signed triangles, an opening enters as a negative
// term. Drawing every positive term's faces would show the fan's extra
// triangles and no holes, so the faces drawn are the solid's boundary only:
// each term face is split by the planes of the terms that overlap it, and a
// piece is kept where the signed count of terms holding a point changes from
// "in the solid" (count > 0) on one side of it to "not" on the other. A piece
// is drawn facing out of the solid. Shared faces (two fan triangles meeting
// on a diagonal, an opening's side flush with a wall face) are inside or
// outside on both sides and drop out.
//
// The faceted part of a solid (faceted breps, triangulated face sets) keeps
// its faces as given (`shells`), and they are cut into triangles as they are.
// A body with neither (swept disks, revolved areas, CSG primitives) has no
// faces here: the caller draws its box.
//
// Pure functions; points are world coordinates in metres after W and f.

import { apply, polyPlanes, earClip } from "./geom.mjs";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// above this many terms (once the extrusion shortcut does not apply) the
// exact boundary costs too much for a page: the element is drawn as its box
export const MAX_BOUNDARY_TERMS = 250;
// an element with more triangles than this is drawn as its box too: the view
// is for finding elements, and one over-detailed fitting should not cost the
// browser more memory than a storey
export const MAX_ELEMENT_TRIANGLES = 40000;
const MAX_PIECES_PER_FACE = 4000;
// polygon cuts one element may cost before it is drawn as its box instead: a
// count, not a clock, so the same model always draws the same way
export const MAX_BOUNDARY_WORK = 40000;

function boxOf(pts) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { if (p[i] < b[i]) b[i] = p[i]; if (p[i] > b[i + 3]) b[i + 3] = p[i]; }
  return b;
}
const overlaps = (a, b, e) => a[0] <= b[3] + e && b[0] <= a[3] + e && a[1] <= b[4] + e && b[1] <= a[4] + e && a[2] <= b[5] + e && b[2] <= a[5] + e;

let work = 0;
// a convex polygon split by the plane n.x = k into the parts on each side
function split(poly, n, k, eps) {
  work++;
  const d = poly.map((p) => dot(n, p) - k);
  let pos = false, neg = false;
  for (const x of d) { if (x > eps) pos = true; else if (x < -eps) neg = true; }
  if (!pos || !neg) return [poly];
  const A = [], B = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = d[i], db = d[(i + 1) % poly.length];
    if (da <= eps) A.push(a);
    if (da >= -eps) B.push(a);
    if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
      const t = da / (da - db);
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      A.push(p); B.push(p);
    }
  }
  return [A, B].filter((q) => q.length >= 3);
}

// which side of n.x = k a piece lies on (its centroid's): > 0 outside
function side(q, n, k) {
  let c = 0;
  for (const p of q) c += dot(n, p);
  return c / q.length - k;
}

function newell(poly) {
  let n = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  return n;
}

const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], r = P[(i + 1) % P.length]; a += p[0] * r[1] - r[0] * p[1]; } return a / 2; };

// directed 2D edges chained into closed loops; null when a vertex has more
// than one way on (two loops touching at a point)
function edgeLoops(edges, key) {
  const next = new Map();
  for (const [a, b] of edges) { const k = key(a); if (next.has(k)) return null; next.set(k, [a, b]); }
  const loops = [];
  const used = new Set();
  for (const [k0] of next) {
    if (used.has(k0)) continue;
    const loop = [];
    let k = k0;
    while (!used.has(k)) {
      used.add(k);
      const e = next.get(k);
      if (!e) return null;
      loop.push(e[0]);
      k = key(e[1]);
    }
    if (k !== k0 || loop.length < 3) return null;
    loops.push(loop);
  }
  return loops;
}

const segX = (a, b, c, d) => {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

// outer loops (counter-clockwise) with their holes (clockwise) joined in by
// a bridge to a vertex they can see, so each cap is one simple-enough
// polygon for ear clipping; null when a hole's outer loop cannot be found
function withHoles(loops) {
  const outers = loops.filter((l) => area2(l) > 0).map((l) => l.slice());
  const holes = loops.filter((l) => area2(l) < 0);
  if (!outers.length) return null;
  const inside = (P, p) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  // rightmost holes first, so a later bridge sees the earlier ones as outer edges
  holes.sort((h1, h2) => Math.max(...h2.map((p) => p[0])) - Math.max(...h1.map((p) => p[0])));
  for (const h of holes) {
    const oi = outers.findIndex((o) => inside(o, h[0]));
    if (oi < 0) return null;
    const O = outers[oi];
    let m = 0;
    for (let i = 1; i < h.length; i++) if (h[i][0] > h[m][0]) m = i;
    const p = h[m];
    const others = holes.filter((x) => x !== h);
    const cands = O.map((q, i) => [Math.hypot(q[0] - p[0], q[1] - p[1]), i]).sort((a, b) => a[0] - b[0]);
    let pick = -1;
    for (const [, i] of cands) {
      const q = O[i];
      let clear = true;
      for (const L of [O, h, ...others]) {
        for (let j = 0; j < L.length && clear; j++) if (segX(p, q, L[j], L[(j + 1) % L.length])) clear = false;
        if (!clear) break;
      }
      if (clear) { pick = i; break; }
    }
    if (pick < 0) return null;
    const ring = [...h.slice(m), ...h.slice(0, m), p];
    outers[oi] = [...O.slice(0, pick + 1), ...ring, ...O.slice(pick)];
  }
  return outers;
}

/**
 * The boundary of a signed sum of prisms that all share one base plane and
 * one extrusion vector (a concave profile fanned into signed triangles, its
 * voids fanned with the opposite sign: what an extruded profile is before any
 * clip or opening). The fan's diagonals appear twice with opposite weight and
 * cancel, leaving the profile's own edges; the sides are those edges swept,
 * and each cap is the region of positive winding, cut into trapezoids
 * between consecutive vertex abscissae. null when the terms are not such a
 * family (the general method then runs).
 */
export function prismFamily(terms) {
  if (terms.length < 2) return null;
  const f0 = terms[0].faces;
  if (!f0 || f0.length < 5) return null;
  const nn = newell(f0[0]);
  const len = Math.hypot(...nn);
  if (!len) return null;
  const n = [nn[0] / len, nn[1] / len, nn[2] / len];
  const k0 = dot(n, f0[0][0]);
  const cen = (f) => { const c = [0, 0, 0]; for (const p of f) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return [c[0] / f.length, c[1] / f.length, c[2] / f.length]; };
  let size = 0;
  for (const t of terms) for (const f of t.faces) for (const p of f) size = Math.max(size, Math.abs(p[0] - f0[0][0][0]), Math.abs(p[1] - f0[0][0][1]), Math.abs(p[2] - f0[0][0][2]));
  const tol = 1e-9 * (size + 1);
  let v = null;
  for (const t of terms) {
    const F = t.faces;
    if (F.length !== F[0].length + 2) return null;
    for (const p of F[0]) if (Math.abs(dot(n, p) - k0) > tol) return null;
    // the top: the bottom loop moved by one vector, the same for every term
    const b = F[0], top = F[1];
    if (top.length !== b.length) return null;
    const d = sub(cen(top), cen(b));
    if (!v) { v = d; if (Math.abs(dot(v, n)) <= tol) return null; }
    else if (Math.abs(d[0] - v[0]) > tol * 10 || Math.abs(d[1] - v[1]) > tol * 10 || Math.abs(d[2] - v[2]) > tol * 10) return null;
    for (const q of top) {
      let hit = false;
      for (const p of b) if (Math.abs(p[0] + v[0] - q[0]) <= tol * 10 && Math.abs(p[1] + v[1] - q[1]) <= tol * 10 && Math.abs(p[2] + v[2] - q[2]) <= tol * 10) { hit = true; break; }
      if (!hit) return null;
    }
  }
  // a frame in the base plane
  const u0 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = cross(n, u0); const ul = Math.hypot(...u); u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const w = cross(n, u);
  const o = f0[0][0];
  const to2 = (p) => { const d = sub(p, o); return [dot(d, u), dot(d, w)]; };
  const to3 = (x, y) => [o[0] + x * u[0] + y * w[0], o[1] + x * u[1] + y * w[1], o[2] + x * u[2] + y * w[2]];
  // signed directed edges of every base triangle, counter-clockwise in (u, w)
  const q = 1e-7 * (size + 1);
  const key = (p) => `${Math.round(p[0] / q)},${Math.round(p[1] / q)}`;
  const edges = new Map();
  for (const t of terms) {
    let P = t.faces[0].map(to2);
    let a2 = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; a2 += a[0] * b[1] - b[0] * a[1]; }
    if (Math.abs(a2) <= tol * tol) continue;
    if (a2 < 0) P = P.slice().reverse();
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const ka = key(a), kb = key(b);
      if (ka === kb) continue;
      const fwd = ka < kb;
      const k = fwd ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = edges.get(k) || { a: fwd ? a : b, b: fwd ? b : a, w: 0 };
      e.w += fwd ? t.s : -t.s;
      edges.set(k, e);
    }
  }
  const bound = [];
  for (const e of edges.values()) {
    if (e.w === 0) continue;
    if (Math.abs(e.w) !== 1) return null; // overlapping profiles: not a simple region
    bound.push(e.w > 0 ? [e.a, e.b] : [e.b, e.a]);
  }
  if (!bound.length) return { faces: [], exact: true };
  const faces = [];
  // sides: each profile edge swept by v, facing to the edge's right (outside)
  for (const [a, b] of bound) {
    const A = to3(a[0], a[1]), B = to3(b[0], b[1]);
    let quad = [A, B, [B[0] + v[0], B[1] + v[1], B[2] + v[2]], [A[0] + v[0], A[1] + v[1], A[2] + v[2]]];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const right = [dy * u[0] - dx * w[0], dy * u[1] - dx * w[1], dy * u[2] - dx * w[2]];
    if (dot(newell(quad), right) < 0) quad = quad.reverse();
    faces.push(quad);
  }
  // caps: when the edges close into loops that all wind the same way (no
  // holes), each loop is one polygon; otherwise trapezoids of positive winding
  // between consecutive abscissae
  const loops = edgeLoops(bound, key);
  const polys = loops && withHoles(loops);
  if (polys) {
    for (const l of polys) {
      let bot = l.map(([x, y]) => to3(x, y));
      if (dot(newell(bot), v) > 0) bot = bot.reverse();
      faces.push(bot, bot.map((p) => [p[0] + v[0], p[1] + v[1], p[2] + v[2]]).reverse());
    }
    return { faces, exact: true };
  }
  const xs = [...new Set(bound.flatMap(([a, b]) => [a[0], b[0]]))].sort((p, r) => p - r);
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i], xb = xs[i + 1];
    if (xb - xa <= q) continue;
    const xm = (xa + xb) / 2;
    const cross2 = [];
    for (const [a, b] of bound) {
      const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      if (lo > xm || hi < xm || hi - lo <= 0) continue;
      const at = (x) => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      cross2.push({ ym: at(xm), ya: at(xa), yb: at(xb), up: b[0] > a[0] ? 1 : -1 });
    }
    cross2.sort((p, r) => p.ym - r.ym);
    let wind = 0;
    for (let j = 0; j + 1 < cross2.length; j++) {
      wind += cross2[j].up;
      if (wind <= 0) continue;
      const lo = cross2[j], hi = cross2[j + 1];
      const pts = [[xa, lo.ya], [xb, lo.yb], [xb, hi.yb], [xa, hi.ya]].filter((p, idx, arr) => { const nx = arr[(idx + 1) % arr.length]; return Math.abs(p[0] - nx[0]) > q || Math.abs(p[1] - nx[1]) > q; });
      if (pts.length < 3) continue;
      let bot = pts.map(([x, y]) => to3(x, y));
      if (dot(newell(bot), v) > 0) bot = bot.reverse();
      const top = bot.map((p) => [p[0] + v[0], p[1] + v[1], p[2] + v[2]]).reverse();
      faces.push(bot, top);
    }
  }
  return { faces, exact: true };
}

/**
 * Boundary polygons of a signed sum of convex polyhedra, each counter-clockwise
 * seen from outside the solid. Local coordinates in, local out.
 * @returns {{faces: number[][][], exact: boolean}}
 */
export function termBoundary(terms) {
  const T = terms.filter((t) => t.faces && t.faces.length >= 4);
  if (!T.length) return { faces: [], exact: true };
  const fam = prismFamily(T);
  if (fam) return fam;
  if (T.length > MAX_BOUNDARY_TERMS) {
    return { faces: [], exact: false, tooComplex: true };
  }
  const info = T.map((t) => ({ s: t.s, faces: t.faces, planes: polyPlanes(t.faces), box: boxOf(t.faces.flat()) }));
  const all = boxOf(info.flatMap((t) => [t.box.slice(0, 3), t.box.slice(3)]));
  const size = Math.max(all[3] - all[0], all[4] - all[1], all[5] - all[2], 1e-9);
  const eps = 1e-10 * size, off = 1e-8 * size;
  const inside = (t, p) => { for (const [n, k] of t.planes) if (dot(n, p) - k > 0) return false; return true; };
  const count = (p) => { let w = 0; for (const t of info) if (p[0] >= t.box[0] - off && p[0] <= t.box[3] + off && p[1] >= t.box[1] - off && p[1] <= t.box[4] + off && p[2] >= t.box[2] - off && p[2] <= t.box[5] + off && inside(t, p)) w += t.s; return w; };
  const out = [];
  const ownedEarlier = (i, c, n) => {
    for (let j = 0; j < i; j++) {
      const t = info[j];
      if (c[0] < t.box[0] - off || c[0] > t.box[3] + off || c[1] < t.box[1] - off || c[1] > t.box[4] + off || c[2] < t.box[2] - off || c[2] > t.box[5] + off) continue;
      let onFace = false, inside = true;
      for (const [m, k] of t.planes) {
        const d = dot(m, c) - k;
        if (Math.abs(Math.abs(dot(m, n)) - 1) < 1e-6) { if (Math.abs(d) <= off) onFace = true; else if (d > 0) { inside = false; break; } continue; }
        // strictly inside the face's other edges: a point on an edge is not covered
        if (d > -eps) { inside = false; break; }
      }
      if (inside && onFace) return true;
    }
    return false;
  };
  let exact = true;
  work = 0;
  for (let i = 0; i < info.length; i++) {
    const ti = info[i];
    if (work > MAX_BOUNDARY_WORK) return { faces: [], exact: false, tooComplex: true };
    for (const f of ti.faces) {
      const nn = newell(f);
      const len = Math.hypot(...nn);
      if (len === 0) continue;
      const n = [nn[0] / len, nn[1] / len, nn[2] / len];
      const fb = boxOf(f);
      let pieces = [f];
      for (let j = 0; j < info.length && pieces.length <= MAX_PIECES_PER_FACE; j++) {
        if (j === i || !overlaps(fb, info[j].box, off)) continue;
        // cut each piece into the part inside term j and the parts outside it:
        // a part found outside one of j's planes is outside j and is not cut further
        const next = [];
        for (const q0 of pieces) {
          // a piece term j only touches (fan triangles sharing an edge) or
          // misses is not cut by it at all
          // quick test first: a piece wholly outside one of j's planes
          let apart = false;
          for (const [m, k] of info[j].planes) {
            let lo = Infinity;
            for (const p of q0) { const d = dot(m, p) - k; if (d < lo) lo = d; }
            // a face lying in j's own plane still needs cutting by j's edges
            if (lo >= (Math.abs(Math.abs(dot(m, n)) - 1) < 1e-9 ? off : -eps)) { apart = true; break; }
          }
          if (apart) { next.push(q0); continue; }
          let probe = q0;
          for (const [m, k] of info[j].planes) {
            if (Math.abs(Math.abs(dot(m, n)) - 1) < 1e-9) continue;
            const parts = split(probe, m, k, eps);
            probe = parts.length === 1 ? (side(parts[0], m, k) > 0 ? null : parts[0]) : parts.find((r) => side(r, m, k) <= 0) ?? null;
            if (!probe || Math.hypot(...newell(probe)) / 2 <= eps * eps) { probe = null; break; }
          }
          if (!probe) { next.push(q0); continue; }
          let rest = [q0];
          for (const [m, k] of info[j].planes) {
            if (!rest.length) break;
            if (Math.abs(Math.abs(dot(m, n)) - 1) < 1e-9) continue; // parallel: cannot cross the face
            const keep = [];
            for (const q of rest) {
              const parts = split(q, m, k, eps);
              if (parts.length === 1) { (side(parts[0], m, k) > 0 ? next : keep).push(parts[0]); continue; }
              for (const r of parts) (side(r, m, k) > 0 ? next : keep).push(r);
            }
            rest = keep;
          }
          next.push(...rest);
        }
        pieces = next;
      }
      if (pieces.length > MAX_PIECES_PER_FACE) return { faces: [], exact: false, tooComplex: true };
      for (const q of pieces) {
        const qa = Math.hypot(...newell(q)) / 2;
        if (qa <= eps * eps) continue;
        const c = [0, 0, 0];
        for (const p of q) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
        c[0] /= q.length; c[1] /= q.length; c[2] /= q.length;
        const wIn = count([c[0] - n[0] * off, c[1] - n[1] * off, c[2] - n[2] * off]) > 0;
        const wOut = count([c[0] + n[0] * off, c[1] + n[1] * off, c[2] + n[2] * off]) > 0;
        if (wIn === wOut) continue;
        // a face of an earlier term in the same plane through the same point
        // has drawn this part already (coplanar caps of a fan, flush faces)
        if (ownedEarlier(i, c, n)) continue;
        out.push(wIn ? q : q.slice().reverse());
      }
    }
  }
  return { faces: out, exact };
}

// a planar polygon (maybe concave) as triangles, by ear clipping in its plane
function triangulate(poly) {
  if (poly.length === 3) return [poly];
  const n = newell(poly);
  const ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
  const [u, v] = ax === 0 ? [1, 2] : ax === 1 ? [2, 0] : [0, 1];
  const P = poly.map((p) => [p[u], p[v]]);
  try {
    return earClip(P).map(([a, b, c]) => {
      const t = [poly[a], poly[b], poly[c]];
      // keep the face's own winding (earClip orders counter-clockwise in u, v)
      const tn = cross(sub(t[1], t[0]), sub(t[2], t[0]));
      return dot(tn, n) < 0 ? [t[0], t[2], t[1]] : t;
    });
  } catch {
    // fall back to a fan: fine for the convex faces most exporters write
    const out = [];
    for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0], poly[i], poly[i + 1]]);
    return out;
  }
}

const BOUNDARY_CACHE = new WeakMap();

/**
 * Triangles of one element in world metres.
 * @param {{terms: any[], shells: any[]|null, mesh: number}} s the element's solid (net if known)
 * @param {number[]} W the element's 3x4 placement
 * @param {number} f length unit to metres
 * @param {number[]} origin subtracted (in metres) before the float32 store, so far-off site coordinates keep their millimetres
 * @returns {{positions: Float32Array, normals: Float32Array, exact: boolean, empty: boolean}}
 */
export function solidMesh(s, W, f = 1, origin = [0, 0, 0]) {
  const polys = [];
  let exact = true;
  if (s && s.terms && s.terms.length) {
    // elements of one type share one body object (geom.mjs caches by
    // representation), so its boundary is worked out once
    let b = BOUNDARY_CACHE.get(s);
    if (!b) { b = termBoundary(s.terms); BOUNDARY_CACHE.set(s, b); }
    if (b.tooComplex) return { positions: new Float32Array(0), normals: new Float32Array(0), exact: false, empty: true, tooComplex: true };
    polys.push(...b.faces);
    exact = b.exact;
  }
  if (s && s.shells) for (const sh of s.shells) for (const loop of sh.loops) if (loop.length >= 3) polys.push(sh.s < 0 ? loop.slice().reverse() : loop);
  if (s && s.mesh && !s.shells) exact = false;
  const tris = [];
  for (const p of polys) for (const t of triangulate(p)) tris.push(t);
  const positions = new Float32Array(tris.length * 9);
  const normals = new Float32Array(tris.length * 9);
  let o = 0;
  for (const t of tris) {
    const w = t.map((p) => { const q = apply(W, p); return [q[0] * f - origin[0], q[1] * f - origin[1], q[2] * f - origin[2]]; });
    let n = cross(sub(w[1], w[0]), sub(w[2], w[0]));
    const l = Math.hypot(...n) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    for (const q of w) { positions.set(q, o); normals.set(n, o); o += 3; }
  }
  return { positions, normals, exact, empty: tris.length === 0 };
}

/** Twelve triangles of an axis-aligned box [x0, y0, z0, x1, y1, z1]. */
export function boxMesh(b, origin = [0, 0, 0]) {
  const [x0, y0, z0, x1, y1, z1] = [b[0] - origin[0], b[1] - origin[1], b[2] - origin[2], b[3] - origin[0], b[4] - origin[1], b[5] - origin[2]];
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const positions = new Float32Array(36 * 3), normals = new Float32Array(36 * 3);
  let o = 0;
  for (const q of quads) {
    const a = P[q[0]], b2 = P[q[1]], c = P[q[2]];
    let n = cross(sub(b2, a), sub(c, a));
    const l = Math.hypot(...n) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    for (const i of [q[0], q[1], q[2], q[0], q[2], q[3]]) { positions.set(P[i], o); normals.set(n, o); o += 3; }
  }
  return { positions, normals, exact: false, empty: false };
}

/** Signed volume enclosed by a triangle list (divergence theorem): a check that the boundary closes. */
export function meshVolume(positions) {
  let v = 0;
  // measured from the first vertex, so float32 rounding of far-off world
  // coordinates does not swamp the sum
  const o = [positions[0] ?? 0, positions[1] ?? 0, positions[2] ?? 0];
  for (let i = 0; i < positions.length; i += 9) {
    const a = [positions[i] - o[0], positions[i + 1] - o[1], positions[i + 2] - o[2]];
    const b = [positions[i + 3] - o[0], positions[i + 4] - o[1], positions[i + 5] - o[2]];
    const c = [positions[i + 6] - o[0], positions[i + 7] - o[1], positions[i + 8] - o[2]];
    v += dot(a, cross(b, c));
  }
  return v / 6;
}

/** The middle of the rows' boxes: a view origin that keeps float32 precise. */
export function modelOrigin(rows) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const r of rows) if (r.box) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], r.box[k]); b[k + 3] = Math.max(b[k + 3], r.box[k + 3]); }
  return Number.isFinite(b[0]) ? [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2] : [0, 0, 0];
}

/** The mesh to draw a takeoff row with: its net solid, else its body, else its box. */
export function rowMesh(row, origin = [0, 0, 0], maxTriangles = MAX_ELEMENT_TRIANGLES) {
  let reason = null;
  const S = row.computed && row.computed.solids;
  const W = row.world;
  const f = row.lengthUnit ?? 1;
  if (S && W) {
    const s = S.net || S.body;
    try {
      const m = solidMesh(s, W, f, origin);
      if (!m.empty && m.positions.length / 9 <= maxTriangles) return { ...m, net: !!S.net && S.net !== S.body };
      if (!m.empty) reason = `${m.positions.length / 9} triangles`;
    } catch { /* drawn as its box below */ }
  }
  if (row.box) return { ...boxMesh(row.box, origin), net: false, boxOnly: true, reason };
  return null;
}

/**
 * The meshes of a model's drawable rows (assemblies are drawn as their
 * parts), one { id, mesh } at a time, mesh null when there is nothing to
 * draw. The page's fallback and view-worker.mjs both use it, so the two draw
 * a model the same way.
 */
export function* meshRows(rows, origin) {
  for (const r of rows) {
    let mesh = null;
    try { mesh = rowMesh(r, origin); } catch { mesh = null; }
    yield { id: r.id, mesh };
  }
}
/** The rows the view draws, and the origin it draws them about. */
meshRows.prepare = (rows) => ({ rows: rows.filter((r) => !r.isAssembly), origin: modelOrigin(rows) });
