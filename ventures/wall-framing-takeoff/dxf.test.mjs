import { test } from "node:test";
import assert from "node:assert/strict";
import { planFromDxf, parseDxf } from "./dxf.mjs";
import { takeoff, samplePlan } from "./engine.mjs";

/** Minimal ASCII DXF: header units, then LINEs [layer, x1, y1, x2, y2]. */
function dxf(lines, units = 1, extra = "") {
  const g = (c, v) => `${c}\n${v}\n`;
  let s = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, units) + g(0, "ENDSEC") + g(0, "SECTION") + g(2, "ENTITIES");
  for (const [layer, x1, y1, x2, y2] of lines) s += g(0, "LINE") + g(8, layer) + g(10, x1) + g(20, y1) + g(30, 0) + g(11, x2) + g(21, y2) + g(31, 0);
  return s + extra + g(0, "ENDSEC") + g(0, "EOF");
}
const ft = (n) => n * 12;
// 40 x 28 ft house drawn as four loose lines, a partition tees into the front wall at 14 ft
const house = () => [
  ["A-WALL", 0, 0, ft(40), 0], ["A-WALL", ft(40), 0, ft(40), ft(28)], ["A-WALL", ft(40), ft(28), 0, ft(28)], ["A-WALL", 0, ft(28), 0, 0],
  ["A-WALL", ft(14), 0, ft(14), ft(28)],
  ["A-DOOR", ft(17), 0, ft(17) + 38, 0], ["A-GLAZ-WINDOW", ft(4), ft(28), ft(4) + 72, ft(28)],
];

test("four lines and a partition become a loop of corner walls and a tee", () => {
  const r = planFromDxf(dxf(house()));
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.stats.exterior, 4);
  assert.equal(r.stats.interior, 1);
  const [a, b, c, d, p] = r.plan.walls;
  assert.deepEqual([a.length, b.length, c.length, d.length, p.length], [480, 336, 480, 336, 336]);
  assert.ok([a, b, c, d].every((w) => w.corner));
  // the partition touches the front wall at 14 ft and the back wall at 14 ft
  assert.deepEqual(a.tees, [168]);
  assert.equal(p.sheathed, false);
  assert.equal(p.tee.wall, "Ext 1");
  assert.equal(p.tee.at, 168);
});

test("openings on door and window layers land on the right wall at the right offset, in walking direction", () => {
  const r = planFromDxf(dxf(house()));
  const [a, , c] = r.plan.walls;
  assert.deepEqual(a.openings.map((o) => [o.kind, o.offset, o.width]), [["door", 204, 38]]);
  // the back wall is walked right to left, so the window at x=4..10 ft sits 30..36 ft from its start
  assert.deepEqual(c.openings.map((o) => [o.kind, o.offset, o.width]), [["window", 360 - 72 + 0, 72]].map(([k, , w]) => [k, 480 - (ft(4) + 72), w]));
});

test("the plan runs through the takeoff engine", () => {
  const r = planFromDxf(dxf(house()));
  const out = takeoff({ ...samplePlan(), walls: r.plan.walls });
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.ok(out.walls.length === 5, JSON.stringify(Object.keys(out)));
  assert.ok(out.walls.every((w) => w.check?.ok !== false));
});

test("lines in feet and in millimetres scale; split lines on one wall merge", () => {
  const f = planFromDxf(dxf(house().map(([l, ...n]) => [l, ...n.map((v) => v / 12)]), 2));
  assert.equal(f.plan.walls[0].length, 480);
  const mm = planFromDxf(dxf(house().map(([l, ...n]) => [l, ...n.map((v) => v * 25.4)]), 4));
  assert.equal(mm.plan.walls[1].length, 336);
  const split = house();
  split.splice(0, 1, ["A-WALL", 0, 0, ft(20), 0], ["A-WALL", ft(20), 0, ft(40), 0]);
  assert.equal(planFromDxf(dxf(split)).plan.walls[0].length, 480);
});

test("an open outline, a missing layer and a binary file are reported", () => {
  const open = house().filter((l, i) => i !== 3);
  const r = planFromDxf(dxf(open));
  assert.ok(r.ok);
  assert.equal(r.plan.walls.some((w) => w.corner), false);
  assert.match(r.notes.join(" "), /No closed exterior loop/);
  assert.equal(planFromDxf(dxf([["TEXT", 0, 0, 1, 1]])).ok, false);
  assert.match(planFromDxf("AutoCAD Binary DXF\r\n").errors[0], /binary/);
});

test("closed LWPOLYLINE and POLYLINE outlines are read", () => {
  const g = (c, v) => `${c}\n${v}\n`;
  const rect = [[0, 0], [480, 0], [480, 336], [0, 336]];
  const lw = g(0, "LWPOLYLINE") + g(8, "WALLS") + g(90, 4) + g(70, 1) + rect.map(([x, y]) => g(10, x) + g(20, y)).join("");
  const r = planFromDxf(dxf([], 1, lw));
  assert.equal(r.stats.exterior, 4);
  const pl = g(0, "POLYLINE") + g(8, "WALLS") + g(70, 1) + rect.map(([x, y]) => g(0, "VERTEX") + g(8, "WALLS") + g(10, x) + g(20, y)).join("") + g(0, "SEQEND");
  assert.equal(planFromDxf(dxf([], 1, pl)).stats.exterior, 4);
  assert.equal(parseDxf(dxf([], 1, pl)).segs.length, 4);
});

// Double-line walls: every wall is two face lines `t` inches apart, as an architect draws it.
// Outer rectangle 40 ft x 28 ft to the centres, 4.5 in walls; the partition at x = 14 ft butts the inner faces.
function doubleHouse(t = 4.5) {
  const h = t / 2, W = ft(40), D = ft(28), px = ft(14);
  return [
    ["A-WALL", -h, -h, W + h, -h], ["A-WALL", W + h, -h, W + h, D + h], ["A-WALL", W + h, D + h, -h, D + h], ["A-WALL", -h, D + h, -h, -h],
    // inner faces, front and back broken where the partition butts them
    ["A-WALL", h, h, px - h, h], ["A-WALL", px + h, h, W - h, h],
    ["A-WALL", W - h, h, W - h, D - h],
    ["A-WALL", W - h, D - h, px + h, D - h], ["A-WALL", px - h, D - h, h, D - h],
    ["A-WALL", h, D - h, h, h],
    // partition faces
    ["A-WALL", px - h, h, px - h, D - h], ["A-WALL", px + h, h, px + h, D - h],
    ["A-DOOR", ft(17), 0, ft(17) + 38, 0],
  ];
}

test("double-line walls read as centre lines: same exterior lengths, one tee, a face-to-face partition", () => {
  const r = planFromDxf(dxf(doubleHouse()));
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.stats.exterior, 4);
  assert.equal(r.stats.interior, 1);
  const [a, b, c, d, p] = r.plan.walls;
  assert.deepEqual([a.length, b.length, c.length, d.length], [480, 336, 480, 336]);
  assert.equal(p.length, 336 - 4.5);
  assert.ok(r.notes.some((n) => /Double-line walls: 5 walls/.test(n)));
  assert.deepEqual(a.tees, [168]);
  assert.equal(a.openings.length, 1);
  assert.equal(a.openings[0].width, 38);
});

test("double-line detection can be switched off and does not touch single-line plans", () => {
  const single = planFromDxf(dxf(house()));
  assert.ok(!single.notes.some((n) => /Double-line/.test(n)));
  const off = planFromDxf(dxf(doubleHouse()), { doubleLine: false });
  assert.ok(!off.notes.some((n) => /Double-line/.test(n)));
  const mm = planFromDxf(dxf(doubleHouse(6).map(([l, ...n]) => [l, ...n.map((v) => v * 25.4)]), 4));
  assert.equal(mm.plan.walls[0].length, 480);
});

// Plans generated by Open House Plans (CC0; ventures/open-house-plans, fixtures/): every wall piece
// between openings is a closed rectangle, openings are gaps with jamb, glazing or garage-door lines.
// The generator's own openings.csv is the answer key for what the importer should find.
import { readFileSync } from "node:fs";
const fixture = (n, ext) => readFileSync(new URL(`./fixtures/open-house-plans-${n}.${ext}`, import.meta.url), "utf8");
function schedule(n) {
  const widths = [];
  for (const row of fixture(n, "openings.csv").trim().split("\n").slice(1)) {
    const m = row.match(/^(?:"[^"]*"|[^,]*),([\d.]+),[\d.]+,[\d.]+,(\d+)$/);
    for (let k = 0; k < Number(m[2]); k++) widths.push(Math.round(Number(m[1]) * 12));
  }
  return widths.sort((p, q) => p - q);
}

for (const n of [1, 2]) {
  test(`Open House Plans DXF ${n}: wall rectangles read as centre lines, exterior loop found, every opening matches its schedule`, () => {
    const r = planFromDxf(fixture(n, "dxf"));
    assert.ok(r.ok, r.errors.join());
    assert.equal(r.stats.exterior, 4);
    assert.ok(r.notes.some((x) => /Rectangle walls/.test(x)));
    const widths = r.plan.walls.flatMap((w) => (w.openings ?? []).map((o) => Math.round(o.width))).sort((p, q) => p - q);
    assert.deepEqual(widths, schedule(n));
    // corners are centre to centre: opposite exterior walls agree
    const ext = r.plan.walls.filter((w) => w.corner).map((w) => w.length);
    assert.equal(ext[0], ext[2]);
    assert.equal(ext[1], ext[3]);
  });
}

test("Open House Plans DXF 1: the exterior is the 34 x 26 ft footprint the generator drew", () => {
  const r = planFromDxf(fixture(1, "dxf"));
  assert.deepEqual(r.plan.walls.filter((w) => w.corner).map((w) => w.length).sort((p, q) => p - q), [312, 312, 408, 408]);
});

test("a house of three bare rectangles is not mistaken for rectangle walls", () => {
  const r = planFromDxf(dxf(house()));
  assert.ok(!r.notes.some((x) => /Rectangle walls/.test(x)));
});

// Door and window block symbols (INSERT) become openings.
function blocksSection() {
  const g = (c, v) => `${c}\n${v}\n`;
  const blk = (name, ents) => g(0, "BLOCK") + g(8, "0") + g(2, name) + g(70, 0) + g(10, 0) + g(20, 0) + g(30, 0) + ents + g(0, "ENDBLK");
  const line = (x1, y1, x2, y2) => g(0, "LINE") + g(8, "0") + g(10, x1) + g(20, y1) + g(11, x2) + g(21, y2);
  const arc = g(0, "ARC") + g(8, "0") + g(10, 0) + g(20, 0) + g(40, 36) + g(50, 0) + g(51, 90);
  return g(0, "SECTION") + g(2, "BLOCKS")
    + blk("DOOR36", line(0, 0, 36, 0) + line(0, 0, 0, 36) + arc)   // hinge at origin, leaf 36 in, swing box 36 x 36
    + blk("WIN-UNIT", line(0, -3, 1, -3) + line(0, 3, 1, 3))        // unit-length window scaled by the insert
    + blk("TOILET", line(0, 0, 14, 0) + line(14, 0, 14, 20))
    + g(0, "ENDSEC");
}
const insert = (name, layer, x, y, sx = 1, rot = 0) => `0\nINSERT\n8\n${layer}\n2\n${name}\n10\n${x}\n20\n${y}\n41\n${sx}\n42\n${sx}\n50\n${rot}\n`;

test("door and window blocks on walls become openings with widths from the block box", () => {
  const body = [["A-WALL", 0, 0, ft(40), 0], ["A-WALL", ft(40), 0, ft(40), ft(28)], ["A-WALL", ft(40), ft(28), 0, ft(28)], ["A-WALL", 0, ft(28), 0, 0]];
  const ents = insert("DOOR36", "A-DOOR", ft(17), 0) + insert("WIN-UNIT", "A-GLAZ", ft(4), ft(28), 72) + insert("TOILET", "A-FIXT", 60, 60);
  const g = (c, v) => `${c}\n${v}\n`;
  let text = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, 1) + g(0, "ENDSEC") + blocksSection() + g(0, "SECTION") + g(2, "ENTITIES");
  for (const [layer, x1, y1, x2, y2] of body) text += g(0, "LINE") + g(8, layer) + g(10, x1) + g(20, y1) + g(11, x2) + g(21, y2);
  text += ents + g(0, "ENDSEC") + g(0, "EOF");
  const r = planFromDxf(text);
  assert.ok(r.ok, r.errors.join());
  const [a, , c] = r.plan.walls;
  assert.deepEqual(a.openings.map((o) => [o.kind, o.offset, o.width]), [["door", 204, 36]]);
  assert.deepEqual(c.openings.map((o) => [o.kind, o.width]), [["window", 72]]);
  assert.equal(r.stats.openings, 2);
  assert.match(r.notes.join("\n"), /3 block INSERTs: 2 read as openings.*1 other block/);
});

test("a block symbol over a door line is not counted twice", () => {
  const g = (c, v) => `${c}\n${v}\n`;
  let text = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, 1) + g(0, "ENDSEC") + blocksSection() + g(0, "SECTION") + g(2, "ENTITIES");
  for (const [layer, x1, y1, x2, y2] of house()) text += g(0, "LINE") + g(8, layer) + g(10, x1) + g(20, y1) + g(11, x2) + g(21, y2);
  text += insert("DOOR36", "A-DOOR", ft(17), 0) + g(0, "ENDSEC") + g(0, "EOF");
  const r = planFromDxf(text);
  assert.equal(r.plan.walls[0].openings.length, 1);
  assert.match(r.notes.join("\n"), /1 already marked by a line/);
});

// A CAD library's door symbols (checked 2026-10-28 on four of LibreCAD's plan/doors files, GPL so not
// kept here) draw only the jambs along the wall plus a swing arc per leaf. This copies that structure
// with made-up numbers: a double door whose jambs sit 118 in apart and two 60 in leaf arcs.
test("jamb pieces and swing arcs read as one door, not several 4 in doors", () => {
  const g = (c, v) => `${c}\n${v}\n`;
  const jamb = (x0, x1) => [["A-DOOR", x0, -3.75, x0, 3.75], ["A-DOOR", x0, 3.75, x1, 3.75], ["A-DOOR", x1, 3.75, x1, -3.75], ["A-DOOR", x1, -3.75, x0, -3.75]];
  const arc = (x, a0, a1) => g(0, "ARC") + g(8, "A-DOOR") + g(10, x) + g(20, 0) + g(40, 60) + g(50, a0) + g(51, a1);
  const lines = [...house().filter((l) => l[0] === "A-WALL"), ...jamb(100, 103.4), ...jamb(221.6, 225)];
  const r = planFromDxf(dxf(lines, 1, arc(102, 270, 360) + arc(222, 180, 270)));
  assert.ok(r.ok, r.errors.join());
  const ops = r.plan.walls[0].openings;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].offset, 100);
  assert.equal(ops[0].width, 125);
  assert.ok(r.notes.some((n) => /joined into one opening/.test(n)));
  // without the arcs there is nothing to say the two jambs belong together
  const bare = planFromDxf(dxf(lines));
  assert.ok(!bare.notes.some((n) => /joined into one opening/.test(n)));
});

test("nested block symbols: a door made of a leaf block inside a frame block, mirrored and turned", () => {
  const g = (c, v) => `${c}\n${v}\n`;
  const line = (x1, y1, x2, y2) => g(0, "LINE") + g(8, "0") + g(10, x1) + g(20, y1) + g(11, x2) + g(21, y2);
  const ins = (name, x, y, o = {}) => g(0, "INSERT") + g(8, o.layer ?? "0") + g(2, name) + g(10, x) + g(20, y) + (o.sx ? g(41, o.sx) + g(42, 1) : "") + (o.rot ? g(50, o.rot) : "");
  const blk = (name, body) => g(0, "BLOCK") + g(2, name) + g(10, 0) + g(20, 0) + body + g(0, "ENDBLK");
  // LEAF is 18 in long; DOOR36 holds two LEAFs, the second mirrored and moved 18 in over: 36 in in all
  const blocks = g(0, "SECTION") + g(2, "BLOCKS") + blk("LEAF", line(0, 0, 18, 0) + line(0, 0, 0, 2)) + blk("DOOR36", ins("LEAF", 0, 0) + ins("LEAF", 36, 0, { sx: -1 })) + g(0, "ENDSEC");
  const withBlocks = dxf(house().filter((l) => l[0] !== "A-DOOR"), 1, ins("DOOR36", ft(17), 0, { layer: "A-DOOR" })).replace(g(0, "SECTION") + g(2, "ENTITIES"), blocks + g(0, "SECTION") + g(2, "ENTITIES"));
  const p = parseDxf(withBlocks);
  assert.deepEqual(p.blocks.DOOR36, { minx: 0, miny: 0, maxx: 36, maxy: 2 });
  const r = planFromDxf(withBlocks);
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual(r.plan.walls[0].openings.map((o) => [o.kind, o.offset, o.width]), [["door", 204, 36]]);
});
