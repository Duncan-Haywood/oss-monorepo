import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_LINES, lineCost, bomCost, orderFor, breakEvenQuantity, orderCsv, parseLines } from "./bom.mjs";

test("line cost: 1.3 m +8% waste at 5.20 = 7.30 (hand worked: 1.404 x 5.2 = 7.3008)", () => {
  assert.ok(Math.abs(lineCost(EXAMPLE_LINES[0]) - 7.3008) < 1e-9);
});
test("bom total and groups", () => {
  const b = bomCost(EXAMPLE_LINES);
  // fabric 7.3008; rib 0.126x4=0.504; thread 176x0.0004=0.0704; label .0927; care .0412; bag .0612
  assert.equal(b.groups.fabric, 7.3);
  assert.equal(b.groups.packaging, 0.06);
  assert.equal(b.total, 8.07);
});
test("order for 100 garments respects moq and packs", () => {
  const o = orderFor(EXAMPLE_LINES, 100);
  const fabric = o.rows[0], label = o.rows[3], bag = o.rows[5];
  assert.ok(Math.abs(fabric.need - 140.4) < 1e-9);
  assert.equal(fabric.order, 140.4); // above 100 m moq
  assert.equal(label.order, 500); // 103 needed, moq 500
  assert.match(label.note, /minimum order 500/);
  assert.equal(bag.order, 200); // 102 needed, packs of 100
  assert.ok(o.effectivePerGarment > o.needTotal / 100);
});
test("breakEvenQuantity: labels need 500/1.03 = 486", () => {
  assert.equal(breakEvenQuantity(EXAMPLE_LINES), 486);
});
test("bad input throws", () => {
  assert.throws(() => orderFor(EXAMPLE_LINES, 0));
  assert.throws(() => lineCost({ name: "x", unit: "m", perGarment: -1, wastePct: 0, unitCost: 1, packSize: 1, moq: 0 }));
});
test("csv neutralises formulas", () => {
  const o = orderFor([{ name: "=HYPERLINK(1)", unit: "pcs", perGarment: 1, wastePct: 0, unitCost: 1, packSize: 1, moq: 0 }], 2);
  assert.match(orderCsv(o), /^Item.*\n'=HYPERLINK\(1\)/);
});
test("parseLines skips header, reports bad rows", () => {
  const r = parseLines("name,unit,perGarment,wastePct,unitCost,packSize,moq\nZip,pcs,1,0,0.5,10,100\nbad,pcs\nX,pcs,1,200,1");
  assert.equal(r.lines.length, 1);
  assert.equal(r.errors.length, 2);
});
