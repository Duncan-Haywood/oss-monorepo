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

import { controlJoints, jointText } from "./slab.mjs";

test("controlJoints: 24 x 24 ft, 4 in slab: spacing 10 ft, 2 cuts each way, 9 panels, 96 ft of saw cut, 1 in deep", () => {
  const r = controlJoints({ length: 288, width: 288, depth: 4 });
  assert.ok(r.ok);
  assert.equal(r.spacing, 120);
  assert.equal(r.cutsAlongLength, 2); // 288/120 = 2.4 -> 3 panels, 2 cuts
  assert.equal(r.panels, 9);
  assert.equal(r.panelLength, 96);
  assert.equal(r.sawCutFeet, (2 * 288 + 2 * 288) / 12);
  assert.equal(r.cutDepth, 1);
});

test("controlJoints: a slab inside the spacing needs no joint; spacing never passes 15 ft; bad input is refused", () => {
  const small = controlJoints({ length: 100, width: 100, depth: 4 });
  assert.ok(small.ok); assert.equal(small.panels, 1); assert.equal(small.sawCutFeet, 0);
  assert.equal(controlJoints({ length: 600, width: 300, depth: 8 }).spacing, 180);
  assert.equal(controlJoints({ length: 288, width: 288, depth: "4" }).ok, false);
  assert.equal(controlJoints({ length: 288, width: 288, depth: 1 }).ok, false);
  assert.equal(controlJoints(null).ok, false);
});

test("controlJoints: a long thin slab inside the spacing still gets a cut across its length", () => {
  const r = controlJoints({ length: 117, width: 60, depth: 4 }); // 117/120 -> 1 panel, 60/120 -> 1: aspect 1.95
  assert.ok(r.ok);
  assert.equal(r.cutsAlongLength, 1); assert.equal(r.cutsAlongWidth, 0); // 2 panels of 58.5 x 60 in
  assert.equal(r.aspect.toFixed(3), (60 / 58.5).toFixed(3));
  assert.equal(r.sawCutFeet, 5);
  assert.ok(r.notes.some((n) => /1 extra cut beyond the spacing keeps/.test(n)));
});

test("controlJoints: a length past 400 ft is refused like a width past 400 ft", () => {
  assert.equal(controlJoints({ length: 4800, width: 288, depth: 4 }).ok, true);
  assert.equal(controlJoints({ length: 4801, width: 288, depth: 4 }).ok, false);
  assert.equal(controlJoints({ length: 288, width: 4801, depth: 4 }).ok, false);
});

test("controlJoints: square panels are 1 : 1 and need no extra cut", () => {
  const r = controlJoints({ length: 288, width: 288, depth: 4 });
  assert.ok(r.ok); assert.equal(r.aspect, 1);
  assert.ok(!r.notes.some((n) => /extra cut/.test(n)));
  assert.match(jointText(r)[0], /9 panels of 96 x 96 in, 1\.00 : 1/);
  const edge = controlJoints({ length: 120, width: 80, depth: 4 }); // exactly 1.5 : 1 is inside the limit: no cut
  assert.ok(edge.ok); assert.equal(edge.aspect, 1.5); assert.equal(edge.panels, 1); assert.equal(edge.sawCutFeet, 0);
});

test("controlJoints: the layout itself keeps panels inside 1.5 : 1, adding cuts on the long side (30 x 10.8 ft, 4 in)", () => {
  // spacing 120 in: 360/120 -> 3 panels, 130/120 -> 2 panels of 65 in, 120/65 = 1.85 : 1.
  // One more cut across the length: 4 panels of 90 x 65 in, 1.38 : 1.
  const r = controlJoints({ length: 360, width: 130, depth: 4 });
  assert.ok(r.ok);
  assert.equal(r.cutsAlongLength, 3); assert.equal(r.cutsAlongWidth, 1);
  assert.equal(r.panelLength, 90); assert.equal(r.panelWidth, 65); assert.equal(r.panels, 8);
  assert.equal(r.sawCutFeet, (3 * 130 + 1 * 360) / 12);
  assert.ok(r.notes.some((n) => /extra cut/.test(n)), r.notes.join(" | "));
});

test("controlJoints property: every accepted slab gets panels within the spacing and within 1.5 : 1", () => {
  for (const L of [12, 40, 60, 96, 117, 130, 250, 360, 1000, 4800]) for (const W of [12, 30, 48, 60, 130, 288, 4800]) for (const D of [2, 4, 6, 10, 24]) {
    const r = controlJoints({ length: L, width: W, depth: D });
    assert.ok(r.ok, `${L}x${W}x${D}`);
    if (!r.ok) continue;
    assert.ok(r.panelLength <= r.spacing + 1e-9 && r.panelWidth <= r.spacing + 1e-9, `${L}x${W}x${D} spacing`);
    const a = Math.max(r.panelLength, r.panelWidth) / Math.min(r.panelLength, r.panelWidth);
    assert.ok(a <= 1.5 + 1e-9, `${L}x${W}x${D}: aspect ${a.toFixed(2)}`);
    assert.equal(r.panels, (r.cutsAlongLength + 1) * (r.cutsAlongWidth + 1));
  }
});
