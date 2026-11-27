import { test } from "node:test";
import assert from "node:assert/strict";
import { skeletonRoofLines } from "./skeleton.mjs";
import { hipRoofLines, regularize } from "./hiproof.mjs";
import { outlineRoof, readAngledOutline, offsetAngledOutline, roofFromOutline } from "./roofoutline.mjs";
import { frameOutlineRoof } from "./hipframe.mjs";
import { sheatheOutlineRoof } from "./outlinesheathing.mjs";
import { layoutEaves } from "./eaves.mjs";
import { materialList } from "./materiallist.mjs";

const P = (a) => a.map(([x, y]) => ({ x, y }));
const F = 12;
const near = (a, b, tol = 1e-9, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b}`);

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** A random square-cornered outline (as hiproof.test.mjs builds them). */
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
  const union = regularize(loops);
  return union.length === 1 ? union[0] : null;
}

/** A random star-shaped polygon about the origin, sides at any angle (every angular gap under 180 degrees, so simple). */
function randomStar(seed) {
  const r = rng(seed), n = 3 + Math.floor(r() * 18);
  const angs = Array.from({ length: n }, () => r() * 2 * Math.PI).sort((a, b) => a - b);
  const pts = angs.map((a) => { const R = 120 + r() * 600; return { x: R * Math.cos(a), y: R * Math.sin(a) }; });
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let g = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x);
    if (g < 0) g += 2 * Math.PI;
    if (g >= 0.98 * Math.PI || Math.hypot(a.x - b.x, a.y - b.y) < 1) return null;
  }
  return pts;
}

/** Square-cornered outline with some outside corners cut at 45 degrees (bays and clipped corners). */
function chamfered(seed) {
  const base = randomOutline(seed);
  if (!base) return null;
  const r = rng(seed * 7 + 3), n = base.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = base[(i + n - 1) % n], c = base[i], b = base[(i + 1) % n];
    const convex = (c.x - a.x) * (b.y - c.y) - (c.y - a.y) * (b.x - c.x) > 0;
    const room = Math.min(Math.hypot(c.x - a.x, c.y - a.y), Math.hypot(b.x - c.x, b.y - c.y)) / 2 - 1;
    if (convex && room > 6 && r() < 0.5) {
      const d = Math.min(room, 6 + Math.floor(r() * 4) * 6);
      const u = { x: Math.sign(a.x - c.x), y: Math.sign(a.y - c.y) }, w = { x: Math.sign(b.x - c.x), y: Math.sign(b.y - c.y) };
      out.push({ x: c.x + d * u.x, y: c.y + d * u.y }, { x: c.x + d * w.x, y: c.y + d * w.y });
    } else out.push({ x: c.x, y: c.y });
  }
  return out;
}

const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)); return Math.hypot(a.x + f * dx - p.x, a.y + f * dy - p.y); };
const inside = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };

/**
 * What any straight-skeleton roof must satisfy, checked from the outline alone: one line from
 * each corner; every line end inside the outline; its height (in run) no more than its distance
 * to the outline (the moving outline never gets ahead of the walls) and exactly its distance to
 * the planes of at least two sides (it lies where those planes meet).
 */
function checkInvariants(pts, pitch, k, what) {
  assert.ok(k.ok, `${what}: ${k.error}`);
  const rise = pitch / 12;
  const sides = pts.map((a, i) => { const b = pts[(i + 1) % pts.length], L = Math.hypot(b.x - a.x, b.y - a.y); return { nx: -(b.y - a.y) / L, ny: (b.x - a.x) / L, c: (-(b.y - a.y) * a.x + (b.x - a.x) * a.y) / L }; });
  const fromCorner = k.lines.filter((l) => l.kind !== "ridge" && Math.min(l.z0, l.z1) < 1e-9).length;
  assert.equal(fromCorner, pts.length, `${what}: one hip or valley from each corner`);
  for (const l of k.lines) for (const [x, y, z] of [[l.x0, l.y0, l.z0], [l.x1, l.y1, l.z1]]) {
    const t = z / rise;
    if (t < 1e-9) continue;
    assert.ok(inside(pts, x, y), `${what}: line end ${x}, ${y} outside`);
    const d = Math.min(...pts.map((a, i) => segDist({ x, y }, a, pts[(i + 1) % pts.length])));
    assert.ok(t <= d + 1e-6, `${what}: height ${t} above distance ${d}`);
    const on = sides.filter((s) => Math.abs(s.nx * x + s.ny * y - s.c - t) < 1e-6).length;
    assert.ok(on >= 2, `${what}: line end ${x}, ${y} at ${t} on ${on} planes`);
  }
}

test("square-cornered outlines: the same lines as hiproof.mjs, also turned to other angles and mirrored", () => {
  let tried = 0;
  for (let seed = 1; tried < 300 && seed < 5000; seed++) {
    const pts = randomOutline(seed);
    if (!pts) continue;
    tried++;
    const pitch = 1 + (seed % 12);
    const h = hipRoofLines(pts, pitch);
    assert.ok(h.ok);
    const th = (seed % 7 + 1) * 0.37, c = Math.cos(th), s = Math.sin(th);
    const turned = pts.map((p) => ({ x: p.x * c - p.y * s + 1000, y: p.x * s + p.y * c - 500 }));
    const mirrored = pts.map((p) => ({ x: -p.x, y: p.y })).reverse();
    for (const [q, how] of [[pts, "as drawn"], [turned, "turned"], [mirrored, "mirrored"]]) {
      const k = skeletonRoofLines(q, pitch);
      assert.ok(k.ok, `seed ${seed} ${how}: ${k.error}`);
      for (const f of ["ridgeFeet", "hipFeet", "valleyFeet", "peakIn"]) near(k[f], h[f], 1e-6, `seed ${seed} ${how} ${f}`);
      near(k.volumeCuIn, h.volumeCuIn, 1e-9 * h.volumeCuIn, `seed ${seed} ${how} volume`);
      for (const f of ["hips", "valleys", "ridges"]) assert.equal(k[f], h[f], `seed ${seed} ${how} ${f}`);
    }
  }
  assert.equal(tried, 300);
});

test("convex outlines: regular octagon, clipped rectangle (closed forms)", () => {
  const oct = Array.from({ length: 8 }, (_, i) => ({ x: 100 * Math.cos((Math.PI * i) / 4), y: 100 * Math.sin((Math.PI * i) / 4) }));
  const o = skeletonRoofLines(oct, 12);
  assert.ok(o.ok);
  assert.equal(o.hips, 8); assert.equal(o.ridges, 0); assert.equal(o.valleys, 0);
  near(o.peakIn, 100 * Math.cos(Math.PI / 8), 1e-9); // the apothem, at 12:12
  // eight hips from the corners to the centre, each the circumradius in plan rising the apothem
  near(o.hipFeet * 12, 8 * Math.hypot(100, 100 * Math.cos(Math.PI / 8)), 1e-6);
  // 40 x 24 ft with every corner clipped 2 ft at 45 degrees: the hips still meet the 16 ft ridge of the 40 x 24 rectangle
  const clip = P([[2, 0], [38, 0], [40, 2], [40, 22], [38, 24], [2, 24], [0, 22], [0, 2]].map(([x, y]) => [x * F, y * F]));
  const c = skeletonRoofLines(clip, 6);
  checkInvariants(clip, 6, c, "clipped");
  near(c.ridgeFeet, 16, 1e-9); assert.equal(c.ridges, 1);
  near(c.peakIn, 12 * F * 0.5, 1e-9);
});

test("a 45-degree bay on a 40 x 24 ft house, worked by hand", () => {
  // bay 8 ft wide at the wall, 4 ft across its front, 2 ft deep, centred on the 40 ft side
  const bay = P([[0, 0], [16, 0], [18, -2], [22, -2], [24, 0], [40, 0], [40, 24], [0, 24]].map(([x, y]) => [x * F, y * F]));
  const k = skeletonRoofLines(bay, 6);
  checkInvariants(bay, 6, k, "bay");
  // main roof: the 40 x 24 hip roof's 16 ft ridge at 12 ft run; bay: its two front hips meet on the bay's centre line
  near(k.ridgeFeet, 16, 1e-9); near(k.peakIn, 12 * F * 0.5, 1e-9);
  assert.equal(k.valleys, 2);
  // the bay's front hips meet where the front (y = -2 ft) and a side (x + y = 16 ft) are equally far: 2 + 2 sqrt 2 ft run
  const r = 2 + 2 * Math.SQRT2;
  const top = k.lines.filter((l) => l.kind === "hip" && Math.abs(l.x1 - 20 * F) < 1e-6 && Math.abs(l.z1 - r * F * 0.5) < 1e-6);
  assert.equal(top.length, 2, "two bay hips end at the bay's apex");
  // the valleys run from the bay's wall corners to where the main front plane (y = 0) meets the bay sides: y = x - 16 + ... = 4 + 4 sqrt 2 ... checked as equal distances
  for (const l of k.lines.filter((x) => x.kind === "valley")) near(l.y1, l.z1 / 0.5, 1e-6, "valley top on the main front plane");
});

test("fuzz: random polygons with sides at any angle and outlines with clipped corners keep every roof invariant", () => {
  let n = 0;
  for (let seed = 1; n < 600 && seed < 2000; seed++) {
    const pts = randomStar(seed);
    if (!pts) continue;
    n++;
    const pitch = 1 + (seed % 12);
    checkInvariants(pts, pitch, skeletonRoofLines(pts, pitch), `star ${seed}`);
  }
  assert.equal(n, 600);
  let m = 0;
  for (let seed = 1; m < 200 && seed < 3000; seed++) {
    const pts = chamfered(seed);
    if (!pts) continue;
    m++;
    checkInvariants(pts, 6, skeletonRoofLines(pts, 6), `clipped ${seed}`);
    // turned, the totals are the same
    const a = skeletonRoofLines(pts, 6), c = Math.cos(0.9), s = Math.sin(0.9);
    const b = skeletonRoofLines(pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c })), 6);
    assert.ok(a.ok && b.ok);
    for (const f of ["ridgeFeet", "hipFeet", "valleyFeet", "peakIn"]) near(a[f], b[f], 1e-6, `clipped ${seed} turned ${f}`);
  }
  assert.equal(m, 200);
});

test("readAngledOutline and offsetAngledOutline", () => {
  const r = readAngledOutline([["0", "2'"], ["16'", "2'"], ["18'", "0"], ["22'", "0"], ["24'", "2'"], ["40'", "2'"], ["40'", "26'"], ["20'", "26'"], ["0", "26'"]]);
  assert.ok(r.ok && r.angled);
  assert.equal(r.points.length, 8, "the corner partway along the back wall is dropped");
  assert.ok(!readAngledOutline([[0, 0], [100, 100], [100, 0], [0, 100]]).ok, "a bow tie crosses itself");
  const sq = readAngledOutline([[0, 0], [0, 100], [100, 100], [100, 0]]);
  assert.ok(sq.ok && !sq.angled);
  assert.ok(sq.ok && sq.points[1].x > 0, "turned counter-clockwise");
  // a 45-degree corner's mitre: each moved side 12 in out
  const e = offsetAngledOutline(r.ok ? r.points : [], 12);
  assert.ok(e);
  const a = e[1]; // the bay's left wall corner (16 ft, 2 ft) moved out: on y = 24 - 12 and on x + y = 216 - 12 sqrt 2 (outward from the bay side is toward smaller x + y)
  near(a.y, 12, 1e-9); near(a.x + a.y, 216 - 12 * Math.SQRT2, 1e-9);
  // too tight: the 1 in bottom of an angled notch, between two inside corners, turns round at a 12 in overhang
  assert.equal(offsetAngledOutline(P([[0, 0], [100, 0], [100, 100], [60, 100], [50.5, 80], [49.5, 80], [40, 100], [0, 100]]), 12), null);
});

test("outlineRoof: an angled outline gets squares, eave and lines; framing, courses and the framing model say why not", () => {
  const outline = [[0, "2'"], ["16'", "2'"], ["18'", 0], ["22'", 0], ["24'", "2'"], ["40'", "2'"], ["40'", "26'"], [0, "26'"]];
  const ro = /** @type {any} */ (outlineRoof(outline, { pitch: 6, overhang: 12 }));
  assert.ok(ro.ok, ro.errors?.join(" "));
  assert.equal(ro.angled, true);
  assert.equal(ro.corners, 8); assert.equal(ro.convex, 6); assert.equal(ro.reflex, 2);
  // footprint 40 x 24 plus the bay's trapezoid (8 + 4) / 2 x 2 = 12 sq ft
  near(ro.footprintSqFt, 40 * 24 + 12, 1e-9);
  // the eave line: every side moved out 1 ft; area = A + P d + d^2 x sum of tan(half the turn) over the corners
  const turn = [Math.PI / 2, -Math.PI / 4, Math.PI / 4, Math.PI / 4, -Math.PI / 4, Math.PI / 2, Math.PI / 2, Math.PI / 2];
  const per = 40 + 24 + 40 - 8 + 2 * 2 * Math.SQRT2 + 4 + 24;
  near(ro.eaveFeet, per + 2 * turn.reduce((t, a) => t + Math.tan(a / 2), 0), 1e-9);
  near(ro.planSqFt, 972 + per + turn.reduce((t, a) => t + Math.tan(a / 2), 0), 1e-9);
  near(ro.slopedSqFt, ro.planSqFt * Math.sqrt(1 + 0.25), 1e-9);
  near(ro.squares, ro.slopedSqFt / 100, 1e-12);
  assert.ok(ro.notes.some((x) => /angled sides/.test(x)));
  // the square-only steps refuse with a reason instead of laying out a wrong roof
  const fr = frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch: 6, stock: [{ size: "2x8", length: 192 }] });
  assert.ok(!fr.ok && fr.errors.some((x) => /angled sides/.test(x)));
  const sh = sheatheOutlineRoof(ro);
  assert.ok(!sh.ok && sh.errors.some((x) => /angled sides/.test(x)));
  const built = roofFromOutline(outline, { pitch: 6, shape: "gable" });
  assert.ok(!built.ok && /angled sides/.test(built.errors[0]));
  // soffit and fascia take each eave side's true length
  const ev = /** @type {any} */ (layoutEaves({}, ro));
  assert.ok(ev.ok, ev.errors?.join(" "));
  // the material list carries the angled roof's rows like any outline roof's
  const m = materialList({ ok: true, walls: [], members: [], boards: [], roofOutline: ro });
  assert.ok(m.rows.some((x) => x.item === "roof area (all-hip, from outline)" && Math.abs(x.qty - Math.round(ro.squares * 100) / 100) < 1e-9));
  // the square-cornered path is unchanged
  const sq = /** @type {any} */ (outlineRoof([[0, 0], ["40'", 0], ["40'", "24'"], [0, "24'"]], { pitch: 6, overhang: 12 }));
  assert.ok(sq.ok && !sq.angled);
  near(sq.ridgeFeet, 16, 1e-9);
});

test("CLI: a house with a 45-degree bay gives the roof's squares and lines, and says why it is not framed", async () => {
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const p = samplePlan();
  p.roof = { outline: [[0, "2'"], ["16'", "2'"], ["18'", 0], ["22'", 0], ["24'", "2'"], ["40'", "2'"], ["40'", "26'"], [0, "26'"]], pitch: 6, overhang: 12 };
  const out = main(["p.json", "--material-list", "--json"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  const row = (/** @type {string} */ item) => j.rows.find((/** @type {any} */ x) => x.section === "Roof" && x.item === item);
  assert.ok(row("roof area (all-hip, from outline)").qty > 11);
  assert.equal(row("ridge length (from outline)").qty, 16);
  assert.ok(row("valley length (from outline)").qty > 0);
  assert.ok(!j.rows.some((/** @type {any} */ x) => x.item === "rafters framed from outline"));
  const text = main(["p.json", "--material-list"], () => JSON.stringify(p));
  assert.match(text.out, /angled sides/);
});
