import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, reliefRate, pensionGross, futureValue, breakEvenRetirementRate, breakEvenMatch, pensionNet } from "./calc.mjs";

test("marginal relief rate by income", () => {
  assert.equal(reliefRate(30000), 0.2);
  assert.equal(reliefRate(60000), 0.4);
  assert.equal(reliefRate(110000), 0.6);
  assert.equal(reliefRate(150000), 0.45);
});

test("£1 of take-home buys £1.25 gross at basic rate, £1.667 at higher", () => {
  assert.equal(pensionGross(1, 30000), 1.25);
  assert.ok(Math.abs(pensionGross(1, 60000) - 1 / 0.6) < 1e-12);
});

test("salary sacrifice adds the employee NI saving", () => {
  assert.ok(Math.abs(pensionGross(1, 30000, true) - 1 / 0.72) < 1e-12);
  assert.ok(Math.abs(pensionGross(1, 60000, true) - 1 / 0.58) < 1e-12);
});

test("future value of start-of-year payments", () => {
  assert.equal(Math.round(futureValue(1000, 1, 0.1)), 1100);
  assert.equal(Math.round(futureValue(1000, 2, 0)), 2000);
});

test("pension net: 25% tax free, rest taxed", () => {
  assert.equal(Math.round(pensionNet(1000, 0.2)), 850);
  assert.equal(pensionNet(1000, 0), 1000);
});

test("basic rate payer: LISA ties at 0% retirement tax and wins above", () => {
  assert.ok(Math.abs(breakEvenRetirementRate(30000)) < 1e-12);
});

test("higher rate payer: pension wins when retirement tax is below a third", () => {
  assert.ok(Math.abs(breakEvenRetirementRate(60000) - 1 / 3) < 1e-9);
});

test("employer match of 25% makes a basic rate pension beat the LISA at 20% retirement tax", () => {
  assert.ok(breakEvenMatch(30000, 0.2) > 0.17 && breakEvenMatch(30000, 0.2) < 0.18);
  const r = compute({ ...SAMPLE, income: "30000", match: "25" });
  assert.equal(r.winner, "pension");
});

test("sample: higher rate payer, 20% retirement tax: pension wins", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.winner, "pension");
  assert.ok(r.perPoundPension > 1.41 && r.perPoundPension < 1.42);
  assert.equal(r.perPoundLisa, 1.25);
  assert.equal(r.strat.length, 3);
});

test("basic rate payer paying tax in retirement: LISA wins", () => {
  const r = compute({ ...SAMPLE, income: "30000" });
  assert.equal(r.winner, "lisa");
});

test("strategy values scale: all pension pot is bigger than LISA-only at higher rate", () => {
  const r = compute(SAMPLE);
  const [a, , c] = r.strat;
  assert.ok(a.retire > c.retire);
  assert.equal(a.home, 0);
  assert.ok(c.home > 0);
});

test("early withdrawal costs the LISA 25% charge on the pot", () => {
  const r = compute({ ...SAMPLE, cost: "4000", income: "30000" });
  const c = r.strat[2];
  assert.ok(Math.abs(c.early - c.lisaPot * 0.75) < 0.02);
});

test("aged 40 or over cannot open a LISA: only the pension strategy is shown", () => {
  const r = compute({ ...SAMPLE, age: "41" });
  assert.equal(r.lisaOpenOk, false);
  assert.equal(r.strat.length, 1);
  assert.ok(r.findings.some((f) => /18 to 39/.test(f.title)));
});

test("taper band income flags the effective 60% relief", () => {
  const r = compute({ ...SAMPLE, income: "110000" });
  assert.ok(r.findings.some((f) => /60%/.test(f.title)));
});

test("bad input is rejected", () => {
  assert.ok(compute({ ...SAMPLE, cost: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, years: "-3" }).errors.length);
  assert.ok(compute({ ...SAMPLE, age: "15" }).errors.length);
  assert.ok(compute({ ...SAMPLE, growth: "abc" }).errors.length);
});

test("summary mentions both wrappers and the disclaimer", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /LISA/);
  assert.match(t, /Not tax advice/);
});
