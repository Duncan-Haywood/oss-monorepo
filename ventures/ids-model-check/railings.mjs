// Qto_RailingBaseQuantities Length from a railing's body, for the model fill
// (model-fill.mjs opts.geometry, via geometry-quantities.mjs measureModel).
//
// The set defines Length as "the total nominal length of the railing", and
// Revit, the one exporter in the public models that stores it, writes the
// length of the railing's path: a U-shaped balcony rail 2.539 + 5.948 +
// 2.539 m along its top rail's middle line stores 11.03 m. A railing body is
// a bag of posts, balusters, panels and rails with no path in it, so the path
// is read off the top rail:
//   1. the body's upward faces (outward normal within 60 deg of up), kept
//      only where nothing of the railing lies above them: the top rail's top,
//      not the posts and panels under it;
//   2. those faces in connected runs (shared corners); a run is a rail when it
//      is at least RAIL_ASPECT times longer than it is wide (a post top is
//      not);
//   3. each rail run read two ways, which must agree within AGREE:
//        - as a strip: a strip of width w along a polyline of length L, with
//          mitred corners, has area L w and outline 2 L + 2 w, so L = P/2 - w
//          where w (P/2 - w) = A (exact for a straight or mitred strip;
//          sloped stair rails too, since the faces are measured in 3D);
//        - as a sweep: the volume of the pieces the run belongs to over their
//          cross-section, cut square to the run at its largest face.
//      A tessellated round handrail's upward facets have a zigzag edge, so
//      its strip reading runs long and the two disagree: held back. A cut
//      that catches a corner gives too large a section: held back.
//   4. separate runs (a balcony rail broken at a post) add up; a run lying
//      in plan within NEAR of a longer run already counted is a second rail
//      under the top one (a mid rail or a handrail) and is not counted.
// The railing's Length is the sum, or none when any counted run's two
// readings disagree or no rail run is found (a body of posts or balusters
// only, its rail exported apart or not at all).
//
// A railing that is one straight member (Tekla classes single IPE80 posts and
// rails as railings) has no top rail when it stands upright, and its sweep cut
// takes the I's hull for its section when it is tessellated, so the rail
// reading fails on it. Such a body is a prism: every face is either along one
// axis (the sides) or square to it and in the plane of one of the two ends.
// prismLength reads it as a member, its length along that axis (the longest
// such axis: a box has three), when the body is RAIL_ASPECT times longer than
// it is wide (a bag of balusters spreads wider than it is tall, and a glass
// panel is not that slender). It is tried only when the rail reading offers
// nothing (eval/one-member-railings-2026-11-23.md).
//
// Not handled: a top rail drawn as pieces whose top faces overlap without
// sharing corners reads as separate runs, and the second as a rail under the
// first (no public export does this).
//
// Measured on every public export that stores a railing Length
// (eval/railing-lengths-2026-11-22.md): 29 offered of 54 stored, 29 within
// 2% (all within 0.2%), 25 held back.

export const RAIL_ASPECT = 10;
export const AGREE = 0.01;
export const MIN_UP = 0.5;
const NEAR = 0.1; // m: a lower rail's faces this close in plan to a counted run's
const SECTION_RADIUS = 0.25; // m: the section cut keeps points this close to the cut's centre

const newell = (l) => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i], q = l[(i + 1) % l.length];
    x += (p[1] - q[1]) * (p[2] + q[2]); y += (p[2] - q[2]) * (p[0] + q[0]); z += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return [x, y, z];
};

function signedVolume(loops) {
  let v = 0;
  for (const l of loops) for (let i = 1; i + 1 < l.length; i++) {
    const a = l[0], b = l[i], c = l[i + 1];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

function inPlan(l, x, y) {
  let c = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
    const a = l[i], b = l[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// the height of a face's plane over (x, y)
const zAt = (f, x, y) => { const [nx, ny, nz] = f.n, p = f.l[0]; return p[2] - (nx * (x - p[0]) + ny * (y - p[1])) / nz; };

/** The body's pieces, each {s, loops, V}: signed convex terms and closed shells alike. */
function piecesOf(body) {
  const out = [];
  for (const t of body.terms || []) out.push({ s: t.s, loops: t.faces });
  for (const sh of body.shells || []) out.push({ s: sh.s ?? 1, loops: sh.loops });
  for (const p of out) p.V = signedVolume(p.loops);
  return out;
}

/**
 * The length of a set of faces' outline. Every edge, oriented by its face, is
 * grouped by the line it lies on, and along each line the signed coverage is
 * summed; the stretches where it is not zero are outline. Two faces that
 * split a shared edge differently (a T-junction) still cancel.
 * @param {{l: number[][], s: number}[]} faces loops oriented outward, s their sign
 * @param {number} tol how far off a line a point may lie and be on it
 */
export function boundaryLength(faces, tol) {
  const groups = [];
  const cos = 1 - 1e-7;
  for (const f of faces) for (let i = 0; i < f.l.length; i++) {
    const a = f.l[i], b = f.l[(i + 1) % f.l.length];
    let d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(...d);
    if (!(L > tol)) continue;
    d = d.map((x) => x / L);
    let g = null;
    for (const h of groups) {
      if (Math.abs(d[0] * h.d[0] + d[1] * h.d[1] + d[2] * h.d[2]) < cos) continue;
      const v = [a[0] - h.o[0], a[1] - h.o[1], a[2] - h.o[2]], t = v[0] * h.d[0] + v[1] * h.d[1] + v[2] * h.d[2];
      if (Math.hypot(v[0] - t * h.d[0], v[1] - t * h.d[1], v[2] - t * h.d[2]) > tol) continue;
      g = h;
      break;
    }
    if (!g) groups.push((g = { o: a, d, ev: [] }));
    const along = (p) => (p[0] - g.o[0]) * g.d[0] + (p[1] - g.o[1]) * g.d[1] + (p[2] - g.o[2]) * g.d[2];
    const ta = along(a), tb = along(b), w = ta < tb ? f.s : -f.s;
    g.ev.push([Math.min(ta, tb), w], [Math.max(ta, tb), -w]);
  }
  let P = 0;
  for (const g of groups) {
    g.ev.sort((p, q) => p[0] - q[0]);
    let c = 0, t0 = 0;
    for (const [t, w] of g.ev) { if (Math.abs(c) > 0.5) P += t - t0; c += w; t0 = t; }
  }
  return P;
}

function hullArea(pts) {
  if (pts.length < 3) return 0;
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
  const h = lo.slice(0, -1).concat(up.slice(0, -1));
  let A = 0;
  for (let i = 0; i < h.length; i++) { const p = h[i], q = h[(i + 1) % h.length]; A += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(A) / 2;
}

/** A run's sweep reading: its pieces' volume over their section cut square to the run at its largest face (SI). */
function sweepReading(ps, run, unit) {
  const ids = [...new Set(run.map((f) => f.pi))];
  let V = 0;
  for (const i of ids) V += ps[i].s * ps[i].V;
  const big = run.reduce((a, b) => (b.A > a.A ? b : a));
  let d = null, longest = 0;
  for (let i = 0; i < big.l.length; i++) {
    const a = big.l[i], b = big.l[(i + 1) % big.l.length], v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...v);
    if (L > longest) { longest = L; d = v.map((x) => x / L); }
  }
  const c = [0, 0, 0];
  for (const q of big.l) for (let k = 0; k < 3; k++) c[k] += q[k] / big.l.length;
  const at = d[0] * c[0] + d[1] * c[1] + d[2] * c[2], r = SECTION_RADIUS / unit;
  const u0 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1 = [d[1] * u0[2] - d[2] * u0[1], d[2] * u0[0] - d[0] * u0[2], d[0] * u0[1] - d[1] * u0[0]];
  const n1 = Math.hypot(...e1);
  e1 = e1.map((x) => x / n1);
  const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
  const pts = [];
  for (const i of ids) for (const l of ps[i].loops) for (let k = 0; k < l.length; k++) {
    const p = l[k], q = l[(k + 1) % l.length];
    const dp = d[0] * p[0] + d[1] * p[1] + d[2] * p[2] - at, dq = d[0] * q[0] + d[1] * q[1] + d[2] * q[2] - at;
    if ((dp < 0) === (dq < 0)) continue;
    const t = dp / (dp - dq), x = [p[0] + (q[0] - p[0]) * t - c[0], p[1] + (q[1] - p[1]) * t - c[1], p[2] + (q[2] - p[2]) * t - c[2]];
    if (Math.hypot(...x) > r) continue;
    pts.push([x[0] * e1[0] + x[1] * e1[1] + x[2] * e1[2], x[0] * e2[0] + x[1] * e2[1] + x[2] * e2[2]]);
  }
  const section = hullArea(pts) * unit * unit, volume = V * unit ** 3;
  return { volume, section, sweep: section > 0 && volume > 0 ? volume / section : null };
}

/**
 * The runs of a railing body's top surface, longest first (SI).
 * @returns {{strip: number|null, width: number|null, sweep: number|null, rail: boolean, box: number[], segs: number[][], cs: number[][]}[]}
 */
export function railRuns(body, unit = 1) {
  const ps = piecesOf(body);
  const faces = [];
  ps.forEach((p, pi) => {
    const o = p.V < 0 ? -1 : 1;
    for (let l of p.loops) {
      let n = newell(l);
      const L = Math.hypot(...n);
      if (!(L > 0)) continue;
      n = n.map((x) => (x * o) / L);
      if (n[2] < MIN_UP) continue;
      if (o < 0) l = [...l].reverse();
      let cx = 0, cy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of l) { cx += q[0]; cy += q[1]; x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      faces.push({ pi, l, n, s: p.s * o, A: L / 2, c: [cx / l.length, cy / l.length], box: [x0, y0, x1, y1] });
    }
  });
  if (!faces.length) return [];
  // 1. kept where no other positive face lies above the face's centre
  const g = 0.25 / unit, grid = new Map(), K = (i, j) => i + "," + j;
  faces.forEach((f, k) => {
    if (f.s < 0) return;
    for (let i = Math.floor(f.box[0] / g); i <= Math.floor(f.box[2] / g); i++) for (let j = Math.floor(f.box[1] / g); j <= Math.floor(f.box[3] / g); j++) {
      const a = grid.get(K(i, j));
      if (a) a.push(k); else grid.set(K(i, j), [k]);
    }
  });
  const tol = 1e-4 / unit;
  const top = faces.filter((f) => {
    const [x, y] = f.c, z = zAt(f, x, y);
    for (const k of grid.get(K(Math.floor(x / g), Math.floor(y / g))) || []) {
      const h = faces[k];
      if (h === f || x < h.box[0] || x > h.box[2] || y < h.box[1] || y > h.box[3]) continue;
      if (zAt(h, x, y) > z + tol && inPlan(h.l, x, y)) return false;
    }
    return true;
  });
  // 2. connected runs, by shared corners
  const key = (q) => q.map((x) => Math.round(x * 1e4 * unit)).join(",");
  const parent = top.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const at = new Map();
  top.forEach((f, i) => { for (const q of f.l) { const k = key(q), j = at.get(k); if (j == null) at.set(k, i); else parent[find(i)] = find(j); } });
  const groups = new Map();
  top.forEach((f, i) => { const r = find(i), c = groups.get(r) || { A: 0, f: [] }; c.A += f.s * f.A; c.f.push(f); groups.set(r, c); });
  // 3. each run read as a strip and, when it is a rail, as a sweep
  return [...groups.values()].sort((a, b) => b.A - a.A).map((c) => {
    const P = boundaryLength(c.f, tol) * unit, A = c.A * unit * unit, d = (P * P) / 4 - 4 * A;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of c.f) { x0 = Math.min(x0, f.box[0]); y0 = Math.min(y0, f.box[1]); x1 = Math.max(x1, f.box[2]); y1 = Math.max(y1, f.box[3]); }
    const run = {
      area: A, outline: P, strip: null, width: null, sweep: null, rail: false,
      box: [x0, y0, x1, y1].map((v) => v * unit),
      cs: c.f.map((f) => [f.c[0] * unit, f.c[1] * unit, f.A * unit * unit]),
      segs: c.f.flatMap((f) => f.l.map((a, i) => { const b = f.l[(i + 1) % f.l.length]; return [a[0] * unit, a[1] * unit, b[0] * unit, b[1] * unit]; })),
    };
    if (A > 0 && d >= 0) { run.width = (P / 2 - Math.sqrt(d)) / 2; run.strip = P / 2 - run.width; }
    if (run.strip != null && run.width > 0 && run.strip >= RAIL_ASPECT * run.width) {
      run.rail = true;
      try { Object.assign(run, sweepReading(ps, c.f, unit)); } catch { run.sweep = null; }
    }
    return run;
  });
}

const PARALLEL = 1e-3; // |n . d| under this: a side face along the axis
const SQUARE = 1 - 1e-4; // |n . d| over this: an end face square to it
const PLANE = 1e-4; // of the length: how far an end face may lie off its end's plane

/**
 * A prism body's length along its axis (SI), or null when the body is not one
 * straight prism (see the header).
 * @returns {{length: number, width: number, section: number, volume: number}|null}
 */
export function prismLength(body, unit = 1) {
  const ps = piecesOf(body);
  const faces = [];
  let V = 0;
  for (const p of ps) {
    V += p.s * p.V;
    const o = p.V < 0 ? -1 : 1;
    for (const l of p.loops) {
      const n = newell(l), L = Math.hypot(...n);
      if (!(L > 0)) continue;
      faces.push({ n: n.map((x) => (x * o) / L), A: (p.s * L) / 2, l });
    }
  }
  if (!faces.length || !(V > 0)) return null;
  const pts = faces.flatMap((f) => f.l);
  const span = (d) => { let lo = Infinity, hi = -Infinity; for (const q of pts) { const t = q[0] * d[0] + q[1] * d[1] + q[2] * d[2]; if (t < lo) lo = t; if (t > hi) hi = t; } return hi - lo; };
  let best = null;
  const tried = [];
  for (const f of faces) {
    const d = f.n;
    if (tried.some((e) => Math.abs(e[0] * d[0] + e[1] * d[1] + e[2] * d[2]) > SQUARE)) continue;
    tried.push(d);
    if (tried.length > 64) break;
    let lo = Infinity, hi = -Infinity;
    for (const q of pts) { const t = q[0] * d[0] + q[1] * d[1] + q[2] * d[2]; if (t < lo) lo = t; if (t > hi) hi = t; }
    const tol = PLANE * (hi - lo);
    let ok = true;
    for (const g of faces) {
      const c = g.n[0] * d[0] + g.n[1] * d[1] + g.n[2] * d[2];
      if (Math.abs(c) < PARALLEL) continue;
      if (Math.abs(c) <= SQUARE) { ok = false; break; }
      // an end face lies in the plane of one end or the other
      const t0 = g.l[0][0] * d[0] + g.l[0][1] * d[1] + g.l[0][2] * d[2];
      if (!(Math.abs(t0 - lo) <= tol || Math.abs(t0 - hi) <= tol)) { ok = false; break; }
    }
    if (!ok) continue;
    if (!best || hi - lo > best.ext) best = { d, ext: hi - lo };
  }
  if (!best) return null;
  const d = best.d, a = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0]];
  const nu = Math.hypot(...u);
  u = u.map((x) => x / nu);
  const w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  let width = 0;
  for (let i = 0; i < 12; i++) {
    const t = (i * Math.PI) / 12, c = Math.cos(t), s = Math.sin(t);
    width = Math.max(width, span([c * u[0] + s * w[0], c * u[1] + s * w[1], c * u[2] + s * w[2]]));
  }
  if (!(best.ext >= RAIL_ASPECT * width)) return null;
  return { length: best.ext * unit, width: width * unit, section: (V / best.ext) * unit * unit, volume: V * unit ** 3 };
}

const nearRun = (k, x, y) => x >= k.box[0] - NEAR && x <= k.box[2] + NEAR && y >= k.box[1] - NEAR && y <= k.box[3] + NEAR &&
  k.segs.some(([ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    return Math.hypot(ax + t * dx - x, ay + t * dy - y) <= NEAR;
  });

/**
 * A railing's Length (SI) from its takeoff row, or null with the reason.
 * @param {{computed: object, lengthUnit?: number}} row a takeoff row
 * @returns {{length: number|null, runs: object[], under: number, reason: string|null, from?: string}}
 *   from: 'rail' (the top rail's path) or 'member' (one straight prism, prismLength)
 */
export function railingLength(row) {
  const body = row.computed?.solids?.body;
  if (!body) return { length: null, runs: [], under: 0, reason: "no body" };
  const runs = railRuns(body, row.lengthUnit ?? 1);
  const counted = [];
  let under = 0;
  for (const r of runs) {
    if (!r.rail) continue;
    let near = 0, all = 0;
    for (const [x, y, a] of r.cs) { all += a; if (counted.some((k) => nearRun(k, x, y))) near += a; }
    if (counted.length && near >= 0.5 * all) under++;
    else counted.push(r);
  }
  const reason = !counted.length ? "no rail on top"
    : !counted.every((r) => r.sweep != null && Math.abs(r.sweep - r.strip) <= AGREE * r.sweep) ? "readings disagree" : null;
  if (!reason) return { length: counted.reduce((a, r) => a + r.sweep, 0), runs: counted, under, reason: null, from: "rail" };
  const p = prismLength(body, row.lengthUnit ?? 1);
  if (p) return { length: p.length, runs: counted, under, reason: null, from: "member", heldBy: reason };
  return { length: null, runs: counted, under, reason };
}

/** Adds computed.railing = {length} (SI) to each railing row with a Length. Returns how many. */
export function addRailingLines(rows) {
  let n = 0;
  for (const r of rows) {
    if (!/^IFCRAILING/.test(r.ifcType) || !r.computed || r.computed.status !== "ok") continue;
    let m;
    try { m = railingLength(r); } catch { m = null; }
    if (!m || m.length == null) continue;
    r.computed.railing = { length: m.length, runs: m.runs.length, from: m.from };
    n++;
  }
  return n;
}
