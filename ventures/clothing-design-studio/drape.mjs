/**
 * Virtual sewing and drape: the drafted front and back panels (`pattern.mjs`)
 * meshed, sewn at the shoulders and side seams around a body built from the
 * wearer's tape measurements, and let fall under gravity. The result is where
 * the garment pulls tight, where it stands away from the body, how much the
 * hem drops, and the pressure the cloth puts on the body.
 *
 * Method (all in metres, kilograms, seconds):
 *  - Cloth: a triangle mesh on a regular grid inside each panel's stitch line.
 *    Grid edges are XPBD distance constraints (Macklin, Müller and Chentanez,
 *    "XPBD: position-based simulation of compliant constrained dynamics",
 *    2016) solved with many small substeps and one iteration each (Macklin et
 *    al., "Small steps in physics simulation", 2019). A grid spring of
 *    stiffness ks across a row spacing hy and along a column spacing hx gives a
 *    tensile stiffness Kt = ks hx / hy per unit width, so the springs are set
 *    from the fabric's tensile stiffness Kt (N/m: newtons per metre of width
 *    at 100% strain, the slope of a low-strain strip test). Compression is
 *    100 times softer, because cloth buckles rather than resisting it.
 *    Diagonals carry a small shear stiffness; skip-one edges a small bending
 *    stiffness.
 *  - Mass from the fabric's areal weight (g/m2) spread over the vertices.
 *  - Body: elliptical cross-sections stacked from mid-thigh to the neck,
 *    using the same ellipse depth ratios and height proportions as `tryon.mjs`
 *    (chest, waist and hip circumferences exact; shoulder width and neck from
 *    typical height proportions). Contact pushes the cloth out along the
 *    surface normal, with Coulomb-style friction.
 *  - Sewing happens without gravity (seams pulled closed over the first part
 *    of the run), then gravity is switched on and the garment settles.
 *
 * Checked against closed-form answers in `drape.test.mjs`: a strip hanging
 * under its own weight stretches by rho g L^2 / (2 Kt); a nearly
 * inextensible strip between two pins sags like a catenary; a tube on a
 * cylinder takes the hoop strain the girths dictate, and the contact force
 * the solver feels approaches Laplace's law, P = T / R, as the step shrinks
 * (one XPBD iteration softens a constraint by 1 / (1 + k w dt^2), so at the
 * garment's step it reads low; the pressure reported is T / R from the strain).
 *
 * What it is NOT: a fitted body scan, a validated fabric model or a fit
 * promise. Sleeves, hood, pocket and rib bands are not simulated yet (body
 * panels only, so the shoulders carry the whole garment and there are no
 * arms under the armholes). The fabric stiffness presets are rough typed
 * guesses, not lab measurements: where the cloth is tight the STRAIN is set
 * by the body and is robust, but the PRESSURE scales directly with the
 * stiffness you enter. Thickness, wrinkles finer than the grid, and
 * anisotropy between the course and wale directions are ignored.
 */
import { draft } from "./pattern.mjs";
import { frontWidth, LANDMARKS } from "./tryon.mjs";
import { BODY_CHEST_CM } from "./fit.mjs";

export const G = 9.81;
export const MMHG_PA = 133.322;

/** Fabric presets: areal weight (g/m2) and tensile stiffness (N/m). Rough typed guesses, not measurements. */
export const FABRICS = Object.freeze({
  jersey: { label: "Cotton jersey (tee weight)", gsm: 160, ktNPerM: 60 },
  heavyJersey: { label: "Heavy cotton jersey", gsm: 240, ktNPerM: 100 },
  fleece: { label: "Brushed fleece (sweatshirt)", gsm: 300, ktNPerM: 140 },
  stretch: { label: "Cotton-elastane jersey", gsm: 200, ktNPerM: 20 },
});

const DEPTH = Object.freeze({ chest: 0.7, waist: 0.72, hip: 0.68 });

/* ---------------- body ---------------- */

/**
 * A torso of stacked ellipses. Each level: {y, a, b} = height above the floor,
 * half-width and half-depth (m). Above `top` there is no body.
 * @param {{chest:number, waist?:number, hip?:number, height?:number}} m  cm
 */
export function bodyModel(m) {
  const chest = num(m?.chest, 60, 170);
  if (chest == null) return { ok: false, error: "Enter a chest measurement between 60 and 170 cm." };
  const assumed = [];
  let height = num(m?.height, 120, 230); if (height == null) { height = 175; assumed.push("height 175 cm"); }
  let waist = num(m?.waist, 40, 170); if (waist == null) { waist = Math.round(chest * 9) / 10; assumed.push(`waist ${waist} cm`); }
  let hip = num(m?.hip, 50, 180); if (hip == null) { hip = Math.round(chest * 9.8) / 10; assumed.push(`hip ${hip} cm`); }
  const H = height / 100, L = LANDMARKS;
  const ell = (circCm, ratio) => { const w = frontWidth(circCm, ratio) / 200; return { a: w, b: w * ratio }; };
  const c = ell(chest, DEPTH.chest), w = ell(waist, DEPTH.waist), h = ell(hip, DEPTH.hip);
  const shoulderA = Math.max(0.12 * H, c.a * 1.05), neckR = 0.034 * H;
  const hps = L.neck * H - 0.02; // high point of the shoulder, as in tryon.mjs
  // shoulder top: from the side of the neck at the HPS down to the shoulder point, about 15 degrees
  const slope = 0.27 * (shoulderA - neckR);
  const levels = [
    { y: 0.40 * H, ...scale(h, 0.92) },
    { y: L.crotch * H, ...h },
    { y: L.hip * H, ...h },
    { y: L.waist * H, ...w },
    { y: L.chest * H, ...c },
    { y: Math.min(0.765 * H, hps - slope - 0.07), a: c.a * 1.01, b: c.b * 0.95 },
    { y: hps - slope - 0.03, a: shoulderA, b: c.b * 0.8 },
    { y: hps - slope, a: shoulderA * 0.96, b: c.b * 0.68 },
    { y: hps - 0.4 * slope, a: neckR + 0.6 * (shoulderA - neckR), b: c.b * 0.6 },
    { y: hps - 0.004, a: neckR * 1.12, b: neckR * 1.1 },
    { y: hps + 0.01, a: neckR, b: neckR },
    { y: 0.93 * H, a: neckR, b: neckR },
  ];
  return { ok: true, levels, top: 0.93 * H, H, measures: { chest, waist, hip, height }, assumed, hps };
}
const scale = (e, s) => ({ a: e.a * s, b: e.b * s });
function num(v, lo, hi) { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; }

/** A straight cylinder (or elliptic prism) body, for tests and comparisons. */
export function cylinderBody(a, b = a, y0 = 0, y1 = 2) {
  return { ok: true, levels: [{ y: y0, a, b }, { y: y1, a, b }], top: y1, H: y1 };
}

/** Half-axes of the body at height y, or null above the top. */
export function sectionAt(body, y) {
  const L = body.levels;
  if (y > body.top) return null;
  if (y <= L[0].y) return { a: L[0].a, b: L[0].b };
  for (let i = 1; i < L.length; i++) {
    if (y <= L[i].y) {
      const t = (y - L[i - 1].y) / (L[i].y - L[i - 1].y || 1);
      return { a: L[i - 1].a + t * (L[i].a - L[i - 1].a), b: L[i - 1].b + t * (L[i].b - L[i - 1].b) };
    }
  }
  return { a: L[L.length - 1].a, b: L[L.length - 1].b };
}

/** Girth (m) of the body at height y (Ramanujan). */
export function girthAt(body, y) {
  const s = sectionAt(body, y);
  if (!s) return 0;
  const { a, b } = s, hh = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + 3 * hh / (10 + Math.sqrt(4 - 3 * hh)));
}

/** Distance (m) from a point to the body along the horizontal ray from the axis; negative inside. */
export function clearance(body, x, y, z) {
  const s = sectionAt(body, y);
  if (!s) return Infinity;
  const f = (x / s.a) ** 2 + (z / s.b) ** 2;
  const r = Math.hypot(x, z);
  if (f === 0) return -Math.min(s.a, s.b);
  return r * (1 - 1 / Math.sqrt(f));
}

/* ---------------- mesh ---------------- */

function insideRing(ring, x, y) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function nearRing(ring, x, y, tol) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= tol) return true;
  }
  return false;
}

/**
 * Mesh a rectangle-bounded panel on a grid. `inside(u, v)` says whether a grid
 * point (pattern metres) belongs to the panel. Returns rest coordinates and
 * triangles; `grid[r][c]` is the vertex index or -1.
 */
export function gridMesh({ x0, x1, y0, y1, h, inside = () => true }) {
  const nc = Math.max(1, Math.round((x1 - x0) / h)), nr = Math.max(1, Math.round((y1 - y0) / h));
  const hx = (x1 - x0) / nc, hy = (y1 - y0) / nr;
  const uv = [], grid = [];
  for (let r = 0; r <= nr; r++) {
    grid.push([]);
    for (let c = 0; c <= nc; c++) {
      const u = x0 + c * hx, v = y0 + r * hy;
      if (inside(u, v)) { grid[r].push(uv.length); uv.push([u, v]); } else grid[r].push(-1);
    }
  }
  const tris = [];
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const a = grid[r][c], b = grid[r][c + 1], d = grid[r + 1][c], e = grid[r + 1][c + 1];
    const flip = (r + c) % 2 === 1;
    const cand = flip ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]];
    for (const t of cand) if (t.every(i => i >= 0)) tris.push(t);
  }
  // drop vertices no triangle uses
  const used = new Uint8Array(uv.length);
  tris.forEach(t => t.forEach(i => { used[i] = 1; }));
  const remap = new Int32Array(uv.length).fill(-1), uv2 = [];
  uv.forEach((p, i) => { if (used[i]) { remap[i] = uv2.length; uv2.push(p); } });
  return {
    uv: uv2, tris: tris.map(t => t.map(i => remap[i])),
    grid: grid.map(row => row.map(i => (i >= 0 ? remap[i] : -1))), hx, hy, nc, nr, x0, y0,
  };
}

/* ---------------- solver ---------------- */

/**
 * Build constraints for a set of meshes merged into one cloth.
 * @param {{uv:number[][], tris:number[][], grid:number[][], hx:number, hy:number}[]} meshes
 */
export function buildCloth(meshes, fabric) {
  const n = meshes.reduce((s, m) => s + m.uv.length, 0);
  const rest = [], offs = [];
  let off = 0;
  const edges = [];
  const rho = fabric.gsm / 1000;
  const mass = new Float64Array(n);
  const tris = [];
  for (const m of meshes) {
    offs.push(off);
    m.uv.forEach(p => rest.push(p));
    // A structural edge carries the half of each grid cell on either side of it, so
    // edges on the panel's outline get half stiffness; diagonals and skip-one edges
    // also carry tension, so the structural springs are reduced to keep the sum at Kt.
    const Kt = fabric.ktNPerM, kd = 0.05 * Kt, kb = 0.002 * Kt, ks = Kt - kd - 2 * kb;
    const kx = ks * m.hx / m.hy, ky = ks * m.hy / m.hx;
    const g = m.grid, add = (i, j, k, kind) => { if (i >= 0 && j >= 0 && k > 0) edges.push([i + off, j + off, k, kind]); };
    const full = (r, c) => r >= 0 && c >= 0 && r + 1 < g.length && c + 1 < g[r].length && g[r][c] >= 0 && g[r][c + 1] >= 0 && g[r + 1][c] >= 0 && g[r + 1][c + 1] >= 0;
    const share = (a, b) => Math.max(0.5 * (a + b), 0.5); // a partial cell still holds the edge
    for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) {
      const i = g[r][c]; if (i < 0) continue;
      if (c + 1 < g[r].length) add(i, g[r][c + 1], kx * share(full(r - 1, c), full(r, c)), 0);
      if (r + 1 < g.length) add(i, g[r + 1][c], ky * share(full(r, c - 1), full(r, c)), 0);
      if (full(r, c)) { add(i, g[r + 1][c + 1], kd, 1); add(g[r][c + 1], g[r + 1][c], kd, 1); }
      if (c + 2 < g[r].length && full(r - 1, c) + full(r, c) + full(r - 1, c + 1) + full(r, c + 1) > 0) add(i, g[r][c + 2], kb, 2);
      if (r + 2 < g.length && full(r, c - 1) + full(r, c) + full(r + 1, c - 1) + full(r + 1, c) > 0) add(i, g[r + 2][c], kb, 2);
    }
    for (const t of m.tris) {
      const [a, b, c] = t.map(i => m.uv[i]);
      const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      t.forEach(i => { mass[i + off] += rho * A / 3; });
      tris.push(t.map(i => i + off));
    }
    off += m.uv.length;
  }
  // keep only edges whose endpoints both exist in the mesh (grid entries may have been dropped)
  const E = edges.filter(([i, j]) => i < n && j < n);
  const ei = new Int32Array(E.length), ej = new Int32Array(E.length), er = new Float64Array(E.length), ek = new Float64Array(E.length);
  E.forEach(([i, j, k], q) => { ei[q] = i; ej[q] = j; er[q] = Math.hypot(rest[i][0] - rest[j][0], rest[i][1] - rest[j][1]); ek[q] = k; });
  return { n, rest, offs, ei, ej, er, ek, mass, tris };
}

/**
 * Run the cloth.
 * @param {object} cloth  from buildCloth
 * @param {Float64Array} pos initial world positions (3n)
 * @param {object} o  {body, pins:Set<number>, seams:[i,j][], sewTime, settleTime, gravity, friction, damping, substeps, thickness}
 */
export function simulate(cloth, pos, o = {}) {
  const { n, ei, ej, er, ek, mass } = cloth;
  const body = o.body || null, thick = o.thickness ?? 0.002;
  const sub = o.substeps ?? 24, frame = 1 / 60, dt = frame / sub;
  const sewT = o.sewTime ?? 0, settleT = o.settleTime ?? 1.5;
  const mu = o.friction ?? 0.4, damp = o.damping ?? 3, compSoft = o.compressionSoftness ?? 1, iters = o.iterations ?? 1;
  const lam = new Float64Array(ei.length);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = mass[i] > 0 ? 1 / mass[i] : 0;
  (o.pins || []).forEach(i => { w[i] = 0; });
  const prev = new Float64Array(pos), vel = new Float64Array(3 * n);
  const seams = o.seams || [];
  const seamD0 = seams.map(([i, j]) => Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]));
  const seamK = o.seamStiffness ?? 2e4;
  const contactImpulse = new Float64Array(n); // sum over the last frame of normal correction * mass (kg m)
  const steps = Math.round((sewT + settleT) / dt);
  const lastFrameFrom = steps - sub * (o.measureFrames ?? 30);
  let t = 0;
  for (let s = 0; s < steps; s++, t += dt) {
    const sewing = t < sewT;
    const gy = sewing ? 0 : -(o.gravity ?? G);
    const dmp = Math.max(0, 1 - (sewing ? 4 * damp : damp) * dt);
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      const k = 3 * i;
      vel[k] *= dmp; vel[k + 1] = (vel[k + 1] + gy * dt) * dmp; vel[k + 2] *= dmp;
      prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2];
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
    }
    const dt2 = dt * dt;
    if (iters > 1) lam.fill(0);
    for (let it = 0; it < iters; it++) {
      for (let q = 0; q < ei.length; q++) {
        const i = ei[q], j = ej[q], wi = w[i], wj = w[j], ws = wi + wj;
        if (ws === 0) continue;
        const a = 3 * i, b = 3 * j;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-12) continue;
        const C = d - er[q];
        const alpha = (C < 0 ? compSoft : 1) / ek[q] / dt2;
        const dl = (-C - alpha * lam[q]) / (ws + alpha);
        lam[q] += dl;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        pos[a] -= wi * dl * nx; pos[a + 1] -= wi * dl * ny; pos[a + 2] -= wi * dl * nz;
        pos[b] += wj * dl * nx; pos[b + 1] += wj * dl * ny; pos[b + 2] += wj * dl * nz;
      }
      if (iters === 1) lam.fill(0);
    }
    if (seams.length) {
      const f = sewing ? Math.max(0, 1 - t / (0.7 * sewT)) : 0;
      const alpha = 1 / seamK / dt2;
      for (let q = 0; q < seams.length; q++) {
        const [i, j] = seams[q], wi = w[i], wj = w[j], ws = wi + wj;
        if (ws === 0) continue;
        const a = 3 * i, b = 3 * j;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-12) continue;
        const C = d - f * seamD0[q];
        const dl = -C / (ws + alpha);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        pos[a] -= wi * dl * nx; pos[a + 1] -= wi * dl * ny; pos[a + 2] -= wi * dl * nz;
        pos[b] += wj * dl * nx; pos[b + 1] += wj * dl * ny; pos[b + 2] += wj * dl * nz;
      }
    }
    if (body) {
      const measure = s >= lastFrameFrom;
      for (let i = 0; i < n; i++) {
        if (w[i] === 0) continue;
        const k = 3 * i, depth = pushOut(body, pos, k, thick);
        if (depth <= 0) continue;
        if (measure) contactImpulse[i] += depth * mass[i];
        // friction: cancel tangential motion over this substep up to mu * normal correction
        const nx = NRM[0], ny = NRM[1], nz = NRM[2];
        let tx = pos[k] - prev[k], ty = pos[k + 1] - prev[k + 1], tz = pos[k + 2] - prev[k + 2];
        const dn = tx * nx + ty * ny + tz * nz;
        tx -= dn * nx; ty -= dn * ny; tz -= dn * nz;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tl > 0) {
          const f = Math.min(1, mu * depth / tl);
          pos[k] -= f * tx; pos[k + 1] -= f * ty; pos[k + 2] -= f * tz;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      const k = 3 * i;
      vel[k] = (pos[k] - prev[k]) / dt; vel[k + 1] = (pos[k + 1] - prev[k + 1]) / dt; vel[k + 2] = (pos[k + 2] - prev[k + 2]) / dt;
    }
  }
  const frames = Math.max(1, Math.min(steps, steps - Math.max(0, lastFrameFrom)));
  // mean contact force per vertex over the measuring window: impulse-like sum (m kg) / (dt^2 * substeps counted)
  const force = new Float64Array(n);
  for (let i = 0; i < n; i++) force[i] = contactImpulse[i] / (dt * dt) / frames;
  let ke = 0;
  for (let i = 0; i < n; i++) ke += 0.5 * mass[i] * (vel[3 * i] ** 2 + vel[3 * i + 1] ** 2 + vel[3 * i + 2] ** 2);
  return { pos, force, kineticJ: ke, steps, dt };
}

const NRM = [0, 0, 0];
/** Push vertex k out of the body along the surface normal; returns the depth corrected (m). */
function pushOut(body, pos, k, thick) {
  let x = pos[k], y = pos[k + 1], z = pos[k + 2];
  const s = sectionAt(body, y);
  if (!s) return 0;
  const a = s.a + thick, b = s.b + thick;
  const f = (x / a) ** 2 + (z / b) ** 2;
  if (f >= 1) return 0;
  const x0 = x, y0 = y, z0 = z;
  // Newton steps on F = (x/a(y))^2 + (z/b(y))^2 - 1 with the y-slope of the section
  for (let it = 0; it < 3; it++) {
    const s0 = sectionAt(body, y);
    if (!s0) break;
    const A = s0.a + thick, B = s0.b + thick;
    const F = (x / A) ** 2 + (z / B) ** 2 - 1;
    if (F >= -1e-9) break;
    const e = 1e-4, s1 = sectionAt(body, y + e) || s0, s2 = sectionAt(body, y - e) || s0;
    const dA = (s1.a - s2.a) / (2 * e), dB = (s1.b - s2.b) / (2 * e);
    const gx = 2 * x / (A * A), gz = 2 * z / (B * B);
    const gy = -2 * x * x / (A * A * A) * dA - 2 * z * z / (B * B * B) * dB;
    let g2 = gx * gx + gy * gy + gz * gz;
    if (g2 < 1e-12) { x += 1e-3; continue; }
    x -= F * gx / g2; y -= F * gy / g2; z -= F * gz / g2;
  }
  // guarantee outside: final horizontal scale
  const s3 = sectionAt(body, y);
  if (s3) {
    const f3 = (x / (s3.a + thick)) ** 2 + (z / (s3.b + thick)) ** 2;
    if (f3 < 1 && f3 > 0) { const r = 1 / Math.sqrt(f3); x *= r; z *= r; }
  }
  const dx = x - x0, dy = y - y0, dz = z - z0, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d > 0) { NRM[0] = dx / d; NRM[1] = dy / d; NRM[2] = dz / d; }
  pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
  return d;
}

/* ---------------- strain ---------------- */

/** Per-triangle stretch of the pattern's x (course, around the body) and y (grain, down the body) directions. */
export function triangleStrain(cloth, pos) {
  const out = [];
  for (const t of cloth.tris) {
    const [i, j, k] = t, R = cloth.rest;
    const m00 = R[j][0] - R[i][0], m01 = R[k][0] - R[i][0], m10 = R[j][1] - R[i][1], m11 = R[k][1] - R[i][1];
    const det = m00 * m11 - m01 * m10;
    if (Math.abs(det) < 1e-14) { out.push({ ex: 0, ey: 0, area: 0 }); continue; }
    const inv = [m11 / det, -m01 / det, -m10 / det, m00 / det];
    const d1 = [0, 1, 2].map(c => pos[3 * j + c] - pos[3 * i + c]), d2 = [0, 1, 2].map(c => pos[3 * k + c] - pos[3 * i + c]);
    const Fx = [0, 1, 2].map(c => d1[c] * inv[0] + d2[c] * inv[2]);
    const Fy = [0, 1, 2].map(c => d1[c] * inv[1] + d2[c] * inv[3]);
    out.push({ ex: Math.hypot(...Fx) - 1, ey: Math.hypot(...Fy) - 1, area: Math.abs(det) / 2 });
  }
  return out;
}

/* ---------------- garment ---------------- */

export const SIMULATED = Object.freeze(["tee", "longsleeve", "crewneck", "hoodie"]);

/**
 * Sew and drape one size of a drafted garment on a body.
 * @param {{chest:number, waist?:number, hip?:number, height?:number}} measures cm
 * @param {{garment?:string, size?:string, fit?:string, fabric?:string|{gsm:number,ktNPerM:number}, gridCm?:number, sizeChart?:object, settleTime?:number}} opts
 */
export function drapeGarment(measures, { garment = "tee", size = "M", fit = "regular", fabric = "jersey", gridCm = 2.5, sizeChart = BODY_CHEST_CM, settleTime = 1.6, sewTime = 0.5, substeps = 32 } = {}) {
  if (!SIMULATED.includes(garment)) return { ok: false, error: `No drape for "${garment}".` };
  const body = bodyModel(measures);
  if (!body.ok) return body;
  const fab = typeof fabric === "string" ? FABRICS[fabric] : fabric;
  if (!fab || !(fab.gsm >= 50 && fab.gsm <= 800) || !(fab.ktNPerM >= 2 && fab.ktNPerM <= 2000)) return { ok: false, error: "Fabric needs a weight from 50 to 800 g/m² and a stiffness from 2 to 2000 N/m." };
  if (!(gridCm >= 1 && gridCm <= 6)) return { ok: false, error: "Grid must be 1 to 6 cm." };
  const d = draft(garment, size, { fit, sizeChart });
  if (!d.ok) return d;
  const bl = d.block, cm = 0.01, h = gridCm * cm;
  const Q = bl.Q * cm, Lp = bl.L * cm;
  const panel = name => {
    const p = d.pieces.find(x => x.name === name);
    const ring = p.stitch.map(([x, y]) => [x * cm, y * cm]);
    return gridMesh({ x0: -Q, x1: Q, y0: 0, y1: Lp, h, inside: (u, v) => insideRing(ring, Math.abs(u), v) || nearRing(ring, Math.abs(u), v, 1e-6) });
  };
  const front = panel("front"), back = panel("back");
  const cloth = buildCloth([front, back], fab);
  const offB = cloth.offs[1];

  // place on an elliptic tube around the body, front at +z
  let A = 0, B = 0;
  for (const l of body.levels) if (l.y <= body.hps) { A = Math.max(A, l.a); B = Math.max(B, l.b); }
  A += 0.03; B += 0.03;
  const pos = new Float64Array(3 * cloth.n);
  const place = (mesh, off, sign) => mesh.uv.forEach(([u, v], i) => {
    const th = (u / (2 * Q)) * Math.PI, k = 3 * (i + off);
    pos[k] = A * Math.sin(th); pos[k + 1] = body.hps - v; pos[k + 2] = sign * B * Math.cos(th);
  });
  place(front, 0, 1); place(back, offB, -1);

  // seams: shoulders (top vertex of each column between neck and shoulder point) and side seams (x = +-Q, below the armhole)
  const seams = [];
  const hn = bl.hn * cm, sx = bl.sx * cm, ad = bl.ad * cm;
  for (let c = 0; c <= front.nc; c++) {
    const u = front.x0 + c * front.hx;
    if (Math.abs(u) < hn - 1e-9 || Math.abs(u) > sx + 1e-9) continue;
    const top = g => { for (let r = 0; r < g.length; r++) if (g[r][c] >= 0) return g[r][c]; return -1; };
    const i = top(front.grid), j = top(back.grid);
    if (i >= 0 && j >= 0) seams.push([i, j + offB]);
  }
  for (const c of [0, front.nc]) for (let r = 0; r <= front.nr; r++) {
    const v = front.y0 + r * front.hy;
    if (v < ad - 1e-9) continue;
    const i = front.grid[r][c], j = back.grid[r][c];
    if (i >= 0 && j >= 0) seams.push([i, j + offB]);
  }
  const sim = simulate(cloth, pos, { body, seams, sewTime, settleTime, substeps, friction: 0.4, damping: 3, thickness: 0.002 });
  return { ok: true, garment, size, fit, fabric: fab, body, draft: d, cloth, seams, ...analyse(cloth, sim, body, seams, fab, { front, back, offB, Lp }) };
}

/** Fit numbers by level from a settled simulation. */
function analyse(cloth, sim, body, seams, fab, { front, offB, Lp }) {
  const { pos, force } = sim, n = cloth.n;
  const strain = triangleStrain(cloth, pos);
  const centroidY = cloth.tris.map(t => (pos[3 * t[0] + 1] + pos[3 * t[1] + 1] + pos[3 * t[2] + 1]) / 3);
  let seamGap = 0;
  for (const [i, j] of seams) seamGap = Math.max(seamGap, Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]));
  let inside = 0;
  for (let i = 0; i < n; i++) if (clearance(body, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]) < -0.002) inside++;
  // hem: mean height of the front panel's bottom row against a straight drop of the pattern length from the HPS
  const hemRow = front.grid[front.nr].filter(i => i >= 0);
  const hemY = hemRow.reduce((s, i) => s + pos[3 * i + 1], 0) / (hemRow.length || 1);
  const hemDropCm = (body.hps - Lp - hemY) * 100;
  let totalMass = 0;
  for (let i = 0; i < n; i++) totalMass += cloth.mass[i];
  const L = LANDMARKS, H = body.H;
  const want = [["chest", L.chest * H], ["waist", L.waist * H], ["hip", L.hip * H]].filter(([, y]) => y > hemY + 0.03);
  want.push(["hem", hemY + 0.03]);
  const half = 0.015;
  const levels = want.map(([where, y]) => {
    let sA = 0, sE = 0, maxE = -Infinity;
    strain.forEach((s, q) => { if (Math.abs(centroidY[q] - y) <= half && s.area > 0) { sA += s.area; sE += s.area * s.ex; maxE = Math.max(maxE, s.ex); } });
    let cnt = 0, clr = 0, touch = 0, fsum = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(pos[3 * i + 1] - y) > half) continue;
      const c = clearance(body, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
      cnt++; clr += c; if (c < 0.005) touch++; fsum += force[i];
    }
    const hoop = sA ? sE / sA : 0, girth = girthAt(body, y);
    const R = girth / (2 * Math.PI);
    const tension = fab.ktNPerM * Math.max(0, hoop);
    const touching = cnt ? touch / cnt : 0;
    const laplacePa = touching > 0.6 ? tension / R : 0;
    const simPa = girth > 0 ? fsum / (girth * 2 * half) : 0;
    return {
      where, heightCm: r1(y * 100), bodyGirthCm: r1(girth * 100),
      hoopStrainPct: r1(hoop * 100), maxHoopStrainPct: r1((Number.isFinite(maxE) ? maxE : 0) * 100),
      clearanceCm: r1(cnt ? (clr / cnt) * 100 : 0), touchingPct: Math.round(touching * 100),
      pressurePa: Math.round(laplacePa), pressureMmHg: r1(laplacePa / MMHG_PA), simPressurePa: Math.round(simPa),
      word: fitWord(hoop, touching, cnt ? clr / cnt : 0),
    };
  });
  return {
    pos, strain, levels, kineticJ: sim.kineticJ,
    checks: { seamGapCm: r2(seamGap * 100), verticesInsideBody: inside, vertices: n, triangles: cloth.tris.length, hemDropCm: r1(hemDropCm), hemFromFloorCm: r1(hemY * 100), garmentMassG: Math.round(totalMass * 1000), settled: sim.kineticJ / totalMass < 1e-4 },
    notes: notesFor(levels, hemDropCm, body),
  };
}

function fitWord(hoop, touching, clr) {
  if (hoop > 0.08) return "pulling tight: the cloth is stretched round the body";
  if (hoop > 0.02) return "close: touching and slightly stretched";
  if (touching > 0.6) return "skims the body without stretching";
  if (clr < 0.02) return "close, with some room";
  if (clr < 0.05) return "relaxed: stands a little off the body";
  return "loose: hangs well away from the body";
}

function notesFor(levels, hemDropCm, body) {
  const out = [];
  const tight = levels.filter(l => l.hoopStrainPct > 8);
  if (tight.length) out.push(`Stretched more than 8% round the ${tight.map(l => l.where).join(" and ")}: unless the fabric is a stretch knit it will look strained and may ride up; try the next size or a stretch fabric.`);
  if (hemDropCm > 1.5) out.push(`The hem hangs ${r1(hemDropCm)} cm lower than a straight drop of the pattern length from the shoulder: the cloth stretches under its own weight.`);
  if (hemDropCm < -1.5) out.push(`The hem sits ${r1(-hemDropCm)} cm higher than a straight drop of the pattern length from the shoulder: that much length goes over the shoulder and round the chest. A flat size chart misses this; add it to the body length if the hem must reach a set point.`);
  if (body.assumed?.length) out.push(`Not given, so assumed: ${body.assumed.join(", ")}.`);
  out.push("Body panels only: sleeves, hood and rib bands are not simulated yet, and the body is smooth ellipses, so treat this as a picture of ease and tension, not a promise of fit.");
  return out;
}

const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;

/* ---------------- drawing ---------------- */

/** Colour for a hoop strain (fraction): blue-grey when slack, yellow to red as it stretches. */
export function strainColour(e, shade = 1) {
  let r, g, b;
  if (e <= 0.005) { r = 120; g = 150; b = 190; }
  else { const t = Math.min(1, e / 0.12); r = 240; g = Math.round(210 - 170 * t); b = Math.round(90 - 60 * t); }
  const s = Math.max(0.35, Math.min(1, shade));
  return `rgb(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)})`;
}

/**
 * Front or side view as SVG: body silhouette, then the cloth triangles back to
 * front, coloured by hoop strain and shaded by their facing.
 * @param {"front"|"side"|"back"} view
 */
export function drapeSvg(res, view = "front") {
  const { pos, cloth, strain, body } = res;
  const proj = view === "side" ? (k => [pos[k + 2], pos[k + 1], pos[k]]) : view === "back" ? (k => [-pos[k], pos[k + 1], -pos[k + 2]]) : (k => [pos[k], pos[k + 1], pos[k + 2]]);
  const yTop = body.H * 0.95, yBot = body.H * 0.36, W = body.H * 0.36;
  const X = x => r1((x + W / 2) * 1000) / 10, Y = y => r1((yTop - y) * 1000) / 10;
  const vb = `0 0 ${r1(W * 100)} ${r1((yTop - yBot) * 100)}`;
  const sil = [];
  const ys = [];
  for (let y = yBot; y <= body.top + 1e-9; y += 0.01) ys.push(y);
  const half = y => { const s = sectionAt(body, y); return s ? (view === "side" ? s.b : s.a) : 0; };
  ys.forEach(y => sil.push(`${X(-half(y))},${Y(y)}`));
  ys.slice().reverse().forEach(y => sil.push(`${X(half(y))},${Y(y)}`));
  const headR = 0.06 * body.H;
  const items = cloth.tris.map((t, q) => {
    const P = t.map(i => proj(3 * i));
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
    const vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
    const shade = 0.45 + 0.55 * Math.abs((0.3 * nx + 0.4 * ny + 0.87 * nz) / nl);
    return { z: (P[0][2] + P[1][2] + P[2][2]) / 3, d: `M${X(P[0][0])} ${Y(P[0][1])}L${X(P[1][0])} ${Y(P[1][1])}L${X(P[2][0])} ${Y(P[2][1])}Z`, c: strainColour(strain[q].ex, shade) };
  }).sort((a, b) => a.z - b.z);
  const label = { front: "Front view", side: "Side view", back: "Back view" }[view];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${label}: the draped garment coloured by how much it stretches round the body">` +
    `<polygon points="${sil.join(" ")}" fill="#d9d2c8"/>` +
    `<circle cx="${X(0)}" cy="${Y(body.top + headR * 0.8)}" r="${r1(headR * 100)}" fill="#d9d2c8"/>` +
    items.map(it => `<path d="${it.d}" fill="${it.c}" stroke="${it.c}" stroke-width="0.15"/>`).join("") + `</svg>`;
}
