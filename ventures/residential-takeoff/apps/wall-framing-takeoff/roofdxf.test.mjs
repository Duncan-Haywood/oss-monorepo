import { test } from "node:test";
import assert from "node:assert/strict";
import { eaveFromDxf, measureOverhang, outlineFromEave, outerLoops } from "./roofdxf.mjs";
import { planFromDxf } from "./dxf.mjs";
import { readOutline, offsetOutline, outlineRoof, roofFromOutline } from "./roofoutline.mjs";
import { layoutRoof, validateRoof } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";
import { main } from "./cli.mjs";
import { gableEnds, offsetSides } from "./roofdxf.mjs";

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

// Gable ends (2026-11-27): a ridge drawn square into the eave line marks a rake, measured apart from the eaves.
const W40 = rect(0, 0, ft(40), ft(28)).map(([x, y]) => ({ x, y }));
/** a 40 x 28 ft gable roof plan: 12 in eaves on the long sides, 6 in rakes, the ridge along the long way */
const gable40x28 = (extra = []) => dxf([...walls40x28(), ["A-ROOF", -6, ft(14), ft(40) + 6, ft(14)], ...extra], [["A-ROOF", rect(-6, -12, ft(40) + 6, ft(28) + 12)]]);

test("a ridge ending on the eave line marks those sides as gable ends; the rake overhang is measured apart", () => {
  const e = eaveFromDxf(gable40x28());
  assert.ok(e.ok, e.errors.join());
  assert.deepEqual(e.ridgeEnds.map((x) => x.side), [1, 3]);
  assert.deepEqual(e.ridgeEnds.map((x) => [x.at.x, x.at.y]), [[ft(40) + 6, ft(14)], [-6, ft(14)]]);
  assert.match(e.notes.join(" "), /Gable ends read from the roof layer: a ridge runs square into eave sides 2, 4/);
  // before: one overhang all round was refused (12 in at the eaves, 6 in at the rakes)
  assert.equal(outlineFromEave(e.eave, { walls: W40 }).ok, false);
  const o = outlineFromEave(e.eave, { walls: W40, ridgeEnds: e.ridgeEnds, inner: e.inner });
  assert.ok(o.ok, o.errors.join());
  assert.equal(o.shape, "gable");
  assert.equal(o.overhang, 12);
  assert.equal(o.gableOverhang, 6);
  assert.deepEqual(o.gableEnds.map((p) => [p.x, p.y]), [[ft(40), ft(14)], [0, ft(14)]]);
  assert.match(o.notes[0], /12 in at the eaves and 6 in at the rakes/);
  // framed as that gable roof (4:12, so the 2x8 rafters fit the sample stock): 28 ft span, 40 ft ridge, 6 in rakes; the plane is rake to rake
  const plan = samplePlan();
  const b = roofFromOutline(pts(o.outline), { pitch: 4, overhang: o.overhang, gableOverhang: o.gableOverhang, gableEnds: o.gableEnds.map((p) => [p.x, p.y]) }, (x) => validateRoof(x, plan));
  assert.ok(b.ok, b.errors.join());
  assert.equal(b.roof.shape, "gable");
  assert.equal(b.roof.width, ft(28));
  assert.equal(b.roof.length, ft(40));
  assert.equal(b.roof.gableEnds, undefined);
  const l = layoutRoof(b.roof, plan);
  assert.ok(l.ok, (l.errors || []).join());
  assert.equal(l.gableOverhang, 6);
  // its sheathed area is the drawn eave-and-rake line's plan area times the slope factor
  const k = Math.sqrt(1 + (4 / 12) ** 2);
  assert.ok(Math.abs(l.sheets.area - (ft(40) + 12) * (ft(28) + 24) * k / 144) < 0.5, `${l.sheets.area}`);
});

test("gable ends on the long sides turn the ridge the short way, as drawn", () => {
  const text = dxf([...walls40x28(), ["A-ROOF", ft(20), -6, ft(20), ft(28) + 6]], [["A-ROOF", rect(-12, -6, ft(40) + 12, ft(28) + 6)]]);
  const e = eaveFromDxf(text);
  const o = outlineFromEave(e.eave, { walls: W40, ridgeEnds: e.ridgeEnds, inner: e.inner });
  assert.ok(o.ok, o.errors.join());
  assert.equal(o.gableOverhang, 6);
  const b = roofFromOutline(pts(o.outline), { pitch: 6, overhang: 12, gableOverhang: 6, gableEnds: o.gableEnds.map((p) => [p.x, p.y]) }, (x) => validateRoof(x, samplePlan()));
  assert.ok(b.ok, b.errors.join());
  assert.equal(b.roof.width, ft(40));
  assert.equal(b.roof.length, ft(28));
  // without the drawing's gable ends the rectangle's ridge runs the long way, as before
  const plain = roofFromOutline(pts(o.outline), { pitch: 6 }, (x) => validateRoof(x, samplePlan()));
  assert.equal(plain.roof.width, ft(28));
});

test("ridges drawn but none on the eave line is a hip roof; only an eave line reads no shape", () => {
  const E = rect(-12, -12, ft(40) + 12, ft(28) + 12);
  const hips = [["A-ROOF", -12, -12, ft(14), ft(14)], ["A-ROOF", ft(40) + 12, -12, ft(26), ft(14)], ["A-ROOF", ft(40) + 12, ft(28) + 12, ft(26), ft(14)], ["A-ROOF", -12, ft(28) + 12, ft(14), ft(14)], ["A-ROOF", ft(14), ft(14), ft(26), ft(14)]];
  const e = eaveFromDxf(dxf(hips, [["A-ROOF", E]]));
  assert.deepEqual(e.ridgeEnds, []);
  assert.equal(e.inner, 5);
  assert.match(e.notes.join(" "), /every side is an eave: a hip roof/);
  const o = outlineFromEave(e.eave, { walls: W40, ridgeEnds: e.ridgeEnds, inner: e.inner });
  assert.equal(o.shape, "hip");
  assert.equal(o.gableEnds, undefined);
  const b = roofFromOutline(pts(o.outline), { pitch: 6, overhang: 12, gableEnds: [] }, (x) => validateRoof(x, samplePlan()));
  assert.ok(b.ok, b.errors.join());
  assert.equal(b.roof.shape, "hip");
  // an L drawn as a hip roof is not framed as a gable with a wing
  const Lw = [[0, 0], [ft(40), 0], [ft(40), ft(28)], [ft(28), ft(28)], [ft(28), ft(40)], [ft(12), ft(40)], [ft(12), ft(28)], [0, ft(28)]];
  const bl = roofFromOutline(Lw, { pitch: 6, gableEnds: [] }, (x) => validateRoof(x, samplePlan()));
  assert.equal(bl.ok, false);
  assert.match(bl.errors[0], /draws a hip roof/);
  // the eave line alone: no shape, so the CLI keeps its earlier default
  const bare = eaveFromDxf(dxf([], [["A-ROOF", E]]));
  assert.equal(bare.inner, 0);
  assert.match(bare.notes.join(" "), /shape is not read/);
  assert.equal(outlineFromEave(bare.eave, { walls: W40, ridgeEnds: bare.ridgeEnds, inner: bare.inner }).shape, undefined);
});

test("a slope arrow or a line near a corner is not a ridge; a ridge drawn on past the rake is", () => {
  // an arrow up to the middle of the front eave with a free tail, and its two head strokes
  const arrow = [["A-ROOF", ft(20), -12, ft(20), ft(6)], ["A-ROOF", ft(20), -12, ft(20) - 4, -4], ["A-ROOF", ft(20), -12, ft(20) + 4, -4]];
  const e = eaveFromDxf(gable40x28(arrow));
  assert.deepEqual(e.ridgeEnds.map((x) => x.side), [1, 3]);
  // a stub 4 in from a corner, square to the side and meeting the ridge, is not a gable either
  const R = rect(0, 0, 400, 200).map(([x, y]) => ({ x, y }));
  const g = gableEnds(R, [...R.map((p, i) => ({ a: p, b: R[(i + 1) % 4] })), { a: { x: 4, y: 0 }, b: { x: 4, y: 100 } }, { a: { x: 0, y: 100 }, b: { x: 400, y: 100 } }], 1);
  assert.deepEqual(g.ends.map((x) => x.side), [1, 3]); // only the ridge's two ends
  // the ridge drawn 6 in past both rakes (the loose-lines drawing above) still marks both
  const L = [
    ["ROOF", 0, 0, ft(15), 0], ["ROOF", ft(15), 0, ft(30), 0], ["ROOF", ft(30), 0, ft(30), ft(20)],
    ["ROOF", ft(30), ft(20), ft(12), ft(20)], ["ROOF", ft(12), ft(20), 0, ft(20)], ["ROOF", 0, ft(20), 0, 0],
    ["ROOF", -6, ft(10), ft(30) + 6, ft(10)],
  ];
  assert.deepEqual(eaveFromDxf(dxf(L)).ridgeEnds.map((x) => [x.side, x.at.x, x.at.y]), [[1, ft(30), ft(10)], [3, 0, ft(10)]]);
});

test("an L with a gable wing frames as the gable main roof and its wing; ends elsewhere are refused", () => {
  // main 40 x 28 ft, a 16 ft wing 12 ft out from the back wall, 12 in all round; ridges and valleys drawn
  const Lw = [[0, 0], [ft(40), 0], [ft(40), ft(28)], [ft(28), ft(28)], [ft(28), ft(40)], [ft(12), ft(40)], [ft(12), ft(28)], [0, ft(28)]];
  const eaveL = [[-12, -12], [ft(40) + 12, -12], [ft(40) + 12, ft(28) + 12], [ft(28) + 12, ft(28) + 12], [ft(28) + 12, ft(40) + 12], [ft(12) - 12, ft(40) + 12], [ft(12) - 12, ft(28) + 12], [-12, ft(28) + 12]];
  const lines = [
    ["ROOF", -12, ft(14), ft(40) + 12, ft(14)], // main ridge
    ["ROOF", ft(20), ft(40) + 12, ft(20), ft(20)], // wing ridge, to where the valleys meet
    ["ROOF", ft(12) - 12, ft(28) + 12, ft(20), ft(20)], ["ROOF", ft(28) + 12, ft(28) + 12, ft(20), ft(20)], // valleys
  ];
  const e = eaveFromDxf(dxf(lines, [["ROOF", eaveL]]));
  assert.ok(e.ok, e.errors.join());
  assert.equal(e.ridgeEnds.length, 3);
  const o = outlineFromEave(e.eave, { overhang: 12, ridgeEnds: e.ridgeEnds, inner: e.inner });
  assert.ok(o.ok, o.errors.join());
  assert.deepEqual(pts(o.outline), Lw);
  assert.equal(o.gableOverhang, 12);
  const ends = o.gableEnds.map((p) => [p.x, p.y]);
  const b = roofFromOutline(Lw, { pitch: 6, overhang: 12, gableOverhang: 12, gableEnds: ends }, (x) => validateRoof(x, samplePlan()));
  assert.ok(b.ok, b.errors.join());
  assert.equal(b.roof.wing.width, ft(16));
  assert.equal(b.roof.wing.projection, ft(12));
  // a gable end the framing model cannot put there (a hip at one end of the main roof)
  const half = roofFromOutline(Lw, { pitch: 6, gableEnds: ends.slice(1) }, (x) => validateRoof(x, samplePlan()));
  assert.equal(half.ok, false);
  assert.match(half.errors[0], /not where a gable roof on this outline puts them/);
});

test("with no wall loop the rakes move in by their own overhang", () => {
  const e = eaveFromDxf(dxf([["A-ROOF", -6, ft(14), ft(40) + 6, ft(14)]], [["A-ROOF", rect(-6, -12, ft(40) + 6, ft(28) + 12)]]));
  const o = outlineFromEave(e.eave, { overhang: 12, gableOverhang: 6, ridgeEnds: e.ridgeEnds, inner: e.inner });
  assert.ok(o.ok, o.errors.join());
  assert.deepEqual(pts(o.outline), rect(0, 0, ft(40), ft(28)));
  assert.deepEqual(o.gableEnds.map((p) => [p.x, p.y]), [[ft(40), ft(14)], [0, ft(14)]]);
  // no rake typed: the eave's is used, and the note says so
  const same = outlineFromEave(e.eave, { overhang: 12, ridgeEnds: e.ridgeEnds, inner: e.inner });
  assert.deepEqual(pts(same.outline), rect(6, 0, ft(40) - 6, ft(28)));
  assert.match(same.notes[0], /the eave's, since no rake overhang was typed/);
  assert.equal(outlineFromEave(e.eave, { overhang: 12, gableOverhang: 50, ridgeEnds: e.ridgeEnds }).ok, false);
  // offsetSides: each side in by its own distance; too deep turns a side round
  assert.deepEqual(offsetSides(rect(0, 0, 100, 50).map(([x, y]) => ({ x, y })), [5, 10, 5, 10]).map((p) => [p.x, p.y]), [[10, 5], [90, 5], [90, 45], [10, 45]]);
  assert.equal(offsetSides(rect(0, 0, 100, 50).map(([x, y]) => ({ x, y })), [5, 60, 5, 60]), null);
});

test("the CLI frames a drawn gable roof with its measured rake, and a drawn hip roof as a hip", () => {
  const r = main(["gable.dxf", "--roof-pitch=4"], () => gable40x28());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /12 in at the eaves and 6 in at the rakes/);
  assert.match(r.out, /Roof: 28' 0" x 40' 0", 4:12 pitch, 12" eave and 6" rake overhang/);
  // a 24 x 16 ft hip roof drawn with its hips and ridge: framed as a hip, where it used to be a gable
  const hw = [["A-WALL", 0, 0, ft(24), 0], ["A-WALL", ft(24), 0, ft(24), ft(16)], ["A-WALL", ft(24), ft(16), 0, ft(16)], ["A-WALL", 0, ft(16), 0, 0]];
  const E = rect(-12, -12, ft(24) + 12, ft(16) + 12);
  const hips = [["A-ROOF", -12, -12, ft(8), ft(8)], ["A-ROOF", ft(24) + 12, -12, ft(16), ft(8)], ["A-ROOF", ft(24) + 12, ft(16) + 12, ft(16), ft(8)], ["A-ROOF", -12, ft(16) + 12, ft(8), ft(8)], ["A-ROOF", ft(8), ft(8), ft(16), ft(8)]];
  const h = main(["hip.dxf", "--roof-pitch=4"], () => dxf([...hw, ...hips], [["A-ROOF", E]]));
  assert.equal(h.code, 0, h.out);
  assert.match(h.out, /every side is an eave: a hip roof/);
  assert.match(h.out, /Roof: 16' 0" x 24' 0", 4:12 pitch, 12" eave overhang \(hip\)/);
  assert.equal(main(["gable.dxf", "--roof-pitch=4", "--rake-overhang=99"], () => gable40x28()).code, 1);
});
