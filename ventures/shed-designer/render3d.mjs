// @ts-check
// A small WebGL viewer for the framed shed: every board is its own extruded
// profile with real dimensions, lit with two lights and outlined so you can
// count studs. No library; drag to orbit, right- or Shift-drag (two fingers on a phone) to pan, wheel, pinch or buttons to zoom,
// arrow keys and +/- when the canvas has focus.

import { paletteOf, PAINTS, SHINGLE_FAMILIES, TRIM_FINISHES } from './looks.mjs';

/** @typedef {import('./model.mjs').Geom} Geom */
/** @typedef {{ geom: Geom, color: [number, number, number], layer: string, flags?: number, id?: string }} Solid */

const COLORS = {
  pt: [0.71, 0.77, 0.58], framing: [0.9, 0.79, 0.57], header: [0.85, 0.66, 0.38], floor: [0.83, 0.7, 0.47],
  osb: [0.79, 0.65, 0.43], siding: [0.64, 0.36, 0.27], shingles: [0.3, 0.32, 0.35], door: [0.42, 0.29, 0.17],
  window: [0.62, 0.78, 0.9], vent: [0.88, 0.88, 0.86], gravel: [0.74, 0.71, 0.66], block: [0.6, 0.6, 0.6],
  lining: [1.0, 0.78, 0.88], rug: [0.98, 0.55, 0.78], beanbag: [0.58, 0.32, 0.8], poster: [1, 1, 1],
  'bulb-0': [1.0, 0.95, 0.6], 'bulb-1': [1.0, 0.5, 0.8], 'bulb-2': [0.6, 0.85, 1.0], 'bulb-3': [0.75, 1.0, 0.7],
};

const HEAT_NONE = [0.82, 0.82, 0.82];

/**
 * The framing member a ray first hits, as {id, t}, or null: the ray from o
 * along dir against every face of each member's extruded profile.
 * @param {{ id: string, geom: Geom }[]} members
 * @param {number[]} o @param {number[]} dir
 */
export function pickMember(members, o, dir) {
  let best = null;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // Moller-Trumbore ray-triangle intersection.
  const hit = (a, b, c) => {
    const e1 = sub(b, a); const e2 = sub(c, a);
    const p = cross(dir, e2); const det = dot(e1, p);
    if (Math.abs(det) < 1e-12) return Infinity;
    const s = sub(o, a); const u = dot(s, p) / det;
    if (u < 0 || u > 1) return Infinity;
    const q = cross(s, e1); const v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) return Infinity;
    const t = dot(e2, q) / det;
    return t > 1e-6 ? t : Infinity;
  };
  for (const m of members) {
    const g = m.geom;
    const { pts: pr, tris } = triangulate(g.profile);
    const front = pr.map((p) => world(g, p, 0)); const back = pr.map((p) => world(g, p, g.thickness));
    let t = Infinity;
    for (const [a, b, c] of tris) t = Math.min(t, hit(front[a], front[b], front[c]), hit(back[a], back[b], back[c]));
    for (let i = 0; i < pr.length; i++) {
      const j = (i + 1) % pr.length;
      t = Math.min(t, hit(front[i], front[j], back[j]), hit(front[i], back[j], back[i]));
    }
    if (t < Infinity && (!best || t < best.t)) best = { id: m.id, t };
  }
  return best;
}

/** Paint colours by name (the full lists, with labels, are in looks.mjs). */
export const SIDING_COLORS = { natural: [0.64, 0.36, 0.27], ...Object.fromEntries(Object.entries(PAINTS).map(([k, v]) => [k, v.rgb])) };
export const ROOF_COLORS = Object.fromEntries(Object.entries(SHINGLE_FAMILIES).map(([k, v]) => [k, v.rgb]));
export const TRIM_COLORS = Object.fromEntries(Object.entries(TRIM_FINISHES).map(([k, v]) => [k, v.rgb]));

/**
 * Finish flags carried in the colour's fourth component, added together:
 * 1 polka dots, 2 glitter, 4 lap siding, 8 board and batten, 16 metal ribs,
 * 32 asphalt shingle courses, 64 T1-11 grooves. A shingle face's colour blend
 * (0 to 0.5) rides in the fraction.
 */
export const FINISH = { dots: 1, glitter: 2, lap: 4, batten: 8, metal: 16, shingle: 32, grooves: 64 };

/** Signed area of a 2D polygon. @param {[number, number][]} pts */
function area2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Ear-clipping triangulation of a simple polygon. Returns index triples.
 * @param {[number, number][]} input
 */
export function triangulate(input) {
  // Drop repeated and collinear points; they make zero-area ears.
  let pts = input.filter((p, i) => {
    const q = input[(i + input.length - 1) % input.length];
    return Math.abs(p[0] - q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9;
  });
  const idx = pts.map((_, i) => i);
  const ccw = area2(pts) > 0;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => {
    const d1 = cross(a, b, p); const d2 = cross(b, c, p); const d3 = cross(c, a, p);
    const hasNeg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
    const hasPos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
    return !(hasNeg && hasPos);
  };
  /** @type {[number, number, number][]} */
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const c = cross(pts[ia], pts[ib], pts[ic]);
      if (Math.abs(c) < 1e-12) { idx.splice(i, 1); clipped = true; break; }
      if (ccw ? c < 0 : c > 0) continue;
      let ear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(pts[j], pts[ia], pts[ib], pts[ic])) { ear = false; break; }
      }
      if (!ear) continue;
      tris.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return { pts, tris };
}

/** World point of profile point p at depth t. */
function world(g, p, t) {
  return [
    g.origin[0] + p[0] * g.u[0] + p[1] * g.v[0] + t * g.w[0],
    g.origin[1] + p[0] * g.u[1] + p[1] * g.v[1] + t * g.w[1],
    g.origin[2] + p[0] * g.u[2] + p[1] * g.v[2] + t * g.w[2],
  ];
}

/**
 * Triangles and outline segments for a list of solids.
 * @param {Solid[]} solids
 */
export function meshOf(solids) {
  const pos = []; const nor = []; const col = []; const lines = [];
  let flags = 0;
  const tri = (a, b, c, color) => {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(color[0], color[1], color[2], flags); }
  };
  for (const s of solids) {
    const g = s.geom;
    flags = s.flags || 0;
    const { pts, tris } = triangulate(g.profile);
    const front = pts.map((p) => world(g, p, 0));
    const back = pts.map((p) => world(g, p, g.thickness));
    for (const [a, b, c] of tris) { tri(front[a], front[b], front[c], s.color); tri(back[a], back[c], back[b], s.color); }
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      tri(front[i], front[j], back[j], s.color); tri(front[i], back[j], back[i], s.color);
      lines.push(...front[i], ...front[j], ...back[i], ...back[j], ...front[i], ...back[i]);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), lines: new Float32Array(lines) };
}

const layerOf = (m) => (m.group === 'foundation' ? 'foundation' : m.group === 'floor' ? 'floor' : m.group === 'roof' ? 'roof' : m.group === 'wall:front' ? 'front wall' : 'walls');

/**
 * Colour, layer and finish for each piece of a built shed. With a heat map
 * (member id -> colour, utilisation.mjs) only the framing is drawn, each
 * checked member in its colour and the rest grey.
 * @param {import('./model.mjs').Shed} shed
 * @param {Map<string, number[]>} [heat]
 */
export function solidsOf(shed, heat) {
  const d = shed.design;
  const glitter = d.glitter ? 2 : 0;
  /** @type {Solid[]} */
  const out = [];
  for (const m of shed.members) {
    const color = heat ? heat.get(m.id) || HEAT_NONE : /^PT /.test(m.material) ? COLORS.pt : (m.kind === 'header' || m.kind === 'ridge board' || m.kind === 'ridge beam') ? COLORS.header : COLORS.framing;
    out.push({ geom: m.geom, color: /** @type {any} */ (color), layer: layerOf(m), id: m.id });
  }
  if (heat) return out;
  const pal = paletteOf(d);
  const siding = pal.siding;
  const texture = d.sidingType === 'board and batten' ? FINISH.batten : (d.sidingType === 'vinyl' || d.sidingType === 'fiber cement') ? FINISH.lap : d.sidingType === 'T1-11' ? FINISH.grooves : 0;
  for (const p of shed.panels) {
    const layer = p.kind === 'floor sheet' ? 'floor' : p.kind === 'roof sheathing' ? 'sheathing' : 'siding';
    const color = p.kind === 'floor sheet' ? COLORS.floor : p.kind === 'roof sheathing' ? COLORS.osb : siding;
    out.push({ geom: p.geom, color: /** @type {any} */ (color), layer, flags: p.kind === 'siding' ? (d.polkaDots ? 1 : 0) + glitter + texture : 0 });
  }
  const roof = pal.roof;
  const trim = pal.trim;
  for (const f of shed.fixtures) {
    if (f.kind === 'poster') continue; // drawn with its picture in the texture pass
    const layer = f.kind === 'shingles' ? 'roofing'
      : f.kind === 'connector' ? 'roof'
      : (f.kind === 'door' || f.kind === 'window' || f.kind === 'vent') ? 'siding'
        : (['trim', 'interior', 'decor', 'front lining'].includes(f.group) ? f.group : 'foundation');
    const lining = { OSB: [0.8, 0.66, 0.44], plywood: [0.93, 0.92, 0.88], drywall: [0.95, 0.95, 0.94], beadboard: [0.96, 0.95, 0.9], pegboard: [0.72, 0.58, 0.42] }[d.interior] || COLORS.lining;
    const color = f.kind === 'shingles' ? roof : (f.kind === 'fascia' || f.kind === 'soffit' || f.kind === 'casing') ? trim : f.kind === 'door' ? pal.door : f.kind === 'connector' ? [0.62, 0.64, 0.66] : f.kind === 'lining' ? lining : /** @type {any} */ (COLORS)[f.kind] || COLORS.block;
    const cover = d.roofCover === 'metal' ? FINISH.metal : FINISH.shingle + pal.roofBlend;
    out.push({ geom: f.geom, color: /** @type {any} */ (color), layer, flags: f.kind === 'shingles' ? glitter + cover : 0 });
  }
  return out;
}

/**
 * Dimension lines for the 3D view: overall length, width and peak height on
 * the ground beside the shed, and each door's rough opening.
 * @param {import('./model.mjs').Shed} shed
 * @returns {{ a: number[], b: number[], ticks: number[][], label: string, n?: number[] }[]}
 */
export function dimensionsOf(shed, fmt = (x) => `${x}`) {
  const d = shed.design;
  const k = shed.dims;
  const L = d.length;
  const W = d.width;
  const o = 30;
  const out = [];
  /** @type {number[] | undefined} */
  let facing;
  const seg = (a, b, ext, label) => out.push({ a, b, ticks: ext, label, ...(facing ? { n: facing } : {}) });
  seg([0, -o, 0], [L, -o, 0], [[0, 0, 0], [0, -o - 4, 0], [L, 0, 0], [L, -o - 4, 0]], `${fmt(L)} long`);
  seg([L + o, 0, 0], [L + o, W, 0], [[L, 0, 0], [L + o + 4, 0, 0], [L, W, 0], [L + o + 4, W, 0]], `${fmt(W)} wide`);
  seg([L + o, W / 2, 0], [L + o, W / 2, k.peak], [[L, W / 2, k.peak], [L + o + 4, W / 2, k.peak]], `${fmt(k.peak)} ground to peak`);
  seg([-o, 0, 0], [-o, 0, k.plateTop], [[0, 0, k.plateTop], [-o - 4, 0, k.plateTop]], `${fmt(k.plateTop)} ground to wall top`);
  seg([-o, W, 0], [-o, W, k.floorTop], [[0, W, k.floorTop], [-o - 4, W, k.floorTop]], `${fmt(k.floorTop)} ground to floor`);
  // Overhang and roof slope on the left gable.
  const eaveZ = k.plateTop + (k.connector ? 0 : -k.stud * (d.pitch / 12)) + k.plumbH;
  if (k.overhang > 0) seg([-6, -k.overhang, eaveZ + 6], [-6, 0, eaveZ + 6], [[-6, 0, k.plateTop], [-6, 0, eaveZ + 8]], `${fmt(k.overhang)} overhang`);
  seg([-12, -k.overhang, eaveZ + 14], [-12, W / 2, k.peak + 8], [], `${d.pitch}/12 roof, ${fmt(k.slopeLen)} eave to ridge`);
  // Every door and window: its rough size, its distance from the corner, and a window's sill height.
  for (const f of shed.fixtures.filter((x) => x.kind === 'door' || x.kind === 'window')) {
    const g = f.geom;
    const w = g.profile[1][0];
    const h = g.profile[2][1];
    const at = (p, q, t) => [0, 1, 2].map((i) => g.origin[i] + p * g.u[i] + q * g.v[i] + t * g.w[i]);
    const name = f.kind === 'door' ? 'door' : 'window';
    facing = g.w; // labels on a wall turned away from the camera are hidden
    seg(at(0, h + 6, 3), at(w, h + 6, 3), [at(0, h, 3), at(0, h + 8, 3), at(w, h, 3), at(w, h + 8, 3)], `${name} ${fmt(w)} wide`);
    seg(at(-6, 0, 3), at(-6, h, 3), [at(0, h, 3), at(-8, h, 3), at(0, 0, 3), at(-8, 0, 3)], `${fmt(h)} high`);
    const ground = 4 - g.origin[2];
    if (f.from !== undefined) seg(at(-f.from, ground, 3), at(0, ground, 3), [at(0, ground, 3), at(0, ground + 6, 3)], `${fmt(f.from)} from corner`);
    if (f.kind === 'window' && f.bottom !== undefined) seg(at(w + 6, -f.bottom, 3), at(w + 6, 0, 3), [at(w, 0, 3), at(w + 8, 0, 3)], `sill ${fmt(f.bottom)} above floor`);
  }
  facing = undefined;
  return out;
}

export const LAYERS = ['foundation', 'floor', 'walls', 'front wall', 'roof', 'sheathing', 'siding', 'roofing', 'trim', 'interior', 'front lining', 'decor'];

/** Generic poster art drawn on a canvas: no real person, an invented band. @param {string} id */
export function posterCanvas(id, image = null) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = id === 'big' ? 512 : 512;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  if (image) {
    const s = Math.max(c.width / image.width, c.height / image.height);
    g.drawImage(image, (c.width - image.width * s) / 2, (c.height - image.height * s) / 2, image.width * s, image.height * s);
    return c;
  }
  const palettes = [['#ff5fa2', '#7b3fd1'], ['#56ccf2', '#ff8ad8'], ['#ffd166', '#ef476f'], ['#b388ff', '#64ffda'], ['#ff7eb9', '#ffe066']];
  const i = id === 'big' ? 4 : Number(id.split('-')[1]) || 0;
  const [a, b] = palettes[i % palettes.length];
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  // Sparkles and hearts.
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (let k = 0; k < 40; k++) { const x = (k * 97) % c.width; const y = (k * 53) % 200; g.fillRect(x, y, 3, 3); }
  const heart = (x, y, s, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x, y + s / 4); g.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s / 4); g.bezierCurveTo(x - s / 2, y + s / 2, x, y + s * 0.7, x, y + s); g.bezierCurveTo(x, y + s * 0.7, x + s / 2, y + s / 2, x + s / 2, y + s / 4); g.bezierCurveTo(x + s / 2, y, x, y, x, y + s / 4); g.fill(); };
  heart(60, 40, 40, '#fff0f6'); heart(320, 70, 30, '#fff0f6');
  // Silhouettes of a made-up band: heads with swoopy fringes, shoulders.
  const n = id === 'big' ? 1 : 3 + (i % 2);
  for (let k = 0; k < n; k++) {
    const cx = (c.width / (n + 1)) * (k + 1);
    const cy = id === 'big' ? 250 : 300;
    const r = id === 'big' ? 90 : 42;
    g.fillStyle = 'rgba(40,10,60,0.85)';
    g.beginPath(); g.ellipse(cx, cy + r * 2.2, r * 1.6, r * 1.1, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx - r * 0.25, cy - r * 0.55, r * 1.05, r * 0.6, -0.35, 0, Math.PI * 2); g.fill();
  }
  const titles = ['HEARTBEAT', 'XOXO TOUR', 'BOY BAND', 'FOREVER 4', 'SUPERSTAR'];
  g.fillStyle = '#ffffff';
  g.font = `bold ${id === 'big' ? 54 : 46}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText(titles[i % titles.length], c.width / 2, c.height - 40);
  return c;
}

/** Feet and inches, as on the drawings. */
function fmtFtInLocal(inches) {
  const t = Math.round(inches * 16);
  const ft = Math.floor(t / 192);
  let r = t - ft * 192;
  const whole = Math.floor(r / 16);
  let f = r % 16;
  let frac = '';
  if (f) { let den = 16; while (f % 2 === 0) { f /= 2; den /= 2; } frac = `-${f}/${den}`; }
  return `${ft ? `${ft}' ` : ''}${whole}${frac}"`;
}

// ---- tiny matrix helpers (column-major, like WebGL) ----
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2); const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, at, up) {
  let zx = eye[0] - at[0]; let zy = eye[1] - at[1]; let zz = eye[2] - at[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy; let xy = up[2] * zx - up[0] * zz; let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy; const yy = zz * xx - zx * xz; const yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

const VS = `attribute vec3 p; attribute vec3 n; attribute vec4 c; uniform mat4 m; uniform float bias; varying vec3 vn; varying vec4 vc; varying vec3 vp;
void main(){ gl_Position = m * vec4(p,1.0); gl_Position.z -= bias * gl_Position.w; vn = n; vc = c; vp = p; }`;
// Finish flags in vc.a (see FINISH): 1 = purple polka dots (3" on a 9" staggered
// grid, in the face's own plane), 2 = glitter (sparse flecks that twinkle with
// time t), 4 = lap siding, 8 = board and batten, 16 = metal ribs, 32 = shingle
// courses (blend in the fraction), 64 = T1-11 grooves, 128 = the lawn, with a
// soft shadow under and beside the shed (foot = length, width, peak).
// Each material class gets its own compiled variant (SIDING, ROOF, LAWN or none):
// software GL, which many phones fall back to, runs every branch of a shader
// for every pixel, so a board should not pay for the shingle maths.
const FS = `precision highp float; varying vec3 vn; varying vec4 vc; varying vec3 vp; uniform float lit; uniform float t; uniform vec4 foot;
// A hash without trig (Dave Hoskins' hash12): software GL on phones pays dearly for sin().
float hash(vec2 q){ vec3 p = fract(vec3(q.xyx) * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
bool has(float f, float bit){ return mod(floor(f / bit), 2.0) > 0.5; }
float boxd(vec2 p, vec2 lo, vec2 hi){ vec2 d = max(max(lo - p, p - hi), 0.0); return length(d); }
void main(){ vec3 n = normalize(vn); vec3 base = vc.rgb; vec3 an = abs(n);
 vec2 uv = an.x > an.y ? (an.x > an.z ? vp.yz : vp.xy) : (an.y > an.z ? vp.xz : vp.xy);
 float f = floor(vc.a + 0.001); float blend = vc.a - f;
#ifdef LAWN
 {
  // Grass speckle, then contact shadow and a sun shadow cast away from the key light.
  vec3 col = base * (0.94 + 0.08 * hash(floor(vp.xy / 2.0)));
  float d0 = boxd(vp.xy, vec2(0.0), foot.xy);
  vec2 sh = -vec2(0.45, -0.6) / 0.75 * foot.z * 0.55;
  float d1 = boxd(vp.xy, min(vec2(0.0), sh), foot.xy + max(vec2(0.0), sh));
  col *= 1.0 - 0.35 * exp(-d0 / 10.0) - 0.3 * (1.0 - smoothstep(0.0, 30.0, d1));
  gl_FragColor = vec4(col, 1.0); return; }
#endif
#ifdef SIDING
 if (has(f, 1.0)) {
  vec2 cell = floor(uv / 9.0); vec2 g = fract(uv / 9.0) - 0.5; if (mod(cell.y, 2.0) > 0.5) g = fract(uv / 9.0 + vec2(0.5, 0.0)) - 0.5;
  if (length(g) < 0.17) base = vec3(0.47, 0.23, 0.66); }
 // Lap siding: a 5" course, the shadow under each butt and a faint bevel.
 if (has(f, 4.0)) { float c = fract(vp.z / 5.0); base *= c > 0.88 ? 0.7 : 0.9 + 0.1 * c; }
 if (has(f, 8.0)) { float bx = an.x > an.y ? vp.y : vp.x; if (fract(bx / 8.0) < 0.3) base *= 0.85; }
 // T1-11: a groove every 8".
 if (has(f, 64.0)) { float bx = an.x > an.y ? vp.y : vp.x; if (fract(bx / 8.0) < 0.05) base *= 0.72; }
#endif
#ifdef ROOF
 if (has(f, 16.0) && fract(vp.x / 2.67) < 0.25) base *= 0.78;
 // Asphalt shingles: 5" courses up the slope, tabs of uneven width staggered
 // course to course, each tab a shade lighter or darker, granule speckle.
 if (has(f, 32.0) && an.z > 0.2) {
  // The ridge runs along x, so up the slope is (0, -n.z, n.y) up to sign.
  float s = dot(vp.yz, vec2(-n.z, n.y) * sign(n.y + 1e-6)) / (length(n.yz) * 5.0); float x = vp.x; float course = floor(s); float fr = fract(s);
  float off = hash(vec2(course, 3.1)) * 40.0; float tab = floor((x + off) / (9.0 + 6.0 * hash(vec2(course, 7.7))));
  base *= 1.0 + blend * (hash(vec2(tab, course)) * 2.0 - 1.0);
  if (fr < 0.1) base *= 0.62; else if (fr < 0.35 && hash(vec2(tab, course + 0.5)) > 0.5) base *= 0.88; }
#endif
 float a = abs(dot(n, normalize(vec3(0.45,-0.6,0.75)))); float b = abs(dot(n, normalize(vec3(-0.6,0.5,0.3))));
 vec3 col = base * (0.42 + 0.5*a + 0.18*b);
 // Walls darken a little toward the ground (cheap ambient occlusion).
 if (an.z < 0.5) col *= 0.82 + 0.18 * smoothstep(-4.0, 30.0, vp.z);
#if defined(SIDING) || defined(ROOF)
 if (has(f, 2.0)) { float h = hash(floor(uv * 1.3)); float s = h > 0.95 ? pow(0.5 + 0.5 * sin(t * 3.0 + h * 90.0), 8.0) : 0.0;
  col = col * (0.96 + 0.08 * hash(floor(uv * 4.0))) + vec3(1.0, 0.92, 1.0) * s; }
#endif
 gl_FragColor = vec4(mix(base, col, lit), 1.0); }`;

// The sky: a gradient behind everything, from haze at the horizon to blue.
const SVS = `attribute vec2 p; varying float y; void main(){ gl_Position = vec4(p, 0.999, 1.0); y = p.y * 0.5 + 0.5; }`;
const SFS = `precision mediump float; varying float y; uniform float horizon; void main(){ float k = smoothstep(horizon - 0.05, 1.0, y);
 vec3 c = mix(vec3(0.86, 0.9, 0.92), vec3(0.47, 0.66, 0.86), k); if (y < horizon) c = vec3(0.86, 0.9, 0.92); gl_FragColor = vec4(c, 1.0); }`;

const TVS = `attribute vec3 p; attribute vec2 uv; uniform mat4 m; varying vec2 vuv; void main(){ gl_Position = m * vec4(p,1.0); vuv = uv; }`;
const TFS = `precision mediump float; varying vec2 vuv; uniform sampler2D tex; void main(){ gl_FragColor = texture2D(tex, vuv); }`;

/**
 * Attach a viewer to a canvas. Returns an object with `show(shed)`, `setLayer(name, on)`,
 * `snapshot()` and `reset()`, or null when WebGL is unavailable.
 * @param {HTMLCanvasElement} canvas
 */
export function createViewer(canvas) {
  const gl = /** @type {WebGLRenderingContext|null} */ (canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }));
  if (!gl) return null;
  const sh = (type, src) => { const s = /** @type {WebGLShader} */ (gl.createShader(type)); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vs = sh(gl.VERTEX_SHADER, VS);
  /** One program per material class; attributes are bound to the same slots in each. */
  const variant = (define) => {
    const pr = /** @type {WebGLProgram} */ (gl.createProgram());
    gl.attachShader(pr, vs); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS.replace('precision highp float;', `precision highp float;\n${define ? `#define ${define}\n` : ''}`)));
    gl.bindAttribLocation(pr, 0, 'p'); gl.bindAttribLocation(pr, 1, 'n'); gl.bindAttribLocation(pr, 2, 'c');
    gl.linkProgram(pr);
    return { prog: pr, m: gl.getUniformLocation(pr, 'm'), lit: gl.getUniformLocation(pr, 'lit'), bias: gl.getUniformLocation(pr, 'bias'), t: gl.getUniformLocation(pr, 't'), foot: gl.getUniformLocation(pr, 'foot') };
  };
  const variants = { plain: variant(''), siding: variant('SIDING'), roof: variant('ROOF'), lawn: variant('LAWN') };
  const loc = { p: 0, n: 1, c: 2, ...variants.plain };
  const prog = variants.plain.prog;
  gl.useProgram(prog);
  gl.enable(gl.DEPTH_TEST);
  const sprog = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(sprog, sh(gl.VERTEX_SHADER, SVS)); gl.attachShader(sprog, sh(gl.FRAGMENT_SHADER, SFS)); gl.linkProgram(sprog);
  const sloc = { p: gl.getAttribLocation(sprog, 'p'), horizon: gl.getUniformLocation(sprog, 'horizon') };
  const tprog = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(tprog, sh(gl.VERTEX_SHADER, TVS)); gl.attachShader(tprog, sh(gl.FRAGMENT_SHADER, TFS)); gl.linkProgram(tprog);
  const tloc = { p: gl.getAttribLocation(tprog, 'p'), uv: gl.getAttribLocation(tprog, 'uv'), m: gl.getUniformLocation(tprog, 'm') };
  /** @type {Record<string, WebGLTexture>} */
  const textures = {};
  let posterImage = null;
  const texture = (id) => {
    if (textures[id]) return textures[id];
    const tex = /** @type {WebGLTexture} */ (gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, posterCanvas(id, id === 'big' ? posterImage : null));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textures[id] = tex;
    return tex;
  };
  /** @type {{ tex: string, layer: string, p: WebGLBuffer, uv: WebGLBuffer }[]} */
  let posters = [];
  let glitter = false;
  let animating = false;
  /** Dimension lines and their labels, drawn over the canvas. */
  let dims = /** @type {{ a: number[], b: number[], ticks: number[][], label: string, n?: number[] }[]} */ ([]);
  let dimBuf = null;
  let dimCount = 0;
  let showDims = true;
  const overlay = canvas.parentElement && canvas.isConnected ? document.createElement('div') : null;
  /** Half the width and height of each dimension label, measured on its first frame. @type {number[][]} */
  let labelHalf = [];
  if (overlay && canvas.parentElement) {
    overlay.className = 'dim-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    canvas.parentElement.style.position = 'relative';
    canvas.insertAdjacentElement('afterend', overlay);
  }

  /** @type {Record<string, any>} */
  const layers = {};
  // Boards you can point at: each member's triangles, for picking with a click,
  // and the ones shown highlighted (drawn last, over everything, so a stud shows
  // through the siding).
  /** @type {{ id: string, layer: string, pos: Float32Array }[]} */
  let pickables = [];
  let hl = null;
  let hlIds = /** @type {string[]} */ ([]);
  let lastM = null;
  /** @type {((id: string|null) => void) | null} */
  let onPick = null;
  const visible = new Set(LAYERS);
  const cam = { theta: -0.95, phi: 0.42, dist: 400, target: [0, 0, 0], fit: 400, pan: [0, 0, 0] };
  let fitted = false;

  const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
  const skyBuf = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
  /** The lawn: one big quad just under grade; colour and shadow come from the shader. */
  let ground = null;
  let foot = [0, 0, 0, 0];
  let scenery = true;
  let outlines = true;

  /** @type {any} */
  let shown = null;
  function show(shed, { refit = false, heat = undefined } = {}) {
    shown = shed;
    for (const k of Object.keys(layers)) { const L = layers[k]; for (const b of [L.p, L.n, L.c, L.l, L.lc]) gl.deleteBuffer(b); delete layers[k]; }
    for (const q of posters) { gl.deleteBuffer(q.p); gl.deleteBuffer(q.uv); }
    posters = shed.fixtures.filter((f) => f.kind === 'poster').map((f) => {
      const g = f.geom;
      const [, [w], [, h]] = [g.profile[0], g.profile[1], g.profile[2]];
      const corner = (a, b) => world(g, [a, b], g.thickness);
      // Someone in the room looks along -w; their right hand is (-w) x up. Flip the
      // picture if the wall's axis u runs the other way.
      const flip = g.u[0] * -g.w[1] + g.u[1] * g.w[0] < 0;
      const u0 = flip ? 1 : 0; const u1 = flip ? 0 : 1;
      const pos = [...corner(0, 0), ...corner(w, 0), ...corner(w, h), ...corner(0, 0), ...corner(w, h), ...corner(0, h)];
      const uv = [u0, 1, u1, 1, u1, 0, u0, 1, u1, 0, u0, 0];
      return { tex: /** @type {any} */ (f).tex || 'poster-0', layer: f.group === 'front lining' ? 'front lining' : 'decor', p: buf(new Float32Array(pos)), uv: buf(new Float32Array(uv)) };
    });
    glitter = Boolean(shed.design.glitter);
    if (overlay) {
      dims = dimensionsOf(shed, (x) => fmtFtInLocal(x));
      const pts = [];
      for (const dm of dims) { pts.push(...dm.a, ...dm.b); for (let i = 0; i + 1 < dm.ticks.length; i += 2) pts.push(...dm.ticks[i], ...dm.ticks[i + 1]); }
      if (dimBuf) gl.deleteBuffer(dimBuf);
      dimBuf = buf(new Float32Array(pts));
      dimCount = pts.length / 3;
      overlay.innerHTML = dims.map((dm) => `<span>${dm.label}</span>`).join('');
      labelHalf = [];
    }
    const solids = solidsOf(shed, heat);
    pickables = solids.filter((x) => x.id).map((x) => ({ id: /** @type {string} */ (x.id), layer: x.layer, pos: meshOf([x]).pos }));
    setHighlight(hlIds.filter((id) => pickables.some((q) => q.id === id)));
    for (const name of LAYERS) {
      const mesh = meshOf(solids.filter((s) => s.layer === name));
      if (!mesh.pos.length) continue;
      const lc = new Float32Array((mesh.lines.length / 3) * 4); for (let i = 0; i < lc.length; i += 4) { lc[i] = lc[i + 1] = lc[i + 2] = 0.25; }
      const ln = new Float32Array(mesh.lines.length).fill(0); for (let i = 2; i < ln.length; i += 3) ln[i] = 1;
      layers[name] = { p: buf(mesh.pos), n: buf(mesh.nor), c: buf(mesh.col), count: mesh.pos.length / 3, l: buf(mesh.lines), ln: buf(ln), lc: buf(lc), lcount: mesh.lines.length / 3 };
    }
    const d = shed.dims;
    {
      const R = Math.max(d.length, d.width) * 6 + 600;
      const x0 = d.length / 2 - R; const x1 = d.length / 2 + R; const y0 = d.width / 2 - R; const y1 = d.width / 2 + R; const z = -0.25;
      const g = [0.43, 0.56, 0.3, 128];
      if (ground) for (const b of [ground.p, ground.n, ground.c]) gl.deleteBuffer(b);
      ground = { p: buf(new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z])), n: buf(new Float32Array(Array(6).fill([0, 0, 1]).flat())), c: buf(new Float32Array(Array(6).fill(g).flat())) };
      foot = [d.length, d.width, d.peak, 0];
    }
    cam.target = [d.length / 2, d.width / 2, d.peak / 2.4];
    cam.fit = Math.hypot(d.length + 2 * d.overhang, d.width + 2 * d.overhang, d.peak) * 1.35;
    if (!fitted || refit) { cam.dist = cam.fit; cam.pan = [0, 0, 0]; fitted = true; }
    draw();
  }

  function draw() {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    // A canvas off the page (the compare thumbnails) keeps the size it was given.
    if (w && h && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.93, 0.95, 0.97, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const tgt = [0, 1, 2].map((i) => cam.target[i] + cam.pan[i]);
    const eye = [tgt[0] + cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta), tgt[1] + cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta), tgt[2] + cam.dist * Math.sin(cam.phi)];
    const m = mul(perspective(0.75, canvas.width / canvas.height, cam.dist * 0.08, cam.dist * 8), lookAt(eye, tgt, [0, 0, 1]));
    lastM = m;
    const attr = (b, l, size = 3) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
    const horizon = 0.5 + 0.5 * Math.tan(cam.phi) / Math.tan(0.375);
    if (scenery && horizon < 1) {
      // The horizon sits tan(phi) above the middle of the picture (in units of the half-height).
      gl.useProgram(sprog);
      gl.uniform1f(sloc.horizon, Math.max(0, horizon));
      gl.depthMask(false);
      attr(skyBuf, sloc.p, 2); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(sloc.p);
      gl.depthMask(true);
    }
    const mm = new Float32Array(m);
    const now = (globalThis.performance?.now?.() ?? 0) / 1000;
    for (const v of Object.values(variants)) {
      gl.useProgram(v.prog);
      gl.uniformMatrix4fv(v.m, false, mm); gl.uniform1f(v.t, now); gl.uniform4fv(v.foot, new Float32Array(foot));
    }
    /** @param {{ prog: WebGLProgram, lit: any, bias: any }} v */
    const use = (v, lit, bias) => { gl.useProgram(v.prog); gl.uniform1f(v.lit, lit); gl.uniform1f(v.bias, bias); };
    for (const name of LAYERS) {
      const L = layers[name];
      if (!L || !visible.has(name)) continue;
      use(name === 'siding' ? variants.siding : name === 'roofing' ? variants.roof : variants.plain, 1, 0);
      attr(L.p, loc.p); attr(L.n, loc.n); attr(L.c, loc.c, 4);
      gl.drawArrays(gl.TRIANGLES, 0, L.count);
      if (!outlines) continue;
      use(variants.plain, 0, 0.00004);
      attr(L.l, loc.p); attr(L.ln, loc.n); attr(L.lc, loc.c, 4);
      gl.drawArrays(gl.LINES, 0, L.lcount);
    }
    // The lawn, after the shed so the pixels it hides are never shaded; from above only: from below it would hide the foundation.
    if (scenery && ground && eye[2] > 0) {
      use(variants.lawn, 1, 0);
      attr(ground.p, loc.p); attr(ground.n, loc.n); attr(ground.c, loc.c, 4);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    if (overlay && dimCount && showDims) {
      use(variants.plain, 0, 0.001);
      attr(dimBuf, loc.p);
      gl.disableVertexAttribArray(loc.n); gl.vertexAttrib3f(loc.n, 0, 0, 1);
      gl.disableVertexAttribArray(loc.c); gl.vertexAttrib4f(loc.c, 0.12, 0.3, 0.55, 0);
      gl.drawArrays(gl.LINES, 0, dimCount);
      // Labels at each line's midpoint, projected to the screen.
      const cw = canvas.clientWidth; const ch = canvas.clientHeight;
      const spans = overlay.children;
      // On a small canvas the labels pile up: draw them in order and skip one
      // that would cover a label already placed or stick out of the picture.
      /** @type {number[][]} */
      const placed = [];
      overlay.style.display = showDims ? '' : 'none';
      dims.forEach((dm, i) => {
        const mid = [0, 1, 2].map((j) => (dm.a[j] + dm.b[j]) / 2);
        const x = m[0] * mid[0] + m[4] * mid[1] + m[8] * mid[2] + m[12];
        const y = m[1] * mid[0] + m[5] * mid[1] + m[9] * mid[2] + m[13];
        const w4 = m[3] * mid[0] + m[7] * mid[1] + m[11] * mid[2] + m[15];
        const el = /** @type {HTMLElement} */ (spans[i]);
        if (!el) return;
        const away = dm.n && dm.n[0] * (eye[0] - mid[0]) + dm.n[1] * (eye[1] - mid[1]) + dm.n[2] * (eye[2] - mid[2]) < 0;
        if (w4 <= 0 || away) { el.style.display = 'none'; return; }
        el.style.display = '';
        const sx = ((x / w4 + 1) / 2) * cw; const sy = ((1 - y / w4) / 2) * ch;
        // A label's size is read once per show(), not every frame: each read forces a layout.
        let half = labelHalf[i];
        if (!half) { half = [el.offsetWidth / 2, el.offsetHeight / 2]; if (half[0]) labelHalf[i] = half; }
        const [hw, hh] = half;
        const box = [sx - hw, sy - hh, sx + hw, sy + hh];
        const clash = placed.some((b) => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3]);
        if (showDims && (clash || box[0] < 0 || box[2] > cw || box[1] < 0 || box[3] > ch)) { el.style.display = 'none'; return; }
        placed.push(box);
        el.style.left = `${canvas.offsetLeft + sx}px`;
        el.style.top = `${canvas.offsetTop + sy}px`;
      });
    }
    if (overlay) overlay.style.display = showDims ? '' : 'none';
    for (const l of [loc.p, loc.n, loc.c]) gl.disableVertexAttribArray(l);
    if (posters.length) {
      gl.useProgram(tprog);
      gl.uniformMatrix4fv(tloc.m, false, new Float32Array(m));
      for (const q of posters) {
        if (!visible.has(q.layer)) continue;
        gl.bindTexture(gl.TEXTURE_2D, texture(q.tex));
        attr(q.p, tloc.p); attr(q.uv, tloc.uv, 2);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.disableVertexAttribArray(tloc.p); gl.disableVertexAttribArray(tloc.uv);
      gl.useProgram(prog);
    }
    if (hl) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      use(variants.plain, 1, 0);
      attr(hl.p, loc.p); attr(hl.n, loc.n); attr(hl.c, loc.c, 4);
      gl.drawArrays(gl.TRIANGLES, 0, hl.count);
      use(variants.plain, 0, 0.00004);
      attr(hl.l, loc.p); attr(hl.ln, loc.n); attr(hl.lc, loc.c, 4);
      gl.drawArrays(gl.LINES, 0, hl.lcount);
      for (const l of [loc.p, loc.n, loc.c]) gl.disableVertexAttribArray(l);
    }
    // Glitter twinkles, so keep drawing while it is on screen.
    if (glitter && !animating && canvas.isConnected) {
      animating = true;
      requestAnimationFrame(() => { animating = false; if (glitter) draw(); });
    }
  }

  function setHighlight(ids) {
    hlIds = [...ids];
    if (hl) for (const k of ['p', 'n', 'c', 'l', 'ln', 'lc']) gl.deleteBuffer(hl[k]);
    hl = null;
    const want = new Set(hlIds);
    const pos = []; for (const q of pickables) if (want.has(q.id)) pos.push(q);
    if (!pos.length) return;
    // Rebuild a mesh in the highlight colour from the members' own triangles.
    const tris = new Float32Array(pos.reduce((t, q) => t + q.pos.length, 0));
    let o = 0; for (const q of pos) { tris.set(q.pos, o); o += q.pos.length; }
    const n = tris.length / 3;
    const nor = new Float32Array(tris.length);
    for (let i = 0; i < n; i += 3) {
      const a = i * 3; const ux = tris[a + 3] - tris[a]; const uy = tris[a + 4] - tris[a + 1]; const uz = tris[a + 5] - tris[a + 2];
      const vx = tris[a + 6] - tris[a]; const vy = tris[a + 7] - tris[a + 1]; const vz = tris[a + 8] - tris[a + 2];
      let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) nor.set([nx, ny, nz], a + k * 3);
    }
    const col = new Float32Array(n * 4); for (let i = 0; i < n; i++) col.set([0.96, 0.45, 0.08, 0], i * 4);
    // Outline every triangle edge in a darker orange so the pieces read apart.
    const lines = []; for (let i = 0; i < n; i += 3) { const a = i * 3; for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) lines.push(tris[a + x * 3], tris[a + x * 3 + 1], tris[a + x * 3 + 2], tris[a + y * 3], tris[a + y * 3 + 1], tris[a + y * 3 + 2]); }
    const ln = new Float32Array(lines.length).fill(0); for (let i = 2; i < ln.length; i += 3) ln[i] = 1;
    const lc = new Float32Array((lines.length / 3) * 4); for (let i = 0; i < lc.length; i += 4) lc.set([0.55, 0.22, 0.02, 0], i);
    hl = { p: buf(tris), n: buf(nor), c: buf(col), count: n, l: buf(new Float32Array(lines)), ln: buf(ln), lc: buf(lc), lcount: lines.length / 3 };
  }

  /** The member under a point on the canvas (client coordinates), nearest the eye, in a visible layer. */
  function pick(clientX, clientY) {
    if (!lastM) return null;
    const r = canvas.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * 2 - 1; const py = 1 - ((clientY - r.top) / r.height) * 2;
    const m = lastM;
    let best = null; let bestZ = Infinity;
    for (const q of pickables) {
      if (!visible.has(q.layer)) continue;
      const P = q.pos; const sx = []; const sy = []; const sz = [];
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i]; const y = P[i + 1]; const z = P[i + 2];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        sx.push((m[0] * x + m[4] * y + m[8] * z + m[12]) / w); sy.push((m[1] * x + m[5] * y + m[9] * z + m[13]) / w); sz.push(w > 0 ? (m[2] * x + m[6] * y + m[10] * z + m[14]) / w : Infinity);
      }
      for (let t = 0; t < sx.length; t += 3) {
        const [ax, bx, cx] = [sx[t], sx[t + 1], sx[t + 2]]; const [ay, by, cy] = [sy[t], sy[t + 1], sy[t + 2]];
        const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d; const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d; const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * sz[t] + l2 * sz[t + 1] + l3 * sz[t + 2];
        if (z < bestZ && z > -1) { bestZ = z; best = q.id; }
      }
    }
    return best;
  }

  // One draw per frame however many pointer events arrive: on a big design a
  // draw costs more than the gap between pointermoves.
  let drawQueued = false;
  const requestDraw = () => {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  };

  // Pan: slide the point the camera looks at across the screen, by pixels.
  // It stays within about half the shed's size of the centre, so the shed
  // can't be lost off screen.
  function panBy(dx, dy) {
    const per = (2 * Math.tan(0.375) * cam.dist) / (canvas.clientHeight || 300);
    const r = [-Math.sin(cam.theta), Math.cos(cam.theta), 0];
    const u = [-Math.sin(cam.phi) * Math.cos(cam.theta), -Math.sin(cam.phi) * Math.sin(cam.theta), Math.cos(cam.phi)];
    const p = [0, 1, 2].map((i) => cam.pan[i] - r[i] * dx * per + u[i] * dy * per);
    const len = Math.hypot(...p); const max = cam.fit * 0.4;
    cam.pan = len > max ? p.map((x) => (x * max) / len) : p;
    requestDraw();
  }

  // Orbit with one pointer (pan with the right button or Shift held), pinch and
  // pan with two fingers, zoom with the wheel or the keys.
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const mid = () => { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, theta: cam.theta, phi: cam.phi, pan: e.button === 2 || e.shiftKey }; press = { x: e.clientX, y: e.clientY, button: e.button }; } else press = null;
    if (pointers.size === 2) { drag = null; pinch = { d: spread(), dist: cam.dist, mid: mid() }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      cam.dist = Math.max(cam.fit * 0.25, Math.min(cam.fit * 3, pinch.dist * (pinch.d / spread())));
      const m2 = mid();
      panBy(m2.x - pinch.mid.x, m2.y - pinch.mid.y);
      pinch.mid = m2;
      return;
    }
    if (!drag) return;
    if (drag.pan) { panBy(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; return; }
    cam.theta = drag.theta - (e.clientX - drag.x) * 0.008;
    cam.phi = Math.max(-0.15, Math.min(1.45, drag.phi + (e.clientY - drag.y) * 0.008));
    requestDraw();
  });
  // A press that barely moves is a click: pick the board under it.
  let press = /** @type {{ x: number, y: number, button: number }|null} */ (null);
  const end = (e) => {
    if (press && e.type === 'pointerup' && press.button === 0 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5 && pointers.size === 1) onPick?.(pick(e.clientX, e.clientY));
    press = null;
    pointers.delete(e.pointerId);
    pinch = null;
    // Lifting one finger of a pinch carries on as an orbit from where it is.
    const [rest] = [...pointers.values()];
    drag = rest ? { x: rest.x, y: rest.y, theta: cam.theta, phi: cam.phi } : null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const turn = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key];
    const slide = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
    if (slide && e.shiftKey) panBy(slide[0], slide[1]);
    else if (turn) {
      cam.theta += turn[0];
      cam.phi = Math.max(-0.15, Math.min(1.45, cam.phi + turn[1]));
      requestDraw();
    } else if (e.key === '+' || e.key === '=') zoom(1 / 1.2);
    else if (e.key === '-' || e.key === '_') zoom(1.2);
    else return;
    e.preventDefault();
  });
  function zoom(f) { cam.dist = Math.max(cam.fit * 0.25, Math.min(cam.fit * 3, cam.dist * f)); requestDraw(); }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(canvas);

  return {
    show,
    draw,
    zoom,
    setLayer(name, on) { if (on) visible.add(name); else visible.delete(name); draw(); },
    setDimensions(on) { showDims = on; draw(); },
    /** Board outlines on or off (presentation mode turns them off). */
    setOutlines(on) { outlines = on; draw(); },
    /** Lawn, shadow and sky on or off. */
    setScenery(on) { scenery = on; draw(); },
    view(theta, phi) { cam.theta = theta; cam.phi = phi; cam.dist = cam.fit; cam.pan = [0, 0, 0]; draw(); },
    reset() { cam.theta = -0.95; cam.phi = 0.42; cam.dist = cam.fit; cam.pan = [0, 0, 0]; draw(); },
    panBy,
    /** Show these members (by id) in orange, over everything; [] clears. */
    highlight(ids) { setHighlight(ids); draw(); },
    pick,
    /** Called with the member id under a click (null for none). */
    set onPick(fn) { onPick = fn; },
    /** How far the view is panned from the shed's centre, in inches (for tests). */
    panned() { return Math.hypot(...cam.pan); },
    snapshot() { draw(); return canvas.toDataURL('image/png'); },
    /** The framing member under a point on the canvas (client pixels), among the layers shown, or null. */
    pick(clientX, clientY) {
      if (!shown) return null;
      const r = canvas.getBoundingClientRect();
      const nx = ((clientX - r.left) / (r.width || 1)) * 2 - 1;
      const ny = 1 - ((clientY - r.top) / (r.height || 1)) * 2;
      const eye = [cam.target[0] + cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta), cam.target[1] + cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta), cam.target[2] + cam.dist * Math.sin(cam.phi)];
      const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const f = norm([cam.target[0] - eye[0], cam.target[1] - eye[1], cam.target[2] - eye[2]]);
      const rt = norm([f[1], -f[0], 0]);
      const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
      const th = Math.tan(0.375); const asp = (r.width || 1) / (r.height || 1);
      const dir = [0, 1, 2].map((i) => f[i] + nx * th * asp * rt[i] + ny * th * up[i]);
      return pickMember(shown.members.filter((m) => visible.has(layerOf(m))), eye, dir)?.id ?? null;
    },
    /** Show a picture of the viewer's own on the big poster (it stays in the browser). */
    setPosterImage(img) { posterImage = img; if (textures.big) { gl.deleteTexture(textures.big); delete textures.big; } draw(); },
  };
}
