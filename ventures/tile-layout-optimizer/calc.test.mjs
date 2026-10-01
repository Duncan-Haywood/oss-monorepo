import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SYSTEMS, BONDS, buildProblem, optimizeTile, planAll, verifyPlan, purchase, ruleOfThumb, naiveLayout,
  viewItems, cutList, reportCsv, sampleInput, parseTiles, toU, fromU, lenText, areaText, fmtNum, layoutText,
} from "./calc.mjs";

const M = SYSTEMS.metric;
const base = (over = {}) => ({
  roomW: 100, roomL: 100, cutouts: [], grout: 0, gap: 0, kerf: 0, minCut: 0, spare: 0, ruleWaste: 10,
  bonds: ["straight"], rotation: "fixed", offcutRotate: false, reuse: true,
  tiles: [{ name: "t", w: 30, h: 30, perBox: null, boxPrice: null }], ...over,
});
const make = (over) => {
  const { problem, errors } = buildProblem(base(over), M);
  assert.deepEqual(errors, []);
  return problem;
};
const best = (over, opts) => {
  const p = make(over);
  const r = optimizeTile(p, p.tiles[0], opts);
  return { p, r, plan: r.best };
};

test("units are integer hundredths of a millimetre and round-trip", () => {
  assert.equal(toU(30, 10), 30000);
  assert.equal(toU(1, 25.4), 2540);
  assert.equal(fromU(30000, 10), 30);
  assert.equal(lenText(30000, M), "30 cm");
  assert.equal(areaText(1e10, M), "1 m²");
  assert.equal(fmtNum(1234.5), "1,234.5");
});

test("a room that is a whole number of tiles needs exactly that many, no cuts", () => {
  const { r, p } = best({ roomW: 120, roomL: 120 });
  assert.equal(r.best.tiles, 16);
  assert.equal(r.best.cutCount, 0);
  assert.equal(r.best.full, 16);
  assert.equal(r.best.lowerBound, 16);
  assert.ok(verifyPlan(p, p.tiles[0], r.best).ok);
});

test("100 x 100 cm with 30 cm tiles: 9 whole, 1900 cm2 of cuts, so 12 is the floor and is reached", () => {
  const { p, r, plan } = best({});
  // area: 10,000 cm2 -> 11.1 tiles of 900 cm2 -> at least 12
  assert.equal(plan.tiles, 12);
  assert.ok(plan.tiles >= Math.ceil(10000 / 900));
  assert.ok(verifyPlan(p, p.tiles[0], plan).ok);
  // the corner start, no reuse, is 9 whole + 7 cuts = 16
  const naive = naiveLayout(p, p.tiles[0]);
  assert.equal(naive.full, 9);
  assert.equal(naive.cutCount, 7);
  assert.equal(naive.tiles, 16);
  // with reuse and the same corner start: three 10x30 strips share a tile, three 30x10 another, the 10x10 a third
  const { p: p2, r: r2 } = best({}, { steps: 1 });
  assert.equal(r2.best.tiles, 12);
  assert.ok(verifyPlan(p2, p2.tiles[0], r2.best).ok);
  assert.ok(r.searched > 0);
});

test("offcut reuse off buys one tile per cut piece", () => {
  const p = make({ reuse: false });
  const r = optimizeTile(p, p.tiles[0]);
  assert.equal(r.best.tiles, r.best.full + r.best.cutCount);
  assert.ok(verifyPlan(p, p.tiles[0], r.best).ok);
  const on = optimizeTile(make({ reuse: true }), p.tiles[0]);
  assert.ok(on.best.tiles <= r.best.tiles);
});

test("a 90 x 30 cm room with 60 x 30 tiles needs one whole tile and one half", () => {
  const { p, plan } = best({ roomW: 90, roomL: 30, tiles: [{ name: "plank", w: 60, h: 30 }] });
  assert.equal(plan.tiles, 2);
  assert.equal(plan.full, 1);
  assert.equal(plan.cutCount, 1);
  assert.ok(verifyPlan(p, p.tiles[0], plan).ok);
});

test("grout joints are part of the pitch: 3 mm grout between 30 cm tiles", () => {
  // 4 tiles and 3 joints across = 120 + 0.9 cm; a 120 cm room cannot fit four whole tiles per row
  const { p, plan } = best({ roomW: 120, roomL: 30, grout: 3 });
  assert.ok(plan.tiles >= 4);
  assert.ok(plan.cutCount >= 1);
  assert.ok(verifyPlan(p, p.tiles[0], plan).ok);
  // 120.9 cm fits four whole tiles exactly
  const wide = best({ roomW: 120.9, roomL: 30, grout: 3 });
  assert.equal(wide.plan.tiles, 4);
  assert.equal(wide.plan.full, 4);
});

test("a cut-out that bites a tile makes an awkward piece that uses a whole tile", () => {
  const { p, plan } = best({ roomW: 60, roomL: 60, tiles: [{ name: "big", w: 60, h: 60 }], cutouts: [{ x: 0, y: 0, w: 20, h: 20 }] });
  assert.equal(plan.tiles, 1);
  assert.equal(plan.complex, 1);
  assert.ok(verifyPlan(p, p.tiles[0], plan).ok);
});

test("a cut-out that takes a whole cell removes that tile", () => {
  const { p, plan } = best({ roomW: 120, roomL: 120, cutouts: [{ x: 30, y: 30, w: 30, h: 30 }] });
  assert.equal(plan.tiles, 15);
  assert.ok(verifyPlan(p, p.tiles[0], plan).ok);
});

test("an L-shaped room is a rectangle with a corner taken out", () => {
  const { p, plan } = best({ roomW: 120, roomL: 120, cutouts: [{ x: 60, y: 60, w: 60, h: 60 }] });
  assert.equal(plan.tiles, 12);
  assert.equal(p.floor, toU(120, 10) * toU(120, 10) * 3 / 4);
});

test("brick bond offsets the rows and can need more cuts at the walls than a straight grid", () => {
  const straight = best({ roomW: 120, roomL: 60, tiles: [{ name: "p", w: 60, h: 30 }] });
  const half = best({ roomW: 120, roomL: 60, tiles: [{ name: "p", w: 60, h: 30 }], bonds: ["half"] });
  assert.equal(straight.plan.tiles, 4);
  assert.equal(half.plan.tiles >= 4, true);
  assert.ok(verifyPlan(half.p, half.p.tiles[0], half.plan).ok);
  assert.equal(half.plan.layout.bond.id, "half");
  // a half-offset brick needs a half tile at each end of alternate rows: 120 = 2 x 60, so shifted rows have two halves
  const forced = half.plan;
  assert.ok(forced.tiles >= 4);
});

test("the narrowest-cut limit rejects layouts with slivers when a clean one exists", () => {
  const strict = best({ roomW: 100, roomL: 100, minCut: 100 }); // 10 cm pieces are slivers (< 100 mm)
  assert.equal(strict.plan.slivers, 0);
  assert.ok(strict.plan.narrowest === null || strict.plan.narrowest >= toU(100, 1));
  const p = strict.p;
  assert.ok(verifyPlan(p, p.tiles[0], strict.plan).ok);
  // a loose limit may take the cheaper layout
  const loose = best({ roomW: 100, roomL: 100, minCut: 0 });
  assert.ok(loose.plan.tiles <= strict.plan.tiles);
});

test("when every layout leaves a sliver the result says so", () => {
  // 30 cm tiles, 31 cm wide room: a 1 cm strip is unavoidable with whole tiles at the walls... unless centred 15 / 15
  const impossible = best({ roomW: 31, roomL: 30, minCut: 400, tiles: [{ name: "t", w: 30, h: 30 }] });
  assert.ok(impossible.plan.slivers > 0);
  assert.ok(verifyPlan(impossible.p, impossible.p.tiles[0], impossible.plan).ok);
});

test("purchase maths: spare, boxes and cost", () => {
  const p = make({ spare: 5 });
  const tile = { w: 1, h: 1, perBox: 6, boxPrice: 62 };
  const b = purchase(p, tile, 67);
  assert.equal(b.withSpare, 71); // ceil(67 * 1.05)
  assert.equal(b.boxes, 12);
  assert.equal(b.bought, 72);
  assert.equal(b.cost, 744);
  const noBox = purchase(p, { w: 1, h: 1, perBox: null, boxPrice: null }, 67);
  assert.equal(noBox.boxes, null);
  assert.equal(noBox.cost, null);
});

test("the rule of thumb is floor area over tile pitch area plus the waste percentage", () => {
  const p = make({ roomW: 120, roomL: 120, ruleWaste: 10 });
  const t = ruleOfThumb(p, p.tiles[0]);
  assert.equal(t.tilesNeeded, Math.ceil(16 * 1.1)); // 17.6 -> 18
});

test("planAll ranks tile options by box cost and compares with rule of thumb and the naive layout", () => {
  const sys = M;
  const raw = base({
    roomW: 240, roomL: 180,
    tiles: [{ name: "A", w: 30, h: 30, perBox: 10, boxPrice: 30 }, { name: "B", w: 60, h: 30, perBox: 5, boxPrice: 45 }],
    bonds: ["straight", "half"], rotation: "either", spare: 5,
  });
  const { problem, errors } = buildProblem(raw, sys);
  assert.deepEqual(errors, []);
  const all = planAll(problem);
  assert.equal(all.results.length, 2);
  assert.equal(all.order.length, 2);
  for (const r of all.results) {
    assert.ok(verifyPlan(problem, r.tile, r.best).ok, r.tile.name);
    assert.ok(r.best.tiles <= r.naive.tiles);
    assert.ok(r.best.tiles >= r.best.lowerBound);
  }
  // 240 x 180 is a whole number of 30 cm tiles (8 x 6 = 48) and of 60 x 30 tiles (4 x 6 = 24)
  assert.equal(all.results[0].best.tiles, 48);
  assert.equal(all.results[1].best.tiles, 24);
  const costs = all.order.map((i) => all.results[i].buy.cost);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test("the sample room verifies, finds a layout below the rule of thumb and is repeatable", () => {
  for (const sys of [SYSTEMS.metric, SYSTEMS.imperial]) {
    const { problem, errors } = buildProblem(sampleInput(sys), sys);
    assert.deepEqual(errors, []);
    const a = planAll(problem);
    const b = planAll(problem);
    for (const [i, r] of a.results.entries()) {
      assert.ok(verifyPlan(problem, r.tile, r.best).ok, `${sys.id} ${r.tile.name}`);
      assert.equal(r.best.tiles, b.results[i].best.tiles);
      assert.deepEqual(r.best.layout, b.results[i].best.layout);
      assert.ok(r.best.tiles <= r.thumb.tilesNeeded, `${sys.id} ${r.tile.name} ${r.best.tiles} vs ${r.thumb.tilesNeeded}`);
      assert.ok(r.best.tiles <= r.naive.tiles);
    }
  }
});

test("random rooms, tiles, cut-outs, bonds and settings always produce a verified plan", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  for (let n = 0; n < 40; n++) {
    const tw = pick(10, 60), th = pick(10, 120);
    const roomW = pick(60, 400), roomL = pick(60, 400);
    const cutouts = [];
    for (let k = pick(0, 2); k > 0; k--) cutouts.push({ x: pick(0, roomW - 10), y: pick(0, roomL - 10), w: pick(5, 120), h: pick(5, 120) });
    const raw = base({
      roomW, roomL, cutouts, grout: pick(0, 5), gap: pick(0, 12), kerf: pick(0, 3), minCut: 0,
      bonds: ["straight", "half", "third"].slice(0, pick(1, 3)),
      rotation: rnd() < 0.5 ? "either" : "fixed", offcutRotate: rnd() < 0.5, reuse: rnd() < 0.8,
      tiles: [{ name: "r", w: tw, h: th }],
    });
    const { problem, errors } = buildProblem(raw, M);
    if (errors.length) continue;
    const r = optimizeTile(problem, problem.tiles[0], { steps: 6, restarts: 6 });
    const v = verifyPlan(problem, problem.tiles[0], r.best);
    assert.ok(v.ok, `case ${n}: ${v.errors.join("; ")}`);
    assert.ok(r.best.tiles >= r.best.lowerBound);
    assert.ok(r.best.tiles * problem.tiles[0].w * problem.tiles[0].h >= r.best.usedArea, `case ${n}: below the area bound`);
    if (problem.bonds.some((b) => b.id === "straight") && problem.reuse) {
      const naive = naiveLayout(problem, problem.tiles[0]);
      assert.ok(r.best.tiles <= naive.tiles, `case ${n}: ${r.best.tiles} > naive ${naive.tiles}`);
    }
  }
});

test("the verifier catches a tampered plan", () => {
  const { p, plan } = best({});
  const tile = p.tiles[0];
  assert.ok(verifyPlan(p, tile, plan).ok);
  const clone = () => structuredClone({ ...plan, layout: { ...plan.layout, bond: BONDS[0] } });
  // a piece goes missing: the floor is no longer covered
  let t = clone();
  t.pieces = t.pieces.slice(1);
  assert.equal(verifyPlan(p, tile, t).ok, false);
  // a cut piece is moved outside its tile
  t = clone();
  const bin = t.bins.find((b) => b.placed.length);
  bin.placed[0].x = tile.w;
  assert.equal(verifyPlan(p, tile, t).ok, false);
  // two pieces forced to overlap in one tile
  t = clone();
  const multi = t.bins.find((b) => b.placed.length > 1);
  if (multi) {
    multi.placed[1].x = multi.placed[0].x;
    multi.placed[1].y = multi.placed[0].y;
    assert.equal(verifyPlan(p, tile, t).ok, false);
  }
  // a wrong tile count
  t = clone();
  t.tiles -= 1;
  assert.equal(verifyPlan(p, tile, t).ok, false);
  // a piece pushed off the grid
  t = clone();
  t.pieces[0].cell = { ...t.pieces[0].cell, x0: t.pieces[0].cell.x0 + 5, x1: t.pieces[0].cell.x1 + 5 };
  assert.equal(verifyPlan(p, tile, t).ok, false);
  // a piece claims to overlap a cut-out
  const q = make({ roomW: 120, roomL: 120, cutouts: [{ x: 30, y: 30, w: 30, h: 30 }] });
  const planQ = optimizeTile(q, q.tiles[0]).best;
  const bad = structuredClone({ ...planQ, layout: { ...planQ.layout, bond: BONDS[0] } });
  bad.pieces[0].rects = [{ ...q.cutouts[0] }];
  assert.equal(verifyPlan(q, q.tiles[0], bad).ok, false);
});

test("input validation gives plain-language errors", () => {
  assert.ok(buildProblem(base({ roomW: 0 }), M).errors.length > 0);
  assert.ok(buildProblem(base({ tiles: [] }), M).errors.some((e) => /tile option/i.test(e)));
  assert.ok(buildProblem(base({ gap: 600 }), M).errors.some((e) => /no floor/.test(e)));
  assert.ok(buildProblem(base({ bonds: [] }), M).errors.some((e) => /bond/i.test(e)));
  assert.ok(buildProblem(base({ cutouts: [{ x: 1, y: 1, w: 0, h: 5 }] }), M).errors.some((e) => /Cut-out 1/.test(e)));
  assert.ok(buildProblem(base({ roomW: 100000, roomL: 100000, tiles: [{ name: "x", w: 1, h: 1 }] }), M).errors.some((e) => /Check the units/.test(e)));
  assert.ok(buildProblem(base({ tiles: [{ name: "x", w: 0.1, h: 10 }], grout: 3 }), M).errors.some((e) => /larger than the grout/.test(e)));
  // blank cut-out rows are ignored
  assert.deepEqual(buildProblem(base({ cutouts: [{ x: NaN, y: NaN, w: NaN, h: NaN }] }), M).errors, []);
});

test("view items, cutting list and CSV describe the plan", () => {
  const { p, plan } = best({});
  const items = viewItems(p, plan);
  assert.equal(items.length, plan.pieces.reduce((s, x) => s + x.rects.length, 0));
  assert.ok(items.some((i) => i.kind === "full"));
  const rows = cutList(p, plan, M);
  assert.equal(rows.length, plan.pieces.filter((x) => x.kind === "cut").length);
  const csv = reportCsv(p, { best: plan }, M);
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^tile_to_cut,piece_in_tile/);
  assert.equal(lines.length, rows.length + 1);
  assert.match(layoutText(p, plan, M), /first grid line/);
});

test("parseTiles reads a pasted block", () => {
  const t = parseTiles("Plank, 20, 120, 6, 62\nLarge\t60\t60\t4\t$68\n\n");
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { name: "Plank", w: 20, h: 120, perBox: 6, boxPrice: 62 });
  assert.equal(t[1].boxPrice, 68);
});
