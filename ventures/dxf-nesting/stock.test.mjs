// Stock lists: mixed sheet sizes used in order, and irregular remnants
// (offcuts with cut-outs) read from DXF and nested into first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nest, verify, stockBlocked, placedEdges } from "./nest.mjs";
import { finishPart, rectEdges, circleEdge, polyEdges, flattenLoop, pointInRing } from "./geom.mjs";
import { writeDxf } from "./dxf.mjs";
import { runJob, remnantsFromDxf, parseStock, exampleParts, exampleRemnantDxf, reportCsv, sheetSvg, sheetDxf, partsFromDxf } from "./job.mjs";

const rect = (w, h) => finishPart({ outer: rectEdges(0, 0, w, h), holes: [], marks: [] }, 0.01);
const disc = (r) => finishPart({ outer: [circleEdge(r, r, r)], holes: [], marks: [] }, 0.01);

function rng(seed) {
  let s = seed;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}

function inMat(x, y, rings) {
  if (!pointInRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(x, y, rings[i])) return false;
  return true;
}
function distToRings(x, y, rings) {
  let d = Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length];
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
  }
  return d;
}

test("parseStock reads lengths, widths, quantities and names; refuses junk", () => {
  const r = parseStock("1200 x 800 x 2 offcut rack A\n# full sheets\n2500x1250\n");
  assert.equal(r.ok, true);
  assert.deepEqual(r.stock[0], { w: 1200, h: 800, qty: 2, name: "offcut rack A" });
  assert.equal(r.stock[1].qty, Infinity);
  assert.equal(parseStock("12 by 8").ok, false);
});

test("a remnant's free cells all lie at least margin + tol inside its outline (random outlines)", () => {
  const r = rng(11);
  for (let t = 0; t < 30; t++) {
    const n = 5 + Math.floor(r() * 10), ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rad = 200 + r() * 300;
      ring.push([500 + rad * Math.cos(a), 500 + rad * Math.sin(a)]);
    }
    const hole = [[450, 450], [550, 450], [550, 520], [450, 520]];
    const outline = [ring, hole];
    const res = 2 + r() * 8, margin = r() * 30, tol = 0.01;
    const st = { w: 1000, h: 1000, outline, GW: Math.floor(1000 / res), GH: Math.floor(1000 / res) };
    const b = stockBlocked(st, res, margin, tol);
    let free = 0;
    for (let j = 0; j < st.GH; j++) for (let i = 0; i < st.GW; i++) {
      if (b[j * st.GW + i]) continue;
      free++;
      for (const [x, y] of [[i * res, j * res], [(i + 1) * res, j * res], [i * res, (j + 1) * res], [(i + 1) * res, (j + 1) * res], [(i + 0.5) * res, (j + 0.5) * res]]) {
        assert.ok(inMat(x, y, outline), `outline ${t}: free cell (${i}, ${j}) corner outside`);
        assert.ok(distToRings(x, y, outline) >= margin + tol - 1e-9, `outline ${t}: free cell (${i}, ${j}) within margin`);
      }
    }
    assert.ok(free > 0, `outline ${t} has free cells`);
  }
});

test("a rectangular stock line blocks exactly what the old single-sheet nester did", () => {
  const items = exampleParts(0.01).map((x, i) => ({ ...x, id: i }));
  const a = nest(items, { sheetW: 2500, sheetH: 1250, gap: 5, margin: 10 });
  const b = nest(items, { stock: [{ w: 2500, h: 1250 }], gap: 5, margin: 10 });
  assert.deepEqual(a.sheets.map((s) => s.placements), b.sheets.map((s) => s.placements));
});

test("stock is used in the order listed: remnant, then the small sheet, then full sheets", () => {
  const items = [{ id: 0, name: "Plate 200x100", qty: 40, part: rect(200, 100) }];
  const stock = [
    { name: "rem", outline: [[[0, 0], [650, 0], [650, 230], [0, 230]]], qty: 1 }, // 3 x 2 = 6 plates with gap 10
    { w: 450, h: 450, qty: 1 }, // 2 x 4 = 8 with gap 10
    { w: 1000, h: 1000 },
  ];
  const res = nest(items, { stock, gap: 10, margin: 0, res: 1, rotations: [0] });
  assert.equal(res.ok, true);
  assert.equal(res.unplaced.length, 0);
  assert.deepEqual(res.sheets.map((s) => s.stock).slice(0, 2), [0, 1]);
  assert.ok(res.sheets.slice(2).every((s) => s.stock === 2));
  assert.equal(res.sheets[0].placements.length, 6);
  assert.equal(res.sheets[1].placements.length, 8);
  const parts = new Map([[0, items[0].part]]);
  assert.equal(verify(res, parts).ok, true);
});

test("finite stock runs out: the rest are reported, not dropped", () => {
  const items = [{ id: 0, name: "Plate", qty: 10, part: rect(200, 100) }];
  const res = nest(items, { stock: [{ w: 450, h: 230, qty: 1 }], gap: 10, res: 1, rotations: [0] });
  const placed = res.sheets.reduce((s, x) => s + x.placements.length, 0);
  assert.equal(placed, 4);
  assert.equal(res.unplaced[0].count, 6);
  assert.match(res.unplaced[0].reason, /stock listed/);
});

test("parts stay out of a remnant's cut-out and notch, and keep the margin (random jobs)", () => {
  const r = rng(5);
  for (let t = 0; t < 6; t++) {
    // an L-shaped offcut with a round cut-out
    const L = [[0, 0], [1200, 0], [1200, 500], [600, 500], [600, 900], [0, 900]];
    const hole = flattenLoop([circleEdge(300, 300, 120)], 0.01);
    const outline = [L, hole];
    const margin = 5 + r() * 15, gap = 2 + r() * 8;
    const items = [
      { id: 0, name: "disc", qty: 6 + Math.floor(r() * 10), part: disc(30 + r() * 50) },
      { id: 1, name: "plate", qty: 4 + Math.floor(r() * 8), part: rect(80 + r() * 200, 40 + r() * 100) },
      { id: 2, name: "tri", qty: 5, part: finishPart({ outer: polyEdges([[0, 0], [150, 0], [0, 120]]), holes: [], marks: [] }, 0.01) },
    ];
    const res = nest(items, { stock: [{ outline, qty: 1 }, { w: 1000, h: 600 }], gap, margin, rotations: [0, 90, 180, 270] });
    assert.equal(res.ok, true);
    assert.equal(res.unplaced.length, 0);
    const parts = new Map(items.map((x) => [x.id, x.part]));
    const chk = verify(res, parts);
    assert.equal(chk.ok, true, chk.problems.join("\n"));
    assert.equal(res.sheets[0].stock, 0);
    // independent of verify: sample each placed part's vertices on the remnant
    for (const pl of res.sheets[0].placements) {
      const e = placedEdges(parts.get(pl.id), pl, 0.01);
      for (const [x, y] of flattenLoop(e.outer, 0.01)) {
        assert.ok(inMat(x, y, outline), `job ${t}: ${pl.name} point (${x}, ${y}) off the remnant`);
        assert.ok(distToRings(x, y, outline) >= margin - 1e-6, `job ${t}: ${pl.name} inside the margin`);
      }
    }
  }
});

test("verify catches a part placed over a remnant's cut-out", () => {
  const outline = [[[0, 0], [500, 0], [500, 500], [0, 500]], [[200, 200], [300, 200], [300, 300], [200, 300]]];
  const part = rect(50, 50);
  const result = {
    tol: 0.01, gap: 0, margin: 0, sheetW: 500, sheetH: 500,
    sheets: [{ w: 500, h: 500, outline, placements: [{ id: 0, name: "p", copy: 0, angle: 0, tx: 225, ty: 225 }] }],
  };
  const chk = verify(result, new Map([[0, part]]));
  assert.equal(chk.ok, false);
  const big = rect(200, 200); // covers the whole cut-out: no vertex in it
  result.sheets[0].placements[0].tx = 150;
  result.sheets[0].placements[0].ty = 150;
  assert.equal(verify(result, new Map([[0, big]])).ok, false);
});

test("remnants read from DXF: a notched offcut with a hole becomes one stock sheet", () => {
  const text = exampleRemnantDxf();
  const r = remnantsFromDxf(text, "offcut.dxf");
  assert.equal(r.ok, true);
  assert.equal(r.remnants.length, 1);
  assert.equal(r.remnants[0].outline.length, 2); // outline and the cut-out
  const job = runJob(exampleParts(0.01), { stock: [...r.remnants, { w: 2500, h: 1250 }], gap: 5, margin: 10 });
  assert.equal(job.ok, true);
  assert.equal(job.check.ok, true, job.check.problems.join("\n"));
  assert.equal(job.result.sheets[0].stock, 0);
  assert.ok(job.result.sheets[0].placements.length > 10);
  assert.equal(job.report.totalParts, 72);
  // the remnant's sheet area is its own, not its bounding box
  assert.ok(job.report.sheets[0].sheetArea < job.result.sheets[0].w * job.result.sheets[0].h);
  // outputs: the SHEET layer is the remnant outline, CSV names the stock
  const back = partsFromDxf(sheetDxf(job, 0), "s.dxf", { skipLayers: /^(CUT_OUTER|CUT_INNER|MARK)$/ });
  assert.equal(back.parts.length, 1);
  assert.ok(Math.abs(back.parts[0].part.area - job.report.sheets[0].sheetArea) < 1e-6 * job.report.sheets[0].sheetArea + 1);
  assert.match(reportCsv(job, "mm"), /^sheet,stock,sheet_area_mm2,/);
  assert.match(sheetSvg(job, 0), /fill-rule="evenodd" stroke="#7b8794"/);
});

test("the command line nests into a remnant file first", () => {
  const dir = mkdtempSync(join(tmpdir(), "nest-"));
  const rem = join(dir, "offcut.dxf"), part = join(dir, "plate.dxf");
  writeFileSync(rem, exampleRemnantDxf());
  writeFileSync(part, writeDxf([{ layer: "0", edges: rectEdges(0, 0, 150, 80) }], 4));
  const out = execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, `${part}:30`, "--remnant", rem, "--stock", "1000x500x1", "--sheet", "2500x1250", "--gap", "5", "--margin", "10"], { encoding: "utf8" });
  assert.match(out, /sheet 1 \[offcut/);
  assert.match(out, /Check: every gap/);
});
