import { test } from "node:test";
import assert from "node:assert/strict";
import { eaveFromDxf, measureOverhang, outlineFromEave, outerLoops } from "./roofdxf.mjs";
import { planFromDxf } from "./dxf.mjs";
import { readOutline, offsetOutline, outlineRoof } from "./roofoutline.mjs";

const g = (c, v) => `${c}\n${v}\n`;
/** ASCII DXF: LINEs [layer, x1, y1, x2, y2] and closed LWPOLYLINEs [layer, [[x, y], ...]]. */
function dxf(lines, polys = [], units = 1) {
  let s = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, units) + g(0, "ENDSEC") + g(0, "SECTION") + g(2, "ENTITIES");
  for (const [layer, x1, y1, x2, y2] of lines) s += g(0, "LINE") + g(8, layer) + g(10, x1) + g(20, y1) + g(30, 0) + g(11, x2) + g(21, y2) + g(31, 0);
  for (const [layer, pts] of polys) {
    s += g(0, "LWPOLYLINE") + g(8, layer) + g(90, pts.length) + g(70, 1);
    for (const [x, y] of pts) s += g(10, x) + g(20, y);
  }
  return s + g(0, "ENDSEC") + g(0, "EOF");
}
const ft = (n) => n * 12;
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const walls40x28 = () => [
  ["A-WALL", 0, 0, ft(40), 0], ["A-WALL", ft(40), 0, ft(40), ft(28)], ["A-WALL", ft(40), ft(28), 0, ft(28)], ["A-WALL", 0, ft(28), 0, 0],
];
const pts = (p) => p.map((q) => [q.x, q.y]);
const areaOf = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2);

test("a closed eave polyline with hips and a ridge inside it reads as its four corners", () => {
  // eave 12 in out from a 40 x 28 ft house; the hip roof's lines drawn on the same layer
  const E = rect(-12, -12, ft(40) + 12, ft(28) + 12);
  const hips = [["A-ROOF", -12, -12, ft(14) , ft(14)], ["A-ROOF", ft(40) + 12, -12, ft(26), ft(14)], ["A-ROOF", ft(40) + 12, ft(28) + 12, ft(26), ft(14)], ["A-ROOF", -12, ft(28) + 12, ft(14), ft(14)], ["A-ROOF", ft(14), ft(14), ft(26), ft(14)]];
  const r = eaveFromDxf(dxf(hips, [["A-ROOF", E]]));
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual(pts(r.eave), E);
  assert.equal(r.others, 0);
  assert.match(r.notes[0], /4 corners/);
});

test("the overhang is measured against the wall loop, and the roof is the wall outline with it", () => {
  const E = rect(-18, -18, ft(40) + 18, ft(28) + 18);
  const text = dxf(walls40x28(), [["A-ROOF-EAVE", E]]);
  const w = planFromDxf(text);
  assert.ok(w.ok && w.outline);
  const ro = readOutline(w.outline.map((q) => [q.x, q.y]));
  const walls = offsetOutline(ro.points, (w.wallThickness || 0) / 2);
  const e = eaveFromDxf(text);
  assert.ok(e.ok, e.errors.join());
  const o = outlineFromEave(e.eave, { walls, overhang: 12 });
  assert.ok(o.ok, o.errors.join());
  assert.equal(o.overhang, 18); // read from the drawing, not the typed 12
  assert.equal(o.measured, true);
  assert.deepEqual(pts(o.outline), pts(walls));
  // the roof model's eave line from that outline and overhang is the drawn one
  const roof = outlineRoof(pts(o.outline), { pitch: 6, overhang: o.overhang });
  assert.ok(roof.ok, roof.errors.join());
  assert.ok(Math.abs(roof.planSqFt - areaOf(E.map(([x, y]) => ({ x, y }))) / 144) < 0.01, `${roof.planSqFt}`);
});

test("an eave line that is not one overhang all round is reported side by side, not guessed", () => {
  const E = [[-12, -12], [ft(40) + 24, -12], [ft(40) + 24, ft(28) + 12], [-12, ft(28) + 12]]; // 24 in on the right gable
  const walls = rect(0, 0, ft(40), ft(28)).map(([x, y]) => ({ x, y }));
  const e = eaveFromDxf(dxf([], [["ROOF", E]]));
  assert.ok(e.ok);
  const m = measureOverhang(e.eave, walls);
  assert.equal(m.uniform, false);
  assert.equal(m.min, 12);
  assert.equal(m.max, 24);
  const o = outlineFromEave(e.eave, { walls });
  assert.equal(o.ok, false);
  assert.match(o.errors[0], /side 2: 24 in/);
});

test("loose lines meeting in T's, a ridge run past the eave and a downspout stub still close", () => {
  // a 30 x 20 ft eave drawn as six lines (front and back eaves in two pieces each, meeting at
  // the valley ends), a ridge that overruns both gable ends by 6 in, and a stub off a corner
  const L = [
    ["ROOF", 0, 0, ft(15), 0], ["ROOF", ft(15), 0, ft(30), 0], ["ROOF", ft(30), 0, ft(30), ft(20)],
    ["ROOF", ft(30), ft(20), ft(12), ft(20)], ["ROOF", ft(12), ft(20), 0, ft(20)], ["ROOF", 0, ft(20), 0, 0],
    ["ROOF", -6, ft(10), ft(30) + 6, ft(10)], // ridge, crossing both gable lines
    ["ROOF", ft(30), 0, ft(30) + 10, -10], // downspout stub
  ];
  const r = eaveFromDxf(dxf(L));
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual(pts(r.eave), rect(0, 0, ft(30), ft(20)));
});

test("ends within the snap close; a gap wider than it does not", () => {
  const near = [["ROOF", 0, 0, 100, 0], ["ROOF", 100.5, 0, 100, 80], ["ROOF", 100, 80, 0, 80], ["ROOF", 0, 80, 0, 0.5]];
  assert.ok(eaveFromDxf(dxf(near)).ok);
  const gap = [["ROOF", 0, 0, 100, 0], ["ROOF", 103, 0, 100, 80], ["ROOF", 100, 80, 0, 80], ["ROOF", 0, 80, 0, 0]];
  const r = eaveFromDxf(dxf(gap));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /do not close/);
});

test("with no wall loop the eave line is moved in by the typed overhang, L-shaped and angled", () => {
  const L = [[-12, -12], [ft(40) + 12, -12], [ft(40) + 12, ft(16) + 12], [ft(20) + 12, ft(16) + 12], [ft(20) + 12, ft(28) + 12], [-12, ft(28) + 12]];
  const e = eaveFromDxf(dxf([], [["ROOF", L]]));
  const o = outlineFromEave(e.eave, { overhang: 12 });
  assert.ok(o.ok, o.errors.join());
  assert.equal(o.measured, false);
  assert.deepEqual(pts(o.outline), [[0, 0], [ft(40), 0], [ft(40), ft(16)], [ft(20), ft(16)], [ft(20), ft(28)], [0, ft(28)]]);
  // a 45-degree bay: moved in, then out again by the roof model, the eave area comes back
  const bay = [[0, 0], [ft(30), 0], [ft(30), ft(8)], [ft(33), ft(11)], [ft(33), ft(17)], [ft(30), ft(20)], [ft(30), ft(24)], [0, ft(24)]];
  const eb = eaveFromDxf(dxf([], [["ROOF", bay]]));
  assert.ok(eb.ok, eb.errors.join());
  const ob = outlineFromEave(eb.eave, { overhang: 12 });
  assert.ok(ob.ok, ob.errors.join());
  const roof = outlineRoof(pts(ob.outline), { pitch: 8, overhang: 12 });
  assert.ok(roof.ok, roof.errors.join());
  assert.ok(Math.abs(roof.planSqFt - areaOf(eb.eave) / 144) < 0.05, `${roof.planSqFt} vs ${areaOf(eb.eave) / 144}`);
  // too deep for the outline, or not typed
  assert.equal(outlineFromEave(e.eave, { overhang: 60 }).ok, true);
  assert.equal(outlineFromEave(e.eave, {}).ok, false);
});

test("the largest of several outlines is the roof, and the rest are named", () => {
  const r = eaveFromDxf(dxf([], [["ROOF", rect(0, 0, ft(40), ft(30))], ["ROOF", rect(ft(50), 0, ft(60), ft(10))]]));
  assert.ok(r.ok);
  assert.equal(r.others, 1);
  assert.equal(areaOf(r.eave), ft(40) * ft(30));
  assert.match(r.notes.join(" "), /1 other closed outline/);
});

test("units are read from the file, and a wall or empty roof layer is refused", () => {
  const r = eaveFromDxf(dxf([], [["ROOF", rect(0, 0, 40, 30)]], 2)); // feet
  assert.ok(r.ok);
  assert.deepEqual(pts(r.eave), rect(0, 0, ft(40), ft(30)));
  assert.match(eaveFromDxf(dxf(walls40x28())).errors[0], /No lines on a roof layer/);
  assert.equal(eaveFromDxf(dxf([], [["ROOF-WALL", rect(0, 0, 40, 30)]])).ok, false);
  assert.ok(eaveFromDxf(dxf([], [["EAVES", rect(0, 0, 40, 30)]], 2), { roofLayer: /^eaves$/i }).ok);
  assert.equal(eaveFromDxf(42).ok, false);
  assert.equal(eaveFromDxf("AutoCAD Binary DXF\r\n").ok, false);
});

test("outer loop walk: random hip-roof plans keep only the eave line", () => {
  // seeded: rectangles with their four hips and ridge, the eave drawn as four loose lines
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 200; k++) {
    const W = 120 + Math.round(rnd() * 600), D = 120 + Math.round(rnd() * Math.min(W, 480) * 0.9);
    const h = D / 2, segs = [
      [0, 0, W, 0], [W, 0, W, D], [W, D, 0, D], [0, D, 0, 0],
      [0, 0, h, h], [W, 0, W - h, h], [W, D, W - h, h], [0, D, h, h], [h, h, W - h, h],
    ].map(([x1, y1, x2, y2]) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } }));
    const loops = outerLoops(segs, 1);
    assert.equal(loops.length, 1);
    const L = loops[0].filter((p, i, a) => { const q = a[(i + a.length - 1) % a.length], n = a[(i + 1) % a.length]; return Math.abs((p.x - q.x) * (n.y - q.y) - (p.y - q.y) * (n.x - q.x)) > 1e-6; });
    assert.equal(L.length, 4, `case ${k}: ${JSON.stringify(loops[0])}`);
    assert.equal(areaOf(L), W * D);
  }
});
