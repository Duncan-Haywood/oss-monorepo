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
 * Sleeves (2026-11-13): the drafted sleeve is meshed twice, wrapped round
 * straight arms held out 30 degrees from the sides (round tapered capsules from
 * the upper arm and wrist girths), its underarm seam closed row by row and its
 * cap sewn into the armhole at matching fractions of the two curves' lengths
 * (`pairEdges`, so the cap's ease is gathered in rather than dropped). Twelve
 * seam passes per substep, because the shoulder point, where the shoulder seam
 * and both cap halves meet, otherwise gapped 3 cm from solver ordering alone.
 *
 * What it is NOT: a fitted body scan, a validated fabric model or a fit
 * promise. Hood, pocket and rib bands are not simulated yet. The arms are
 * straight and fixed in one pose, so the sleeve's hang on a lowered arm and
 * the pull across the back when reaching forward are not shown; arms held out
 * also add some pull across the chest of a tight top (`sleeves: false` gives
 * the panels alone). The fabric stiffness presets are rough typed
 * guesses, not lab measurements: where the cloth is tight the STRAIN is set
 * by the body and is robust, but the PRESSURE scales directly with the
 * stiffness you enter. Thickness, wrinkles finer than the grid, and
 * anisotropy between the course and wale directions are ignored.
 */
import { draft, armholeCurve } from "./pattern.mjs";
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
export function bodyModel(m, { armAngleDeg = 30 } = {}) {
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
  // Arms: straight, held out armAngleDeg from the side (an A pose, as virtual
  // fitting avatars use, so the sleeve's underarm has room beside the torso).
  // Round tapered capsules: upper arm girth at the top, 0.8 of it at the elbow,
  // the wrist girth at the wrist, then a hand. Typical proportions when not
  // measured: upper arm 0.31 x chest, wrist 0.165 x chest, elbow 0.186 H and
  // wrist 0.332 H below the shoulder point (as in tryon.mjs).
  let upperArm = num(m?.upperArm, 15, 70); if (upperArm == null) { upperArm = Math.round(chest * 3.1) / 10; assumed.push(`upper arm ${upperArm} cm`); }
  let wrist = num(m?.wrist, 10, 30); if (wrist == null) { wrist = Math.round(chest * 1.65) / 10; assumed.push(`wrist ${wrist} cm`); }
  const rU = upperArm / 100 / (2 * Math.PI), rW = wrist / 100 / (2 * Math.PI), rE = Math.max(rW, 0.8 * rU);
  const al = Math.max(5, Math.min(60, armAngleDeg)) * Math.PI / 180;
  const arms = [1, -1].map(sg => {
    const d = [sg * Math.sin(al), -Math.cos(al), 0];
    const p0 = [sg * (shoulderA - rU), hps - slope - rU, 0];
    const at = s => [p0[0] + s * d[0], p0[1] + s * d[1], 0];
    const sE = 0.186 * H - rU * 0.5, sW = 0.332 * H - rU * 0.5, sH = sW + 0.1 * H;
    return {
      side: sg, p0, d, n1: [sg * Math.cos(al), Math.sin(al), 0], wristAt: sW, elbowAt: sE,
      caps: [
        { a: p0, b: at(sE), ra: rU, rb: rE, s0: 0 },
        { a: at(sE), b: at(sW), ra: rE, rb: rW, s0: sE },
        { a: at(sW), b: at(sH), ra: rW * 1.15, rb: rW * 1.15, s0: sW },
      ],
    };
  });
  return { ok: true, levels, top: 0.93 * H, H, measures: { chest, waist, hip, height, upperArm, wrist }, assumed, hps, slope, arms, armAngleDeg: Math.round(al * 180 / Math.PI) };
}

/** Radius (m) of an arm at distance s along its axis from the shoulder joint. */
export function armRadiusAt(arm, s) {
  for (const c of arm.caps) {
    const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]);
    if (s <= c.s0 + L) return c.ra + (c.rb - c.ra) * Math.max(0, Math.min(1, (s - c.s0) / (L || 1)));
  }
  const c = arm.caps[arm.caps.length - 1];
  return c.rb;
}

/**
 * Nearest arm surface: {dist, cx, cy, cz, r, s} where dist is the distance from the
 * point to the surface (negative inside), (cx, cy, cz) the axis point and s its
 * distance along the axis. Capsules with a linear radius taper (the slope is
 * small, so the radial distance stands in for the true one).
 */
export function armContact(body, x, y, z) {
  let best = null;
  for (const arm of body.arms || []) for (const c of arm.caps) {
    const ux = c.b[0] - c.a[0], uy = c.b[1] - c.a[1], uz = c.b[2] - c.a[2], L2 = ux * ux + uy * uy + uz * uz;
    let t = ((x - c.a[0]) * ux + (y - c.a[1]) * uy + (z - c.a[2]) * uz) / (L2 || 1);
    t = Math.max(0, Math.min(1, t));
    const cx = c.a[0] + t * ux, cy = c.a[1] + t * uy, cz = c.a[2] + t * uz;
    const r = c.ra + (c.rb - c.ra) * t, dist = Math.hypot(x - cx, y - cy, z - cz) - r;
    if (!best || dist < best.dist) best = { dist, cx, cy, cz, r, s: c.s0 + t * Math.sqrt(L2), arm };
  }
  return best;
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

/** Distance (m) from a point to the torso or an arm, whichever is nearer; negative inside either. */
export function bodyClearance(body, x, y, z) {
  const t = clearance(body, x, y, z), a = armContact(body, x, y, z);
  return a ? Math.min(t, a.dist) : t;
}

/** Distance (m) from a point to the torso along the horizontal ray from the axis; negative inside. */
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
  const tris = [], triOffs = [];
  for (const m of meshes) {
    offs.push(off); triOffs.push(tris.length);
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
  return { n, rest, offs, triOffs, ei, ej, er, ek, mass, tris };
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
  const seamK = o.seamStiffness ?? 2e4, seamPasses = o.seamPasses ?? 1;
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
    if (seams.length) for (let sp = 0; sp < seamPasses; sp++) {
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
        const k = 3 * i;
        for (let part = 0; part < 2; part++) {
          const depth = part === 0 ? pushOut(body, pos, k, thick) : (body.arms ? pushOutArm(body, pos, k, thick) : 0);
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
  return { pos, vel, force, kineticJ: ke, steps, dt };
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

/** Push vertex k out of the nearest arm capsule along its radius; returns the depth corrected (m). */
function pushOutArm(body, pos, k, thick) {
  const x = pos[k], y = pos[k + 1], z = pos[k + 2];
  const c = armContact(body, x, y, z);
  if (!c || c.dist >= thick) return 0;
  let dx = x - c.cx, dy = y - c.cy, dz = z - c.cz, d = Math.hypot(dx, dy, dz);
  if (d < 1e-9) { dx = c.arm.n1[0]; dy = c.arm.n1[1]; dz = 0; d = 1; }
  const depth = c.r + thick - d;
  NRM[0] = dx / d; NRM[1] = dy / d; NRM[2] = dz / d;
  pos[k] = x + NRM[0] * depth; pos[k + 1] = y + NRM[1] * depth; pos[k + 2] = z + NRM[2] * depth;
  return depth;
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

/** Grid vertices of a mesh with a missing 4-neighbour: the panel's outline. */
function outline(mesh) {
  const g = mesh.grid, out = [];
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) {
    const i = g[r][c]; if (i < 0) continue;
    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    if (nb.some(([a, b]) => a < 0 || b < 0 || a >= g.length || b >= g[a].length || g[a][b] < 0)) out.push({ i, r, c, u: mesh.x0 + c * mesh.hx, v: mesh.y0 + r * mesh.hy });
  }
  return out;
}

/** Nearest point on a polyline: {d, f} = distance and arc-length fraction (0 at the first point). */
export function onPolyline(line, x, y) {
  let total = 0; const segL = [];
  for (let i = 1; i < line.length; i++) { const l = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); segL.push(l); total += l; }
  let best = { d: Infinity, f: 0 }, acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best.d) best = { d, f: total ? (acc + t * segL[i - 1]) / total : 0 };
    acc += segL[i - 1];
  }
  return best;
}

/**
 * Pair two edges to be sewn, each a list of {i, f} (vertex, fraction along the
 * edge): every vertex on either edge is joined to the vertex at the nearest
 * fraction on the other, so unequal spacing is eased in rather than dropped.
 */
export function pairEdges(A, B) {
  if (!A.length || !B.length) return [];
  const near = (L, f) => L.reduce((b, x) => (Math.abs(x.f - f) < Math.abs(b.f - f) ? x : b));
  const seen = new Set(), out = [];
  const add = (i, j) => { const key = i + ":" + j; if (!seen.has(key)) { seen.add(key); out.push([i, j]); } };
  A.forEach(a => add(a.i, near(B, a.f).i));
  B.forEach(b => add(near(A, b.f).i, b.i));
  return out;
}

/**
 * Sew and drape one size of a drafted garment on a body.
 * @param {{chest:number, waist?:number, hip?:number, height?:number, upperArm?:number, wrist?:number}} measures cm
 * @param {{garment?:string, size?:string, fit?:string, fabric?:string|{gsm:number,ktNPerM:number}, gridCm?:number, sizeChart?:object, settleTime?:number, sleeves?:boolean, armAngleDeg?:number, pattern?:object}} opts
 */
export function drapeGarment(measures, { garment = "tee", size = "M", fit = "regular", fabric = "jersey", gridCm = 2.5, sizeChart = BODY_CHEST_CM, settleTime, sewTime, substeps = 32, sleeves = true, armAngleDeg = 30, pattern = {} } = {}) {
  if (!SIMULATED.includes(garment)) return { ok: false, error: `No drape for "${garment}".` };
  const body = bodyModel(measures, { armAngleDeg });
  if (!body.ok) return body;
  if (!sleeves) { body.arms = null; body.assumed = body.assumed.filter(a => !/^(upper arm|wrist) /.test(a)); }
  settleTime ??= sleeves ? 2.0 : 1.6; sewTime ??= sleeves ? 0.7 : 0.5;
  const fab = typeof fabric === "string" ? FABRICS[fabric] : fabric;
  if (!fab || !(fab.gsm >= 50 && fab.gsm <= 800) || !(fab.ktNPerM >= 2 && fab.ktNPerM <= 2000)) return { ok: false, error: "Fabric needs a weight from 50 to 800 g/m² and a stiffness from 2 to 2000 N/m." };
  if (!(gridCm >= 1 && gridCm <= 6)) return { ok: false, error: "Grid must be 1 to 6 cm." };
  const d = draft(garment, size, { fit, sizeChart, ...pattern });
  if (!d.ok) return d;
  const bl = d.block, cm = 0.01, h = gridCm * cm;
  const Q = bl.Q * cm, Lp = bl.L * cm;
  const ringOf = name => d.pieces.find(x => x.name === name).stitch.map(([x, y]) => [x * cm, y * cm]);
  const panel = name => {
    const ring = ringOf(name);
    return gridMesh({ x0: -Q, x1: Q, y0: 0, y1: Lp, h, inside: (u, v) => insideRing(ring, Math.abs(u), v) || nearRing(ring, Math.abs(u), v, 1e-6) });
  };
  const front = panel("front"), back = panel("back");
  let sleeve = null, sp = null;
  if (sleeves) {
    sp = d.pieces.find(x => x.name === "sleeve");
    const ring = ringOf("sleeve"), xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const hs = Math.min(h, 0.02); // sleeves are narrow: at most a 2 cm grid
    sleeve = gridMesh({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), h: hs, inside: (u, v) => insideRing(ring, u, v) || nearRing(ring, u, v, 1e-6) });
  }
  const meshes = sleeve ? [front, back, sleeve, sleeve] : [front, back];
  const cloth = buildCloth(meshes, fab);
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
  const sleeveInfo = [];
  if (sleeve) {
    const sv = sp.solved, capL = sv.cap.left.map(([x, y]) => [x * cm, y * cm]), capR = sv.cap.right.map(([x, y]) => [x * cm, y * cm]);
    const w = Math.max(...sleeve.uv.map(p => p[0])) - Math.min(...sleeve.uv.map(p => p[0]));
    const capH = sv.h * cm, tol = 0.75 * Math.max(sleeve.hx, sleeve.hy);
    const sOut = outline(sleeve);
    const armholes = { front: armholeCurve(bl, "front").map(([x, y]) => [x * cm, y * cm]), back: armholeCurve(bl, "back").map(([x, y]) => [x * cm, y * cm]) };
    const torsoEdge = (mesh, off, side, sg) => {
      const tolT = 0.75 * Math.max(mesh.hx, mesh.hy);
      return outline(mesh).filter(p => Math.sign(p.u) === sg).map(p => ({ i: p.i + off, ...onPolyline(armholes[side], Math.abs(p.u), p.v) })).filter(p => p.d <= tolT);
    };
    [1, -1].forEach((sg, q) => {
      const arm = body.arms.find(a => a.side === sg), off = cloth.offs[2 + q];
      // the underarm (cap baseline, pattern y = 0) sits level with the bottom of the body's armhole
      const s0 = (arm.p0[1] - (body.hps - ad)) / Math.cos(body.armAngleDeg * Math.PI / 180);
      const R0 = w / (2 * Math.PI);
      sleeve.uv.forEach(([u, v], i) => {
        const s = v + s0, R = Math.max(R0, armRadiusAt(arm, Math.max(0, s)) + 0.012), th = -2 * Math.PI * u / w;
        const k = 3 * (i + off), cth = Math.cos(th), sth = Math.sin(th);
        pos[k] = arm.p0[0] + s * arm.d[0] + R * cth * arm.n1[0];
        pos[k + 1] = arm.p0[1] + s * arm.d[1] + R * cth * arm.n1[1];
        pos[k + 2] = R * sth;
      });
      // cap to armhole: the cap's left half (front) runs underarm to top, the front armhole shoulder to underarm
      const capF = sOut.map(p => ({ i: p.i + off, ...onPolyline(capL, p.u, p.v) })).filter(p => p.d <= tol).map(p => ({ i: p.i, f: 1 - p.f }));
      const capB = sOut.map(p => ({ i: p.i + off, ...onPolyline(capR, p.u, p.v) })).filter(p => p.d <= tol);
      const armF = torsoEdge(front, 0, "front", sg), armB = torsoEdge(back, offB, "back", sg);
      const capSeams = [...pairEdges(capF, armF), ...pairEdges(capB, armB)];
      // underarm seam: the two slanted sides of the sleeve, row by row below the cap
      const under = [];
      sleeve.grid.forEach((row, r) => {
        if (sleeve.y0 + r * sleeve.hy < 0) return;
        const idx = row.filter(i => i >= 0);
        if (idx.length >= 2) under.push([idx[0] + off, idx[idx.length - 1] + off]);
      });
      seams.push(...capSeams, ...under);
      sleeveInfo.push({ side: sg, off, arm, s0, capSeams: capSeams.length, underSeams: under.length, capEdge: capF.length + capB.length, armholeEdge: armF.length + armB.length });
    });
    sleeveInfo.capHeightM = capH;
  }
  const sim = simulate(cloth, pos, { body, seams, sewTime, settleTime, substeps, friction: 0.4, damping: 3, thickness: 0.002, seamPasses: sleeve ? 12 : 1 });
  return { ok: true, garment, size, fit, fabric: fab, body, draft: d, cloth, seams, ...analyse(cloth, sim, body, seams, fab, { front, back, offB, Lp, sleeve, sleeveInfo }) };
}

/** Sleeve fit numbers: stretch round the arm at the bicep, the elbow and the cuff, and where the cuff lands. */
function sleeveLevels(cloth, pos, strain, force, body, fab, sleeve, info, q) {
  const off = info.off, t0 = cloth.triOffs[2 + q], t1 = 2 + q + 1 < cloth.triOffs.length ? cloth.triOffs[3 + q] : cloth.tris.length;
  const nV = sleeve.uv.length, vMax = Math.max(...sleeve.uv.map(p => p[1]));
  const hemRow = sleeve.grid[sleeve.nr].filter(i => i >= 0).map(i => i + off);
  // distance along the arm of the cuff (mean of the hem row's axial positions)
  const arm = info.arm;
  const axial = i => (pos[3 * i] - arm.p0[0]) * arm.d[0] + (pos[3 * i + 1] - arm.p0[1]) * arm.d[1] + pos[3 * i + 2] * arm.d[2];
  const cuffS = hemRow.reduce((s, i) => s + axial(i), 0) / (hemRow.length || 1);
  const band = (lo, hi, where) => {
    let sA = 0, sE = 0, maxE = -Infinity;
    for (let t = t0; t < t1; t++) {
      const tri = cloth.tris[t], vr = (cloth.rest[tri[0]][1] + cloth.rest[tri[1]][1] + cloth.rest[tri[2]][1]) / 3;
      if (vr < lo || vr > hi || strain[t].area <= 0) continue;
      sA += strain[t].area; sE += strain[t].area * strain[t].ex; maxE = Math.max(maxE, strain[t].ex);
    }
    let cnt = 0, clr = 0, touch = 0, rSum = 0;
    for (let j = 0; j < nV; j++) {
      const vr = cloth.rest[j + off][1];
      if (vr < lo || vr > hi) continue;
      const i = j + off, c = armContact(body, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
      if (!c) continue;
      cnt++; clr += c.dist; rSum += c.r; if (c.dist < 0.005) touch++;
    }
    const hoop = sA ? sE / sA : 0, R = cnt ? rSum / cnt : 0, touching = cnt ? touch / cnt : 0;
    const pa = touching > 0.6 && R > 0 ? fab.ktNPerM * Math.max(0, hoop) / R : 0;
    return { where, armGirthCm: r1(2 * Math.PI * R * 100), hoopStrainPct: r1(hoop * 100), maxHoopStrainPct: r1((Number.isFinite(maxE) ? maxE : 0) * 100), clearanceCm: r1(cnt ? clr / cnt * 100 : 0), touchingPct: Math.round(touching * 100), pressurePa: Math.round(pa), pressureMmHg: r1(pa / MMHG_PA), word: fitWord(hoop, touching, cnt ? clr / cnt : 0) };
  };
  const levels = [band(0.01, 0.04, "bicep")];
  const elbowV = arm.elbowAt - info.s0;
  if (elbowV < vMax - 0.04) levels.push(band(elbowV - 0.015, elbowV + 0.015, "elbow"));
  levels.push(band(vMax - 0.03, vMax, "cuff"));
  return { side: info.side < 0 ? "left" : "right", levels, cuffFromShoulderCm: r1((cuffS + body.arms[0].caps[0].ra) * 100), cuffPastWristCm: r1((cuffS - arm.wristAt) * 100), cuffAboveElbowCm: r1((arm.elbowAt - cuffS) * 100) };
}

/** Fit numbers by level from a settled simulation. */
function analyse(cloth, sim, body, seams, fab, { front, Lp, sleeve, sleeveInfo }) {
  const { pos, force } = sim, n = cloth.n;
  const strain = triangleStrain(cloth, pos);
  const nTorso = sleeve ? cloth.offs[2] : n, tTorso = sleeve ? cloth.triOffs[2] : cloth.tris.length;
  const centroidY = cloth.tris.map(t => (pos[3 * t[0] + 1] + pos[3 * t[1] + 1] + pos[3 * t[2] + 1]) / 3);
  let seamGap = 0;
  for (const [i, j] of seams) seamGap = Math.max(seamGap, Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]));
  let inside = 0;
  for (let i = 0; i < n; i++) if (bodyClearance(body, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]) < -0.002) inside++;
  // hem: mean height of the front panel's bottom row against a straight drop of the pattern length from the HPS
  const hemRow = front.grid[front.nr].filter(i => i >= 0);
  const hemY = hemRow.reduce((s, i) => s + pos[3 * i + 1], 0) / (hemRow.length || 1);
  const hemDropCm = (body.hps - Lp - hemY) * 100;
  let totalMass = 0, sleeveMass = 0, moving = 0;
  for (let i = 0; i < n; i++) { totalMass += cloth.mass[i]; if (i >= nTorso) sleeveMass += cloth.mass[i]; }
  // settled: under 0.5% of the vertices still moving faster than 2 cm/s. (A whole-garment
  // kinetic energy test was failed by one coincident front/back pair on a seam
  // trembling a millimetre per substep while every other vertex was still.)
  if (sim.vel) for (let i = 0; i < n; i++) if (Math.hypot(sim.vel[3 * i], sim.vel[3 * i + 1], sim.vel[3 * i + 2]) > 0.02) moving++;
  const L = LANDMARKS, H = body.H;
  const want = [["chest", L.chest * H], ["waist", L.waist * H], ["hip", L.hip * H]].filter(([, y]) => y > hemY + 0.03);
  want.push(["hem", hemY + 0.03]);
  const half = 0.015;
  const levels = want.map(([where, y]) => {
    let sA = 0, sE = 0, maxE = -Infinity;
    for (let q = 0; q < tTorso; q++) { const s = strain[q]; if (Math.abs(centroidY[q] - y) <= half && s.area > 0) { sA += s.area; sE += s.area * s.ex; maxE = Math.max(maxE, s.ex); } }
    let cnt = 0, clr = 0, touch = 0, fsum = 0;
    for (let i = 0; i < nTorso; i++) {
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
  const sleevesOut = sleeve ? sleeveInfo.map((info, q) => sleeveLevels(cloth, pos, strain, force, body, fab, sleeve, info, q)) : [];
  return {
    pos, strain, levels, sleeves: sleevesOut, kineticJ: sim.kineticJ,
    checks: { seamGapCm: r2(seamGap * 100), verticesInsideBody: inside, vertices: n, triangles: cloth.tris.length, hemDropCm: r1(hemDropCm), hemFromFloorCm: r1(hemY * 100), garmentMassG: Math.round(totalMass * 1000), sleeveMassG: Math.round(sleeveMass * 1000), settled: sim.vel ? moving <= 0.005 * n : sim.kineticJ / totalMass < 1e-4, movingVertices: moving, ...(sleeve ? { capSeams: sleeveInfo[0].capSeams, underarmSeams: sleeveInfo[0].underSeams } : {}) },
    notes: notesFor(levels, hemDropCm, body, sleevesOut),
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

function notesFor(levels, hemDropCm, body, sleeves = []) {
  const out = [];
  const tight = levels.filter(l => l.hoopStrainPct > 8);
  if (tight.length) out.push(`Stretched more than 8% round the ${tight.map(l => l.where).join(" and ")}: unless the fabric is a stretch knit it will look strained and may ride up; try the next size or a stretch fabric.`);
  if (hemDropCm > 1.5) out.push(`The hem hangs ${r1(hemDropCm)} cm lower than a straight drop of the pattern length from the shoulder: the cloth stretches under its own weight.`);
  if (hemDropCm < -1.5) out.push(`The hem sits ${r1(-hemDropCm)} cm higher than a straight drop of the pattern length from the shoulder: that much length goes over the shoulder and round the chest. A flat size chart misses this; add it to the body length if the hem must reach a set point.`);
  const sl = sleeves[0];
  if (sl) {
    const tightS = sl.levels.filter(l => l.hoopStrainPct > 8);
    if (tightS.length) out.push(`The sleeve is stretched more than 8% round the ${tightS.map(l => l.where).join(" and ")} (${tightS.map(l => l.hoopStrainPct + "%").join(", ")}): the arm is bigger than the sleeve. Unless the fabric is a stretch knit, widen the sleeve or go up a size.`);
    if (sl.cuffPastWristCm > 6) out.push(`The cuff reaches ${sl.cuffPastWristCm} cm past the wrist with the arms held out: on a hanging arm it bunches or covers the hand.`);
  }
  if (body.assumed?.length) out.push(`Not given, so assumed: ${body.assumed.join(", ")}.`);
  out.push(sl ? `Body and sleeves, arms held ${body.armAngleDeg} degrees from the sides; hood and rib bands are not simulated yet, and the body is smooth ellipses and round arms, so treat this as a picture of ease and tension, not a promise of fit.` : "Body panels only: sleeves, hood and rib bands are not simulated, and the body is smooth ellipses, so treat this as a picture of ease and tension, not a promise of fit.");
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
  const proj3 = view === "side" ? (p => [p[2], p[1], p[0]]) : view === "back" ? (p => [-p[0], p[1], -p[2]]) : (p => [p[0], p[1], p[2]]);
  const proj = k => proj3([pos[k], pos[k + 1], pos[k + 2]]);
  const yTop = body.H * 0.95, yBot = body.H * 0.36, W = body.H * (body.arms && view !== "side" ? 0.62 : 0.36);
  const X = x => r1((x + W / 2) * 1000) / 10, Y = y => r1((yTop - y) * 1000) / 10;
  const vb = `0 0 ${r1(W * 100)} ${r1((yTop - yBot) * 100)}`;
  const sil = [];
  const ys = [];
  for (let y = yBot; y <= body.top + 1e-9; y += 0.01) ys.push(y);
  const half = y => { const s = sectionAt(body, y); return s ? (view === "side" ? s.b : s.a) : 0; };
  ys.forEach(y => sil.push(`${X(-half(y))},${Y(y)}`));
  ys.slice().reverse().forEach(y => sil.push(`${X(half(y))},${Y(y)}`));
  const headR = 0.06 * body.H;
  // arms as tapered strokes (drawn under the cloth): one round-capped line per capsule
  const arms = (body.arms || []).flatMap(arm => arm.caps.map(c => {
    const a = proj3(c.a), b = proj3(c.b), r = (c.ra + c.rb) / 2;
    return `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#d9d2c8" stroke-width="${r1(2 * r * 100)}" stroke-linecap="round"/>`;
  }));
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
    arms.join("") +
    items.map(it => `<path d="${it.d}" fill="${it.c}" stroke="${it.c}" stroke-width="0.15"/>`).join("") + `</svg>`;
}
