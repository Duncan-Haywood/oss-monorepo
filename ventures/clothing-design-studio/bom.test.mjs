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

import { sheetExtras, saveBomExtras, loadBomExtras } from "./bom.mjs";
test("sheetExtras: trims 0.30 (rib .504+thread .0704+label .0927+care .0412 = .7083 -> 0.71), packaging 0.06", () => {
  const e = sheetExtras(EXAMPLE_LINES);
  assert.equal(e.packagingPerUnit, 0.06);
  assert.equal(e.trimsPerUnit, 0.71);
  assert.equal(e.fabricPerGarment, 7.3);
  assert.equal(e.total, 8.07);
});
test("bom extras round-trip through storage and reject junk", () => {
  const m = new Map(); const st = { setItem: (k, v) => m.set(k, v), getItem: k => m.get(k) ?? null };
  assert.equal(loadBomExtras(st), null);
  assert.ok(saveBomExtras({ trimsPerUnit: 0.71, packagingPerUnit: 0.06 }, st));
  assert.deepEqual(loadBomExtras(st), { trimsPerUnit: 0.71, packagingPerUnit: 0.06 });
  st.setItem("clothing-design-studio-bom", JSON.stringify({ trimsPerUnit: -1, packagingPerUnit: 0 }));
  assert.equal(loadBomExtras(st), null);
  st.setItem("clothing-design-studio-bom", "{not json");
  assert.equal(loadBomExtras(st), null);
});

import { saveRunQty, loadRunQty } from "./bom.mjs";
test("run quantity round-trips through storage and rejects junk", () => {
  const m = new Map(), st = { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v) };
  assert.equal(loadRunQty(st), null);
  assert.ok(saveRunQty(309, st));
  assert.equal(loadRunQty(st), 309);
  for (const bad of [0, -5, 2.5, NaN, 1e7, "9"]) assert.equal(saveRunQty(bad, st), false);
  assert.equal(loadRunQty(st), 309);
  m.set("cds.runQty", "abc"); assert.equal(loadRunQty(st), null);
  assert.equal(loadRunQty({ getItem() { throw new Error("blocked"); } }), null);
});
