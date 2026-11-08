import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBulk, validateBulk, bulkText } from "./bulk.mjs";

test("hand count: 20 x 10 ft bed, 3 in mulch", () => {
  // 200 sq ft x 3/12 = 50 cu ft = 1.852 yd; x1.05 waste = 1.944 yd -> 2.0 yd; 50*1.05/0.5 = 105 bags
  const p = layoutBulk({ areas: [{ length: 20, width: 10 }], material: { name: "mulch" } });
  assert.equal(p.ok, true);
  assert.equal(p.cuFt, 50); assert.equal(p.netYards, 1.85); assert.equal(p.orderYards, 1.94);
  assert.equal(p.roundedYards, 2); assert.equal(p.bags, 105); assert.equal(p.tons, 0.78);
});
test("compaction and circles, typed tons", () => {
  // circle d=10: 78.54 sq ft x 4/12 = 26.18 cu ft; x1.2 x1.05 = 32.99 cu ft = 1.222 yd; x1.5 t = 1.83 t
  const p = layoutBulk({ areas: [{ diameter: 10, depth: 4 }], material: { compaction: 1.2, tonsPerYard: 1.5 } });
  assert.equal(p.sqFt, 78.54); assert.equal(p.orderYards, 1.22); assert.equal(p.tons, 1.83);
});
test("delivery minimum and cost", () => {
  const p = layoutBulk({ areas: [{ areaSqFt: 30, depth: 2 }], material: { minYards: 3, pricePerYard: 40 } });
  assert.equal(p.roundedYards, 3); assert.equal(p.cost, 120);
  assert.ok(p.notes.some((n) => /minimum/.test(n)));
});
test("refusals", () => {
  assert.ok(validateBulk({ areas: [] }).length);
  assert.ok(validateBulk({ areas: [{ length: 5, width: 5 }] }).length); // no depth, no preset
  assert.ok(validateBulk({ areas: [{ length: 5, width: 5, diameter: 3, depth: 2 }] }).length);
  assert.ok(validateBulk({ areas: [{ length: -5, width: 5, depth: 2 }] }).length);
  assert.ok(validateBulk({ areas: [{ length: 5, width: 5, depth: 300 }] }).length);
  assert.ok(validateBulk({ areas: [{ length: 5, width: 5, depth: 2 }], material: { name: "gold" } }).length);
  assert.ok(validateBulk({ areas: [{ length: 5, width: 5, depth: 2 }], material: { compaction: 0.5 } }).length);
  assert.equal(layoutBulk(null).ok, false);
});
test("text lists the totals", () => {
  const t = bulkText(layoutBulk({ areas: [{ name: "front bed", length: 12, width: 6, depth: 3 }], material: { pricePerYard: 35 } })).join("\n");
  assert.ok(t.includes("front bed") && t.includes("Order:") && t.includes("Bulk cost"));
});

test("material names inherited from Object.prototype are refused, not read as presets", async () => {
  const { layoutBulk } = await import("./bulk.mjs");
  for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    const r = layoutBulk({ material: { name }, areas: [{ length: 10, width: 10 }] });
    assert.equal(r.ok, false, name);
    assert.match(r.errors.join(" "), /material\.name is one of/);
  }
  assert.equal(layoutBulk({ material: { name: "mulch" }, areas: [{ length: 10, width: 10 }] }).ok, true);
});
