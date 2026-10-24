// @ts-check
// Views of the 3D model as vector drawings: an axonometric and four
// elevations. Hidden surfaces are resolved with a painter's order: faces that
// overlap on screen are ordered by which side of the other's plane they lie
// on (Newell's test), then sorted topologically. All solids are convex, which
// is what makes that test sufficient here.

import { dot, sub, cross, norm, centre, faceNormal, materialColors } from "./model3d.mjs";
import { ftIn } from "./geom.mjs";

const EPS = 1e-4;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function camera(dv) {
  const v = norm(dv);
  const up0 = Math.abs(v[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
  const right = norm(cross(up0, v));
  const up = cross(v, right);
  return { dv: v, right, up, P: (p) => [dot(p, right), dot(p, up)], depth: (p) => dot(p, v) };
}

function overlap2d(A, B) {
  // separating axis test for convex polygons, touching does not count
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ax = -(b[1] - a[1]), ay = b[0] - a[0];
      const len = Math.hypot(ax, ay);
      if (len < 1e-9) continue;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of A) { const d = (p[0] * ax + p[1] * ay) / len; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const p of B) { const d = (p[0] * ax + p[1] * ay) / len; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA <= minB + 1e-3 || maxB <= minA + 1e-3) return false;
    }
  }
  return true;
}

/** Visible faces in painter's order (back to front). */
export function paintOrder(faces, cam) {
  const vis = [];
  for (const f of faces) {
    const n = f.n || faceNormal(f.pts);
    if (dot(n, cam.dv) <= 1e-6) continue;
    const p2 = f.pts.map(cam.P);
    const xs = p2.map((p) => p[0]), ys = p2.map((p) => p[1]);
    vis.push({ f, n, p2, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], depth: cam.depth(centre(f.pts)), p0: f.pts[0] });
  }
  const N = vis.length;
  const after = Array.from({ length: N }, () => []); // after[i]: faces that must be drawn after i
  const indeg = new Array(N).fill(0);
  const side = (pts, n, p0) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { const s = dot(n, sub(p, p0)); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    return [lo, hi];
  };
  const order = vis.map((_, i) => i).sort((a, b) => vis[a].bb[0] - vis[b].bb[0]);
  for (let ii = 0; ii < N; ii++) {
    const i = order[ii];
    const A = vis[i];
    for (let jj = ii + 1; jj < N; jj++) {
      const j = order[jj];
      const B = vis[j];
      if (B.bb[0] >= A.bb[2] - 1e-3) break;
      if (B.bb[1] >= A.bb[3] - 1e-3 || A.bb[1] >= B.bb[3] - 1e-3) continue;
      if (!overlap2d(A.p2, B.p2)) continue;
      let first = null;
      const [aLo, aHi] = side(A.f.pts, B.n, B.p0);
      if (aHi <= EPS) first = [i, j];
      else if (aLo >= -EPS) first = [j, i];
      else {
        const [bLo, bHi] = side(B.f.pts, A.n, A.p0);
        if (bHi <= EPS) first = [j, i];
        else if (bLo >= -EPS) first = [i, j];
        else first = A.depth < B.depth ? [i, j] : [j, i];
      }
      after[first[0]].push(first[1]);
      indeg[first[1]]++;
    }
  }
  // Kahn's algorithm, farthest first among the ready; break cycles by depth
  const done = new Array(N).fill(false);
  const out = [];
  const ready = [];
  for (let i = 0; i < N; i++) if (!indeg[i]) ready.push(i);
  while (out.length < N) {
    if (!ready.length) {
      let best = -1;
      for (let i = 0; i < N; i++) if (!done[i] && (best < 0 || indeg[i] < indeg[best] || (indeg[i] === indeg[best] && vis[i].depth < vis[best].depth))) best = i;
      indeg[best] = 0;
      ready.push(best);
    }
    ready.sort((a, b) => vis[b].depth - vis[a].depth);
    const i = ready.pop();
    if (done[i]) continue;
    done[i] = true;
    out.push(vis[i]);
    for (const j of after[i]) if (--indeg[j] === 0 && !done[j]) ready.push(j);
  }
  return out;
}

/** Cut a convex planar polygon with the plane dot(n, p) = d: the segment, or null. */
function slice(pts, n, d) {
  const hits = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const sa = dot(n, a) - d, sb = dot(n, b) - d;
    if ((sa <= 0 && sb > 0) || (sa > 0 && sb <= 0)) {
      const t = sa / (sa - sb);
      hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return hits.length >= 2 ? [hits[0], hits[1]] : null;
}

/** Cladding lines on an outside wall face, in absolute coordinates so pieces line up. */
function claddingLines(f, cladding) {
  const n = f.n;
  if (Math.abs(n[2]) > 0.1) return [];
  const zs = f.pts.map((p) => p[2]);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const alongX = Math.abs(n[1]) > Math.abs(n[0]);
  const hs = f.pts.map((p) => (alongX ? p[0] : p[1]));
  const h0 = Math.min(...hs), h1 = Math.max(...hs);
  const out = [];
  if (cladding === "lap" || cladding === "shingle") {
    const step = cladding === "lap" ? 0.6 : 0.55;
    for (let z = Math.ceil(z0 / step) * step; z < z1 - 1e-6; z += step) {
      const s = slice(f.pts, [0, 0, 1], z);
      if (s) out.push(s);
      if (cladding === "shingle") {
        const off = Math.round(z / step) % 2 ? 0.45 : 0;
        for (let hh = Math.ceil((h0 - off) / 0.9) * 0.9 + off; hh < h1; hh += 0.9) {
          const seg = slice(f.pts, alongX ? [1, 0, 0] : [0, 1, 0], hh);
          if (!seg) continue;
          const top = Math.min(z + step, Math.max(seg[0][2], seg[1][2]));
          if (top - z < 0.05) continue;
          const base = alongX ? [hh, seg[0][1], z] : [seg[0][0], hh, z];
          out.push([base, [base[0], base[1], top]]);
        }
      }
    }
  } else {
    const step = cladding === "board-and-batten" ? 1.33 : 0.5;
    for (let hh = Math.ceil(h0 / step) * step; hh < h1 - 1e-6; hh += step) {
      const s = slice(f.pts, alongX ? [1, 0, 0] : [0, 1, 0], hh);
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Render a view to drawing primitives in screen feet (x right, y up).
 * dir is the direction from the scene toward the viewer.
 */
export function viewPrimitives(model, style, dir, { kinds = null, light = [-0.45, -1, 1.3], strokeScale = 1 } = {}) {
  const cam = camera(dir);
  const colors = materialColors(style);
  const faces = [];
  for (const el of model.elements) {
    if (kinds && !kinds.includes(el.kind)) continue;
    if (el.kind === "partition") continue;
    for (const f of el.faces) faces.push({ ...f, el });
  }
  const L = norm(light);
  const out = [];
  const lineColor = shade(colors.wall, 0.78);
  for (const v of paintOrder(faces, cam)) {
    const f = v.f;
    const base = colors[f.mat] || "#cccccc";
    let k = 0.72 + 0.32 * Math.max(0, dot(v.n, L));
    if (f.mat === "glass") k = 0.85 + 0.25 * Math.max(0, v.n[2]);
    if (f.mat === "soffit") k *= 0.8;
    const fill = shade(base, k);
    const edge = f.mat === "roof" ? shade(base, 0.6) : f.mat === "glass" ? "#2e3b46" : shade(base, 0.55);
    out.push({ t: "poly", pts: v.p2, closed: true, fill, stroke: edge, sw: 0.035 * strokeScale, join: "round", layer: `V-${f.mat.toUpperCase()}` });
    const deco = [];
    if (f.mat === "wall" && f.el.kind !== "foundation") deco.push(...claddingLines(f, style.cladding));
    if (f.deco) deco.push(...f.deco);
    for (const [a, b] of deco) {
      out.push({ t: "line", a: cam.P(a), b: cam.P(b), stroke: f.mat === "wall" ? lineColor : f.mat === "glass" ? "#dfe6ea" : shade(base, 0.6), sw: (f.mat === "glass" ? 0.06 : 0.025) * strokeScale, layer: "V-DETAIL" });
    }
    if (f.mat === "roof" && style.roof !== "shed") {
      // a few shingle courses on the roof planes
      const zs = f.pts.map((p) => p[2]);
      const z0 = Math.min(...zs), z1 = Math.max(...zs);
      for (let z = z0 + 0.8; z < z1 - 0.2; z += 0.8) {
        const s = slice(f.pts, [0, 0, 1], z);
        if (s) out.push({ t: "line", a: cam.P(s[0]), b: cam.P(s[1]), stroke: shade(base, 0.82), sw: 0.02 * strokeScale, layer: "V-DETAIL" });
      }
    } else if (f.mat === "roof") {
      // standing seams
      const xs = f.pts.map((p) => p[0]);
      for (let x = Math.min(...xs) + 1.5; x < Math.max(...xs); x += 1.5) {
        const s = slice(f.pts, [1, 0, 0], x);
        if (s) out.push({ t: "line", a: cam.P(s[0]), b: cam.P(s[1]), stroke: shade(base, 1.25), sw: 0.025 * strokeScale, layer: "V-DETAIL" });
      }
    }
  }
  return { prims: out, cam };
}

const VIEWS = {
  front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0],
};

function shrub(x, r, color) {
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI * (i / 18);
    const wob = 1 + 0.08 * Math.sin(i * 2.7);
    pts.push([x + r * wob * Math.cos(a), r * 0.85 * wob * Math.sin(a)]);
  }
  return { t: "poly", pts, closed: true, fill: color, stroke: "#4c6b47", sw: 0.03, layer: "V-SITE" };
}

/** One elevation as primitives, with grade, plantings and height marks. */
export function elevationPrimitives(model, style, plan, which) {
  const { prims, cam } = viewPrimitives(model, style, VIEWS[which]);
  const out = [];
  // keep the view's own x direction; the ground line spans the drawing
  const xs = prims.flatMap((p) => (p.t === "poly" ? p.pts.map((q) => q[0]) : []));
  const x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3;
  out.push({ t: "poly", pts: [[x0, -1.2], [x1, -1.2], [x1, 0], [x0, 0]], closed: true, fill: "#e7e3d6", stroke: null, layer: "V-SITE" });
  out.push(...prims);
  // plantings either side of the house front
  const hx0 = Math.min(...xs), hx1 = Math.max(...xs);
  for (const [x, r] of [[hx0 + 1.2, 1.6], [hx1 - 1.2, 1.4], [hx0 - 1.5, 2.2], [hx1 + 1.6, 2.0]]) out.push(shrub(x, r, r > 2 ? "#7d9a74" : "#8fae84"));
  out.push({ t: "line", a: [x0, 0], b: [x1, 0], stroke: "#555", sw: 0.06, layer: "V-SITE" });
  // height marks on the right
  const h = model.h;
  const mx = x1 + 1.5;
  for (const [z, label] of [[h.base, `Floor ${ftIn(h.base)}`], [h.plate, `Plate ${ftIn(h.plate)}`], [h.ridge, `Top of roof ${ftIn(h.ridge)}`]]) {
    out.push({ t: "line", a: [mx - 0.8, z], b: [mx + 0.8, z], stroke: "#666", sw: 0.03, layer: "V-ANNO" });
    out.push({ t: "poly", pts: [[mx - 0.35, z + 0.6], [mx + 0.35, z + 0.6], [mx, z]], closed: true, fill: "#666", stroke: null, layer: "V-ANNO" });
    out.push({ t: "text", p: [mx + 1.1, z - 0.25], s: label, size: 0.8, anchor: "start", fill: "#444", layer: "V-ANNO" });
  }
  return out;
}

/** The axonometric view (front left, from above), with a soft ground shadow. */
export function axonPrimitives(model, style, plan, dir = [-0.62, -1, 0.75]) {
  const { prims, cam } = viewPrimitives(model, style, dir, { strokeScale: 0.8 });
  const sh = [[-1, -1, 0], [plan.W + 1, -1, 0], [plan.W + 3, plan.D + 3, 0], [1, plan.D + 3, 0]].map(cam.P);
  const ground = [[-12, -14, 0], [plan.W + 12, -14, 0], [plan.W + 12, plan.D + 10, 0], [-12, plan.D + 10, 0]].map(cam.P);
  return [
    { t: "poly", pts: ground, closed: true, fill: "#eef0e6", stroke: null, layer: "V-SITE" },
    { t: "poly", pts: sh, closed: true, fill: "#000000", opacity: 0.12, stroke: null, layer: "V-SITE" },
    ...prims,
  ];
}
