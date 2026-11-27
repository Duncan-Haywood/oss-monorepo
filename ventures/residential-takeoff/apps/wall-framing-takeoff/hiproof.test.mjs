import { test } from "node:test";
import assert from "node:assert/strict";
import { hipRoofLines, regularize } from "./hiproof.mjs";
import { outlineRoof, readOutline } from "./roofoutline.mjs";
import { materialList } from "./materiallist.mjs";

const P = (a) => a.map(([x, y]) => ({ x, y }));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const R2 = Math.SQRT2;

/** Roof height in units of run: the L-infinity distance from p to the outline (brute force). */
function depth(pts, x, y) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const gx = Math.max(0, Math.min(a.x, b.x) - x, x - Math.max(a.x, b.x)), gy = Math.max(0, Math.min(a.y, b.y) - y, y - Math.max(a.y, b.y));
    d = Math.min(d, Math.max(gx, gy));
  }
  return d;
}

/** Even-odd inside test. */
function inside(pts, x, y) {
  let c = false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (a.x === b.x && (a.y > y) !== (b.y > y) && a.x > x) c = !c;
  }
  return c;
}

/** Every line's height matches the brute-force roof along it, and the totals add up. */
function checkRoof(pts, pitch, r) {
  assert.equal(r.ok, true, r.error);
  const rise = pitch / 12;
  for (const l of r.lines) {
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const x = l.x0 + s * (l.x1 - l.x0), y = l.y0 + s * (l.y1 - l.y0), z = l.z0 + s * (l.z1 - l.z0);
      near(z / rise, depth(pts, x, y), 1e-6);
    }
    if (l.kind === "ridge") assert.ok(l.x0 === l.x1 || l.y0 === l.y1, "a ridge is level and square to the axes");
    else near(Math.abs(l.x1 - l.x0), Math.abs(l.y1 - l.y0), 1e-6);
  }
  // one hip from every outside corner, one valley from every inside corner, starting at the eave
  for (let i = 0; i < pts.length; i++) {
    const p = pts[(i + pts.length - 1) % pts.length], c = pts[i], n = pts[(i + 1) % pts.length];
    const convex = (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x) > 0;
    const from = r.lines.filter((l) => l.kind === (convex ? "hip" : "valley") && Math.abs(l.x0 - c.x) < 1e-6 && Math.abs(l.y0 - c.y) < 1e-6 && l.z0 === 0);
    assert.equal(from.length, 1, `corner ${i} (${c.x}, ${c.y}) starts one ${convex ? "hip" : "valley"}`);
  }
}

test("rectangle: one ridge of long minus short side and four hips, as the closed form", () => {
  const r = hipRoofLines(P([[0, 0], [480, 0], [480, 240], [0, 240]]), 6);
  assert.equal(r.ok, true);
  near(r.ridgePlanIn, 240);
  near(r.hipFeet, 4 * 120 * Math.sqrt(2 + 0.25) / 12);
  assert.equal(r.hips, 4); assert.equal(r.valleys, 0); assert.equal(r.ridges, 1);
  near(r.peakIn, 120 * 0.5);
  // volume of a hip roof on L x W: integral of the contour area (L - 2t)(W - 2t) dt from 0 to W/2, times the rise
  near(r.volumeCuIn, (480 * 240 * 120 - (480 + 240) * 120 * 120 + 4 * 120 ** 3 / 3) * 0.5, 1e-3);
  checkRoof(P([[0, 0], [480, 0], [480, 240], [0, 240]]), 6, r);
});

test("square: a pyramid, four hips meeting at one point, no ridge", () => {
  const r = hipRoofLines(P([[0, 0], [240, 0], [240, 240], [0, 240]]), 8);
  assert.equal(r.ok, true);
  assert.equal(r.ridges, 0);
  assert.equal(r.hips, 4);
  for (const l of r.lines) { near(l.x1, 120); near(l.y1, 120); }
});

test("L plan, hand-worked: two ridges of 10 ft meeting over the inside corner's valley", () => {
  // 20 x 10 ft arm and a 10 x 10 ft arm on it (feet as inches x 12), 12:12
  const pts = P([[0, 0], [240, 0], [240, 120], [120, 120], [120, 240], [0, 240]]);
  const r = hipRoofLines(pts, 12);
  checkRoof(pts, 12, r);
  near(r.ridgePlanIn, 240); // y = 60 from x = 60 to 180, and x = 60 from y = 60 to 180
  assert.equal(r.ridges, 2);
  assert.equal(r.hips, 5);
  near(r.hipPlanIn, 5 * 60 * R2, 1e-9);
  assert.equal(r.valleys, 1);
  near(r.valleyPlanIn, 60 * R2, 1e-9); // (120, 120) to (60, 60)
  near(r.valleyFeet, 60 * Math.sqrt(3) / 12, 1e-9); // 12:12: sqrt(2 + 1) per unit of run
});

test("U plan, hand-worked: three ridges of 20 ft, six hips, two valleys", () => {
  const pts = P([[0, 0], [360, 0], [360, 360], [240, 360], [240, 120], [120, 120], [120, 360], [0, 360]]);
  const r = hipRoofLines(pts, 6);
  checkRoof(pts, 6, r);
  near(r.ridgePlanIn, 3 * 240);
  assert.equal(r.hips, 6); assert.equal(r.valleys, 2);
  near(r.valleyPlanIn, 2 * 60 * R2, 1e-9);
});

test("two wings on a narrow link: the contour splits in two and each wing gets its own peak", () => {
  // two 20 x 20 ft squares joined by a 10 ft link 4 ft wide
  const pts = P([[0, 0], [240, 0], [240, 96], [360, 96], [360, 0], [600, 0], [600, 240], [360, 240], [360, 144], [240, 144], [240, 240], [0, 240]]);
  const r = hipRoofLines(pts, 6);
  checkRoof(pts, 6, r);
  // the link's ridge at 2 ft of run, reaching 2 ft into each square along the valleys
  const ridge = r.lines.filter((l) => l.kind === "ridge");
  assert.equal(ridge.length, 1);
  near(ridge[0].x0, 216); near(ridge[0].x1, 384); near(ridge[0].y0, 120);
  assert.equal(r.hips, 8); assert.equal(r.valleys, 4);
  near(r.peakIn, 120 * 0.5);
  assert.ok(r.events >= 2, "split, then each square closes");
});

test("regularize drops zero-width slivers and keeps loops that touch at one corner apart", () => {
  // two squares touching at (10, 10), drawn as one figure-eight loop
  const eight = P([[0, 0], [10, 0], [10, 10], [20, 10], [20, 20], [10, 20], [10, 10], [0, 10]]);
  const out = regularize([eight]);
  assert.equal(out.length, 2);
  for (const l of out) assert.equal(l.length, 4);
  // a rectangle with a zero-width spike
  const spike = P([[0, 0], [10, 0], [10, 5], [15, 5], [10, 5], [10, 10], [0, 10]]);
  const s = regularize([spike]);
  assert.equal(s.length, 1);
  assert.equal(s[0].length, 4);
});

/** Small deterministic generator. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** A random square-cornered outline: a connected blob of cells on an uneven grid, holes filled. */
function randomOutline(seed) {
  const rand = rng(seed);
  const n = 3 + Math.floor(rand() * 7), m = 3 + Math.floor(rand() * 7);
  const xs = [0], ys = [0];
  for (let i = 0; i < n; i++) xs.push(xs[i] + 24 * (1 + Math.floor(rand() * 10)));
  for (let j = 0; j < m; j++) ys.push(ys[j] + 24 * (1 + Math.floor(rand() * 10)));
  const on = Array.from({ length: m }, () => Array(n).fill(false));
  let ci = Math.floor(rand() * n), cj = Math.floor(rand() * m);
  on[cj][ci] = true;
  const steps = 3 + Math.floor(rand() * 2 * n * m);
  for (let k = 0; k < steps; k++) {
    const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
    ci = Math.max(0, Math.min(n - 1, ci + d[0])); cj = Math.max(0, Math.min(m - 1, cj + d[1]));
    on[cj][ci] = true;
  }
  // fill holes: cells not reachable from outside the grid
  const seen = Array.from({ length: m + 2 }, () => Array(n + 2).fill(false));
  const stack = [[0, 0]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (i < 0 || j < 0 || i > n + 1 || j > m + 1 || seen[j][i]) continue;
    if (i >= 1 && j >= 1 && i <= n && j <= m && on[j - 1][i - 1]) continue;
    seen[j][i] = true;
    stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (!seen[j + 1][i + 1]) on[j][i] = true;
  const loops = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (on[j][i]) loops.push(P([[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]]));
  // the union of the cells: shared sides cancel under the even-odd rule
  const union = regularize(loops);
  return union.length === 1 ? union[0] : null;
}

test("fuzz: 300 random square-cornered outlines, every roof line on the brute-force roof, volume and peak agree", () => {
  let tried = 0;
  for (let seed = 1; tried < 300 && seed < 5000; seed++) {
    const pts = randomOutline(seed);
    if (!pts) continue;
    const read = readOutline(pts.map((p) => [p.x, p.y]));
    if (!read.ok) continue; // touching corners are refused by readOutline, so not a roof outline
    tried++;
    const pitch = 1 + (seed % 12);
    const r = hipRoofLines(read.points, pitch);
    checkRoof(read.points, pitch, r);
    // the contour's volume against a midpoint sum of the brute-force height, and the peak against the sampled maximum
    const xs = read.points.map((p) => p.x), ys = read.points.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const N = 120, hx = (x1 - x0) / N, hy = (y1 - y0) / N;
    let vol = 0, peak = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = x0 + (i + 0.5) * hx, y = y0 + (j + 0.5) * hy;
      if (!inside(read.points, x, y)) continue;
      const d = depth(read.points, x, y);
      vol += d * hx * hy; peak = Math.max(peak, d);
    }
    const rise = pitch / 12;
    // every crease counted independently: corners are on a 24 in grid, so each contour side stays on its eave
    // side's line moved in by t, events fall at half the gaps (12 in steps) and every line's ends on a 12 in
    // lattice. Midway between lattice points the brute-force roof shows which crease (if any) passes.
    let ridgeIn = 0, hipIn = 0, valleyIn = 0;
    const f = (x, y) => depth(read.points, x, y);
    for (let x = x0; x <= x1; x += 6) for (let y = y0; y <= y1; y += 6) {
      const mx = (x - x0) % 12 === 6, my = (y - y0) % 12 === 6;
      if ((!mx && !my) || !inside(read.points, x + 1e-3 * (mx ? 0 : 1), y + 1e-3 * (my ? 0 : 1))) continue;
      const c = f(x, y);
      if (c < 2) continue;
      const ex = f(x + 1, y) + f(x - 1, y) - 2 * c, ey = f(x, y + 1) + f(x, y - 1) - 2 * c;
      if (mx && my) { if (ex < -0.5 && ey < -0.5) hipIn += 12 * Math.SQRT2; else if (ex > 0.5 && ey > 0.5) valleyIn += 12 * Math.SQRT2; }
      else if (mx && Math.abs(ex) < 1e-9 && ey < -1.5) ridgeIn += 12; // level along x, falling both ways in y
      else if (my && Math.abs(ey) < 1e-9 && ex < -1.5) ridgeIn += 12;
    }
    near(r.ridgePlanIn, ridgeIn, 1e-6);
    near(r.hipPlanIn, hipIn, 1e-6);
    near(r.valleyPlanIn, valleyIn, 1e-6);
    assert.ok(Math.abs(r.volumeCuIn / rise - vol) <= 0.01 * vol + 1, `seed ${seed}: volume ${r.volumeCuIn / rise} vs ${vol}`);
    assert.ok(peak <= r.peakIn / rise + 1e-6 && peak >= r.peakIn / rise - Math.max(hx, hy), `seed ${seed}: peak`);
  }
  assert.equal(tried, 300);
});

test("outlineRoof gives the roof lines for any outline, and the material list carries them", () => {
  const T = [[0, 0], ["40'", 0], ["40'", "12'"], ["26'", "12'"], ["26'", "30'"], ["14'", "30'"], ["14'", "12'"], [0, "12'"]];
  const o = outlineRoof(T, { pitch: 6, overhang: 12 });
  assert.equal(o.ok, true, o.errors?.join());
  assert.equal(o.hips, 6); assert.equal(o.valleys, 2);
  assert.ok(o.ridgeFeet > 0 && o.hipFeet > 0 && o.valleyFeet > 0);
  checkRoof(o.eaveLine, 6, hipRoofLines(o.eaveLine, 6));
  assert.match(o.notes[1], /6 hips of [\d.]+ ft and 2 valleys/);
  // a rectangle keeps the closed form
  const rect = outlineRoof([[0, 0], ["40'", 0], ["40'", "24'"], [0, "24'"]], { pitch: 6, overhang: 12 });
  near(rect.ridgeFeet, 16);
  near(rect.hipFeet, 4 * 13 * Math.sqrt(2.25), 1e-9);
  assert.equal(rect.valleyFeet, 0);
  // the material list's outline rows (no framed roof)
  const ml = materialList({ ok: true, walls: [], roofOutline: o }, {});
  assert.equal(ml.ok, true);
  const items = Object.fromEntries(ml.rows.map((x) => [x.item, x.qty]));
  assert.equal(items["valley length (from outline)"], Math.round(o.valleyFeet * 100) / 100);
  assert.equal(items["hip length (from outline)"], Math.round(o.hipFeet * 100) / 100);
  assert.equal(items["ridge length (from outline)"], Math.round(o.ridgeFeet * 100) / 100);
});
