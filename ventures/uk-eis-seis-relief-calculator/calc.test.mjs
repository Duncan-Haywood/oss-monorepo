import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, RATES } from "./calc.mjs";

const base = { scheme: "eis", kic: "no", invest: "", liability: "", gain: "", cgtRate: "24", proceeds: "0", marginal: "40" };

test("EIS gives 30% income tax relief within the tax bill", () => {
  const r = compute({ ...base, invest: "100000", liability: "50000" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.relief, 30000);
  assert.equal(r.unused, 0);
  assert.equal(r.netCost, 70000);
});

test("SEIS gives 50% relief and caps investment at 200,000", () => {
  const r = compute({ ...base, scheme: "seis", invest: "300000", liability: "500000" });
  assert.equal(r.eligible, 200000);
  assert.equal(r.relief, 100000);
});

test("relief cannot exceed the income tax owed", () => {
  const r = compute({ ...base, invest: "100000", liability: "10000" });
  assert.equal(r.relief, 10000);
  assert.equal(r.unused, 20000);
  assert.ok(r.findings.some((f) => /lose £20,000/.test(f.title)));
});

test("EIS above 1m only counts for relief with knowledge-intensive companies", () => {
  assert.equal(compute({ ...base, invest: "1500000", liability: "9e6" }).eligible, 1000000);
  assert.equal(compute({ ...base, invest: "1500000", liability: "9e6", kic: "yes" }).eligible, 1500000);
});

test("EIS defers gain; SEIS exempts half the reinvested gain", () => {
  const e = compute({ ...base, invest: "50000", liability: "50000", gain: "30000" });
  assert.equal(e.cgt.kind, "deferred");
  assert.equal(e.cgt.value, 7200);
  assert.equal(e.cgt.saved, 0);
  const s = compute({ ...base, scheme: "seis", invest: "50000", liability: "50000", gain: "30000" });
  assert.equal(s.cgt.saved, 3600);
});

test("total loss: loss relief is on the cost net of income tax relief", () => {
  const r = compute({ ...base, scheme: "seis", invest: "10000", liability: "100000", marginal: "45" });
  // cost after relief 5000; loss relief 2250; out of pocket 2750
  assert.equal(r.totalLossNet, 2750);
});

test("break-even sale price returns the investor to zero", () => {
  const r = compute({ ...SAMPLE });
  const check = compute({ ...SAMPLE, proceeds: String(r.breakEven) });
  assert.ok(check.outOfPocket < 1);
});

test("worked sample runs and says it is not advice", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.match(summaryText(r), /Not tax advice/);
  assert.equal(RATES.seis.relief, 0.5);
});

test("bad input is rejected", () => {
  assert.ok(compute({ ...base, invest: "-1" }).errors.length);
  assert.ok(compute({ ...base, invest: "abc" }).errors.length);
  assert.ok(compute({ ...base, cgtRate: "150" }).errors.length);
  assert.ok(compute(base).findings.some((f) => /Enter the amount/.test(f.title)));
});
