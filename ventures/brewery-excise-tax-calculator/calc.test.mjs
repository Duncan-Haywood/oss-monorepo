import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, exciseTax, toBarrels, filingFrequency, toCsv, sampleInput } from "./calc.mjs";

test("a half-barrel keg is half a barrel", () => {
  assert.ok(Math.abs(toBarrels({ halfKegs: 2 }) - 1) < 1e-9);
});

test("small brewer under 60,000 barrels pays $3.50 per barrel", () => {
  const r = exciseTax({ barrels: 10000 });
  assert.equal(r.tax, 35000);
  assert.equal(r.marginal, 3.5);
});

test("barrels past 60,000 are taxed at $16 and earlier barrels keep $3.50", () => {
  const r = exciseTax({ barrels: 70000 });
  assert.equal(r.tax, 60000 * 3.5 + 10000 * 16);
  assert.equal(r.marginal, 16);
});

test("a brewer over 2 million barrels gets no reduced rate; over 6 million pays $18 on the excess", () => {
  const r = exciseTax({ barrels: 7000000, small: false });
  assert.equal(r.tax, 6000000 * 16 + 1000000 * 18);
});

test("a controlled-group share smaller than 60,000 sends the rest to $16", () => {
  const r = exciseTax({ barrels: 20000, allotment: 5000 });
  assert.equal(r.tax, 5000 * 3.5 + 15000 * 16);
});

test("plan reports per-keg tax and the saving against the top rate", () => {
  const r = plan({ halfKegs: 200, allotment: 60000, small: true });
  assert.equal(r.barrels, 100);
  assert.ok(Math.abs(r.perUnits[0].each - 1.75) < 1e-9);
  assert.equal(r.saved, 100 * 18 - 350);
});

test("the growth table shows the rate cliff", () => {
  const r = plan({ otherBarrels: 50000, small: true, allotment: 60000 });
  const double = r.growth.find((g) => g.multiple === 2);
  assert.equal(double.tax, 60000 * 3.5 + 40000 * 16);
  assert.equal(double.marginal, 16);
});

test("bad input is rejected with a message", () => {
  assert.match(plan({}).error, /Enter what you remove/);
  assert.match(plan({ halfKegs: -1 }).error, /0 or more/);
  assert.match(plan({ otherBarrels: 1e9 }).error, /units/);
});

test("filing frequency thresholds", () => {
  assert.match(filingFrequency(900), /Annual/);
  assert.match(filingFrequency(20000), /Quarterly/);
  assert.match(filingFrequency(80000), /semi-monthly/);
});

test("sample runs and exports csv", () => {
  const r = plan(sampleInput());
  assert.ok(r.tax > 0);
  assert.match(toCsv(r), /^tier,barrels/);
});

// Boundary tests from the 2026-11-15 quality census (26 U.S.C. 5051(a), 27 CFR 25.164); each kills a mutant that survived.
test("filing thresholds are inclusive at $1,000 and $50,000", () => {
  assert.match(filingFrequency(1000), /Annual/);
  assert.match(filingFrequency(1000.01), /Quarterly/);
  assert.match(filingFrequency(50000), /Quarterly/);
  assert.match(filingFrequency(50000.01), /semi-monthly/);
});

test("statutory tiers: 60k at $3.50, to 6M at $16, then $18", () => {
  assert.equal(exciseTax({ barrels: 60000 }).marginal, 16);
  assert.equal(exciseTax({ barrels: 59999 }).marginal, 3.5);
  assert.equal(exciseTax({ barrels: 70000 }).tax, 60000 * 3.5 + 10000 * 16);
  assert.equal(exciseTax({ barrels: 6.5e6 }).tax, 60000 * 3.5 + 5940000 * 16 + 500000 * 18);
  assert.equal(exciseTax({ barrels: 2.5e6, small: false }).tax, 2.5e6 * 16);
  assert.equal(exciseTax({ barrels: 70000, allotment: 80000 }).tax, 370000);
});

test("package conversions use 128 oz per gallon and 31-gallon barrels", () => {
  assert.ok(Math.abs(toBarrels({ cases12: (31 * 128) / (24 * 12) }) - 1) < 1e-9);
  assert.ok(Math.abs(toBarrels({ cases16: (31 * 128) / (24 * 16) }) - 1) < 1e-9);
});

test("a blank allotment keeps the statutory 60,000 (audit 2026-11-15)", () => {
  assert.equal(plan({ halfKegs: 200, allotment: "" }).tax, 350);
});

test("growth rows above 2 million barrels lose the reduced rate (audit 2026-11-15)", () => {
  const r = plan({ otherBarrels: 1e6, small: true });
  assert.equal(r.growth[4].tax, 48e6);
  assert.equal(r.growth[3].tax, 60000 * 3.5 + (2e6 - 60000) * 16);
  assert.match(r.advice.join(" "), /2 million/);
});
