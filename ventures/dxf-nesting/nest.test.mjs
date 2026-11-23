import { test } from "node:test";
import assert from "node:assert/strict";
import { rasterise, dilate, nest, verify, autoRes } from "./nest.mjs";
import { finishPart, rectEdges, circleEdge, polyEdges, partRings, pointInRing } from "./geom.mjs";
import { runJob, exampleParts, reportCsv, sheetDxf, partsFromDxf } from "./job.mjs";

const rect = (w, h) => finishPart({ outer: rectEdges(0, 0, w, h), holes: [], marks: [] }, 0.01);

function rng(seed) {
  let s = seed;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}

test("a rectangle on cell boundaries rasterises to exactly its cells", () => {
  const m = rasterise([[[0, 0], [100, 0], [100, 50], [0, 50]]], 10);
  assert.equal(m.w, 10);
  assert.equal(m.h, 5);
  assert.equal(m.grid.reduce((s, v) => s + v, 0), 50);
});

test("the raster covers every point of the shape (random polygons, sampled)", () => {
  const r = rng(7);
  for (let t = 0; t < 40; t++) {
    // a star-ish polygon around (50, 50)
    const n = 5 + Math.floor(r() * 12), ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rad = 10 + r() * 40;
      ring.push([50 + rad * Math.cos(a), 50 + rad * Math.sin(a)]);
    }
    const res = 1 + r() * 4;
    const m = rasterise([ring], res);
    for (let q = 0; q < 400; q++) {
      const x = r() * 100, y = r() * 100;
      if (!pointInRing(x, y, ring)) continue;
      const i = Math.floor((x - m.minX) / res), j = Math.floor((y - m.minY) / res);
      assert.equal(m.grid[j * m.w + i], 1, `point (${x}, ${y}) not covered in polygon ${t}`);
    }
  }
});

test("a hole stays free in the raster, and dilation grows by k cells each way", () => {
  const m = rasterise([[[0, 0], [100, 0], [100, 100], [0, 100]], [[30, 30], [70, 30], [70, 70], [30, 70]]], 10);
  assert.equal(m.grid[5 * m.w + 5], 0); // centre of the hole
  assert.equal(m.grid.reduce((s, v) => s + v, 0), 100 - 16);
  const d = dilate(m, 1);
  assert.equal(d.w, 12);
  assert.equal(d.grid.reduce((s, v) => s + v, 0), 144 - 4); // hole shrinks from 4x4 to 2x2
});

test("100 x 50 parts tile a 1000 x 500 sheet exactly: 100 parts, one sheet, 100% used", () => {
  const job = runJob([{ name: "R", part: rect(100, 50), qty: 100 }], { sheetW: 1000, sheetH: 500, gap: 0, margin: 0, res: 10, tol: 0 });
  assert.equal(job.report.totalSheets, 1);
  assert.equal(job.report.totalParts, 100);
  assert.ok(Math.abs(job.report.utilisation - 1) < 1e-9);
  assert.ok(job.check.ok, job.check.problems.join("\n"));
});

test("with a gap, one more part than fits spills to a second sheet", () => {
  // 1000 x 500 with 10 mm gaps and no margin: 9 columns of 100 (9*100 + 8*10 = 980) and 4 rows of 110 (4*110 + 3*10 = 470; a fifth needs 590)
  const job = runJob([{ name: "R", part: rect(100, 110), qty: 37 }], { sheetW: 1000, sheetH: 500, gap: 10, margin: 0, res: 10, tol: 0, rotations: [0] });
  assert.equal(job.report.sheets[0].parts, 36);
  assert.equal(job.report.totalSheets, 2);
  assert.ok(job.check.ok);
  assert.ok(job.check.minGap >= 10 - 1e-9);
});

test("a small part goes inside a large part's cut-out", () => {
  const ringPart = finishPart({ outer: [circleEdge(100, 100, 100)], holes: [[circleEdge(100, 100, 75)]], marks: [] }, 0.01);
  const disc = finishPart({ outer: [circleEdge(50, 50, 50)], holes: [], marks: [] }, 0.01);
  const job = runJob([{ name: "ring", part: ringPart, qty: 1 }, { name: "disc", part: disc, qty: 1 }], { sheetW: 205, sheetH: 205, gap: 5, margin: 0, res: 1 });
  assert.equal(job.report.totalSheets, 1);
  assert.equal(job.report.totalParts, 2);
  assert.ok(job.check.ok, job.check.problems.join("\n"));
});

test("a part bigger than the sheet is reported, not dropped", () => {
  const job = runJob([{ name: "big", part: rect(600, 600), qty: 2 }, { name: "ok", part: rect(100, 100), qty: 1 }], { sheetW: 500, sheetH: 500, res: 10, tol: 0 });
  assert.equal(job.result.unplaced.length, 1);
  assert.equal(job.result.unplaced[0].count, 2);
  assert.match(job.result.unplaced[0].reason, /larger than the sheet/);
  assert.equal(job.report.totalParts, 1);
});

test("rotation lets a long part fit a sheet it would not fit unturned", () => {
  const job = runJob([{ name: "bar", part: rect(50, 400), qty: 1 }], { sheetW: 500, sheetH: 100, res: 10, tol: 0 });
  assert.equal(job.report.totalParts, 1);
  assert.equal(job.result.sheets[0].placements[0].angle % 180, 90);
  const none = runJob([{ name: "bar", part: rect(50, 400), qty: 1 }], { sheetW: 500, sheetH: 100, res: 10, tol: 0, rotations: [0] });
  assert.equal(none.report.totalParts, 0);
});

test("the edge margin is kept", () => {
  const job = runJob([{ name: "R", part: rect(100, 100), qty: 20 }], { sheetW: 600, sheetH: 400, gap: 3, margin: 12, res: 2 });
  assert.ok(job.check.ok);
  assert.ok(job.check.minEdge >= 12);
});

test("verify catches an overlap and a part off the sheet (so it is a real check)", () => {
  const parts = new Map([[0, rect(100, 100)]]);
  const bad = { tol: 0, gap: 5, margin: 0, sheetW: 500, sheetH: 500, sheets: [{ placements: [{ id: 0, name: "R", copy: 0, angle: 0, tx: 0, ty: 0 }, { id: 0, name: "R", copy: 1, angle: 0, tx: 103, ty: 0 }, { id: 0, name: "R", copy: 2, angle: 0, tx: 450, ty: 0 }] }] };
  const v = verify(bad, parts);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /3\.0000 apart/.test(p)));
  assert.ok(v.problems.some((p) => /sheet edge/.test(p)));
  // one part entirely inside another's material
  const inside = { ...bad, sheets: [{ placements: [{ id: 0, name: "R", copy: 0, angle: 0, tx: 0, ty: 0 }, { id: 1, name: "S", copy: 0, angle: 0, tx: 40, ty: 40 }] }] };
  const v2 = verify(inside, new Map([[0, rect(100, 100)], [1, rect(10, 10)]]));
  assert.equal(v2.ok, false);
});

test("random irregular jobs always pass the independent check", () => {
  const r = rng(99);
  for (let t = 0; t < 6; t++) {
    const items = [];
    for (let k = 0; k < 4; k++) {
      const n = 3 + Math.floor(r() * 7), pts = [];
      const R = 20 + r() * 80;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, rad = R * (0.4 + 0.6 * r());
        pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
      }
      const holes = r() < 0.5 ? [[circleEdge(0, 0, R * 0.2)]] : [];
      items.push({ name: "P" + k, part: finishPart({ outer: polyEdges(pts), holes, marks: [] }, 0.05), qty: 1 + Math.floor(r() * 6) });
    }
    const gap = r() * 8;
    const job = runJob(items, { sheetW: 800, sheetH: 400, gap, margin: r() * 10, res: 1 + r() * 3, tol: 0.05, rotations: [0, 45, 90, 135, 180, 225, 270, 315] });
    assert.ok(job.check.ok, job.check.problems.join("\n"));
    if (job.check.minGap < Infinity) assert.ok(job.check.minGap >= gap);
  }
});

test("the worked example nests on one 2500 x 1250 sheet and passes the check", () => {
  const job = runJob(exampleParts(), { sheetW: 2500, sheetH: 1250, gap: 5, margin: 10 });
  assert.equal(job.result.res, 2);
  assert.equal(job.report.totalParts, 72);
  assert.equal(job.report.totalSheets, 1);
  assert.ok(job.check.ok, job.check.problems.join("\n"));
  // pierces: 12 flanges x 6, 16 gussets x 2, 10 brackets x 3, 30 washers x 2, 4 plates x 3
  assert.equal(job.report.pierces, 72 + 32 + 30 + 60 + 12);
});

test("a nested sheet written as DXF reads back as the same parts and area", () => {
  const job = runJob(exampleParts(), { sheetW: 2500, sheetH: 1250, gap: 5, margin: 10, res: 5 });
  const back = partsFromDxf(sheetDxf(job, 0, 4), "sheet", { skipLayers: "^SHEET$" });
  assert.equal(back.units, "mm");
  assert.equal(back.parts.length, job.report.sheets[0].parts);
  const area = back.parts.reduce((s, p) => s + p.part.area, 0);
  assert.ok(Math.abs(area - job.report.sheets[0].partArea) < 1e-3 * area);
});

test("the CSV report neutralises formula-like cells", () => {
  const job = runJob([{ name: "=HYPERLINK(1)", part: rect(10, 10), qty: 1 }], { sheetW: 100, sheetH: 100, res: 1, tol: 0 });
  const csv = reportCsv(job, "mm");
  assert.match(csv, /'?1x =HYPERLINK/);
  assert.doesNotMatch(csv.split("\n")[1], /,=HYP/);
});

test("autoRes picks round cells near 1,250 on the long side", () => {
  assert.equal(autoRes(2500, 1250), 2);
  assert.equal(autoRes(96, 48), 0.1);
  assert.equal(autoRes(3000, 1500), 5);
});

test("bad inputs are refused with a reason", () => {
  assert.equal(nest([], { sheetW: 0, sheetH: 10 }).ok, false);
  assert.equal(nest([], { sheetW: 10, sheetH: 10, gap: -1 }).ok, false);
  assert.equal(runJob([{ name: "x", part: rect(1, 1), qty: 0 }], { sheetW: 10, sheetH: 10 }).ok, false);
  assert.ok(partRings(rect(1, 1), 0.01).length === 1);
});

test("the order search repeats, never ends worse than no search, and still passes the check", () => {
  const r = rng(7);
  const items = [];
  for (let k = 0; k < 5; k++) {
    const n = 4 + Math.floor(r() * 5), pts = [];
    const R = 30 + r() * 60;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rad = R * (0.4 + 0.6 * r());
      pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
    }
    items.push({ name: "P" + k, part: finishPart({ outer: polyEdges(pts), holes: [], marks: [] }, 0.05), qty: 3 + Math.floor(r() * 5) });
  }
  // a long strip: one sheet, so the score is its used length
  const opts = { sheetW: 3000, sheetH: 300, gap: 2, res: 2, tol: 0.05, maxSheets: 1 };
  const base = runJob(items, { ...opts, searchIters: 0 });
  const a = runJob(items, { ...opts, searchIters: 40 });
  const b = runJob(items, { ...opts, searchIters: 40 });
  assert.equal(a.result.searched, 40);
  assert.ok(a.check.ok, a.check.problems.join("\n"));
  assert.deepEqual(a.result.sheets, b.result.sheets);
  assert.equal(a.result.sheets.length, 1);
  assert.ok(a.result.sheets[0].usedLength <= base.result.sheets[0].usedLength);
});

test("compaction keeps the gap, repeats, never lengthens the last sheet, and shortens random jobs", () => {
  const r = rng(2026);
  let shorter = 0;
  for (let t = 0; t < 6; t++) {
    const items = [];
    for (let k = 0; k < 4; k++) {
      const n = 3 + Math.floor(r() * 7), pts = [];
      const R = 20 + r() * 60;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, rad = R * (0.4 + 0.6 * r());
        pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
      }
      const holes = r() < 0.5 ? [[circleEdge(0, 0, R * 0.2)]] : [];
      items.push({ name: "P" + k, part: finishPart({ outer: polyEdges(pts), holes, marks: [] }, 0.05), qty: 2 + Math.floor(r() * 5) });
    }
    const gap = r() * 6;
    const opts = { sheetW: 1500, sheetH: 300, gap, margin: r() * 8, res: 2, tol: 0.05, rotations: [0, 90, 180, 270], timeLimitMs: 60000 };
    const plain = runJob(items, opts);
    const a = runJob(items, { ...opts, compactMoves: 800 });
    const b = runJob(items, { ...opts, compactMoves: 800 });
    assert.ok(a.check.ok, a.check.problems.join("\n"));
    if (a.check.minGap < Infinity) assert.ok(a.check.minGap >= gap);
    assert.equal(a.report.totalParts, plain.report.totalParts);
    const last = (j) => j.result.sheets[j.result.sheets.length - 1].usedLength;
    assert.ok(last(a) <= last(plain), `compaction lengthened job ${t}: ${last(a)} > ${last(plain)}`);
    assert.deepEqual(a.result.sheets, b.result.sheets, "same job, same nest");
    if (last(a) < last(plain)) shorter++;
  }
  assert.ok(shorter >= 3, `only ${shorter} of 6 random jobs got shorter`);
});
