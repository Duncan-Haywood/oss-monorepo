import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SYSTEMS, evaluateLayout, layoutFor, searchBest, planMode, compareLayouts, cutList, verifyLayout,
  validateSpec, reuseTiles, tileableArea, sampleSpec, reportCsv, betterLayout, estimateCells,
} from "./calc.mjs";

const base = (o = {}) => ({
  roomW: 3000, roomH: 3000, wallGap: 0, tileW: 300, tileH: 300, grout: 0, pattern: "grid", brickShift: 0.5,
  obstacles: [], minCut: 50, overagePct: 0, tilesPerBox: 0, boxPrice: null, reuse: true, swap: false, ...o,
});

test("a room that is a whole number of tiles needs exactly that many, no cuts", () => {
  const r = planMode(base(), "corner-nw");
  assert.equal(r.full, 100);
  assert.equal(r.cutCount, 0);
  assert.equal(r.tilesWithReuse, 100);
  assert.equal(r.smallest, null);
  assert.equal(r.slivers, 0);
});

test("hand-computed: 3000 x 2000 with 300 tiles has 60 full and 10 cut, and the cuts cannot share", () => {
  const spec = base({ roomH: 2000 });
  const r = planMode(spec, "corner-nw");
  assert.equal(r.full, 60);
  assert.equal(r.cutCount, 10);
  assert.equal(r.tilesNoReuse, 70);
  // each cut is 300 x 200, leaving 300 x 100, which cannot serve another 200 cut
  assert.equal(r.tilesWithReuse, 70);
  assert.equal(r.smallest, 200);
});

test("hand-computed: 2500 wide leaves 100 mm strips; two strips share one tile", () => {
  const spec = base({ roomW: 2500 });
  const r = planMode(spec, "corner-nw");
  assert.equal(r.full, 80);
  assert.equal(r.cutCount, 10);
  assert.equal(r.tilesNoReuse, 90);
  assert.equal(r.tilesWithReuse, 84); // 10 strips of 100 x 300, three per tile: 4 tiles
  assert.equal(r.smallest, 100);
});

test("centring splits the leftover across both walls", () => {
  const spec = base({ roomW: 2500, roomH: 3300 });
  const r = planMode(spec, "tile-center");
  assert.equal(r.smallest, 200);
  assert.equal(r.full, 77); // 7 full tiles across, 11 rows
  assert.equal(r.cutCount, 22); // 200 mm cut on each side of every row
  // a 200 mm piece leaves 100 mm, too thin to serve another 200 mm piece
  assert.equal(r.tilesWithReuse, 99);
  // the corner start needs fewer tiles but its strips are only 100 mm
  const c = planMode(spec, "corner-nw");
  assert.equal(c.tilesWithReuse, 92); // 88 full + 11 strips, three to a tile = 4
  assert.equal(c.smallest, 100);
});

test("grout joints change the pitch", () => {
  const spec = base({ roomW: 3100, roomH: 300, tileW: 300, grout: 10 });
  const r = planMode(spec, "corner-nw");
  // pitch 310: ten tiles fit at 0..3090, the eleventh starts at 3100 and is outside
  assert.equal(r.full, 10);
  assert.equal(r.cutCount, 0);
});

test("an obstacle removes tiles and creates cuts", () => {
  const spec = base({ obstacles: [{ x: 0, y: 0, w: 600, h: 600 }] });
  const r = planMode(spec, "corner-nw");
  assert.equal(r.full, 96); // 100 - 4 under the obstacle
  assert.equal(r.cutCount, 0);
  assert.equal(tileableArea(spec), 3000 * 3000 - 600 * 600);
  const off = base({ obstacles: [{ x: 100, y: 100, w: 400, h: 400 }] });
  const r2 = planMode(off, "corner-nw");
  assert.ok(r2.cutCount > 0);
});

test("an obstacle may poke through a tile and leave an L-shaped piece", () => {
  const spec = base({ roomW: 600, roomH: 600, obstacles: [{ x: 300, y: 300, w: 300, h: 300 }] });
  const r = planMode(spec, "corner-nw");
  assert.equal(r.full, 3);
  assert.equal(r.cutCount, 0);
  const notch = base({ roomW: 600, roomH: 600, obstacles: [{ x: 400, y: 400, w: 200, h: 200 }] });
  const r2 = planMode(notch, "corner-nw", true);
  assert.equal(r2.cutCount, 1);
  assert.equal(r2.full, 3);
  assert.deepEqual(verifyLayout(notch, r2), []);
});

test("diagonal layout: pieces add up to the floor, no matter the offset", () => {
  const spec = base({ roomW: 3700, roomH: 2900, tileW: 400, tileH: 400, grout: 4, pattern: "diagonal" });
  for (const kind of ["tile-center", "joint-center", "corner"]) {
    const r = evaluateLayout(spec, layoutFor(spec, kind), true);
    assert.deepEqual(verifyLayout(spec, r), [], kind);
    assert.equal(r.reuseModelled, false);
    assert.equal(r.tilesWithReuse, r.tilesNoReuse);
  }
});

test("diagonal needs more tiles than straight for the same room", () => {
  const spec = base({ roomW: 4000, roomH: 3000, tileW: 400, tileH: 400, grout: 3 });
  const straight = planMode(spec, "best");
  const diag = planMode({ ...spec, pattern: "diagonal" }, "best");
  assert.ok(diag.tilesWithReuse > straight.tilesWithReuse);
});

test("random rooms, tiles, patterns and obstacles always verify", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let n = 0; n < 60; n++) {
    const pattern = ["grid", "brick", "diagonal"][n % 3];
    const roomW = 1500 + Math.floor(rnd() * 5000), roomH = 1500 + Math.floor(rnd() * 5000);
    const obstacles = [];
    if (rnd() < 0.7) obstacles.push({ x: Math.floor(rnd() * roomW * 0.5), y: Math.floor(rnd() * roomH * 0.5), w: 200 + Math.floor(rnd() * 800), h: 200 + Math.floor(rnd() * 800) });
    const spec = base({
      roomW, roomH, pattern, tileW: 200 + Math.floor(rnd() * 500), tileH: 200 + Math.floor(rnd() * 500), grout: Math.floor(rnd() * 8),
      wallGap: rnd() < 0.5 ? 0 : 8, obstacles, brickShift: [0.5, 1 / 3, 0.25][n % 3],
    });
    if (validateSpec(spec).length) continue;
    for (const mode of ["best", "tile-center", "corner-se"]) {
      const r = planMode(spec, mode, true);
      assert.deepEqual(verifyLayout(spec, r), [], `${pattern} ${mode} #${n}`);
      // the same room with no joints must tile to the square millimetre
      const flat = { ...spec, grout: 0 };
      assert.deepEqual(verifyLayout(flat, planMode(flat, mode, true)), [], `flat ${pattern} ${mode} #${n}`);
      assert.ok(r.tilesWithReuse >= r.full);
      assert.ok(r.tilesWithReuse <= r.tilesNoReuse);
    }
  }
});

test("the best layout is never worse than any named layout", () => {
  const spec = base({ roomW: 3470, roomH: 2810, tileW: 300, tileH: 600, grout: 3 });
  const rows = compareLayouts(spec);
  const best = rows[rows.length - 1];
  for (const r of rows) assert.ok(!betterLayout(r, best), r.name);
  assert.equal(best.name, "Best found, either tile direction");
});

test("brick bond shifts alternate rows and the pieces still verify", () => {
  const spec = base({ roomW: 3100, roomH: 1500, tileW: 600, tileH: 300, grout: 2, pattern: "brick" });
  const r = planMode(spec, "corner-nw", true);
  assert.deepEqual(verifyLayout(spec, r), []);
  // alternate rows start half a tile in, so a short and a long piece sit at each end
  assert.ok(r.cutCount >= 8);
});

test("search finds a layout without thin cuts when one exists", () => {
  // 3100 wide with 300 tiles leaves a 100 strip at one wall from the corner; centring leaves 200 each side
  const spec = base({ roomW: 3050, roomH: 3000, minCut: 100 });
  const corner = planMode(spec, "corner-nw");
  assert.equal(corner.smallest, 50);
  assert.equal(corner.slivers, 10);
  const best = planMode(spec, "best");
  assert.equal(best.slivers, 0);
  assert.ok(best.smallest >= 100);
});

test("reuse: leftover of a cut serves a later cut, but never one that does not fit", () => {
  assert.equal(reuseTiles([[100, 300], [100, 300]], 300, 300, false), 1);
  assert.equal(reuseTiles([[200, 300], [200, 300]], 300, 300, false), 2);
  // rotated offcut: a 300 x 100 piece fits a rotated 100 x 300 leftover only if rotation is allowed
  assert.equal(reuseTiles([[100, 300], [300, 100]], 300, 300, true), 1);
  assert.equal(reuseTiles([[100, 300], [300, 100]], 300, 300, false), 2);
});

test("order quantity adds overage and rounds up to boxes and cost", () => {
  const spec = base({ roomW: 2500, overagePct: 10, tilesPerBox: 8, boxPrice: 40 });
  const r = planMode(spec, "corner-nw");
  assert.equal(r.tilesWithReuse, 84);
  assert.equal(r.orderTiles, Math.ceil(84 * 1.1)); // 93
  assert.equal(r.boxes, 12);
  assert.equal(r.cost, 480);
});

test("validation catches the mistakes people make", () => {
  assert.ok(validateSpec(base({ roomW: NaN })).length);
  assert.ok(validateSpec(base({ tileW: 0 })).length);
  assert.ok(validateSpec(base({ grout: 400 })).length);
  assert.ok(validateSpec(base({ wallGap: 1600 })).length);
  assert.ok(validateSpec(base({ obstacles: [{ x: 2900, y: 0, w: 500, h: 100 }] })).some((e) => /outside/.test(e)));
  assert.ok(validateSpec(base({ obstacles: [{ x: 0, y: 0, w: 500, h: 500 }, { x: 400, y: 400, w: 500, h: 500 }] })).some((e) => /overlap/.test(e)));
  assert.ok(validateSpec(base({ tileW: 10, tileH: 10, roomW: 20000, roomH: 20000 })).some((e) => /60,000/.test(e)));
  assert.deepEqual(validateSpec(base()), []);
});

test("sample bathroom is valid, verifies and shows an obstacle", () => {
  const spec = sampleSpec();
  assert.deepEqual(validateSpec(spec), []);
  const r = planMode(spec, "best", true);
  assert.deepEqual(verifyLayout(spec, r), []);
  assert.equal(tileableArea(spec), 2740 * 2130 - 1740 * 800);
  assert.ok(cutList(r).length > 0);
  assert.match(reportCsv(SYSTEMS.metric, spec, r), /tiles to buy/);
});

test("a big room stays fast", () => {
  const spec = base({ roomW: 12000, roomH: 9000, tileW: 150, tileH: 150, grout: 3, pattern: "brick" });
  assert.ok(estimateCells(spec) < 60000);
  const t = Date.now();
  const r = planMode(spec, "best");
  assert.ok(Date.now() - t < 20000);
  assert.ok(r.full > 1000);
});
