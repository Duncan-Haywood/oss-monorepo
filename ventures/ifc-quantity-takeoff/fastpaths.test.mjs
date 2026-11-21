// The 2026-11-21 speed-ups in geom.mjs keep their answers: each fast path is
// checked here against the code it replaced, copied verbatim below, on random
// polyhedra. A mismatch means the speed-up changed a result, not just a time
// (docs/history/ci-perf-2026-11-21-ifc-takeoff-clip-and-orient.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { prism, clipPoly, clipByPlanes, beyondAPlane, polyPlanes, orientShell, solidExtent, solidPoints } from "./geom.mjs";

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
