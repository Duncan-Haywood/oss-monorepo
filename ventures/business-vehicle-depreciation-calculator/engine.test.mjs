import test from "node:test";
import assert from "node:assert/strict";
import { compute, DEFAULT_LIMITS, fmt } from "./engine.mjs";

const by = (r, k) => r.methods.find((m) => m.key === k);
const base = { price: 60000, businessPct: 100, vehicleClass: "passenger", taxRate: 30 };

test("passenger car: bonus year one is the with-bonus cap, then later caps", () => {
  const b = by(compute(base), "bonus");
  assert.equal(b.schedule[0], 20200);
  assert.equal(b.schedule[1], 19600);
  assert.equal(b.schedule[2], 11800);
  assert.equal(b.schedule[3], 7060);
  assert.ok(Math.abs(b.total - 60000) < 1e-6, "everything is eventually recovered");
});

test("passenger car: 179 is held to the no-bonus cap", () => {
  assert.equal(by(compute(base), "s179").year1, 12200);
});

test("business use scales the caps", () => {
  const b = by(compute({ ...base, businessPct: 80 }), "bonus");
  assert.equal(b.schedule[0], 20200 * 0.8);
});

test("heavy SUV: bonus deducts everything, 179 is capped then MACRS on the rest", () => {
  const r = compute({ ...base, price: 80000, vehicleClass: "heavy_suv" });
  assert.equal(by(r, "bonus").year1, 80000);
  assert.equal(by(r, "macrs").year1, 16000);
  const s = by(r, "s179");
  assert.ok(Math.abs(s.year1 - (31300 + 48700 * 0.2)) < 1e-6);
  assert.ok(Math.abs(s.total - 80000) < 1e-6);
});

test("exempt work truck: 179 limited by business income, excess carries", () => {
  const r = compute({ ...base, price: 70000, vehicleClass: "exempt", businessIncome: 50000 });
  const s = by(r, "s179");
  assert.equal(s.schedule[0], 50000);
  assert.equal(s.schedule[1], 20000);
  assert.ok(r.warnings.some((w) => /taxable income/.test(w)));
});

test("50% business use or less: ADS only, no bonus or 179", () => {
  const r = compute({ ...base, businessPct: 50, vehicleClass: "heavy_suv" });
  assert.deepEqual(r.methods.map((m) => m.key), ["ads"]);
  assert.ok(Math.abs(r.methods[0].year1 - 30000 / 12) < 1e-6);
});

test("tax saved is deduction times rate; mileage shown separately", () => {
  const r = compute({ ...base, miles: 10000 });
  assert.equal(by(r, "bonus").taxSavedYear1, 20200 * 0.3);
  assert.equal(r.mileage.deduction, 7000);
});

test("empty input is an error, not NaN", () => {
  assert.equal(compute({}).status, "error");
  assert.equal(fmt(1234.5), "$1,235");
  assert.ok(DEFAULT_LIMITS.heavySuv179Cap > 0);
});

test("editable limits override defaults", () => {
  const lim = JSON.parse(JSON.stringify(DEFAULT_LIMITS));
  lim.passengerCaps.year1WithBonus = 10000;
  assert.equal(by(compute(base, lim), "bonus").year1, 10000);
});
