import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutPaver, validatePaver, paverText } from "./paver.mjs";

const flat = { areas: [{ width: 10, length: 10 }], paver: { length: 12, width: 12, joint: 0, thickness: 2.375, baseDepth: 4, sandDepth: 1, baseOverhang: 0, compaction: 1, waste: 0.1 } };

test("10 x 10 ft of 12 in pavers, hand count", () => {
  const p = layoutPaver(flat);
  assert.equal(p.ok, true);
  assert.equal(p.netSqFt, 100);
  assert.equal(p.pavers, 110); // 100 + 10% waste
  assert.ok(Math.abs(p.baseCuYd - 100 * (4 / 12) / 27) < 1e-9); // 1.2346
  assert.ok(Math.abs(p.sandCuYd - 100 / 12 / 27) < 1e-9); // 0.3086
  assert.ok(Math.abs(p.excavationCuYd - 100 * (7.375 / 12) / 27) < 1e-9);
  assert.equal(p.jointSandBags, 0); // no joint, no sand
  assert.equal(p.edgeFeet, 40); assert.equal(p.edgePieces, 4); assert.equal(p.spikes, 40);
});
test("a joint adds to the unit and fills with sand", () => {
  const p = layoutPaver({ ...flat, paver: { ...flat.paver, joint: 0.5, waste: 0 } });
  // unit 12.5 x 12.5 = 156.25 in2 -> 14400/156.25 = 92.16 -> 93
  assert.equal(p.pavers, 93);
  // gap fraction 1 - 144/156.25 = 0.0784; 100 ft2 x 2.375/12 ft x 0.0784 = 1.5514 cu ft x 100 lb
  assert.ok(Math.abs(p.jointSandLb - 100 * 2.375 / 12 * 0.0784 * 100) < 0.05);
  assert.equal(p.jointSandBags, 4);
});
test("overhang and compaction widen the base; a subtracted planter removes paving", () => {
  const p = layoutPaver({ areas: [{ width: 10, length: 10 }, { width: 2, length: 2, subtract: true }], paver: { ...flat.paver, baseOverhang: 6, compaction: 1.25 } });
  assert.equal(p.netSqFt, 96);
  const spread = 11 * 11 - 4; // 117
  assert.ok(Math.abs(p.baseCuYd - spread * (4 / 12) / 27 * 1.25) < 1e-9);
  assert.equal(p.edgeFeet, 40); // the planter's edge is not added
  assert.ok(p.notes.some((n) => /subtracted/.test(n)));
});
test("edgeFeet overrides the perimeter; prices give a cost", () => {
  const p = layoutPaver({ ...flat, edgeFeet: 20, paver: { ...flat.paver, paverPrice: 2, edgePrice: 10 } });
  assert.equal(p.edgePieces, 2);
  assert.equal(p.cost, 110 * 2 + 2 * 10);
  assert.equal(layoutPaver(flat).cost, null);
});
test("refusals and text", () => {
  for (const bad of [null, {}, { areas: [] }, { areas: [{ width: 0, length: 5 }] }, { areas: [{ width: 5, length: 5, subtract: true }] }, { areas: [{ width: 5, length: 5 }], paver: { joint: 5 } }, { areas: [{ width: 5, length: 5 }], paver: { length: "abc" } }, { areas: [{ width: 5, length: 5 }], edgeFeet: -1 }])
    assert.ok(validatePaver(bad).length > 0, JSON.stringify(bad));
  const t = paverText(layoutPaver(flat)).join("\n");
  assert.match(t, /110 pavers/);
  assert.match(t, /not sized/);
  assert.ok(layoutPaver({ areas: [{ width: 5, length: 5 }], paver: { baseDepth: 2 } }).notes.some((n) => /thin/.test(n)));
});
