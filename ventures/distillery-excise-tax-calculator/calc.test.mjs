import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, exciseTax, toProofGallons, proofGallonsPerBottle, abvToProof, filingFrequency, toCsv, sampleInput } from "./calc.mjs";

test("ABV doubles to proof", () => assert.equal(abvToProof(40), 80));

test("a 750 mL bottle at 80 proof is about 0.1585 proof gallons", () => {
  assert.ok(Math.abs(proofGallonsPerBottle(750, 80) - 0.15850) < 1e-4);
});

test("a wine gallon at 100 proof is one proof gallon", () => {
  assert.ok(Math.abs(proofGallonsPerBottle(3785.411784, 100) - 1) < 1e-9);
});

test("bottles plus bulk proof gallons add up", () => {
  const pg = toProofGallons({ proof: 100, ml1000: 1000, bulkProofGallons: 10 });
  assert.ok(Math.abs(pg - (1000 * 1000 / 3785.411784 + 10)) < 1e-6);
});

test("first 100,000 proof gallons pay $2.70", () => {
  const r = exciseTax({ proofGallons: 50000 });
  assert.equal(r.tax, 135000);
  assert.equal(r.marginal, 2.7);
});

test("proof gallons past 100,000 pay $13.34 and earlier ones keep $2.70", () => {
  const r = exciseTax({ proofGallons: 120000 });
  assert.ok(Math.abs(r.tax - (100000 * 2.7 + 20000 * 13.34)) < 1e-6);
  assert.equal(r.marginal, 13.34);
});

test("over 22.13 million proof gallons pays $13.50 on the excess, and no reduced rate means $13.34 first", () => {
  const r = exciseTax({ proofGallons: 23000000, small: false });
  assert.ok(Math.abs(r.tax - (22130000 * 13.34 + 870000 * 13.5)) < 1e-3);
});

test("a controlled-group share smaller than 100,000 pushes the rest to $13.34", () => {
  const r = exciseTax({ proofGallons: 20000, allotment: 5000 });
  assert.ok(Math.abs(r.tax - (5000 * 2.7 + 15000 * 13.34)) < 1e-6);
});

test("plan reports tax per bottle and the saving against the full rate", () => {
  const r = plan({ proof: 80, ml750: 1000, small: true });
  const pg = 1000 * proofGallonsPerBottle(750, 80);
  assert.ok(Math.abs(r.proofGallons - pg) < 1e-9);
  assert.ok(Math.abs(r.perUnits[0].each - proofGallonsPerBottle(750, 80) * 2.7) < 1e-9);
  assert.ok(Math.abs(r.saved - (pg * 13.5 - pg * 2.7)) < 1e-6);
});

test("higher proof carries more tax per bottle", () => {
  const lo = plan({ proof: 80, ml750: 100 }).perUnits[0].each;
  const hi = plan({ proof: 120, ml750: 100 }).perUnits[0].each;
  assert.ok(Math.abs(hi / lo - 1.5) < 1e-9);
});

test("the growth table shows the rate cliff", () => {
  const r = plan({ bulkProofGallons: 80000, small: true });
  const double = r.growth.find((g) => g.multiple === 2);
  assert.ok(Math.abs(double.tax - (100000 * 2.7 + 60000 * 13.34)) < 1e-6);
  assert.equal(double.marginal, 13.34);
});

test("bad input is rejected with a message", () => {
  assert.match(plan({}).error, /Enter what you remove/);
  assert.match(plan({ ml750: -1 }).error, /0 or more/);
  assert.match(plan({ bulkProofGallons: 1e9 }).error, /units/);
  assert.match(plan({ ml750: 1, proof: 250 }).error, /200/);
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
