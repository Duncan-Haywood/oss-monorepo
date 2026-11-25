import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { removalRate, finishRate, cycleEstimate } from "./cycle.mjs";
import { readPart, stockOptions } from "./part-geometry.mjs";

// A 10 mm cube as a closed binary STL (12 triangles).
function cubeStl(s = 10) {
  const v = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  const buf = new ArrayBuffer(84 + f.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, f.length, true);
  f.forEach((t, i) => t.forEach((k, j) => v[k].forEach((x, a) => dv.setFloat32(84 + i * 50 + 12 + j * 12 + a * 4, x, true))));
  return new Uint8Array(buf);
}

test("rates are width x depth x feed and stepover x feed; blanks and negatives are 0", () => {
  assert.equal(removalRate({ width: 5, depth: 10, feed: 1000 }), 50000);
  assert.equal(removalRate({ width: 5, depth: "", feed: 1000 }), 0);
  assert.equal(removalRate({ width: -5, depth: 10, feed: 1000 }), 0);
  assert.equal(finishRate({ stepover: 0.5, feed: 2000 }), 1000);
});

test("a 10 mm cube from 12 mm stock: hand-checked minutes", () => {
  const r = readPart(cubeStl(), "cube.stl");
  assert.ok(Math.abs(r.volume - 1000) < 1e-6);
  assert.ok(Math.abs(r.area - 600) < 1e-6);
  const stock = 12 * 12 * 12; // 1728 mm3, so 728 mm3 of chips
  const e = cycleEstimate(r, stock, { rough: { width: 2, depth: 4, feed: 91 }, finish: { stepover: 0.5, feed: 120 }, allowancePct: 25, loadMinutes: 1.5 });
  assert.ok(Math.abs(e.removed - 728) < 1e-6);
  assert.ok(Math.abs(e.roughMinutes - 1) < 1e-9); // 728 / (2*4*91)
  assert.ok(Math.abs(e.finishMinutes - 10) < 1e-9); // 600 / 60
  assert.ok(Math.abs(e.cycleMinutes - (11 * 1.25 + 1.5)) < 1e-9);
  assert.deepEqual(e.missing, []);
});

test("nothing is guessed: no rates, no minutes, and the page says what is missing", () => {
  const r = readPart(cubeStl(), "cube.stl");
  const e = cycleEstimate(r, 1728, {});
  assert.equal(e.cycleMinutes, null);
  assert.equal(e.roughMinutes, null);
  assert.equal(e.missing.length, 2);
});

test("a STEP reading (no volume) gives no cycle time", () => {
  const step = readFileSync(new URL("./fixtures/geometry/plate-holes-pocket.step", import.meta.url), "utf8");
  const r = readPart(new TextEncoder().encode(step), "plate.step");
  const e = cycleEstimate(r, 1e6, { rough: { width: 2, depth: 4, feed: 1000 }, finish: { stepover: 0.5, feed: 1000 } });
  assert.equal(e.cycleMinutes, null);
  assert.match(e.missing[0], /closed STL/);
});

test("an open mesh is refused, and stock smaller than the part removes nothing", () => {
  const e = cycleEstimate({ volume: 1000, area: 600, closed: false }, 2000, { rough: { width: 1, depth: 1, feed: 1 }, finish: { stepover: 1, feed: 1 } });
  assert.equal(e.cycleMinutes, null);
  const g = cycleEstimate({ volume: 1000, area: 600, closed: true }, 500, { rough: { width: 1, depth: 1, feed: 1 }, finish: { stepover: 1, feed: 60 } });
  assert.equal(g.removed, 0);
  assert.equal(g.roughMinutes, 0);
  assert.equal(g.cycleMinutes, 10);
});

test("fixture STL: removed volume matches the kernel's part volume and the stock the page sizes", () => {
  const truth = JSON.parse(readFileSync(new URL("./fixtures/geometry/truth.json", import.meta.url), "utf8"));
  const bytes = readFileSync(new URL("./fixtures/geometry/scallop-concave-arc.stl", import.meta.url));
  const r = readPart(new Uint8Array(bytes), "scallop-concave-arc.stl");
  const t = truth["scallop-concave-arc"];
  assert.ok(Math.abs(r.volume - t.volume) / t.volume < 0.01, `${r.volume} vs ${t.volume}`);
  const opt = stockOptions(r, {})[0];
  const e = cycleEstimate(r, opt.volume, { rough: { width: 1, depth: 1, feed: 1 }, finish: { stepover: 1, feed: 1 } });
  assert.ok(Math.abs(e.removed - (opt.volume - r.volume)) < 1e-6);
  assert.ok(e.finishMinutes > 0 && Math.abs(e.finishMinutes - r.area) < 1e-6);
});
