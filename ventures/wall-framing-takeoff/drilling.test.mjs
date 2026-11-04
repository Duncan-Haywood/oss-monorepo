import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDrilling, validateDrilling, drillingText } from "./drilling.mjs";

const plan = { walls: [{ id: "A", stud: "2x4" }, { id: "B", stud: "2x6" }, { id: "P", stud: "2x4", bearing: false }] };
const run = (runs, extra = {}) => layoutDrilling({ runs, ...extra }, plan);

test("bearing 2x4: 40% of 3.5 in is 1.4 in; a 1.5 in hole is over, 1.4 is not", () => {
  const r = run([{ wall: "A", kind: "bore", size: 1.4 }, { wall: "A", kind: "bore", size: 1.5 }]);
  assert.equal(r.rows[0].ok, true);
  assert.equal(r.rows[0].maxSize, 1.4);
  assert.equal(r.rows[1].ok, false);
  assert.match(r.rows[1].fix, /2x6/);
  assert.equal(r.failing, 1);
});

test("non-bearing or doubled 2x4: 60% is 2.1 in, capped by 5/8 in edges (3.5 - 1.25 = 2.25)", () => {
  assert.equal(run([{ wall: "P", kind: "bore", size: 2.1 }]).rows[0].ok, true);
  assert.equal(run([{ wall: "A", kind: "bore", size: 2.1, doubled: true }]).rows[0].ok, true);
  assert.equal(run([{ wall: "P", kind: "bore", size: 2.2 }]).rows[0].ok, false);
  // a loosened 80% limit is stopped by the edge distance: 2x4 allows 2.25 in at most
  const r = run([{ wall: "P", kind: "bore", size: 2.3 }], { limits: { boreDoubledOrNonBearing: 0.8 } });
  assert.equal(r.rows[0].maxSize, 2.25);
  assert.equal(r.rows[0].ok, false);
});

test("a 3 in DWV drain (3.5 in OD + 1/8 in) fits no single bearing stud: 2x6 doubled is the way", () => {
  const r = run([{ wall: "B", kind: "bore", pipe: "3" }]);
  assert.equal(r.rows[0].size, 3.625);
  assert.equal(r.rows[0].ok, false);
  assert.match(r.rows[0].fix, /no listed stud|2x8/);
  // 2x6 doubled: 60% of 5.5 = 3.3, still short; 2x8 doubled 60% of 7.25 = 4.35 takes it
  const d = run([{ wall: "B", kind: "bore", pipe: "3", doubled: true }]);
  assert.equal(d.rows[0].ok, false);
  assert.match(d.rows[0].fix, /2x8/);
  // a 2 in drain: 2.5 in hole, over 40% of a 2x6 (2.2) but fine in a doubled 2x6 (3.3)
  assert.equal(run([{ wall: "B", kind: "bore", pipe: "2" }]).rows[0].ok, false);
  assert.equal(run([{ wall: "B", kind: "bore", pipe: "2", doubled: true }]).rows[0].ok, true);
});

test("notches: 25% bearing, 40% non-bearing; counts add up holes", () => {
  const r = run([{ wall: "A", kind: "notch", size: 0.875 }, { wall: "A", kind: "notch", size: 0.9 }, { wall: "P", kind: "notch", size: 1.4, count: 3 }, { wall: "B", kind: "bore", size: 1, count: 6 }]);
  assert.deepEqual(r.rows.map((x) => x.ok), [true, false, true, true]);
  assert.equal(r.holes, 6);
});

test("validation: unknown wall, bad kind, notch with pipe, bad limits key, empty list", () => {
  assert.match(validateDrilling({ runs: [{ wall: "Z", kind: "bore", size: 1 }] }, plan)[0], /not a wall/);
  assert.match(validateDrilling({ runs: [{ wall: "A", kind: "drill", size: 1 }] }, plan).join(), /kind/);
  assert.match(validateDrilling({ runs: [{ wall: "A", kind: "notch", pipe: "2" }] }, plan).join(), /pipe/);
  assert.match(validateDrilling({ runs: [{ wall: "A", kind: "bore", size: 1 }], limits: { foo: 0.5 } }, plan).join(), /not a limit/);
  assert.match(validateDrilling({ runs: [] }, plan)[0], /runs/);
  assert.equal(layoutDrilling({ runs: [{ wall: "A", kind: "bore", size: -1 }] }, plan).ok, false);
});

test("text names the failing run and its fix", () => {
  const t = drillingText(run([{ wall: "A", kind: "bore", size: 2, label: "kitchen drain" }]));
  assert.match(t.join("\n"), /OVER A \(kitchen drain\): bore 2 in in a 2x4 bearing stud = 57.1%/);
});
