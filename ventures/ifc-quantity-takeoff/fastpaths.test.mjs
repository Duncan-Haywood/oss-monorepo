// The 2026-11-21 speed-ups in geom.mjs keep their answers: each fast path is
// checked here against the code it replaced, copied verbatim below, on random
// polyhedra. A mismatch means the speed-up changed a result, not just a time
// (docs/history/ci-perf-2026-11-21-ifc-takeoff-clip-and-orient.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { prism, clipPoly, clipByPlanes, clipBounds, clipByPlanesBoxed, beyondAPlane, polyPlanes, orientShell, solidExtent, solidPoints, planeAreas, apply, IDENTITY } from "./geom.mjs";
import { planRect, rayHit } from "./envelope.mjs";

// ---- the code as it was before (reference) ----
const EPS_REL = 1e-9;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 0 ? mulS(a, 1 / n) : null; };
function scaleOf(faces) {
  let s = 0;
  for (const f of faces) for (const p of f) s = Math.max(s, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  return s;
}
function clipPolyOld(faces, n, k) {
  if (!faces.length) return faces;
  const eps = EPS_REL * (scaleOf(faces) * norm(n) + Math.abs(k) + 1);
  const out = [];
  const cap = [];
  let anyOut = false;
  for (const f of faces) {
    const res = [];
    const m = f.length;
    for (let i = 0; i < m; i++) {
      const a = f[i], b = f[(i + 1) % m];
      const da = dot(n, a) - k, db = dot(n, b) - k;
      if (da <= eps) res.push(a);
      if (da > eps) anyOut = true;
      if (Math.abs(da) <= eps) cap.push(a);
      if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
        const t = da / (da - db);
        const p = add(a, mulS(sub(b, a), t));
        res.push(p);
        cap.push(p);
      }
    }
    if (res.length >= 3) out.push(res);
  }
  if (!anyOut) return faces;
  if (cap.length >= 3) {
    const c = mulS(cap.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / cap.length);
    const nn = unit(n);
    const u = unit(Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]));
    const v = cross(nn, u);
    const pts = [];
    const tol = eps * 10;
    for (const p of cap) if (!pts.some((q) => Math.abs(q[0] - p[0]) <= tol && Math.abs(q[1] - p[1]) <= tol && Math.abs(q[2] - p[2]) <= tol)) pts.push(p);
    if (pts.length >= 3) {
      pts.sort((p, q) => Math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)) - Math.atan2(dot(sub(q, c), v), dot(sub(q, c), u)));
      out.push(pts);
    }
  }
  return out;
}
const clipByPlanesOld = (faces, planes) => {
  let f = faces;
  for (const [n, k] of planes) { f = clipPolyOld(f, n, k); if (!f.length) break; }
  return f;
};
const pkey = (p) => `${p[0]},${p[1]},${p[2]}`;
function orientShellOld(faces0) {
  const faces = faces0.map((f) => f.map((l) => l.slice()));
  const edges = new Map();
  const ids = new Map(), seen = new Map();
  const idOf = (p) => {
    let id = seen.get(p);
    if (id === undefined) {
      const k = pkey(p);
      id = ids.get(k);
      if (id === undefined) ids.set(k, (id = ids.size));
      seen.set(p, id);
    }
    return id;
  };
  faces.forEach((f, fi) => {
    for (const l of f) for (let i = 0; i < l.length; i++) {
      const a = idOf(l[i]), b = idOf(l[(i + 1) % l.length]);
      if (a === b) continue;
      const fwd = a < b;
      const key = fwd ? a * 67108864 + b : b * 67108864 + a;
      let e = edges.get(key);
      if (!e) edges.set(key, (e = []));
      e.push({ fi, fwd });
    }
  });
  let closed = true;
  const adj = faces.map(() => []);
  for (const e of edges.values()) {
    if (e.length !== 2) { closed = false; continue; }
    const [p, q] = e;
    if (p.fi === q.fi) continue;
    const mustFlip = p.fwd === q.fwd;
    adj[p.fi].push([q.fi, mustFlip]);
    adj[q.fi].push([p.fi, mustFlip]);
  }
  const turn = new Array(faces.length).fill(null);
  const piece = new Array(faces.length).fill(-1);
  let pieces = 0;
  let flipped = 0;
  for (let s = 0; s < faces.length; s++) {
    if (turn[s] !== null) continue;
    turn[s] = false;
    piece[s] = pieces;
    const stack = [s];
    while (stack.length) {
      const i = stack.pop();
      for (const [j, mustFlip] of adj[i]) {
        const want = turn[i] !== mustFlip;
        if (turn[j] === null) { turn[j] = want; piece[j] = pieces; stack.push(j); } else if (turn[j] !== want) closed = false;
      }
    }
    pieces++;
  }
  for (let i = 0; i < faces.length; i++) if (turn[i]) { faces[i] = faces[i].map((l) => l.slice().reverse()); flipped++; }
  return { faces, flipped, closed, piece, pieces, turned: turn };
}

// ---- random convex polyhedra ----
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const randomPrism = (scale = 1, off = [0, 0, 0]) => {
  // a random convex polygon (points on a circle, sorted by angle), extruded
  const m = 3 + Math.floor(rnd() * 6), r = scale * (0.5 + rnd());
  const angles = Array.from({ length: m }, () => rnd() * 2 * Math.PI).sort((a, b) => a - b);
  const pts = angles.map((a) => [off[0] + r * Math.cos(a), off[1] + r * Math.sin(a)]);
  const faces = prism(pts, [scale * (rnd() - 0.5), scale * (rnd() - 0.5), scale * (0.5 + rnd())]);
  return faces.map((f) => f.map((p) => [p[0], p[1], p[2] + off[2]]));
};
const randomPlane = (scale = 1) => {
  const n = unit([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
  return [n, scale * (rnd() * 3 - 1.5)];
};

test("clipPoly gives the same faces as before, its fast paths included", () => {
  let inside = 0, beyond = 0, cut = 0;
  for (let i = 0; i < 3000; i++) {
    const sc = [1, 1000, 1e-3][i % 3];
    const faces = randomPrism(sc, [sc * (rnd() - 0.5), sc * (rnd() - 0.5), 0]);
    let [n, k] = randomPlane(sc);
    // now and then a plane through a vertex, so the |d| <= eps branch runs
    if (i % 7 === 0) k = dot(n, faces[0][0]);
    const a = clipPolyOld(faces, n, k), b = clipPoly(faces, n, k);
    assert.deepEqual(b, a);
    if (a === faces) { assert.equal(b, faces); inside++; } else if (!a.length) beyond++; else cut++;
  }
  assert.ok(inside > 100 && beyond > 100 && cut > 100, `${inside} ${beyond} ${cut}`);
});

test("beyondAPlane only answers true where clipping comes back empty", () => {
  let skipped = 0, empty = 0;
  for (let i = 0; i < 3000; i++) {
    const sc = [1, 1000, 1e-3][i % 3];
    const A = randomPrism(sc), B = randomPrism(sc, [sc * (rnd() * 3 - 1.5), sc * (rnd() * 3 - 1.5), sc * (rnd() - 0.5)]);
    const planes = polyPlanes(A);
    const ref = clipByPlanesOld(B, planes);
    assert.deepEqual(clipByPlanes(B, planes), ref);
    if (!ref.length) empty++;
    if (beyondAPlane(B, planes)) { skipped++; assert.equal(ref.length, 0); }
  }
  assert.ok(skipped > 100 && skipped <= empty, `${skipped} of ${empty}`);
});

test("orientShell turns the same faces as before; 0 and -0 are one point", () => {
  for (let i = 0; i < 500; i++) {
    const faces = randomPrism([1, 1000][i % 2]).map((l) => [rnd() < 0.3 ? l.slice().reverse() : l]);
    assert.deepEqual(orientShell(faces), orientShellOld(faces));
  }
  // a unit cube written with -0 on some corners, as exporters do
  const z = -0;
  const P = (x, y, w) => [x || (x === 0 && w ? z : 0), y, w];
  const cube = [
    [[P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)]],
    [[P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)]],
    [[P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)]],
    [[P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)]],
    [[P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)]],
    [[P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)]],
  ];
  const a = orientShell(cube), b = orientShellOld(cube);
  assert.deepEqual(a, b);
  assert.equal(a.closed, true);
});

test("solidExtent is the min and max over solidPoints", () => {
  for (let i = 0; i < 300; i++) {
    const s = { terms: [{ s: 1, faces: randomPrism() }], shells: i % 2 ? [{ s: 1, loops: randomPrism(2) }] : null };
    if (i % 3 === 0) s.loose = randomPrism(3);
    const n = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
    const nn = unit(n);
    let lo = Infinity, hi = -Infinity;
    for (const p of [...solidPoints(s), ...(s.loose && !solidPointsHasLoose ? s.loose.flat() : [])]) { const d = dot(nn, p); if (d < lo) lo = d; if (d > hi) hi = d; }
    assert.deepEqual(solidExtent(s, n), [lo, hi]);
  }
});
// solidPoints yields open shells' `loose` loops once PR #18042 lands; until then add them here
const solidPointsHasLoose = [...solidPoints({ terms: [], shells: null, loose: [[[1, 2, 3]]] })].length > 0;

// ---- 2026-11-24: planeAreas, planRect and orientShell's edge table --------
// (docs/history/ifc-takeoff-perf-2026-11-24.md). The code they replaced,
// copied verbatim: planeAreas keyed its planes by a string per loop,
// planRect read every corner of every face, orientShell's edges were a Map.

function newellOld(l) {
  let n = [0, 0, 0];
  for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return n;
}
function planeAreasOld(s, signed = false) {
  if (s.mesh && !s.shells) return null;
  const loops = [];
  if (s.terms.length > 1 && !signed) return null;
  for (const t of s.terms) for (const f of t.faces) loops.push([t.s, f]);
  if (s.shells) for (const sh of s.shells) for (const l of sh.loops) loops.push([sh.s ?? 1, l]);
  if (!loops.length) return null;
  let scale = 0;
  for (const [, l] of loops) for (const p of l) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const planes = new Map();
  for (const [sg, l] of loops) {
    if (l.length < 3) continue;
    const a = mulS(newellOld(l), 0.5 * (signed ? sg : 1));
    const n = unit(a);
    if (!n) continue;
    // one key for both orientations of a plane
    const i = Math.abs(n[0]) > 1e-9 ? 0 : Math.abs(n[1]) > 1e-9 ? 1 : 2;
    const c = n[i] < 0 ? mulS(n, -1) : n;
    const r = (x, q) => Math.round(x / q);
    const key = `${r(c[0], 1e-6)},${r(c[1], 1e-6)},${r(c[2], 1e-6)},${r(dot(c, l[0]), 1e-6 * (scale || 1))}`;
    const v = planes.get(key);
    planes.set(key, v ? add(v, a) : a);
  }
  const out = [];
  for (const v of planes.values()) { const area = norm(v); if (area > 0) out.push({ n: mulS(v, 1 / area), area }); }
  return out;
}
const STEPS = 90;
function planRectOld(body, W, f = 1) {
  const pts = [];
  let z0 = Infinity, z1 = -Infinity;
  for (const p of solidPoints(body)) {
    const q = apply(W, p);
    pts.push(q[0] * f, q[1] * f);
    if (q[2] * f < z0) z0 = q[2] * f;
    if (q[2] * f > z1) z1 = q[2] * f;
  }
  if (!pts.length) return null;
  const ext = (a) => {
    const nx = Math.cos(a), ny = Math.sin(a);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { const d = pts[i] * nx + pts[i + 1] * ny; if (d < lo) lo = d; if (d > hi) hi = d; }
    return [lo, hi];
  };
  let best = 0, bw = Infinity;
  for (let k = 0; k < STEPS; k++) { const a = (k * Math.PI) / STEPS; const [lo, hi] = ext(a); if (hi - lo < bw) { bw = hi - lo; best = a; } }
  for (let d = -10; d <= 10; d++) { const a = best + (d * Math.PI) / STEPS / 10; const [lo, hi] = ext(a); if (hi - lo < bw - 1e-12) { bw = hi - lo; best = a; } }
  const n = [Math.cos(best), Math.sin(best)], u = [-n[1], n[0]];
  const [nlo, nhi] = ext(best), [ulo, uhi] = ext(best + Math.PI / 2);
  const cn = (nlo + nhi) / 2, cu = (ulo + uhi) / 2;
  return { c: [cn * n[0] + cu * u[0], cn * n[1] + cu * u[1]], u, hl: (uhi - ulo) / 2, ht: (nhi - nlo) / 2, z0, z1 };
}

// a triangulated grid: n x n quads, two triangles each, sharing corner
// arrays the way faceted shells do; `bumpy` gives most triangles a plane of
// their own (the lofted decks' case), flat puts them all on one plane
function grid(n, bumpy, sc = 1) {
  const P = [];
  for (let i = 0; i <= n; i++) { P.push([]); for (let j = 0; j <= n; j++) P[i].push([sc * i, sc * j, bumpy ? sc * 0.01 * rnd() : 0]); }
  const tris = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    tris.push([P[i][j], P[i + 1][j], P[i + 1][j + 1]]);
    tris.push([P[i][j], P[i + 1][j + 1], P[i][j + 1]]);
  }
  return tris;
}

test("planeAreas sums the same planes, in the same order, as the string-keyed version", () => {
  const cases = [];
  for (let i = 0; i < 400; i++) {
    const sc = [1, 1000, 1e-3][i % 3];
    const terms = [{ s: 1, faces: randomPrism(sc) }];
    if (i % 4 === 1) terms.push({ s: -1, faces: randomPrism(sc) });
    const shells = i % 2 ? [{ s: i % 3 === 0 ? -1 : 1, loops: randomPrism(sc, [sc, 0, 0]) }, { loops: randomPrism(sc) }] : null;
    cases.push({ terms, shells });
  }
  // many planes at once (the table grows), one plane many times over, -0
  // and 0 in one key, degenerate and short loops, an infinite coordinate
  cases.push({ terms: [], shells: [{ s: 1, loops: grid(60, true) }] });
  cases.push({ terms: [], shells: [{ s: 1, loops: grid(40, false) }, { s: -1, loops: grid(5, true, 7) }] });
  cases.push({ terms: [{ s: 1, faces: [[[0, 0, -0], [1, 0, 0], [1, 1, -0]], [[-0, 0, 0], [0, 1, 0], [0, 1, 1]], [[0, 0, 0], [1, 1, 1], [2, 2, 2]], [[0, 0, 0], [1, 0, 0]]] }] });
  cases.push({ terms: [{ s: 1, faces: [[[0, 0, 0], [Infinity, 0, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [0, 1, 0]]] }] });
  cases.push({ terms: [], shells: [] }, { terms: [], mesh: true });
  for (const s of cases) for (const signed of [false, true]) assert.deepEqual(planeAreas(s, signed), planeAreasOld(s, signed));
});

test("planRect reads each shared corner once and gives the same rectangle", () => {
  const W = [Math.cos(0.3), -Math.sin(0.3), 0, 5, Math.sin(0.3), Math.cos(0.3), 0, -2, 0, 0, 1, 0.5];
  for (let i = 0; i < 300; i++) {
    const sc = [1, 1000, 1e-3][i % 3];
    const body = { terms: [{ s: 1, faces: randomPrism(sc) }], shells: i % 2 ? [{ s: 1, loops: grid(6, true, sc) }] : null };
    if (i % 5 === 0) body.loose = randomPrism(sc);
    for (const m of [IDENTITY, W]) assert.deepEqual(planRect(body, m, [1, 0.001][i % 2]), planRectOld(body, m, [1, 0.001][i % 2]));
  }
  assert.equal(planRect({ terms: [] }, IDENTITY), null);
});

test("orientShell's edge table gives the same answer as the Map on large and open shells", () => {
  for (let i = 0; i < 20; i++) {
    // thousands of edges: the table grows several times
    const tris = grid(20 + i, i % 2 === 0).map((l) => [rnd() < 0.3 ? l.slice().reverse() : l]);
    if (i % 3 === 0) tris.splice(5, 1);
    assert.deepEqual(orientShell(tris), orientShellOld(tris));
  }
});

// ---- 2026-11-26: openings cut from the box and the distinct points first ----
// (docs/history/ifc-takeoff-perf-2026-11-26.md)

test("clipByPlanesBoxed gives clipByPlanes' faces: disjoint, touching, cut, cut then emptied", () => {
  const counts = { same: 0, empty: 0, cut: 0 };
  const box = (x0, y0, z0, x1, y1, z1) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [0, 0, z1 - z0]).map((f) => f.map((p) => [p[0], p[1], p[2] + z0]));
  const check = (B, planes) => {
    const ref = clipByPlanesOld(B, planes);
    const got = clipByPlanesBoxed(B, clipBounds(B), planes);
    assert.deepEqual(got, ref);
    if (ref === B) { assert.equal(got, B); counts.same++; } else if (!ref.length) counts.empty++; else counts.cut++;
  };
  for (let i = 0; i < 4000; i++) {
    const sc = [1, 1000, 1e-3, 3e5][i % 4];
    const far = i % 5 === 0 ? 6 : 1.5;
    const A = randomPrism(sc), B = randomPrism(sc * (0.2 + rnd()), [sc * far * (rnd() * 2 - 1), sc * far * (rnd() * 2 - 1), sc * (rnd() - 0.5)]);
    const planes = polyPlanes(A);
    check(B, planes);
    // the same body, and a plane list run from a shuffled start
    if (i % 50 === 0) check(A, planes);
    if (i % 3 === 0) check(B, planes.slice(1).concat(planes.slice(0, 1)));
  }
  // axis-aligned blocks that touch on a face, an edge or a corner, overlap a
  // hair, or stand a hair apart: the bounds' margins are where these sit
  for (const sc of [1, 1000, 1e-3]) {
    const A = box(0, 0, 0, sc, sc, sc), planes = polyPlanes(A);
    for (const d of [0, 1e-12, -1e-12, 1e-9, -1e-9, 1e-6, -1e-6]) {
      for (const [ox, oy, oz] of [[1, 0, 0], [1, 1, 0], [1, 1, 1], [0.5, 0.5, 1], [-1, 0.2, 0.2]]) {
        const sx = ox * (sc + d * sc), sy = oy * (sc + d * sc), sz = oz * (sc + d * sc);
        check(box(sx, sy, sz, sx + sc, sy + sc, sz + sc), planes);
      }
    }
  }
  check([], polyPlanes(randomPrism()));
  assert.equal(clipBounds([]), null);
  assert.ok(counts.same > 100 && counts.empty > 1000 && counts.cut > 300, JSON.stringify(counts));
});

function rayHitOld(o, d, r, pad) {
  const n = [-r.u[1], r.u[0]];
  const rx = o[0] - r.c[0], ry = o[1] - r.c[1];
  let t0 = 0, t1 = Infinity;
  for (const [ax, h] of [[r.u, r.hl + pad], [n, r.ht + pad]]) {
    const p = rx * ax[0] + ry * ax[1], v = d[0] * ax[0] + d[1] * ax[1];
    if (Math.abs(v) < 1e-12) { if (p < -h || p > h) return Infinity; continue; }
    let a = (-h - p) / v, b = (h - p) / v;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

test("rayHit gives the same distances as before", () => {
  let hits = 0, misses = 0;
  for (let i = 0; i < 20000; i++) {
    const a = rnd() * 2 * Math.PI, b = i % 4 === 0 ? a + Math.PI / 2 * Math.floor(rnd() * 4) : rnd() * 2 * Math.PI;
    const r = { c: [rnd() * 20 - 10, rnd() * 20 - 10], u: i % 4 === 0 ? [1, 0] : [Math.cos(a), Math.sin(a)], hl: rnd() * 5, ht: rnd() * 0.3 };
    const o = [rnd() * 30 - 15, rnd() * 30 - 15], d = i % 4 === 0 ? [Math.round(Math.cos(b)), Math.round(Math.sin(b))] : [Math.cos(b), Math.sin(b)];
    const t = rayHit(o, d, r, 0.05);
    assert.equal(Object.is(t, rayHitOld(o, d, r, 0.05)), true);
    if (t === Infinity) misses++; else hits++;
  }
  assert.ok(hits > 1000 && misses > 1000, `${hits} ${misses}`);
});
