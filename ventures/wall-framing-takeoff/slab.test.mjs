import test from "node:test";
import assert from "node:assert/strict";
import { slabConcrete, slabText } from "./slab.mjs";

test("12 x 12 ft slab, 4 in thick: 48 cu ft, 1.78 cu yd, 10% waste orders 2 yd, 88 bags of 80 lb", () => {
  const r = slabConcrete({ length: 144, width: 144, depth: 4 });
  assert.ok(r.ok);
  assert.equal(r.cuFt, 48);
  assert.equal(r.cuYd.toFixed(3), "1.778");
  assert.equal(r.orderYd, 2);
  assert.equal(r.bags, 88); // 52.8 cu ft / 0.6
  assert.equal(r.shortLoad, true);
});
test("footing strip 20 ft x 16 in x 8 in deep, and pier 12 in x 48 in deep x 6", () => {
  const f = slabConcrete({ shape: "footing", length: 240, width: 16, depth: 8, waste: 0 });
  assert.ok(f.ok); assert.equal(f.cuFt.toFixed(3), "17.778");
  const p = slabConcrete({ shape: "pier", diameter: 12, depth: 48, count: 6, waste: 0 });
  assert.ok(p.ok); assert.equal(p.cuFt.toFixed(3), (Math.PI * 36 * 48 * 6 / 1728).toFixed(3)); // 6 x 0.785 x 4 = 18.85
});
test("order rounds up to a quarter yard and never down", () => {
  assert.equal(slabConcrete({ length: 120, width: 120, depth: 4, waste: 0 }).orderYd, 1.25); // 1.235
  assert.equal(slabConcrete({ length: 108, width: 108, depth: 4, waste: 0 }).orderYd, 1); // exactly 1.0
});
test("bad input is refused with reasons, not NaN", () => {
  for (const bad of [{ length: 0, width: 10, depth: 4 }, { length: 144, width: 144, depth: 1 }, { length: 144, width: 144, depth: 4, bag: 50 }, { shape: "pier", depth: 12 }, { shape: "cone", length: 144, width: 144, depth: 4 }]) {
    const r = slabConcrete(/** @type {any} */ (bad));
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
  assert.match(slabText(slabConcrete({ length: 144, width: 144, depth: 4 })).join("\n"), /order 2\.00 cu yd/);
});
