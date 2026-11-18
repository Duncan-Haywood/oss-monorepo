import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recommendSize, sizeRun, garmentMeasurements, fitGap, BODY_CHEST_CM } from "./fit.mjs";

test("a body at a size's chest gets that size in a regular tee", () => {
  for (const [s, c] of Object.entries(BODY_CHEST_CM)) {
    const r = recommendSize({ chest: c });
    assert.equal(r.size, s);
    assert.equal(r.ease, 12);
  }
});

test("garment chest is body plus ease, flat width is half", () => {
  const g = garmentMeasurements("hoodie", "relaxed");
  assert.equal(g.M.chest, 100 + 18 + 8);
  assert.equal(g.M.flatWidth, 63);
  assert.equal(garmentMeasurements("tee", "regular").L.length, 73);
});

test("between sizes the nearer ease wins; ties go up", () => {
  assert.equal(recommendSize({ chest: 95 }).size, "S");
  assert.equal(recommendSize({ chest: 96 }).size, "M"); // exact tie between S and M goes up
  assert.equal(recommendSize({ chest: 97 }).size, "M");
});

test("wanting a looser look than the cut takes a bigger size", () => {
  const idx = r => ["XS", "S", "M", "L", "XL", "XXL"].indexOf(r.size);
  for (const chest of [88, 96, 104, 112]) {
    const slim = recommendSize({ chest }, { want: "slim" }), reg = recommendSize({ chest }), over = recommendSize({ chest }, { want: "oversized" });
    assert.ok(idx(slim) <= idx(reg) && idx(reg) <= idx(over), `chest ${chest}`);
    assert.ok(over.notes.some(n => /cut regular; for the oversized/.test(n)));
  }
  assert.equal(recommendSize({ chest: 100 }, { fit: "oversized", want: "oversized" }).size, "M");
});

test("bad input is refused with a reason, extremes get notes", () => {
  assert.equal(recommendSize({ chest: "abc" }).ok, false);
  assert.equal(recommendSize({ chest: 30 }).ok, false);
  const big = recommendSize({ chest: 140 });
  assert.equal(big.size, "XXL");
  assert.ok(big.notes.some(n => /extended sizes|no size fits/i.test(n)));
  const tall = recommendSize({ chest: 100, height: 200 });
  assert.ok(tall.notes.some(n => /short|longer/.test(n)));
  assert.ok(recommendSize({ chest: 100, waist: 110 }).notes.some(n => /Waist/.test(n)));
});

test("a custom factory chart replaces the typical one", () => {
  const r = recommendSize({ chest: 100 }, { sizeChart: { S: 96, M: 104, L: 112 } });
  assert.equal(r.rows.length, 3);
  assert.ok(["S", "M"].includes(r.size));
});

test("size run sums to the total, peaks at the mean, and respects a missing size", () => {
  const r = sizeRun(200, { meanChest: 100, sdChest: 9 });
  assert.equal(Object.values(r.sizes).reduce((a, b) => a + b, 0), 200);
  assert.ok(r.sizes.M >= r.sizes.S && r.sizes.M >= r.sizes.XL);
  const big = sizeRun(200, { meanChest: 116, sdChest: 8 });
  assert.ok(big.sizes.XL > r.sizes.XL && big.sizes.XS < r.sizes.XS + 1);
  const chart = sizeRun(100, { sizeChart: { S: 92, M: 100, L: 108 } });
  assert.equal(chart.sizes.XS + chart.sizes.XL + chart.sizes.XXL, 0);
  assert.equal(Object.values(chart.sizes).reduce((a, b) => a + b, 0), 100);
  assert.equal(sizeRun(50, { sdChest: 0 }).ok, false);
  assert.equal(Object.values(sizeRun(0).sizes).reduce((a, b) => a + b, 0), 0);
});

test("buyers who want it looser than the cut sell the bigger sizes", () => {
  assert.equal(fitGap("regular", "regular"), 0);
  assert.equal(fitGap("regular", "oversized"), 16);
  const same = sizeRun(300), loose = sizeRun(300, { extraEase: fitGap("regular", "oversized") });
  assert.ok(loose.sizes.XL + loose.sizes.XXL > same.sizes.XL + same.sizes.XXL);
});

test("the fit page loads the module and carries the disclaimer", () => {
  const html = readFileSync(new URL("./fit.html", import.meta.url), "utf8");
  assert.match(html, /from "\.\/fit\.mjs"/);
  assert.match(html, /<output id="results" aria-live="polite">/);
  assert.match(html, /typical/i);
});
