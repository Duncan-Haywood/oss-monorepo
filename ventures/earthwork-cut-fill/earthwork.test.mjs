import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePoints, parseBoundary, triangulate, makeSurface, convexHull, polygonArea, designPlane,
  computeVolumes, balanceSheet, balanceElevation, gridVolumes, elevationAt, run, toCsv, exampleCsv, EXAMPLE_BOUNDARY,
} from './earthwork.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

function gridPoints(n, size, f, { ox = 0, oy = 0 } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = (i * size) / n, y = (j * size) / n;
    pts.push({ id: `${i}-${j}`, x: ox + x, y: oy + y, z: f(x, y) });
  }
  return pts;
}

// Seeded random points, so a failure reproduces.
function randomPoints(n, seed = 1) {
  const pts = [];
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n; i++) pts.push({ id: String(i), x: r() * 100, y: r() * 100, z: r() * 5 });
  return pts;
}

test('Delaunay: empty circumcircles, and the triangles tile the convex hull', () => {
  for (const seed of [1, 2, 3]) {
    const pts = randomPoints(400, seed);
    const { pts: P, tris } = triangulate(pts);
    let area = 0;
    for (const [a, b, c] of tris) {
      const A = P[a], B = P[b], C = P[c];
      area += ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
      const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
      const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / d;
      const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / d;
      const r2 = (A.x - ux) ** 2 + (A.y - uy) ** 2;
      for (const q of P) assert.ok((q.x - ux) ** 2 + (q.y - uy) ** 2 >= r2 * (1 - 1e-9), `point inside circumcircle (seed ${seed})`);
    }
    close(area, polygonArea(convexHull(P)), 1e-6 * area, `hull area seed ${seed}`);
    assert.equal(tris.length, 2 * P.length - 2 - convexHull(P).length, 'Euler count');
  }
});

test('a regular grid (many co-circular points) still tiles the square', () => {
  const s = makeSurface(gridPoints(10, 100, () => 0));
  const area = s.tris.reduce((t, tr) => { const [A, B, C] = tr.map(i => s.pts[i]); return t + ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2; }, 0);
  close(area, 10000, 1e-6);
  assert.equal(s.tris.length, 200);
});

test('flat ground, pad 2 ft above: fill is area × 2, no cut', () => {
  const ex = makeSurface(gridPoints(4, 100, () => 100));
  const v = computeVolumes(ex, designPlane({ elevation: 102 }));
  close(v.fill, 20000, 1e-6); close(v.cut, 0, 1e-9); close(v.area, 10000, 1e-6);
});

test('a planar slope through a flat pad: cut and fill match the closed form exactly', () => {
  // z = 100 + 0.1 x on a 100 ft square; pad at 105 crosses at x = 50.
  const ex = makeSurface(gridPoints(7, 100, x => 100 + 0.1 * x));
  const v = computeVolumes(ex, designPlane({ elevation: 105 }));
  close(v.cut, 12500, 1e-6); close(v.fill, 12500, 1e-6);
  close(v.cutArea, 5000, 1e-6); close(v.fillArea, 5000, 1e-6);
  close(v.maxCut, 5, 1e-9); close(v.maxFill, 5, 1e-9);
});

test('state-plane-sized coordinates give the same volumes as local ones', () => {
  const f = (x, y) => 100 + 0.1 * x + 0.02 * y;
  const local = computeVolumes(makeSurface(gridPoints(9, 100, f)), designPlane({ elevation: 104 }));
  const far = computeVolumes(makeSurface(gridPoints(9, 100, f, { ox: 612400, oy: 2087150 })), designPlane({ elevation: 104 + 0, x0: 612400, y0: 2087150 }));
  close(far.cut, local.cut, 1e-4); close(far.fill, local.fill, 1e-4);
});

test('a curved surface converges to the integral: z = x·y/100 over 10 × 10 is 25', () => {
  const v = computeVolumes(makeSurface(gridPoints(20, 10, (x, y) => (x * y) / 100)), designPlane({ elevation: 0 }));
  close(v.cut, 25, 25 * 0.005);
  close(v.fill, 0, 1e-9);
});

test('boundary clipping: an L-shaped boundary (either winding) counts only its own area', () => {
  const ex = makeSurface(gridPoints(5, 100, () => 100));
  const L = [[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]];
  const a = computeVolumes(ex, designPlane({ elevation: 101 }), { boundary: L });
  const b = computeVolumes(ex, designPlane({ elevation: 101 }), { boundary: L.slice().reverse() });
  close(a.fill, 7500, 1e-6); close(b.fill, 7500, 1e-6); close(a.area, 7500, 1e-6);
  // A boundary half outside the survey counts only the overlap.
  const c = computeVolumes(ex, designPlane({ elevation: 101 }), { boundary: [[50, 50], [150, 50], [150, 150], [50, 150]] });
  close(c.fill, 2500, 1e-6);
});

test('proposed grade as a second TIN on different shots: overlay is exact for planes', () => {
  const ex = makeSurface(gridPoints(6, 100, () => 100));
  const prop = makeSurface(randomPoints(60, 9).map(p => ({ ...p, z: 99 + 0.02 * p.x })).concat(
    [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y], i) => ({ id: `c${i}`, x, y, z: 99 + 0.02 * x }))));
  const v = computeVolumes(ex, prop);
  // depth = -1 + 0.02x: cut for x < 50 (area 5000, mean 0.5), fill for x > 50.
  close(v.cut, 2500, 1e-6); close(v.fill, 2500, 1e-6); close(v.area, 10000, 1e-6);
});

test('topsoil strip lowers the existing surface before the comparison', () => {
  const ex = makeSurface(gridPoints(4, 100, () => 100));
  const v = computeVolumes(ex, designPlane({ elevation: 100 }), { strip: 0.5 });
  close(v.fill, 5000, 1e-6); close(v.stripVolume, 5000, 1e-6);
});

test('balance elevation with 20% shrink matches the closed form (104.721)', () => {
  // cut = 5(100 − a)², fill = 5a² with a = 10(E − 100); 0.8·cut = fill.
  const ex = makeSurface(gridPoints(7, 100, x => 100 + 0.1 * x));
  const E = balanceElevation(ex, { x0: 0, y0: 0, slopeX: 0, slopeY: 0 }, { shrink: 20 });
  const a = (100 * Math.sqrt(0.8)) / (1 + Math.sqrt(0.8));
  close(E, 100 + a / 10, 1e-3);
  close(balanceElevation(ex, { x0: 0, y0: 0 }, {}), 105, 1e-3);
});

test('a sloped pad that follows the ground is all zero', () => {
  const ex = makeSurface(gridPoints(5, 100, (x, y) => 100 + 0.1 * x - 0.05 * y));
  const v = computeVolumes(ex, designPlane({ elevation: 100, x0: 0, y0: 0, slopeX: 10, slopeY: -5 }));
  close(v.cut, 0, 1e-6); close(v.fill, 0, 1e-6);
});

test('grid method agrees with the TIN to within 1% on a smooth hill', () => {
  const f = (x, y) => 100 + 3 * Math.exp(-(((x - 60) / 25) ** 2 + ((y - 40) / 30) ** 2));
  const ex = makeSurface(gridPoints(40, 100, f));
  const d = designPlane({ elevation: 101.2 });
  const t = computeVolumes(ex, d); const g = gridVolumes(ex, d, 1);
  close(g.cut, t.cut, t.cut * 0.01); close(g.fill, t.fill, t.fill * 0.01);
});

test('elevationAt interpolates inside and returns null outside', () => {
  const ex = makeSurface(gridPoints(3, 30, x => 10 + x));
  close(elevationAt(ex, 12.5, 7), 22.5, 1e-9);
  assert.equal(elevationAt(ex, 40, 5), null);
});

test('balance sheet: export, import, trucks', () => {
  const e = balanceSheet({ cut: 1000, fill: 600, shrink: 20, swell: 25, truck: 12 });
  assert.equal(e.kind, 'export'); close(e.bank, 250, 1e-9); close(e.loose, 312.5, 1e-9); assert.equal(e.trucks, 27);
  const i = balanceSheet({ cut: 500, fill: 800, shrink: 20, swell: 0, truck: 10 });
  assert.equal(i.kind, 'import'); close(i.compacted, 400, 1e-9); close(i.bank, 500, 1e-9); assert.equal(i.trucks, 50);
});

test('parsing: PNEZD headerless, named header, ENZ, bad lines and duplicates', () => {
  const a = parsePoints('1,5000.0,2000.0,101.2,EG\n2,5010,2000,101.5,EG\n3,5000,2010,101.1,TOP BANK\n');
  assert.equal(a.format, 'PNEZD'); assert.equal(a.points[0].x, 2000); assert.equal(a.points[0].y, 5000); assert.equal(a.points[2].desc, 'TOP BANK');
  const b = parsePoints('Easting\tNorthing\tElev\n10\t20\t1\n11\t20\t2\n10\t21\t3\n');
  assert.equal(b.format, 'header'); assert.deepEqual([b.points[1].x, b.points[1].y, b.points[1].z], [11, 20, 2]);
  const c = parsePoints('0 0 1\n1 0 2\n0 1 3\nfoo bar baz\n');
  assert.equal(c.format, 'ENZ'); assert.equal(c.points.length, 3); assert.equal(c.warnings.length, 1);
  const d = parsePoints('1,0,0,1\n2,0,0,2\n3,1,0,1\n4,0,1,1\n', { format: 'PNEZD' });
  const s = makeSurface(d.points); assert.deepEqual(s.duplicates, ['2']);
  assert.match(parsePoints('1,2\n').errors[0], /at least 3/);
  const p = parsePoints('1,0,0,1\n2,1,0,1\n3,0,1,1\n', { format: 'PENZD' });
  assert.equal(p.points[1].x, 1);
});

test('boundary parser: E,N pairs, closing vertex dropped, PNEZ rows', () => {
  assert.deepEqual(parseBoundary('0,0\n10,0\n10,10\n0,0\n').vertices, [[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(parseBoundary('1,100,200,5\n2,100,210,5\n3,110,210,5\n').vertices, [[200, 100], [210, 100], [210, 110]]);
  assert.match(parseBoundary('0,0\n1,1\n').error, /3 vertices/);
});

test('run(): example with boundary, balance and CSV; plain pad errors when missing', () => {
  const r = run({ existingText: exampleCsv(), boundaryText: EXAMPLE_BOUNDARY, units: 'ft', balance: true, shrink: 15, swell: 25, truck: 12 });
  assert.equal(r.error, undefined);
  assert.equal(r.existing.points, 154);
  close(r.volumes.area, 160 * 110 - 80 * 50, 1e-3);
  close(r.volumes.cut * 0.85, r.volumes.fill, 0.5);
  assert.match(toCsv(r), /cut \(bank\)/);
  assert.match(run({ existingText: exampleCsv() }).error, /pad elevation/);
  assert.match(run({ existingText: '1,0,0,1\n2,1,1,1\n3,2,2,1\n' }).error, /one line/);
});

test('max edge drops long boundary triangles', () => {
  const pts = gridPoints(4, 100, () => 0).concat([{ id: 'far', x: 400, y: 50, z: 0 }]);
  const all = makeSurface(pts); const trimmed = makeSurface(pts, { maxEdge: 60 });
  assert.ok(trimmed.tris.length < all.tris.length);
  const v = computeVolumes(trimmed, designPlane({ elevation: 1 }));
  close(v.area, 10000, 1e-6);
});

test('stress: 40 random sets, points crowded near the hull edges, always tile the hull', () => {
  for (let seed = 11; seed < 51; seed++) {
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const pts = [];
    for (let i = 0; i < 150; i++) {
      const edge = r() < 0.4;
      pts.push({ id: String(i), x: edge ? (r() < 0.5 ? r() * 0.01 : 100 - r() * 0.01) : r() * 100, y: r() * 100, z: 0 });
    }
    const t = triangulate(pts);
    let area = 0;
    for (const [a, b, c] of t.tris) { const [A, B, C] = [a, b, c].map(i => t.pts[i]); area += ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2; }
    close(area, polygonArea(convexHull(t.pts)), 1e-6 * area, `seed ${seed}`);
  }
});

test('5,000 shots triangulate and integrate in well under the page budget', () => {
  const pts = randomPoints(5000, 4);
  const t0 = performance.now();
  const s = makeSurface(pts);
  computeVolumes(s, designPlane({ elevation: 2.5 }));
  const ms = performance.now() - t0;
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms`);
});

test('a bisected balance reads as balanced, with no phantom truck', () => {
  const b = balanceSheet({ cut: 921.7, fill: 921.7 * 0.85 - 0.01, shrink: 15, swell: 25, truck: 12 });
  assert.equal(b.kind, 'balanced'); assert.equal(b.trucks, 0); assert.equal(b.loose, 0);
});
