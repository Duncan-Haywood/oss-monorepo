import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, bestOrder, toCsv, EXAMPLE_FLOWERS, EXAMPLE_SHARED, MAX_FLOWERS } from "./calc.mjs";

test("bestOrder matches brute force over a grid of cases", () => {
  for (let need = 1; need <= 80; need += 3) {
    for (const [sa, pa, sb, pb] of [[10, 20, 25, 45], [5, 11, 20, 36], [10, 19, 40, 80], [7, 9, 12, 20]]) {
      let brute = Infinity;
      for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20; b++) if (a * sa + b * sb >= need) brute = Math.min(brute, a * pa + b * pb);
      const got = bestOrder(need, [{ size: sa, price: pa }, { size: sb, price: pb }]);
      assert.ok(got.stems >= need);
      assert.ok(Math.abs(got.cost - brute) < 1e-9, `need ${need} packs ${sa}/${sb}`);
    }
  }
});

test("single pack rounds up to whole packs", () => {
  const o = bestOrder(33, [{ size: 10, price: 24 }]);
  assert.deepEqual([o.a, o.stems, o.cost], [4, 40, 96]);
});

test("damage allowance raises the stems to cover and rounds up", () => {
  const a = analyze([{ name: "R", stems: "50", sizeA: "10", priceA: "20" }], { lossPct: "10", budget: "" });
  assert.equal(a.lines[0].stemsToCover, 55);
  assert.equal(a.lines[0].packA, 6);
  assert.equal(a.total, 120);
  assert.equal(a.lines[0].spare, 5);
});

test("a bigger pack is used when it is cheaper per stem", () => {
  const a = analyze([{ name: "R", stems: "100", sizeA: "10", priceA: "20", sizeB: "50", priceB: "80" }], { lossPct: "0", budget: "" });
  assert.equal(a.lines[0].packB, 2);
  assert.equal(a.lines[0].packA, 0);
  assert.equal(a.total, 160);
  assert.ok(a.saving > 0);
});

test("never worse than buying the small pack only, and example is sound", () => {
  const a = analyze(EXAMPLE_FLOWERS, EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.ok(a.total <= a.totalOnlyA + 1e-9);
  for (const l of a.lines) assert.ok(l.stemsOrdered >= l.stemsToCover);
  assert.ok(a.flowerCostPct > 0 && a.flowerCostPct < 1);
});

test("bad rows are reported, not guessed", () => {
  const a = analyze([{ name: "X", stems: "10", sizeA: "0", priceA: "5" }], { lossPct: "10", budget: "" });
  assert.equal(a.ok, false);
  assert.match(a.warnings[0], /pack size/);
  assert.equal(analyze([], { lossPct: "10", budget: "" }).ok, false);
  assert.equal(analyze([{ name: "X", stems: "10", sizeA: "5", priceA: "5", sizeB: "10" }], { lossPct: "0", budget: "" }).ok, false);
});

test("csv has a header, a row per flower and a total", () => {
  const lines = toCsv(analyze(EXAMPLE_FLOWERS, EXAMPLE_SHARED)).split("\n");
  assert.equal(lines.length, EXAMPLE_FLOWERS.length + 2);
  assert.ok(MAX_FLOWERS >= EXAMPLE_FLOWERS.length);
});
