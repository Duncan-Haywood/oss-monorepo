import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDxf, bulgeEdge, writeDxf, splinePoints } from "./dxf.mjs";
import { chain, partsFromLoops, loopArea, edgeLength, start, end, flattenLoop, ringArea } from "./geom.mjs";
import { partsFromDxf, exampleParts } from "./job.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const dxf = (body, header = "") => `0\nSECTION\n2\nHEADER\n${header}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;

test("bulge 1 is a counter-clockwise half circle (Autodesk DXF Reference: bulge = tan(angle/4), positive = CCW)", () => {
  const e = bulgeEdge(0, 0, 2, 0, 1);
  near(e.cx, 1);
  near(e.cy, 0);
  near(e.r, 1);
  near(e.sw, Math.PI);
  // CCW from (0,0) to (2,0) about (1,0) passes below the chord
  const mid = [e.cx + e.r * Math.cos(e.a0 + e.sw / 2), e.cy + e.r * Math.sin(e.a0 + e.sw / 2)];
  near(mid[0], 1);
  near(mid[1], -1);
  // a quarter circle: bulge tan(22.5 deg)
  const q = bulgeEdge(1, 0, 0, 1, Math.tan(Math.PI / 8));
  near(q.cx, 0);
  near(q.cy, 0);
  near(q.r, 1);
  near(q.sw, Math.PI / 2);
});

test("the example flange's area and cut length match the hand calculation", () => {
  const flange = exampleParts()[0].part;
  // 200 x 200 square less four R20 corner losses, less a 110 bore and four 14 holes
  const area = 200 * 200 - (4 - Math.PI) * 20 * 20 - Math.PI * 55 * 55 - 4 * Math.PI * 7 * 7;
  near(flange.area, area, 1e-6);
  const cut = 4 * 160 + 2 * Math.PI * 20 + 2 * Math.PI * 55 + 4 * 2 * Math.PI * 7;
  near(flange.cutLength, cut, 1e-6);
  assert.equal(flange.pierces, 6);
});

test("a closed LWPOLYLINE with a circle inside is one part with one hole; $INSUNITS 4 is mm", () => {
  const text = dxf(
    "0\nLWPOLYLINE\n8\nCUT\n90\n4\n70\n1\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n50\n10\n0\n20\n50\n" +
      "0\nCIRCLE\n8\nCUT\n10\n50\n20\n25\n40\n10\n" +
      "0\nTEXT\n8\nNOTES\n10\n0\n20\n0\n1\nhello\n",
    "9\n$INSUNITS\n70\n4\n",
  );
  const r = partsFromDxf(text, "plate.dxf");
  assert.equal(r.ok, true);
  assert.equal(r.units, "mm");
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0].name, "plate");
  assert.equal(r.parts[0].part.holes.length, 1);
  near(r.parts[0].part.area, 5000 - Math.PI * 100, 1e-9);
  assert.ok(r.warnings.some((w) => /1 TEXT/.test(w)));
});

test("separate LINE and ARC entities chain into one outline (a slot)", () => {
  // slot 100 long, 20 wide, round ends
  const body =
    "0\nLINE\n10\n0\n20\n0\n11\n100\n21\n0\n" +
    "0\nARC\n10\n100\n20\n10\n40\n10\n50\n270\n51\n90\n" +
    "0\nLINE\n10\n100\n20\n20\n11\n0\n21\n20\n" +
    "0\nARC\n10\n0\n20\n10\n40\n10\n50\n90\n51\n270\n";
  const r = partsFromDxf(dxf(body), "slot");
  assert.equal(r.parts.length, 1);
  near(r.parts[0].part.area, 100 * 20 + Math.PI * 100, 1e-6);
  near(r.parts[0].part.cutLength, 200 + 2 * Math.PI * 10, 1e-6);
});

test("an arc drawn with extrusion (0,0,-1) is mirrored in x", () => {
  const r = parseDxf(dxf("0\nARC\n10\n10\n20\n0\n40\n5\n50\n0\n51\n90\n230\n-1\n"));
  const e = r.edges[0];
  near(e.cx, -10);
  const s = start(e), f = end(e);
  // OCS start (15, 0) -> WCS (-15, 0); OCS end (10, 5) -> WCS (-10, 5)
  near(s[0], -15);
  near(s[1], 0, 1e-9);
  near(f[0], -10, 1e-9);
  near(f[1], 5);
});

test("INSERT applies base point, scale, rotation and MINSERT arrays", () => {
  const text =
    "0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nSQ\n10\n1\n20\n1\n" +
    "0\nLWPOLYLINE\n90\n4\n70\n1\n10\n1\n20\n1\n10\n3\n20\n1\n10\n3\n20\n2\n10\n1\n20\n2\n0\nENDBLK\n0\nENDSEC\n" +
    "0\nSECTION\n2\nENTITIES\n0\nINSERT\n2\nSQ\n10\n100\n20\n0\n41\n2\n42\n2\n50\n90\n70\n2\n44\n10\n0\nENDSEC\n0\nEOF\n";
  const r = parseDxf(text);
  assert.equal(r.edges.length, 8);
  const { loops } = chain(r.edges, 1e-6);
  assert.equal(loops.length, 2);
  // block 2 x 1 scaled by 2 -> 4 x 2, area 8 each; turned 90 so it spans x in [98, 100], y in [0, 4]
  for (const l of loops) near(Math.abs(loopArea(l)), 8, 1e-9);
  const xs = r.edges.slice(0, 4).flatMap((e) => [e.x1, e.x2]), ys = r.edges.slice(0, 4).flatMap((e) => [e.y1, e.y2]);
  near(Math.min(...xs), 98, 1e-9);
  near(Math.max(...ys), 4, 1e-9);
  // the second copy is 10 along the rotated x axis, i.e. +10 in y
  const ys2 = r.edges.slice(4).flatMap((e) => [e.y1, e.y2]);
  near(Math.min(...ys2), 10, 1e-9);
});

test("a full ELLIPSE flattens to within tolerance of pi a b", () => {
  const r = parseDxf(dxf("0\nELLIPSE\n10\n0\n20\n0\n11\n50\n21\n0\n40\n0.5\n41\n0\n42\n6.283185307179586\n"), { tol: 0.01 });
  const { loops } = chain(r.edges, 1e-6);
  assert.equal(loops.length, 1);
  const a = Math.abs(loopArea(loops[0]));
  const exact = Math.PI * 50 * 25;
  assert.ok(a < exact && exact - a < 0.01 * 2 * Math.PI * 50, `${a} vs ${exact}`);
});

test("a quadratic B-spline passes through the Bezier midpoint", () => {
  const pts = splinePoints([[0, 0], [10, 20], [20, 0]], [0, 0, 0, 1, 1, 1], 2, null, 0.001);
  near(pts[0][0], 0);
  near(pts[pts.length - 1][0], 20, 1e-9);
  // B(1/2) = P0/4 + P1/2 + P2/4 = (10, 10); the sampled curve reaches it
  const top = pts.reduce((m, p) => (p[1] > m[1] ? p : m));
  near(top[0], 10, 0.01);
  near(top[1], 10, 0.001);
});

test("a binary DXF is refused with an instruction", () => {
  const r = partsFromDxf("AutoCAD Binary DXF\r\n\x1a\x00", "b");
  assert.equal(r.ok, false);
  assert.match(r.error, /ASCII DXF/);
});

test("an open outline is reported, not nested", () => {
  const r = partsFromDxf(dxf("0\nLINE\n10\n0\n20\n0\n11\n10\n21\n0\n0\nLINE\n10\n10\n20\n0\n11\n10\n21\n10\n"), "open");
  assert.equal(r.ok, false);
  assert.match(r.error, /open contour/);
});

test("written DXF reads back with the same arcs (R12 ARC is counter-clockwise from 50 to 51)", () => {
  const edges = [{ t: "A", cx: 0, cy: 0, r: 5, a0: Math.PI / 2, sw: -Math.PI / 2 }, { t: "L", x1: 5, y1: 0, x2: 0, y2: 0 }, { t: "L", x1: 0, y1: 0, x2: 0, y2: 5 }];
  const text = writeDxf([{ layer: "CUT", edges }], 4);
  assert.match(text, /50\n0\n51\n90\n/);
  const back = parseDxf(text);
  assert.equal(back.units, "mm");
  const { loops } = chain(back.edges, 1e-6);
  near(Math.abs(loopArea(loops[0])), (Math.PI * 25) / 4, 1e-6);
  near(edgeLength(back.edges[0]), (Math.PI * 5) / 2, 1e-9);
});

test("an island inside a hole is its own part", () => {
  const sq = (x, y, w) => `0\nLWPOLYLINE\n90\n4\n70\n1\n10\n${x}\n20\n${y}\n10\n${x + w}\n20\n${y}\n10\n${x + w}\n20\n${y + w}\n10\n${x}\n20\n${y + w}\n`;
  const r = partsFromDxf(dxf(sq(0, 0, 100) + sq(10, 10, 80) + sq(30, 30, 40)), "nested");
  assert.equal(r.parts.length, 2);
  const areas = r.parts.map((p) => p.part.area).sort((a, b) => a - b);
  near(areas[0], 1600);
  near(areas[1], 10000 - 6400);
});

test("flattening keeps the shoelace area within the chord error", () => {
  const { parts } = partsFromLoops([[{ t: "A", cx: 0, cy: 0, r: 10, a0: 0, sw: 2 * Math.PI }]], [], 0.01, 1e-6);
  const ring = flattenLoop(parts[0].outer, 0.01);
  const a = Math.abs(ringArea(ring));
  assert.ok(a < 100 * Math.PI && 100 * Math.PI - a < 0.01 * 2 * Math.PI * 10);
});
