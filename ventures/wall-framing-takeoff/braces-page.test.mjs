import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { braceReport, braceText } from "./braces.mjs";
import { layoutFasteners } from "./fasteners.mjs";

test("a 20 ft and a 3 ft wall at 8 ft: 1 brace of 135.8 in, the short wall none", () => {
  const r = braceReport({ walls: [240, 36], height: 96, pricePerBrace: 12 });
  assert.ok(r.ok);
  assert.deepEqual(r.rows.map((x) => x.count), [1, 0]);
  assert.equal(r.braceInches, 135.76); // 96 / sin 45
  assert.equal(r.count, 1);
  assert.equal(r.cost, 12);
  assert.equal(r.runInches, 96);
});
test("spacing 120 on a 40 ft wall is 4 braces; 300 in exactly is 1", () => {
  assert.equal(braceReport({ walls: [480], height: 96, spacing: 120 }).count, 4);
  assert.equal(braceReport({ walls: [300], height: 96 }).count, 1);
  assert.equal(braceReport({ walls: [301], height: 96 }).count, 2);
});
test("flags a wall shorter than the braces' run", () => {
  const r = braceReport({ walls: [60], height: 96, spacing: 24 });
  assert.equal(r.rows[0].count, 3);
  assert.equal(r.rows[0].fits, false);
  assert.match(braceText(r).join("\n"), /shorter than/);
});
test("agrees with the takeoff engine's fasteners.wallBracing", () => {
  const res = { walls: [{ id: "A", length: 480, height: 97.125, members: [] }, { id: "B", length: 100, height: 97.125, members: [] }] };
  const f = layoutFasteners({ wallBracing: { angle: 50, spacing: 200 } }, {}, res).wallBracing;
  const r = braceReport({ walls: [480, 100], height: 97.125, angle: 50, spacing: 200 });
  assert.equal(r.count, f.count);
  assert.ok(Math.abs(r.feet - f.feet) < 0.01);
});
test("refuses bad input", () => {
  for (const o of [null, { walls: [], height: 96 }, { walls: [5], height: 96 }, { walls: [100], height: 10 }, { walls: [100], height: 96, angle: 10 }, { walls: [100], height: 96, spacing: 1 }, { walls: [100], height: 96, pricePerBrace: -1 }]) {
    assert.equal(braceReport(o).ok, false);
  }
});
test("page, sitemap and llms.txt carry it", () => {
  const p = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  assert.match(p("brace-calculator.html"), /braceReport/);
  assert.match(p("brace-calculator.html"), /No warranty/);
  assert.match(p("sitemap.xml"), /brace-calculator\.html/);
  assert.match(p("llms.txt"), /brace-calculator\.html/);
});
