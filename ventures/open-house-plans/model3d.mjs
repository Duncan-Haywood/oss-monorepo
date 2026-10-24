// @ts-check
// The house as a 3D model: convex solids with materials, in feet, x along
// the front, y toward the back, z up from grade. One model feeds the OBJ
// export, the IFC export, the axonometric view and the four elevations, so
// the drawings and the files agree.

import { T_EXT, T_INT } from "./layout.mjs";
import { bbox } from "./geom.mjs";

// --- vector helpers ---
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function faceNormal(pts) {
  // Newell's method
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return norm(n);
}
export const centre = (pts) => mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);

/**
 * A convex prism: polygon `base` (3D points, planar) swept by vector `d`.
 * Faces are oriented outward. faceMat(i) may give per-face materials:
 * 'base', 'top' and 'side'.
 */
export function prism(base, d, mats) {
  const top = base.map((p) => add(p, d));
  const faces = [{ pts: base.slice(), role: "base" }, { pts: top.slice(), role: "top" }];
  for (let i = 0; i < base.length; i++) {
    const j = (i + 1) % base.length;
    faces.push({ pts: [base[i], base[j], top[j], top[i]], role: "side", edge: i });
  }
  const c = centre([...base, ...top]);
  for (const f of faces) {
    const n = faceNormal(f.pts);
    if (dot(n, sub(centre(f.pts), c)) < 0) f.pts.reverse();
    f.n = faceNormal(f.pts);
    f.mat = typeof mats === "string" ? mats : mats[f.role] ?? mats.side;
  }
  return faces;
}

export function box(x0, y0, z0, x1, y1, z1, mats) {
  return prism([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, z1 - z0], mats);
}

// --- the model ---

export function heights(plan, brief, style) {
  const base = brief.foundation === "crawl" ? 2.5 : 0.67; // top of floor above grade
  const ceiling = plan.ceiling;
  const plate = base + ceiling + 0.33; // ceiling plus framing above it
  const roofT = 0.6;
  const p = style.pitch / 12;
  let ridge;
  if (style.roof === "shed") ridge = plate + plan.D * p;
  else if (style.roof === "hip") ridge = plate + (Math.min(plan.W, plan.D) / 2) * p;
  else ridge = plate + (plan.D / 2) * p;
  return { base, ceiling, plate, ridge: ridge + roofT, roofT, pitch: p };
}

/** Wall pieces around openings: boxes in wall-local (s along, t across) coordinates. */
function wallPieces(len, z0, z1, ops) {
  // ops: [{ s0, s1, zs, zh }] opening extents along the wall and in height
  const out = [];
  const sorted = ops.slice().sort((a, b) => a.s0 - b.s0);
  let s = 0;
  for (const o of sorted) {
    if (o.s0 > s + 1e-6) out.push([s, o.s0, z0, z1]);
    if (o.zs > z0 + 1e-6) out.push([o.s0, o.s1, z0, o.zs]);
    if (o.zh < z1 - 1e-6) out.push([o.s0, o.s1, o.zh, z1]);
    s = Math.max(s, o.s1);
  }
  if (len > s + 1e-6) out.push([s, len, z0, z1]);
  return out;
}

/**
 * Build the model. Returns { elements, h } where each element is
 * { kind, name, mat, faces, ref } and kind is one of: foundation, wall,
 * partition, gable, roof, window, door, glass, trim, porch, post, step.
 */
export function buildModel(plan, brief, style) {
  const h = heights(plan, brief, style);
  const els = [];
  const E = (kind, name, faces, extra = {}) => els.push({ kind, name, faces, ...extra });
  const { W, D } = plan;
  const t = T_EXT;
  // foundation / floor
  E("foundation", "Foundation and floor", box(0, 0, 0, W, D, h.base, "foundation"));
  // exterior walls: front (y=0), back (y=D), left (x=0), right (x=W)
  const wallsById = new Map(plan.walls.map((w) => [w.id, w]));
  const opsOn = (w) => plan.openings.filter((o) => o.wall === w.id);
  const sides = [
    { name: "front", dir: "h", c: 0, P: (s, tt, z) => [s, tt, z], len: W, inward: 1 },
    { name: "back", dir: "h", c: D, P: (s, tt, z) => [s, D - tt, z], len: W, inward: -1 },
    { name: "left", dir: "v", c: 0, P: (s, tt, z) => [tt, s, z], len: D, inward: 1 },
    { name: "right", dir: "v", c: W, P: (s, tt, z) => [W - tt, s, z], len: D, inward: -1 },
  ];
  const zOf = (o) => (o.kind === "window" ? [h.base + o.sill, h.base + o.sill + o.height] : [h.base, h.base + o.height]);
  for (const sd of sides) {
    const ws = plan.walls.filter((w) => w.type === "ext" && w.dir === sd.dir && Math.abs(w.c - sd.c) < 1e-6);
    const ops = ws.flatMap(opsOn).map((o) => { const [zs, zh] = zOf(o); return { o, s0: o.pos - o.width / 2, s1: o.pos + o.width / 2, zs, zh }; });
    // corners: front and back walls run full length; side walls fit between them
    const s0 = sd.dir === "v" ? t : 0, s1 = sd.dir === "v" ? D - t : sd.len;
    const pieces = wallPieces(sd.len, h.base, h.plate, ops).map(([a, b, za, zb]) => [Math.max(a, s0), Math.min(b, s1), za, zb]).filter(([a, b]) => b - a > 1e-6);
    for (const [a, b, za, zb] of pieces) {
      const q = [sd.P(a, 0, za), sd.P(b, 0, za), sd.P(b, t, za), sd.P(a, t, za)];
      E("wall", `Exterior wall (${sd.name})`, prism(q, [0, 0, zb - za], { side: "wall", base: "wall", top: "wall" }), { side: sd.name });
    }
    // openings: glass or door leaf, trim and sill
    for (const { o, s0: a, s1: b, zs, zh } of ops) {
      const inset = 0.25;
      const fillMat = o.kind === "window" || o.kind === "slider" ? "glass" : o.kind === "garage" ? "garagedoor" : "door";
      const leaf = [sd.P(a, inset, zs), sd.P(b, inset, zs), sd.P(b, inset + 0.12, zs), sd.P(a, inset + 0.12, zs)];
      const deco = [];
      const L = (s1, z1, s2, z2) => deco.push([sd.P(s1, inset - 0.01, z1), sd.P(s2, inset - 0.01, z2)]);
      if (o.kind === "window") {
        const g = style.window.grille;
        const mid = (zs + zh) / 2;
        if (o.over === "sink" || o.obscure) { /* plain */ } else if (g === "3-over-1") {
          L(a, mid, b, mid);
          for (const k of [1, 2]) L(a + ((b - a) * k) / 3, mid, a + ((b - a) * k) / 3, zh);
        } else if (g === "colonial") {
          L(a, mid, b, mid);
          L((a + b) / 2, zs, (a + b) / 2, zh);
          for (const zz of [(zs + mid) / 2, (mid + zh) / 2]) L(a, zz, b, zz);
        } else if (style.window.pair === false && b - a >= 4) {
          L((a + b) / 2, zs, (a + b) / 2, zh);
        }
      } else if (o.kind === "garage") {
        for (let z = zs + 1.75; z < zh - 0.2; z += 1.75) L(a, z, b, z);
      } else if (o.kind === "slider") {
        L((a + b) / 2, zs, (a + b) / 2, zh);
      } else {
        // a six-panel door, or a door with a lite on top for the entry
        const m = 0.35;
        const panel = (s1, z1, s2, z2) => { L(s1, z1, s2, z1); L(s2, z1, s2, z2); L(s2, z2, s1, z2); L(s1, z2, s1, z1); };
        const cut = zs + (zh - zs) * 0.62;
        panel(a + m, zs + m, b - m, cut - m / 2);
        panel(a + m, cut + m / 2, b - m, zh - m);
      }
      E(fillMat === "glass" ? "glass" : "door", o.kind === "window" ? "Window" : o.kind === "garage" ? "Garage door" : o.kind === "slider" ? "Sliding door" : "Door",
        prism(leaf, [0, 0, zh - zs], fillMat).map((f) => ({ ...f, deco: f.role === "side" && f.edge === 0 ? deco : undefined })), { opening: o.id, side: sd.name });
      // trim: jambs, head and sill on the outside face
      const tw = 0.33, tp = 0.08;
      const head = style.label === "Craftsman bungalow" ? 0.55 : tw;
      const trim = [];
      trim.push([a - tw, b + tw, zh, zh + head]);
      trim.push([a - tw, a, o.kind === "window" ? zs : h.base, zh]);
      trim.push([b, b + tw, o.kind === "window" ? zs : h.base, zh]);
      if (o.kind === "window") trim.push([a - tw - 0.08, b + tw + 0.08, zs - 0.18, zs]);
      for (const [p, q, za, zb] of trim) {
        const quad = [sd.P(p, -tp, za), sd.P(q, -tp, za), sd.P(q, 0, za), sd.P(p, 0, za)];
        E("trim", "Trim", prism(quad, [0, 0, zb - za], "trim"));
      }
    }
  }
  // roof and gable ends
  const r = style.roof;
  const e = style.eave, rk = style.rake, T = h.roofT, p = h.pitch;
  const zAt = (dist) => h.plate + dist * p; // roof underside height at a horizontal distance in from the wall line
  const roofPrism = (top, name) => E("roof", name, prism(top.map(([x, y, z]) => [x, y, z]), [0, 0, -T], { top: "roof", base: "soffit", side: "trim" }));
  if (r === "gable") {
    const zr = zAt(D / 2) + T;
    roofPrism([[-rk, -e, zAt(-e) + T], [W + rk, -e, zAt(-e) + T], [W + rk, D / 2, zr], [-rk, D / 2, zr]], "Roof (front)");
    roofPrism([[-rk, D / 2, zr], [W + rk, D / 2, zr], [W + rk, D + e, zAt(-e) + T], [-rk, D + e, zAt(-e) + T]], "Roof (back)");
    for (const [x0, name] of [[0, "left"], [W - t, "right"]]) {
      const tri = [[x0, 0, h.plate], [x0, D, h.plate], [x0, D / 2, zAt(D / 2)]];
      E("gable", `Gable (${name})`, prism(tri, [t, 0, 0], "wall"), { side: name });
    }
  } else if (r === "hip") {
    const zr = zAt(Math.min(W, D) / 2) + T;
    const z0 = zAt(-e) + T;
    if (W >= D) {
      const a = D / 2, b = W - D / 2;
      roofPrism([[-e, -e, z0], [W + e, -e, z0], [b, D / 2, zr], [a, D / 2, zr]], "Roof (front)");
      roofPrism([[a, D / 2, zr], [b, D / 2, zr], [W + e, D + e, z0], [-e, D + e, z0]], "Roof (back)");
      roofPrism([[-e, -e, z0], [a, D / 2, zr], [-e, D + e, z0]], "Roof (left hip)");
      roofPrism([[W + e, -e, z0], [W + e, D + e, z0], [b, D / 2, zr]], "Roof (right hip)");
    } else {
      const a = W / 2, b = D - W / 2;
      roofPrism([[-e, -e, z0], [W + e, -e, z0], [W / 2, a, zr]], "Roof (front hip)");
      roofPrism([[W + e, -e, z0], [W + e, D + e, z0], [W / 2, b, zr], [W / 2, a, zr]], "Roof (right)");
      roofPrism([[W + e, D + e, z0], [-e, D + e, z0], [W / 2, b, zr]], "Roof (back hip)");
      roofPrism([[-e, D + e, z0], [-e, -e, z0], [W / 2, a, zr], [W / 2, b, zr]], "Roof (left)");
    }
  } else {
    // shed: high at the front, so the front wall rises to meet it
    const zf = zAt(D) + T, zb = h.plate + T;
    const s = p;
    roofPrism([[-rk, -e, zf + e * s], [W + rk, -e, zf + e * s], [W + rk, D + e, zb - e * s], [-rk, D + e, zb - e * s]], "Roof");
    const zt = zAt(D);
    // a band of clerestory glass over the great room, under the high eave
    const pub = plan.zones.find((z) => z.kind === "public");
    const band = zt - h.plate;
    const cl = [];
    if (pub && band >= 2.5) {
      const gh = Math.min(2.5, band - 1);
      const zs = h.plate + (band - gh) / 2;
      const n = Math.max(1, Math.floor((pub.x1 - pub.x0 - 2) / 4));
      const span = n * 4 - 0.5;
      const a0 = (pub.x0 + pub.x1) / 2 - span / 2;
      for (let i = 0; i < n; i++) cl.push({ s0: a0 + i * 4, s1: a0 + i * 4 + 3.5, zs, zh: zs + gh });
    }
    for (const [a, b, za, zb] of wallPieces(W, h.plate, zt, cl)) E("gable", "Clerestory wall (front)", box(a, 0, za, b, t, zb, "wall"), { side: "front" });
    for (const c of cl) {
      E("glass", "Clerestory window", box(c.s0, 0.25, c.zs, c.s1, 0.37, c.zh, "glass"), { side: "front" });
      E("trim", "Trim", box(c.s0 - 0.25, -0.08, c.zs - 0.15, c.s1 + 0.25, 0, c.zs, "trim"));
      E("trim", "Trim", box(c.s0 - 0.25, -0.08, c.zh, c.s1 + 0.25, 0, c.zh + 0.25, "trim"));
    }
    for (const [x0, name] of [[0, "left"], [W - t, "right"]]) {
      const tri = [[x0, 0, h.plate], [x0, D, h.plate], [x0, 0, zt]];
      E("gable", `Side wall top (${name})`, prism(tri, [t, 0, 0], "wall"), { side: name });
    }
  }
  // porch
  if (plan.porch) {
    const po = plan.porch;
    const ps = style.porch || { roof: "shed", pitch: 3, post: 0.5 };
    const d = po.d;
    E("porch", "Porch deck", box(po.x0, -d, 0, po.x1, 0, h.base - 0.08, "porch"));
    E("step", "Step", box((po.x0 + po.x1) / 2 - 2.5, -d - 1, 0, (po.x0 + po.x1) / 2 + 2.5, -d, Math.max(0.2, h.base / 2 - 0.08), "porch"));
    // the porch roof starts where the main roof leaves the wall and falls at a lower pitch
    const beamBottomMin = h.base + 7.5;
    const attach = h.plate;
    let pp = Math.min(ps.roof === "gable" ? 0 : ps.pitch, 12 * (attach - beamBottomMin - 0.75) / (d + 0.5));
    pp = Math.max(1, pp);
    const zEdge = attach - ((d + 0.5) * pp) / 12;
    const beamTop = ps.roof === "gable" ? Math.max(beamBottomMin + 0.75, h.plate - 0.2) : zEdge;
    const post = ps.post;
    const n = Math.max(2, Math.round(po.w / 8) + 1);
    for (let i = 0; i < n; i++) {
      const x = po.x0 + 0.5 + (i * (po.w - 1)) / (n - 1);
      const pw = post > 1 ? 0.75 : post;
      if (post > 1) E("post", "Column base", box(x - post / 2, -d + 0.2, h.base - 0.08, x + post / 2, -d + 0.2 + post, h.base + 3, "trim"));
      E("post", "Post", box(x - pw / 2, -d + 0.2 + (post - pw) / 2, h.base - 0.08, x + pw / 2, -d + 0.2 + (post + pw) / 2, beamTop - 0.75, "trim"));
    }
    E("trim", "Porch beam", box(po.x0, -d, beamTop - 0.75, po.x1, -d + 0.75, beamTop, "trim"));
    if (ps.roof === "gable") {
      const xc = (po.x0 + po.x1) / 2, half = po.w / 2 + 0.5;
      const gp = style.pitch / 12;
      const zr = beamTop + half * gp;
      E("roof", "Porch roof (left)", prism([[po.x0 - 0.5, -d - 0.75, beamTop + T], [xc, -d - 0.75, zr + T], [xc, 0, zr + T], [po.x0 - 0.5, 0, beamTop + T]], [0, 0, -T], { top: "roof", base: "soffit", side: "trim" }));
      E("roof", "Porch roof (right)", prism([[xc, -d - 0.75, zr + T], [po.x1 + 0.5, -d - 0.75, beamTop + T], [po.x1 + 0.5, 0, beamTop + T], [xc, 0, zr + T]], [0, 0, -T], { top: "roof", base: "soffit", side: "trim" }));
      E("gable", "Porch gable", prism([[po.x0, -d, beamTop], [po.x1, -d, beamTop], [xc, -d, zr]], [0, 0.4, 0], "trim"));
    } else {
      E("roof", "Porch roof", prism([[po.x0 - 0.5, -d - 0.5, zEdge + T], [po.x1 + 0.5, -d - 0.5, zEdge + T], [po.x1 + 0.5, 0, attach + T], [po.x0 - 0.5, 0, attach + T]], [0, 0, -T], { top: "roof", base: "soffit", side: "trim" }));
    }
  } else {
    // a stoop at the entry, under a flat canopy
    const entry = plan.openings.find((o) => o.kind === "entry");
    E("step", "Stoop", box(entry.pos - 2.5, -4, 0, entry.pos + 2.5, 0, h.base - 0.08, "porch"));
    const zc = h.base + entry.height + 0.9;
    E("roof", "Entry canopy", box(entry.pos - 3, -4, zc, entry.pos + 3, 0, zc + 0.45, { top: "roof", base: "soffit", side: "trim" }));
  }
  // partitions (inside; the OBJ and IFC carry them, the views do not)
  for (const w of plan.walls) {
    if (w.type !== "int" && w.type !== "fire") continue;
    const ops = opsOn(w).map((o) => ({ s0: o.pos - o.width / 2 - w.a, s1: o.pos + o.width / 2 - w.a, zs: h.base, zh: h.base + Math.min(o.height, h.ceiling - 0.5) }));
    for (const [a, b, za, zb] of wallPieces(w.b - w.a, h.base, h.base + h.ceiling, ops)) {
      const A = w.a + a, B = w.a + b, lo = w.c - T_INT / 2, hi = w.c + T_INT / 2;
      const f = w.dir === "h" ? box(A, lo, za, B, hi, zb, "partition") : box(lo, A, za, hi, B, zb, "partition");
      E("partition", w.type === "fire" ? "Garage separation wall" : "Partition", f, { wall: w.id });
    }
  }
  return { elements: els, h };
}

export const MATERIAL_NAMES = ["foundation", "wall", "trim", "roof", "soffit", "glass", "door", "garagedoor", "porch", "partition"];

export function materialColors(style) {
  const c = style.colors;
  return {
    foundation: "#9b9993", wall: c.wall, trim: c.trim, roof: c.roof, soffit: c.trim, glass: "#4d6a80",
    door: c.door, garagedoor: c.trim === "#1d1f22" ? "#4a4d52" : "#f3f1ec", porch: c.porch, partition: "#e9e6df",
  };
}

/** Wavefront OBJ (+ MTL) in metres. */
export function toOBJ(model, style, name = "house") {
  const colors = materialColors(style);
  const M = 0.3048;
  const v = [];
  const lines = [`# ${name}: generated by Open House Plans (CC0 1.0). Units: metres. Not for construction.`, `mtllib ${name}.mtl`];
  let vi = 1;
  for (const el of model.elements) {
    lines.push(`o ${el.kind}_${vi}`);
    let mat = null;
    for (const f of el.faces) {
      if (f.mat !== mat) { lines.push(`usemtl ${f.mat}`); mat = f.mat; }
      const idx = [];
      for (const [x, y, z] of f.pts) {
        // OBJ convention: y up. Model x -> x, z -> y, y -> -z (front faces +z).
        lines.push(`v ${(x * M).toFixed(4)} ${(z * M).toFixed(4)} ${(-y * M).toFixed(4)}`);
        idx.push(vi++);
      }
      lines.push(`f ${idx.join(" ")}`);
    }
  }
  const mtl = [`# Materials for ${name}`];
  for (const [k, hex] of Object.entries(colors)) {
    const n = parseInt(hex.slice(1), 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (c / 255).toFixed(3)).join(" ");
    mtl.push(`newmtl ${k}`, `Kd ${rgb}`, `Ka 0 0 0`, `d ${k === "glass" ? "0.6" : "1.0"}`, "illum 1", "");
  }
  return { obj: lines.join("\n") + "\n", mtl: mtl.join("\n") + "\n" };
}
