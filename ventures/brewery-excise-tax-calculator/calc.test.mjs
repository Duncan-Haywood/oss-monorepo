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
