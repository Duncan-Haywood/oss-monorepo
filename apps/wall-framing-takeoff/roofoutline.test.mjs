import { test } from "node:test";
import assert from "node:assert/strict";
import { readOutline, offsetOutline, areaPerimeter, outlineRoof, decompose, roofFromOutline } from "./roofoutline.mjs";
import { layoutRoof, validateRoof } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";

const plan = samplePlan();
// long boards so the framed roofs below are not refused for rafter length
plan.stock = [...plan.stock, ...["2x8", "2x10", "2x12"].flatMap((size) => [20, 24].map((f) => ({ size, length: f * 12, price: f })))];
const check = (r) => validateRoof(r, plan);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("readOutline squares near-square sides, drops straight-run corners and turns the outline counter-clockwise", () => {
  const r = readOutline([[0, 0], [0, 336], ["20'", 336.25], [240, 168], [480.4, 168], [480, 0], [0, 0]]);
  assert.equal(r.ok, true, r.errors.join());
  // clockwise in, counter-clockwise out; the 0.25 and 0.4 in slop squared away
  assert.equal(r.points.length, 6);
  assert.ok(areaPerimeter(r.points).area > 0);
  for (let i = 0; i < r.points.length; i++) {
    const a = r.points[i], b = r.points[(i + 1) % r.points.length];
    assert.ok(a.x === b.x || a.y === b.y, `side ${i} square`);
  }
  // a corner partway along a straight side is not a corner
  assert.equal(readOutline([[0, 0], [100, 0], [200, 0], [200, 100], [0, 100]]).points.length, 4);
});

test("readOutline refuses what it cannot read", () => {
  for (const [bad, re] of [
    [null, /list of corners/],
    [[[0, 0], [10, 0], [10, 10]], /at least 4/],
    [[[0, 0], [100, 0], [100, 100], [0, 100], [50, 50]], /not square/],
    [[[0, 0], ["x", 0], [10, 10], [0, 10]], /not a pair of lengths/],
    // a figure eight: two squares joined at a corner cross over themselves
    [[[0, 0], [100, 0], [100, 100], [200, 100], [200, 200], [100, 200], [100, 100], [0, 100]], /crosses itself/],
    [Array.from({ length: 201 }, () => [0, 0]), /200 corners/],
  ]) {
    const r = readOutline(bad);
    assert.equal(r.ok, false, JSON.stringify(bad).slice(0, 60));
    assert.match(r.errors[0], re);
  }
});

test("a 30 x 40 ft rectangle, 12 in eave, 6:12, worked by hand", () => {
  // eave line 32 x 42 ft = 1344 sq ft plan; slope factor sqrt(1 + 0.25) = 1.118034; 1502.64 sq ft = 15.0264 squares
  const r = outlineRoof([[0, 0], [480, 0], [480, 360], [0, 360]], { pitch: 6, overhang: 12 });
  assert.equal(r.ok, true);
  near(r.planSqFt, 1344);
  near(r.squares, 1344 * Math.sqrt(1.25) / 100);
  near(r.eaveFeet, 2 * (32 + 42));
  near(r.footprintSqFt, 1200);
  // all-hip rectangle: ridge 42 - 32 = 10 ft; each hip runs 16 ft x sqrt(2) in plan and rises 8 ft: sqrt(512 + 64) = 24 ft
  near(r.ridgeFeet, 10);
  near(r.hipFeet, 4 * 24, 1e-9);
  assert.equal(r.reflex, 0);
});

test("outlineRoof checks pitch and overhang, and refuses an eave line that runs into the house", () => {
  const sq = [[0, 0], [480, 0], [480, 360], [0, 360]];
  assert.match(outlineRoof(sq, { pitch: 0 }).errors[0], /Pitch/);
  assert.match(outlineRoof(sq, { pitch: 6, overhang: 60 }).errors[0], /overhang/);
  // a U with a 30 in gap: a 24 in eave on both sides of the gap meets in the middle
  const u = [[0, 0], [600, 0], [600, 300], [315, 300], [315, 100], [285, 100], [285, 300], [0, 300]];
  assert.equal(outlineRoof(u, { pitch: 6, overhang: 12 }).ok, true);
  assert.match(outlineRoof(u, { pitch: 6, overhang: 24 }).errors[0], /too tight/);
});

test("offset area follows area + perimeter x d + 4 d^2 on 300 seeded random square-cornered outlines", () => {
  // outlines are unions of cells on a grid, walked as a staircase-free boundary: random column heights (a skyline)
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const cols = 1 + Math.floor(rnd() * 6), w = 60 + Math.floor(rnd() * 120);
    const hs = Array.from({ length: cols }, () => 120 + 24 * Math.floor(rnd() * 10));
    const pts = [[0, 0], [cols * w, 0]];
    for (let c = cols - 1; c >= 0; c--) { pts.push([(c + 1) * w, hs[c]]); pts.push([c * w, hs[c]]); }
    const r = readOutline(pts);
    assert.equal(r.ok, true, JSON.stringify(pts));
    const ap = areaPerimeter(r.points);
    near(ap.area, hs.reduce((t, h) => t + h * w, 0), 1e-6);
    const d = 12;
    const off = offsetOutline(r.points, d);
    if (!off) continue; // a notch narrower than 2 d closes up; refused, not mis-measured
    near(areaPerimeter(off).area, ap.area + ap.perimeter * d + 4 * d * d, 1e-6);
    const o = outlineRoof(pts, { pitch: 8, overhang: d });
    near(o.squares, (ap.area + ap.perimeter * d + 4 * d * d) * Math.sqrt(1 + (8 / 12) ** 2) / 14400, 1e-9);
    // corners: c - r = 4 for any simple square-cornered polygon
    assert.equal(o.convex - o.reflex, 4);
    checked++;
  }
  assert.ok(checked > 200, `checked ${checked}`);
});

test("decompose: L, T, U and cross plans; a staircase is not one rectangle with wings", () => {
  const L = readOutline([[0, 0], [480, 0], [480, 240], [180, 240], [180, 420], [0, 420]]).points;
  const dl = decompose(L);
  const x = dl.find((d) => d.axis === "x");
  assert.deepEqual(x.main, { a0: 0, a1: 480, b0: 0, b1: 240 });
  assert.deepEqual(x.wings, [{ a0: 0, a1: 180, b0: 240, b1: 420, side: "right" }]);
  const U = readOutline([[0, 0], [600, 0], [600, 400], [480, 400], [480, 250], [120, 250], [120, 400], [0, 400]]).points;
  assert.equal(decompose(U).find((d) => d.axis === "x").wings.length, 2);
  const plus = readOutline([[200, 0], [300, 0], [300, 200], [500, 200], [500, 300], [300, 300], [300, 500], [200, 500], [200, 300], [0, 300], [0, 200], [200, 200]]).points;
  const dp = decompose(plus);
  assert.ok(dp.length >= 1 && dp.every((d) => d.wings.length === 2 && d.wings[0].side !== d.wings[1].side));
  const stairs = readOutline([[0, 0], [300, 0], [300, 100], [200, 100], [200, 200], [100, 200], [100, 300], [0, 300]]).points;
  assert.deepEqual(decompose(stairs), []);
});

test("an L outline frames as a gable with one cross wing, and its squares equal the all-hip squares (two code paths)", () => {
  // equal eave and rake overhangs: the gable's plan inside its overhangs is the same offset outline as the all-hip roof's
  const L = [[0, 0], ["40'", 0], ["40'", "20'"], ["15'", "20'"], ["15'", "35'"], [0, "35'"]];
  const base = { pitch: 6, rafter: "2x8", ridge: "2x10", spacing: 16, overhang: 12, gableOverhang: 12 };
  const f = roofFromOutline(L, base, check);
  assert.equal(f.ok, true, f.errors.join());
  assert.equal(f.roof.width, 240);
  assert.equal(f.roof.length, 480);
  assert.deepEqual({ ...f.roof.wing }, { width: 180, projection: 180, at: 90, side: "right" });
  assert.equal(f.roof.outline, undefined);
  const l = layoutRoof(f.roof, plan);
  assert.equal(l.ok, true, (l.errors || []).join());
  const h = outlineRoof(L, { pitch: 6, overhang: 12 });
  near(l.roofing.squares, h.squares, 1e-9);
  // two valleys (inside corner and the main gable end), each (wing half-width + overhang) x sqrt(2 + 0.25) = 8.5 x 1.5 ft
  near(l.roofing.valleyFeet, 2 * 8.5 * 1.5, 1e-9);
});

test("a T outline frames with the stem as the wing; a rectangle runs its ridge the long way", () => {
  const T = [[0, 0], [480, 0], [480, 288], [300, 288], [300, 480], [180, 480], [180, 288], [0, 288]];
  const f = roofFromOutline(T, { pitch: 6, rafter: "2x8", spacing: 16 }, check);
  assert.equal(f.ok, true, f.errors.join());
  assert.equal(f.roof.width, 288);
  assert.equal(f.roof.wing.width, 120);
  assert.equal(f.roof.wing.at, 240);
  const rect = roofFromOutline([[0, 0], [0, 480], [336, 480], [336, 0]], { pitch: 4, shape: "hip" }, check);
  assert.equal(rect.ok, true, rect.errors.join());
  assert.equal(rect.roof.width, 336);
  assert.equal(rect.roof.length, 480);
  assert.equal(rect.roof.wing, undefined);
});

test("roofFromOutline refuses a hip with wings and an outline it cannot split, and keeps squares available", () => {
  const L = [[0, 0], [480, 0], [480, 240], [180, 240], [180, 420], [0, 420]];
  const hip = roofFromOutline(L, { pitch: 6, shape: "hip" }, check);
  assert.equal(hip.ok, false);
  assert.match(hip.errors[0], /hip roof is framed on a rectangle only/);
  const stairs = [[0, 0], [300, 0], [300, 100], [200, 100], [200, 200], [100, 200], [100, 300], [0, 300]];
  const st = roofFromOutline(stairs, { pitch: 6 }, check);
  assert.equal(st.ok, false);
  assert.match(st.errors[0], /squares and eave length are still given/);
  assert.equal(outlineRoof(stairs, { pitch: 6, overhang: 12 }).ok, true);
  // a wing as wide as the main roof fails the roof checks and is reported
  const wide = roofFromOutline([[0, 0], [480, 0], [480, 240], [240, 240], [240, 480], [0, 480]], { pitch: 6, rafter: "2x8" }, check);
  assert.equal(wide.ok, false);
});
