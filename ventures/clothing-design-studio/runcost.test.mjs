import test from "node:test";
import assert from "node:assert/strict";
import { runCost, fabricFactors } from "./runcost.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";
import { newDesign } from "./design.mjs";
import { unitCost } from "./costing.mjs";
import { sizeRun } from "./fit.mjs";

const design = newDesign({ quantity: 200 });

test("fabric factor is 1 at M and grows with size", () => {
  const f = fabricFactors("tee");
  assert.equal(f.M, 1);
  assert.ok(f.XS < f.S && f.S < f.M && f.M < f.L && f.L < f.XL && f.XL < f.XXL);
});

test("an all-M run costs exactly what costing.mjs says", () => {
  const r = runCost(design, EXAMPLE_SUPPLIER, { M: 200 });
  assert.ok(r.ok);
  assert.equal(r.blendedLanded, unitCost(design, EXAMPLE_SUPPLIER).landed);
  assert.equal(r.differenceVsFlat, 0);
});

test("a mixed run: totals add up and fabric to buy follows the sizes", () => {
  const sizes = sizeRun(200, { meanChest: 100, sdChest: 9 }).sizes;
  const r = runCost(design, EXAMPLE_SUPPLIER, sizes);
  assert.ok(r.ok);
  assert.equal(r.pieces, 200);
  assert.ok(Math.abs(r.rows.reduce((a, x) => a + x.total, 0) - r.runTotal) < 0.05);
  const xs = r.rows.find(x => x.size === "XS"), xxl = r.rows.find(x => x.size === "XXL");
  assert.ok(xs.metres < xxl.metres);
  assert.ok(xxl.landed > xs.landed);
  const expectMetres = r.rows.reduce((a, x) => a + x.metres * x.pieces, 0);
  assert.ok(Math.abs(r.fabricMetresToBuy - expectMetres) < 0.01);
});

test("duty applies to the fabric difference and a surcharge", () => {
  const sheet = { ...EXAMPLE_SUPPLIER, dutyPct: 10 };
  const a = runCost(design, sheet, { XXL: 100, M: 100 });
  const b = runCost(design, sheet, { XXL: 100, M: 100 }, { surcharge: { XXL: 1 } });
  const xa = a.rows.find(x => x.size === "XXL").landed, xb = b.rows.find(x => x.size === "XXL").landed;
  assert.ok(Math.abs(xb - xa - 1.1) < 0.011);
});

test("refuses: empty run, unpriced fabric, size missing from chart", () => {
  assert.equal(runCost(design, EXAMPLE_SUPPLIER, {}).ok, false);
  assert.equal(runCost({ ...design, fabric: "nope" }, EXAMPLE_SUPPLIER, { M: 10 }).ok, false);
  const r = runCost(design, EXAMPLE_SUPPLIER, { XL: 10 }, { sizeChart: { S: 92, M: 100 } });
  assert.equal(r.ok, false);
  assert.match(r.error, /XL/);
});

test("small sizes and low totals are flagged", () => {
  const r = runCost(design, EXAMPLE_SUPPLIER, { XS: 3, M: 20 });
  assert.ok(r.notes.some(n => /XS under 10/.test(n)));
  assert.ok(r.notes.some(n => /minimum order/.test(n)));
});
