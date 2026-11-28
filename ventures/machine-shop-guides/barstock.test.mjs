import test from "node:test";
import assert from "node:assert/strict";
import { barStock, sectionArea, barCsv, EXAMPLE, IN, LB } from "./barstock.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("1 in round steel bar: 2.67 lb/ft, the figure steel weight tables print", () => {
  // area pi/4 = 0.785398 in² = 506.707 mm²; x 7.85 g/cm³ = 3.9777 kg/m = 2.6729 lb/ft
  const r = barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "12", density: "7.85" });
  assert.deepEqual(r.errors, []);
  close(r.areaIn2, Math.PI / 4, 1e-12, "area");
  close(r.kgPerM, 506.7075 * 7.85 / 1000, 1e-4, "kg/m");
  close(r.lbPerFt, 2.6729, 1e-3, "lb/ft");
  close(r.barLb, 2.6729, 1e-3, "a 12 in bar weighs a foot's worth");
});

test("1 in x 12 in 6061 round, worked by hand: 9.4248 in³, 0.919 lb", () => {
  const r = barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "12", density: "2.70" });
  close(r.volumeIn3, 9.42478, 1e-4, "volume");
  close(r.volumeCm3, 9.42478 * 16.387064, 1e-3, "cm³");
  close(r.barKg, 9.42478 * 16.387064 * 2.7 / 1000, 1e-6, "kg");
  close(r.barLb, 0.9193, 1e-3, "lb (0.0975 lb/in³ x 9.4248)");
});

test("section areas by hand", () => {
  close(sectionArea("hex", { af: 10 }), 86.60254, 1e-4, "hex 10 AF = sqrt(3)/2 x 100");
  close(sectionArea("square", { a: 10 }), 100, 1e-12, "square");
  close(sectionArea("flat", { w: 50, t: 6 }), 300, 1e-12, "flat");
  close(sectionArea("tube", { od: 50, wall: 5 }), Math.PI / 4 * (2500 - 1600), 1e-9, "tube 50 x 5");
  close(sectionArea("squareTube", { a: 40, wall: 3 }), 1600 - 34 * 34, 1e-12, "square tube 40 x 3");
});

test("metric units: 20 mm hex brass, 3 m bar, priced per metre", () => {
  const r = barStock({ shape: "hex", units: "mm", dims: { af: "20" }, barLength: "3000", density: "8.5", price: "12", per: "m" });
  assert.deepEqual(r.errors, []);
  const area = Math.sqrt(3) / 2 * 400; // 346.41 mm²
  close(r.kgPerM, area * 8.5 / 1000, 1e-9, "kg/m");
  close(r.barKg, area * 8.5 * 3 / 1000, 1e-9, "bar kg");
  close(r.barCost, 36, 1e-9, "3 m x 12");
});

test("the invented example: parts per bar, drop, cost per part and the lot", () => {
  const r = barStock(EXAMPLE);
  assert.deepEqual(r.errors, []);
  // each part 2.25 + 0.03 + 0.125 = 2.405 in; usable 144 - 3 = 141; floor(141 / 2.405) = 58
  assert.equal(r.partsPerBar, 58);
  close(r.stockPerPartMm, 2.405 * IN, 1e-9, "stock per part");
  close(r.dropMm, (144 - 58 * 2.405) * IN, 1e-9, "drop");
  close(r.yieldPct, 58 * 2.25 / 144 * 100, 1e-9, "yield");
  // 1.5 in round x 144 in = 254.469 in³ x 0.0975... use the exact chain
  const barKg = Math.PI / 4 * (1.5 * IN) ** 2 * 144 * IN * 2.7 / 1e6;
  close(r.barKg, barKg, 1e-9, "bar kg");
  close(r.barCost, barKg / LB * 4.5, 1e-9, "bar cost at 4.50/lb");
  close(r.costPerPart, barKg / LB * 4.5 / 58, 1e-9, "per part");
  assert.equal(r.barsNeeded, 5); // ceil(250 / 58)
  close(r.totalCost, 5 * barKg / LB * 4.5, 1e-9, "lot");
});

test("parts fill the usable length exactly", () => {
  const r = barStock({ shape: "square", units: "mm", dims: { a: "25" }, barLength: "1000", partLength: "95", kerf: "5" });
  assert.equal(r.partsPerBar, 10);
  close(r.dropMm, 0, 1e-9, "no drop");
  assert.equal(r.costPerPart, undefined, "no price, no cost");
});

test("price per pound with no density gives no cost and says why", () => {
  const r = barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "144", price: "3", per: "lb" });
  assert.equal(r.barCost, null);
  assert.ok(r.notes.some((n) => /density/.test(n)));
  const each = barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "144", price: "60", per: "bar", partLength: "10" });
  assert.equal(each.barCost, 60);
  close(each.costPerPart, 60 / 14, 1e-12, "14 parts of 10 in");
});

test("bad input is refused with a reason", () => {
  assert.match(barStock({ shape: "tube", units: "in", dims: { od: "1", wall: "0.5" }, barLength: "12" }).errors.join(), /wall is too thick/);
  assert.match(barStock({ shape: "round", units: "in", dims: { d: "" }, barLength: "12" }).errors.join(), /Diameter/);
  assert.match(barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "0" }).errors.join(), /Bar length/);
  assert.match(barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "12", quantity: "2.5" }).errors.join(), /whole number/);
  assert.match(barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "12", density: "70" }).errors.join(), /Density/);
  assert.match(barStock({ shape: "nope" }).errors.join(), /shape/);
  const none = barStock({ shape: "round", units: "in", dims: { d: "1" }, barLength: "2", partLength: "3" });
  assert.equal(none.partsPerBar, 0);
  assert.ok(none.notes.some((n) => /Not one part/.test(n)));
});

test("CSV: header, formula text neutralised", () => {
  const csv = barCsv(barStock(EXAMPLE), "=HYPERLINK(1)");
  assert.match(csv, /^Item,Value\n/);
  assert.match(csv, /Shape,'=HYPERLINK\(1\)/);
  assert.match(csv, /Parts per bar,58/);
});
