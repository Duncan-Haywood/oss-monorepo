// ASCII DXF in and out, for flat parts.
//
// Read: LINE, ARC, CIRCLE, LWPOLYLINE and POLYLINE (with bulges), ELLIPSE,
// SPLINE (control points, rational or not), and INSERT/MINSERT of blocks
// (nested up to 8 deep, with scale, rotation and arrays). Arcs, circles and
// polylines drawn with a (0, 0, -1) extrusion are mirrored into the plan, as
// the Autodesk DXF Reference's arbitrary-axis rule says. Text, dimensions,
// hatches and points are counted and skipped.
//
// Write: R12 entities only (LINE, ARC, CIRCLE), which every cutting CAM reads.

import { IDENTITY, apply, compose, transformEdges, flattenEdge, end } from "./geom.mjs";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const UNITS = { 0: "unitless", 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };

function pairs(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

/** Split the pair list into records, one per entity (each starts with code 0). */
function records(ps, from, to) {
  const out = [];
  let cur = null;
  for (let i = from; i < to; i++) {
    const [c, v] = ps[i];
    if (c === 0) {
      cur = { type: v, g: [] };
      out.push(cur);
    } else if (cur) cur.g.push([c, v]);
  }
  return out;
}

const num = (rec, code, dflt = 0) => {
  for (const [c, v] of rec.g) if (c === code) return parseFloat(v);
  return dflt;
};
const str = (rec, code, dflt = "") => {
  for (const [c, v] of rec.g) if (c === code) return v;
  return dflt;
};
const all = (rec, code) => rec.g.filter(([c]) => c === code).map(([, v]) => parseFloat(v));

/** Edge for a polyline segment from p to q with DXF bulge b (tan of a quarter of the included angle). */
export function bulgeEdge(x1, y1, x2, y2, b) {
  if (!b || Math.abs(b) < 1e-12) return { t: "L", x1, y1, x2, y2 };
  const vx = x2 - x1, vy = y2 - y1;
  const k = (1 - b * b) / (4 * b);
  const cx = x1 + vx / 2 - vy * k, cy = y1 + vy / 2 + vx * k;
  const r = Math.hypot(x1 - cx, y1 - cy);
  return { t: "A", cx, cy, r, a0: Math.atan2(y1 - cy, x1 - cx), sw: 4 * Math.atan(b) };
}

function polyEdges(verts, closed) {
  const out = [];
  const n = verts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    if (a.x === b.x && a.y === b.y) continue;
    out.push(bulgeEdge(a.x, a.y, b.x, b.y, a.b));
  }
  return out;
}

// OCS with extrusion (0, 0, -1): x is mirrored
const MIRROR_X = [-1, 0, 0, 1, 0, 0];
function extrusionFlip(rec) {
  return num(rec, 230, 1) < 0;
}

function deBoor(k, x, t, c, p) {
  const d = [];
  for (let j = 0; j <= p; j++) d.push(c[j + k - p].slice());
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const den = t[j + 1 + k - r] - t[j + k - p];
      const alpha = den === 0 ? 0 : (x - t[j + k - p]) / den;
      for (let q = 0; q < d[j].length; q++) d[j][q] = (1 - alpha) * d[j - 1][q] + alpha * d[j][q];
    }
  }
  return d[p];
}

/** Points along a B-spline (control points, knots, optional weights), refined until midpoints sit within tol of the chords. */
export function splinePoints(ctrl, knots, degree, weights, tol) {
  const p = degree, n = ctrl.length;
  if (n < 2 || knots.length !== n + p + 1) return ctrl.map((c) => [c[0], c[1]]);
  const w = weights && weights.length === n ? weights : null;
  const C = ctrl.map((c, i) => (w ? [c[0] * w[i], c[1] * w[i], w[i]] : [c[0], c[1], 1]));
  const t0 = knots[p], t1 = knots[n];
  const at = (x) => {
    let k = p;
    while (k < n - 1 && x >= knots[k + 1]) k++;
    const v = deBoor(k, x, knots, C, p);
    return [v[0] / v[2], v[1] / v[2]];
  };
  const pts = [at(t0)];
  const spans = [];
  for (let i = p; i < n; i++) if (knots[i + 1] > knots[i]) spans.push([knots[i], knots[i + 1]]);
  const refine = (a, b, pa, pb, depth) => {
    const m = (a + b) / 2, pm = at(m);
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy);
    const dev = L === 0 ? Math.hypot(pm[0] - pa[0], pm[1] - pa[1]) : Math.abs(dx * (pm[1] - pa[1]) - dy * (pm[0] - pa[0])) / L;
    if (depth < 14 && (dev > tol / 2 || depth < 2)) {
      refine(a, m, pa, pm, depth + 1);
      refine(m, b, pm, pb, depth + 1);
    } else pts.push(pb);
  };
  for (const [a, b] of spans) refine(a, b, pts[pts.length - 1], at(b), 0);
  return pts;
}

function linesThrough(pts, closed) {
  const out = [];
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    out.push({ t: "L", x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
  }
  return out;
}

/**
 * Parse an ASCII DXF into edges in drawing units.
 * @returns {{ edges: object[], units: string, insunits: number, skipped: Record<string, number>, layers: string[], warnings: string[] }}
 */
export function parseDxf(text, { tol = 0.01, skipLayers = null } = {}) {
  const warnings = [];
  if (typeof text !== "string") text = "";
  if (text.startsWith("AutoCAD Binary DXF")) {
    return { edges: [], units: "unitless", insunits: 0, skipped: {}, layers: [], warnings: ["This is a binary DXF. Save it from your CAD program as an ASCII DXF and load that."] };
  }
  const ps = pairs(text);
  let insunits = 0;
  for (let i = 0; i + 1 < ps.length; i++) if (ps[i][0] === 9 && ps[i][1] === "$INSUNITS") insunits = parseInt(ps[i + 1][1], 10) || 0;
  // find sections
  const sections = {};
  for (let i = 0; i + 1 < ps.length; i++) {
    if (ps[i][0] === 0 && ps[i][1] === "SECTION" && ps[i + 1][0] === 2) {
      let j = i + 2;
      while (j < ps.length && !(ps[j][0] === 0 && ps[j][1] === "ENDSEC")) j++;
      sections[ps[i + 1][1]] = [i + 2, j];
      i = j;
    }
  }
  // no sections at all: treat the whole file as entities (some exporters write bare entity lists)
  if (!sections.ENTITIES && !sections.BLOCKS) sections.ENTITIES = [0, ps.length];
  const blocks = {};
  if (sections.BLOCKS) {
    const recs = records(ps, ...sections.BLOCKS);
    let cur = null;
    for (const r of recs) {
      if (r.type === "BLOCK") cur = { name: str(r, 2), bx: num(r, 10), by: num(r, 20), ents: [] };
      else if (r.type === "ENDBLK") {
        if (cur) blocks[cur.name] = cur;
        cur = null;
      } else if (cur) cur.ents.push(r);
    }
  }
  const skipped = {};
  const layers = new Set();
  const edges = [];
  const skipRe = skipLayers ? new RegExp(skipLayers, "i") : null;

  const emit = (es, m) => {
    for (const e of transformEdges(es, m, tol)) edges.push(e);
  };

  function walk(recs, m, depth) {
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      const layer = str(r, 8, "0");
      if (r.type !== "VERTEX" && r.type !== "SEQEND") layers.add(layer);
      if (skipRe && skipRe.test(layer) && r.type !== "VERTEX" && r.type !== "SEQEND") {
        skipped["layer " + layer] = (skipped["layer " + layer] || 0) + 1;
        if (r.type === "POLYLINE") while (i + 1 < recs.length && recs[i + 1].type !== "SEQEND") i++;
        continue;
      }
      const flip = extrusionFlip(r);
      const mm = flip ? compose(m, MIRROR_X) : m;
      switch (r.type) {
        case "LINE":
          emit([{ t: "L", x1: num(r, 10), y1: num(r, 20), x2: num(r, 11), y2: num(r, 21) }], m);
          break;
        case "CIRCLE":
          emit([{ t: "A", cx: num(r, 10), cy: num(r, 20), r: num(r, 40), a0: 0, sw: TAU }], mm);
          break;
        case "ARC": {
          const a0 = num(r, 50) * DEG;
          let a1 = num(r, 51) * DEG;
          while (a1 <= a0) a1 += TAU;
          emit([{ t: "A", cx: num(r, 10), cy: num(r, 20), r: num(r, 40), a0, sw: a1 - a0 }], mm);
          break;
        }
        case "LWPOLYLINE": {
          const verts = [];
          for (const [c, v] of r.g) {
            if (c === 10) verts.push({ x: parseFloat(v), y: 0, b: 0 });
            else if (c === 20 && verts.length) verts[verts.length - 1].y = parseFloat(v);
            else if (c === 42 && verts.length) verts[verts.length - 1].b = parseFloat(v);
          }
          emit(polyEdges(verts, (num(r, 70) & 1) === 1), mm);
          break;
        }
        case "POLYLINE": {
          const flags = num(r, 70);
          const verts = [];
          while (i + 1 < recs.length && recs[i + 1].type === "VERTEX") {
            i++;
            const v = recs[i];
            verts.push({ x: num(v, 10), y: num(v, 20), b: num(v, 42) });
          }
          if (i + 1 < recs.length && recs[i + 1].type === "SEQEND") i++;
          if (flags & (16 | 64)) {
            skipped["3D mesh POLYLINE"] = (skipped["3D mesh POLYLINE"] || 0) + 1;
            break;
          }
          emit(polyEdges(verts, (flags & 1) === 1), mm);
          break;
        }
        case "ELLIPSE": {
          const cx = num(r, 10), cy = num(r, 20), mx = num(r, 11), my = num(r, 21), ratio = num(r, 40, 1);
          let t0 = num(r, 41, 0), t1 = num(r, 42, TAU);
          while (t1 <= t0) t1 += TAU;
          const R = Math.hypot(mx, my);
          const n = Math.max(8, Math.ceil((t1 - t0) / (2 * Math.acos(Math.max(-1, 1 - tol / Math.max(R, tol))))));
          const pts = [];
          for (let k = 0; k <= n; k++) {
            const t = t0 + ((t1 - t0) * k) / n;
            pts.push([cx + Math.cos(t) * mx - Math.sin(t) * ratio * my, cy + Math.cos(t) * my + Math.sin(t) * ratio * mx]);
          }
          const full = Math.abs(t1 - t0 - TAU) < 1e-9;
          if (full) pts.pop();
          emit(linesThrough(pts, full), mm);
          break;
        }
        case "SPLINE": {
          const flags = num(r, 70), degree = num(r, 71, 3);
          const knots = all(r, 40), weights = all(r, 41);
          const xs = all(r, 10), ys = all(r, 20), fx = all(r, 11), fy = all(r, 21);
          let pts;
          if (xs.length >= 2) pts = splinePoints(xs.map((x, k) => [x, ys[k]]), knots, degree, weights.length ? weights : null, tol);
          else if (fx.length >= 2) {
            pts = fx.map((x, k) => [x, fy[k]]);
            warnings.push("A SPLINE defined only by fit points was joined with straight lines between them.");
          } else break;
          const closed = (flags & 1) === 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 1e-9;
          emit(linesThrough(pts, closed), mm);
          break;
        }
        case "INSERT": {
          const b = blocks[str(r, 2)];
          if (!b) {
            skipped["INSERT of a missing block"] = (skipped["INSERT of a missing block"] || 0) + 1;
            break;
          }
          if (depth >= 8) {
            warnings.push("Blocks nested more than 8 deep were not expanded.");
            break;
          }
          const sx = num(r, 41, 1), sy = num(r, 42, 1), rot = num(r, 50) * DEG;
          const cols = Math.max(1, num(r, 70, 1)), rows = Math.max(1, num(r, 71, 1));
          const dc = num(r, 44), dr = num(r, 45);
          const c = Math.cos(rot), s = Math.sin(rot);
          for (let ri = 0; ri < rows; ri++) for (let ci = 0; ci < cols; ci++) {
            // array offsets run along the rotated axes
            const ox = ci * dc, oy = ri * dr;
            const ix = num(r, 10) + c * ox - s * oy, iy = num(r, 20) + s * ox + c * oy;
            const local = [c * sx, s * sx, -s * sy, c * sy, 0, 0];
            const [bx, by] = apply(local, b.bx, b.by);
            let ins = [local[0], local[1], local[2], local[3], ix - bx, iy - by];
            if (flip) ins = compose(MIRROR_X, ins);
            walk(b.ents, compose(m, ins), depth + 1);
          }
          break;
        }
        case "VERTEX":
        case "SEQEND":
          break;
        default:
          skipped[r.type] = (skipped[r.type] || 0) + 1;
      }
    }
  }
  if (sections.ENTITIES) walk(records(ps, ...sections.ENTITIES), IDENTITY, 0);
  else warnings.push("No ENTITIES section was found.");
  if (!edges.length) warnings.push("No lines, arcs, circles, polylines, ellipses or splines were found.");
  return { edges, units: UNITS[insunits] || "unitless", insunits, skipped, layers: [...layers], warnings };
}

// ---- writing ------------------------------------------------------------------

const f = (x) => {
  const v = Math.abs(x) < 1e-9 ? 0 : x;
  return String(Math.round(v * 1e6) / 1e6);
};

function entity(e, layer) {
  if (e.t === "L") return `0\nLINE\n8\n${layer}\n10\n${f(e.x1)}\n20\n${f(e.y1)}\n30\n0\n11\n${f(e.x2)}\n21\n${f(e.y2)}\n31\n0\n`;
  if (Math.abs(Math.abs(e.sw) - TAU) < 1e-9) return `0\nCIRCLE\n8\n${layer}\n10\n${f(e.cx)}\n20\n${f(e.cy)}\n30\n0\n40\n${f(e.r)}\n`;
  // DXF arcs run counter-clockwise from the start angle to the end angle
  const a = e.sw > 0 ? e.a0 : e.a0 + e.sw, b = a + Math.abs(e.sw);
  const deg = (x) => {
    let d = (x / DEG) % 360;
    if (d < 0) d += 360;
    return f(d);
  };
  return `0\nARC\n8\n${layer}\n10\n${f(e.cx)}\n20\n${f(e.cy)}\n30\n0\n40\n${f(e.r)}\n50\n${deg(a)}\n51\n${deg(b)}\n`;
}

/**
 * An R12 DXF: [{ edges, layer }] groups. `insunits` is written to the header
 * so CAM opens it at the right scale.
 */
export function writeDxf(groups, insunits = 0) {
  let s = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${insunits}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
  for (const g of groups) for (const e of g.edges) s += entity(e, g.layer || "0");
  return s + "0\nENDSEC\n0\nEOF\n";
}

/** Points along an edge list for previews (polyline, both ends). */
export function previewPoints(edges, tol) {
  const pts = [];
  for (const e of edges) for (const p of flattenEdge(e, tol)) pts.push(p);
  if (edges.length) pts.push(end(edges[edges.length - 1]));
  return pts;
}
