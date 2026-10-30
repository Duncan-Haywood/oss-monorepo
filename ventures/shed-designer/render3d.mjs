// @ts-check
// A small WebGL viewer for the framed shed: every board is its own extruded
// profile with real dimensions, lit with two lights and outlined so you can
// count studs. No library; drag to orbit, wheel, pinch or buttons to zoom,
// arrow keys and +/- when the canvas has focus.

/** @typedef {import('./model.mjs').Geom} Geom */
/** @typedef {{ geom: Geom, color: [number, number, number], layer: string, flags?: number }} Solid */

const COLORS = {
  pt: [0.71, 0.77, 0.58], framing: [0.9, 0.79, 0.57], header: [0.85, 0.66, 0.38], floor: [0.83, 0.7, 0.47],
  osb: [0.79, 0.65, 0.43], siding: [0.64, 0.36, 0.27], shingles: [0.3, 0.32, 0.35], door: [0.42, 0.29, 0.17],
  window: [0.62, 0.78, 0.9], vent: [0.88, 0.88, 0.86], gravel: [0.74, 0.71, 0.66], block: [0.6, 0.6, 0.6],
  lining: [1.0, 0.78, 0.88], rug: [0.98, 0.55, 0.78], beanbag: [0.58, 0.32, 0.8], poster: [1, 1, 1],
  'bulb-0': [1.0, 0.95, 0.6], 'bulb-1': [1.0, 0.5, 0.8], 'bulb-2': [0.6, 0.85, 1.0], 'bulb-3': [0.75, 1.0, 0.7],
};

/** Paint colours for the siding; natural is the stained T1-11 look. */
export const SIDING_COLORS = {
  natural: [0.64, 0.36, 0.27], red: [0.62, 0.16, 0.13], pink: [0.96, 0.62, 0.76], 'hot pink': [1.0, 0.33, 0.66],
  lavender: [0.76, 0.64, 0.93], mint: [0.6, 0.9, 0.78], gray: [0.6, 0.62, 0.62],
  blue: [0.38, 0.52, 0.66], green: [0.42, 0.55, 0.38], white: [0.93, 0.92, 0.88],
};
export const ROOF_COLORS = { charcoal: [0.3, 0.32, 0.35], brown: [0.38, 0.27, 0.2], pink: [0.93, 0.45, 0.66], purple: [0.5, 0.28, 0.68], teal: [0.2, 0.55, 0.58] };
export const TRIM_COLORS = { white: [0.97, 0.97, 0.97], purple: [0.5, 0.28, 0.68], pink: [1.0, 0.55, 0.78], black: [0.13, 0.13, 0.15], gold: [0.92, 0.76, 0.3] };

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

/** Colour, layer and finish for each piece of a built shed. @param {import('./model.mjs').Shed} shed */
export function solidsOf(shed) {
  const d = shed.design;
  const glitter = d.glitter ? 2 : 0;
  /** @type {Solid[]} */
  const out = [];
  for (const m of shed.members) {
    const layer = m.group === 'foundation' ? 'foundation' : m.group === 'floor' ? 'floor' : m.group === 'roof' ? 'roof' : m.group === 'wall:front' ? 'front wall' : 'walls';
    const color = /^PT /.test(m.material) ? COLORS.pt : (m.kind === 'header' || m.kind === 'ridge board' || m.kind === 'ridge beam') ? COLORS.header : COLORS.framing;
    out.push({ geom: m.geom, color: /** @type {any} */ (color), layer });
  }
  // Unfinished: bare plywood, or LP's factory primer (a pale grey).
  const bare = d.sidingType?.startsWith('LP SmartSide') ? [0.84, 0.83, 0.79] : [0.78, 0.62, 0.43];
  const siding = d.sidingColor === 'unfinished' ? bare : /** @type {any} */ (SIDING_COLORS)[d.sidingColor] || COLORS.siding;
  for (const p of shed.panels) {
    const layer = p.kind === 'floor sheet' ? 'floor' : p.kind === 'roof sheathing' ? 'sheathing' : 'siding';
    const color = p.kind === 'floor sheet' ? COLORS.floor : p.kind === 'roof sheathing' ? COLORS.osb : siding;
    const texture = d.sidingType === 'board and batten' ? 8 : (d.sidingType === 'vinyl' || d.sidingType === 'fiber cement') ? 4 : 0;
    const vinyl = d.sidingType === 'vinyl' && d.sidingColor === 'natural' ? [0.93, 0.92, 0.88] : null;
    out.push({ geom: p.geom, color: /** @type {any} */ (p.kind === 'siding' && vinyl ? vinyl : color), layer, flags: p.kind === 'siding' ? (d.polkaDots ? 1 : 0) + glitter + texture : 0 });
  }
  const roof = /** @type {any} */ (ROOF_COLORS)[d.roofColor] || COLORS.shingles;
  const trim = /** @type {any} */ (TRIM_COLORS)[d.trimColor] || TRIM_COLORS.white;
  for (const f of shed.fixtures) {
    if (f.kind === 'poster') continue; // drawn with its picture in the texture pass
    const layer = f.kind === 'shingles' ? 'roofing'
      : f.kind === 'connector' ? 'roof'
      : (f.kind === 'door' || f.kind === 'window' || f.kind === 'vent') ? 'siding'
        : (['trim', 'interior', 'decor', 'front lining'].includes(f.group) ? f.group : 'foundation');
    const lining = { OSB: [0.8, 0.66, 0.44], plywood: [0.93, 0.92, 0.88], drywall: [0.95, 0.95, 0.94], beadboard: [0.96, 0.95, 0.9], pegboard: [0.72, 0.58, 0.42] }[d.interior] || COLORS.lining;
    const color = f.kind === 'shingles' ? roof : (f.kind === 'fascia' || f.kind === 'soffit' || f.kind === 'casing') ? trim : f.kind === 'connector' ? [0.62, 0.64, 0.66] : f.kind === 'lining' ? lining : /** @type {any} */ (COLORS)[f.kind] || COLORS.block;
    const metal = d.roofCover === 'metal' ? 16 : 0;
    out.push({ geom: f.geom, color: /** @type {any} */ (color), layer, flags: f.kind === 'shingles' ? glitter + metal : 0 });
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
  // A lean-to's high point is its front edge, over the tall front wall.
  const py = k.lean ? -k.overhang : W / 2;
  seg([L + o, py, 0], [L + o, py, k.peak], [[L, py, k.peak], [L + o + 4, py, k.peak]], `${fmt(k.peak)} ground to ${k.lean ? 'high edge' : 'peak'}`);
  seg([-o, 0, 0], [-o, 0, k.lean ? k.highPlateTop : k.plateTop], [[0, 0, k.lean ? k.highPlateTop : k.plateTop], [-o - 4, 0, k.lean ? k.highPlateTop : k.plateTop]], `${fmt(k.lean ? k.highPlateTop : k.plateTop)} ground to ${k.lean ? 'front ' : ''}wall top`);
  if (k.lean) seg([-o, W, k.floorTop], [-o, W, k.plateTop], [[0, W, k.plateTop], [-o - 4, W, k.plateTop]], `${fmt(k.plateTop)} ground to back wall top`);
  seg([-o, W, 0], [-o, W, k.floorTop], [[0, W, k.floorTop], [-o - 4, W, k.floorTop]], `${fmt(k.floorTop)} ground to floor`);
  // Overhang and roof slope on the left gable.
  const eaveZ = k.plateTop + (k.connector ? 0 : -k.stud * (d.pitch / 12)) + k.plumbH;
  // On a lean-to the overhang is shown at the low back eave.
  if (k.overhang > 0 && k.lean) seg([-6, W, eaveZ + 6], [-6, W + k.overhang, eaveZ + 6], [[-6, W, k.plateTop], [-6, W, eaveZ + 8]], `${fmt(k.overhang)} overhang`);
  else if (k.overhang > 0) seg([-6, -k.overhang, eaveZ + 6], [-6, 0, eaveZ + 6], [[-6, 0, k.plateTop], [-6, 0, eaveZ + 8]], `${fmt(k.overhang)} overhang`);
  if (k.lean) {
    // One slope, from the low back tail up to the high front one.
    const lowZ = eaveZ - k.overhang * (d.pitch / 12);
    seg([-12, W + k.overhang, lowZ + 14], [-12, -k.overhang, k.peak + 8], [], `${d.pitch}/12 roof, ${fmt(k.slopeLen)} tail to tail`);
  } else seg([-12, -k.overhang, eaveZ + 14], [-12, W / 2, k.peak + 8], [], `${d.pitch}/12 roof, ${fmt(k.slopeLen)} eave to ridge`);
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
// Finish flags in vc.a: 1 = purple polka dots (3" on a 9" staggered grid, in the
// face's own plane), 2 = glitter (sparse flecks that twinkle with time t).
const FS = `precision highp float; varying vec3 vn; varying vec4 vc; varying vec3 vp; uniform float lit; uniform float t;
float hash(vec2 q){ return fract(sin(dot(q, vec2(12.9898,78.233))) * 43758.5453); }
void main(){ vec3 n = normalize(vn); vec3 base = vc.rgb; vec3 an = abs(n);
 vec2 uv = an.x > an.y ? (an.x > an.z ? vp.yz : vp.xy) : (an.y > an.z ? vp.xz : vp.xy);
 float f = floor(vc.a + 0.5);
 if (mod(f, 2.0) > 0.5) {
  vec2 cell = floor(uv / 9.0); vec2 g = fract(uv / 9.0) - 0.5; if (mod(cell.y, 2.0) > 0.5) g = fract(uv / 9.0 + vec2(0.5, 0.0)) - 0.5;
  if (length(g) < 0.17) base = vec3(0.47, 0.23, 0.66); }
 // 4 = lap siding (a shadow line every 5"), 8 = board and batten (a batten every 8"), 16 = metal ribs.
 if (mod(floor(f / 4.0), 2.0) > 0.5 && fract(vp.z / 5.0) < 0.12) base *= 0.72;
 if (mod(floor(f / 8.0), 2.0) > 0.5) { float bx = an.x > an.y ? vp.y : vp.x; if (fract(bx / 8.0) < 0.3) base *= 0.85; }
 if (mod(floor(f / 16.0), 2.0) > 0.5 && fract(vp.x / 2.67) < 0.25) base *= 0.78;
 float a = abs(dot(n, normalize(vec3(0.45,-0.6,0.75)))); float b = abs(dot(n, normalize(vec3(-0.6,0.5,0.3))));
 vec3 col = base * (0.42 + 0.5*a + 0.18*b);
 if (mod(floor(f / 2.0), 2.0) > 0.5) { float h = hash(floor(uv * 1.3)); float s = h > 0.95 ? pow(0.5 + 0.5 * sin(t * 3.0 + h * 90.0), 8.0) : 0.0;
  col = col * (0.96 + 0.08 * hash(floor(uv * 4.0))) + vec3(1.0, 0.92, 1.0) * s; }
 gl_FragColor = vec4(mix(base, col, lit), 1.0); }`;

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
  const prog = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  gl.useProgram(prog);
  const loc = { p: gl.getAttribLocation(prog, 'p'), n: gl.getAttribLocation(prog, 'n'), c: gl.getAttribLocation(prog, 'c'), m: gl.getUniformLocation(prog, 'm'), lit: gl.getUniformLocation(prog, 'lit'), bias: gl.getUniformLocation(prog, 'bias'), t: gl.getUniformLocation(prog, 't') };
  gl.enable(gl.DEPTH_TEST);
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
  if (overlay && canvas.parentElement) {
    overlay.className = 'dim-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    canvas.parentElement.style.position = 'relative';
    canvas.insertAdjacentElement('afterend', overlay);
  }

  /** @type {Record<string, any>} */
  const layers = {};
  const visible = new Set(LAYERS);
  const cam = { theta: -0.95, phi: 0.42, dist: 400, target: [0, 0, 0], fit: 400 };
  let fitted = false;

  const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };

  function show(shed, { refit = false } = {}) {
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
    }
    const solids = solidsOf(shed);
    for (const name of LAYERS) {
      const mesh = meshOf(solids.filter((s) => s.layer === name));
      if (!mesh.pos.length) continue;
      const lc = new Float32Array((mesh.lines.length / 3) * 4); for (let i = 0; i < lc.length; i += 4) { lc[i] = lc[i + 1] = lc[i + 2] = 0.25; }
      const ln = new Float32Array(mesh.lines.length).fill(0); for (let i = 2; i < ln.length; i += 3) ln[i] = 1;
      layers[name] = { p: buf(mesh.pos), n: buf(mesh.nor), c: buf(mesh.col), count: mesh.pos.length / 3, l: buf(mesh.lines), ln: buf(ln), lc: buf(lc), lcount: mesh.lines.length / 3 };
    }
    const d = shed.dims;
    cam.target = [d.length / 2, d.width / 2, d.peak / 2.4];
    cam.fit = Math.hypot(d.length + 2 * d.overhang, d.width + 2 * d.overhang, d.peak) * 1.35;
    if (!fitted || refit) { cam.dist = cam.fit; fitted = true; }
    draw();
  }

  function draw() {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    // A canvas off the page (the compare thumbnails) keeps the size it was given.
    if (w && h && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.93, 0.95, 0.97, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const eye = [cam.target[0] + cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta), cam.target[1] + cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta), cam.target[2] + cam.dist * Math.sin(cam.phi)];
    const m = mul(perspective(0.75, canvas.width / canvas.height, cam.dist * 0.08, cam.dist * 4), lookAt(eye, cam.target, [0, 0, 1]));
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.m, false, new Float32Array(m));
    gl.uniform1f(loc.t, (globalThis.performance?.now?.() ?? 0) / 1000);
    const attr = (b, l, size = 3) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
    for (const name of LAYERS) {
      const L = layers[name];
      if (!L || !visible.has(name)) continue;
      gl.uniform1f(loc.lit, 1); gl.uniform1f(loc.bias, 0);
      attr(L.p, loc.p); attr(L.n, loc.n); attr(L.c, loc.c, 4);
      gl.drawArrays(gl.TRIANGLES, 0, L.count);
      gl.uniform1f(loc.lit, 0); gl.uniform1f(loc.bias, 0.00004);
      attr(L.l, loc.p); attr(L.ln, loc.n); attr(L.lc, loc.c, 4);
      gl.drawArrays(gl.LINES, 0, L.lcount);
    }
    if (overlay && dimCount && showDims) {
      gl.uniform1f(loc.lit, 0); gl.uniform1f(loc.bias, 0.001);
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
        const hw = el.offsetWidth / 2; const hh = el.offsetHeight / 2;
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
    // Glitter twinkles, so keep drawing while it is on screen.
    if (glitter && !animating && canvas.isConnected) {
      animating = true;
      requestAnimationFrame(() => { animating = false; if (glitter) draw(); });
    }
  }

  // One draw per frame however many pointer events arrive: on a big design a
  // draw costs more than the gap between pointermoves.
  let drawQueued = false;
  const requestDraw = () => {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  };

  // Orbit with one pointer, pinch with two, zoom with the wheel or the keys.
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, theta: cam.theta, phi: cam.phi };
    else if (pointers.size === 2) { drag = null; pinch = { d: spread(), dist: cam.dist }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      cam.dist = Math.max(cam.fit * 0.25, Math.min(cam.fit * 3, pinch.dist * (pinch.d / spread())));
      requestDraw();
      return;
    }
    if (!drag) return;
    cam.theta = drag.theta - (e.clientX - drag.x) * 0.008;
    cam.phi = Math.max(-0.15, Math.min(1.45, drag.phi + (e.clientY - drag.y) * 0.008));
    requestDraw();
  });
  const end = (e) => {
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
    if (turn) {
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
    view(theta, phi) { cam.theta = theta; cam.phi = phi; cam.dist = cam.fit; draw(); },
    reset() { cam.theta = -0.95; cam.phi = 0.42; cam.dist = cam.fit; draw(); },
    snapshot() { draw(); return canvas.toDataURL('image/png'); },
    /** Show a picture of the viewer's own on the big poster (it stays in the browser). */
    setPosterImage(img) { posterImage = img; if (textures.big) { gl.deleteTexture(textures.big); delete textures.big; } draw(); },
  };
}
