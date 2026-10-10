import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, exciseTax, proofGallons, toProofGallons, filingFrequency, toCsv, sampleInput } from "./calc.mjs";

test("a proof gallon is a wine gallon at 50 percent ABV", () => {
  assert.equal(proofGallons(1, 50), 1);
  assert.equal(proofGallons(10, 40), 8);
});

test("a case of twelve 750 mL bottles at 40 percent is about 1.9 proof gallons", () => {
  const pg = toProofGallons({ ml750: 12, abv: 40 });
  assert.ok(Math.abs(pg - 1.9017) < 0.001);
});

test("a small distiller under 100,000 proof gallons pays $2.70 each", () => {
  const r = exciseTax({ proofGal: 10000 });
  assert.equal(r.tax, 27000);
  assert.equal(r.marginal, 2.7);
});

test("proof gallons past 100,000 are taxed at $13.34 and earlier ones keep $2.70", () => {
  const r = exciseTax({ proofGal: 150000 });
  assert.equal(r.tax, 100000 * 2.7 + 50000 * 13.34);
  assert.equal(r.marginal, 13.34);
});

test("a distiller over 22.23 million proof gallons gets no reduced rate; the excess pays $13.50", () => {
  const r = exciseTax({ proofGal: 23230000, small: false });
  assert.equal(r.tax, 22230000 * 13.34 + 1000000 * 13.5);
});

test("a controlled-group share smaller than 100,000 sends the rest to $13.34", () => {
  const r = exciseTax({ proofGal: 20000, allotment: 5000 });
  assert.equal(r.tax, 5000 * 2.7 + 15000 * 13.34);
});

test("plan reports per-bottle tax and the saving against the top rate", () => {
  const r = plan({ ml750: 10000, abv: 40, allotment: 100000, small: true });
  assert.ok(Math.abs(r.proofGal - 1584.8) < 0.5);
  assert.ok(Math.abs(r.perUnits[0].each - 0.15848 * 2.7 * 10 / 10) < 0.01);
  assert.ok(Math.abs(r.saved - (r.proofGal * 13.5 - r.proofGal * 2.7)) < 1e-6);
});

test("the growth table shows the rate cliff", () => {
  const r = plan({ bulkWineGallons: 125000, abv: 40, small: true, allotment: 100000 });
  assert.equal(r.proofGal, 100000);
  const double = r.growth.find((g) => g.multiple === 2);
  assert.equal(double.tax, 100000 * 2.7 + 100000 * 13.34);
  assert.equal(double.marginal, 13.34);
});

test("bad input is rejected with a message", () => {
  assert.match(plan({}).error, /Enter what you remove/);
  assert.match(plan({ ml750: -1 }).error, /0 or more/);
  assert.match(plan({ ml750: 10, abv: 0 }).error, /alcohol by volume/);
  assert.match(plan({ bulkWineGallons: 1e10 }).error, /units/);
});

test("filing frequency thresholds", () => {
  assert.match(filingFrequency(20000), /Quarterly/);
  assert.match(filingFrequency(80000), /semi-monthly/);
});

test("sample runs and exports csv", () => {
  const r = plan(sampleInput());
  assert.ok(r.tax > 0);
  assert.match(toCsv(r), /^tier,proof_gallons/);
});
