import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, seTax, incomeTax, marginalRate, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("SE tax: 15.3% of 92.35% of profit, under the wage base", () => {
  const s = seTax(100000, 0, "single");
  assert.equal(s.earnings, 92350);
  assert.equal(s.ss, 11451.4);
  assert.equal(s.medicare, 2678.15);
  assert.equal(s.total, 14129.55);
});
test("W-2 wages use up the Social Security wage base first", () => {
  const s = seTax(100000, 184500, "single");
  assert.equal(s.ss, 0);
  assert.equal(s.medicare, 2678.15);
});
test("no SE tax under $400 of net earnings", () => {
  assert.equal(seTax(400, 0, "single").total, 0);
});
test("income tax brackets stack", () => {
  assert.equal(incomeTax(12400, "single"), 1240);
  assert.equal(incomeTax(61468.18, "single"), 8235);
  assert.equal(incomeTax(24800, "mfj"), 2480);
  assert.equal(marginalRate(61468, "single"), 0.22);
});
test("worked example matches a by-hand return", () => {
  const r = run({});
  assert.equal(r.net, 100000);
  assert.equal(r.agi, 92935.22);
  assert.equal(r.qbi, 15367.04);
  assert.equal(r.taxable, 61468.18);
  assert.equal(r.federal, 8235);
  assert.equal(r.state, 4646.76);
  assert.equal(r.total, 27011.31);
  assert.equal(r.afterTax, r.net - r.total);
});
test("marginal set-aside on the next $1,000 exceeds the average", () => {
  const r = run({});
  assert.ok(r.marginalPer1000 > r.perThousand);
  assert.ok(r.marginalPer1000 < 600);
});
test("QBI off raises the federal tax", () => {
  assert.ok(run({ qbi: "no" }).federal > run({}).federal);
  assert.equal(run({ qbi: "no" }).qbi, 0);
});
test("no QBI is taken above the threshold, with a finding", () => {
  const r = run({ revenue: "400000", expenses: "0" });
  assert.equal(r.qbi, 0);
  assert.ok(r.findings.some((f) => /QBI/.test(f.title)));
});
test("joint filers pay less federal tax than single on the same profit", () => {
  assert.ok(run({ filingStatus: "mfj" }).federal < run({}).federal);
});
test("Additional Medicare Tax appears past the threshold", () => {
  assert.ok(run({ revenue: "300000", expenses: "0" }).se.additional > 0);
});
test("expenses above revenue give nothing to set aside", () => {
  const r = run({ revenue: "1000", expenses: "5000" });
  assert.equal(r.net, 0);
  assert.equal(r.total, 0);
});
test("estimated-payment finding uses the prior-year safe harbor when it is lower", () => {
  const f = run({ priorYearTax: "10000" }).findings.find((x) => /1040-ES/.test(x.title));
  assert.match(f.title, /at least \$10000\.00/);
  assert.match(f.title, /last year/);
});
test("small profit raises no estimated-payment finding", () => {
  assert.ok(!run({ revenue: "4000", expenses: "0", stateRate: "0" }).findings.some((x) => /1040-ES/.test(x.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ stateRate: "50" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
  assert.ok(run({ priorYearTax: "-1" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on irs\.gov/);
});
