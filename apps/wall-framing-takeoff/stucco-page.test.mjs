import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutStucco } from "./stucco.mjs";

const p = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
// The page's default house: 40 x 30 ft, 8 ft walls, a door and two windows on wall A.
const ops = [{ kind: "door", offset: 60, width: 36, height: 80 }, { kind: "window", offset: 200, width: 36, height: 48, headerHeight: 80 }, { kind: "window", offset: 300, width: 36, height: 48, headerHeight: 80 }];
const wall = (id, length, openings = []) => ({ id, length, openings, sheathed: true });
const plan = { studLength: 91.5, defaultHeaderHeight: 80, walls: [wall("A", 480, ops), wall("B", 360), wall("C", 480), wall("D", 360)] };

test("the FAQ figures are what the engine returns for the page's default house", () => {
  const s = layoutStucco({ height: 96 }, plan);
  assert.equal(Math.round(s.netSqFt), 1076);       // 4 x ... 1120 sq ft less 44 sq ft of openings, by hand
  assert.equal(s.plaster.volumeCuFt.toFixed(1), "78.5");
  assert.equal(s.plaster.bags, 151);
  assert.equal(s.lath.sheets, 73);
  assert.equal(s.lath.fasteners, 1953);
  assert.equal(s.barrier.rolls, 2);
  assert.deepEqual([s.trim.screed.pieces, s.trim.casing.pieces, s.trim.corner.pieces, s.trim.joints.pieces], [16, 6, 5, 7]);
  const html = p("stucco-calculator.html");
  for (const n of ["1,076", "78.5", "151 bags", "73 sheets", "1,953"]) assert.ok(html.includes(n), n);
});
test("the one-coat option (1/2 in) needs fewer bags than 7/8 in", () => {
  const one = layoutStucco({ height: 96, scratch: 0.25, brown: 0, finish: 0.25 }, plan);
  assert.ok(one.ok && one.plaster.bags < 151);
  assert.ok(Math.abs(one.plaster.thickness - 0.5) < 1e-9);
});
test("page, sitemap and llms.txt carry it", () => {
  const html = p("stucco-calculator.html");
  assert.match(html, /layoutStucco/);
  assert.match(html, /No warranty/);
  assert.match(p("sitemap.xml"), /stucco-calculator\.html/);
  assert.match(p("llms.txt"), /stucco-calculator\.html/);
});
