import test from "node:test";
import assert from "node:assert/strict";
import { computeBudget, parseAmounts, summarize, money, pct, DEFAULTS } from "./engine.mjs";

const EXAMPLE = { tuition: 18000, equipment: "12500, 4200", subawards: "80000\n30000", awardCap: 350000 };

test("defaults: all included costs are MTDC and 15% de minimis applies", () => {
  const r = computeBudget({});
  assert.equal(r.mtdc, 183600);
  assert.equal(r.excluded, 0);
  assert.equal(r.indirect, 27540);
  assert.equal(r.total, 211140);
  assert.equal(r.fit, null);
});

test("equipment at or over the threshold is excluded, cheaper units are supplies", () => {
  const r = computeBudget({ ...DEFAULTS, equipment: "10000, 9999.99", salaries: 0, fringe: 0, supplies: 0, travel: 0, services: 0, otherDirect: 0 });
  assert.equal(r.excluded, 10000);
  assert.equal(r.mtdc, 9999.99);
});

test("only the first $50,000 of each subaward counts, per subaward", () => {
  const r = computeBudget({ salaries: 0, fringe: 0, supplies: 0, travel: 0, services: 0, otherDirect: 0, subawards: "80000, 30000, 50000" });
  assert.equal(r.mtdc, 50000 + 30000 + 50000);
  assert.equal(r.excluded, 30000);
});

test("worked example matches the guide", () => {
  const r = computeBudget(EXAMPLE);
  assert.equal(r.mtdc, 267800);
  assert.equal(r.excluded, 60500);
  assert.equal(r.direct, 328300);
  assert.equal(r.indirect, 40170);
  assert.equal(r.total, 368470);
  assert.equal(r.overChargeIfAppliedToTdc, 9075);
  assert.equal(pct(r.effectiveOnDirect), "12.2%");
  assert.equal(r.fit.over, 18470);
  assert.equal(r.fit.maxDirect, 311843.57);
  assert.equal(r.fit.directCut, 16456.43);
  assert.equal(r.fit.maxIndirect, 38156.43);
});

test("the max direct budget really fits the cap", () => {
  const r = computeBudget(EXAMPLE);
  const share = r.baseAmount / r.direct;
  const total = r.fit.maxDirect * (1 + 0.15 * share);
  assert.ok(Math.abs(total - 350000) < 0.05, String(total));
});

test("total direct cost base charges on everything", () => {
  const r = computeBudget({ ...EXAMPLE, base: "tdc" });
  assert.equal(r.baseAmount, 328300);
  assert.equal(r.indirect, 49245);
});

test("scenarios include 10, 15 and the chosen rate once each", () => {
  const rates = computeBudget({ ratePct: 26 }).scenarios.map((s) => s.ratePct);
  assert.deepEqual(rates, [10, 15, 26]);
  assert.deepEqual(computeBudget({}).scenarios.map((s) => s.ratePct), [10, 15]);
});

test("a custom threshold and cap are honoured", () => {
  const r = computeBudget({ equipment: "6000", equipmentThreshold: 5000, subawards: "30000", subawardCap: 25000, salaries: 0, fringe: 0, supplies: 0, travel: 0, services: 0, otherDirect: 0 });
  assert.equal(r.excluded, 6000 + 5000);
  assert.equal(r.mtdc, 25000);
});

test("bad input throws a readable error", () => {
  assert.throws(() => computeBudget({ salaries: "abc" }), /Salaries must be a number/);
  assert.throws(() => computeBudget({ ratePct: 150 }), /between 0 and 100/);
  assert.throws(() => computeBudget({ travel: -5 }), /Travel must be between/);
  assert.throws(() => parseAmounts("12, x"), /must be a number/);
});

test("parseAmounts accepts commas, semicolons, newlines and dollar signs", () => {
  assert.deepEqual(parseAmounts("$1,000"), [1000]);
  assert.deepEqual(parseAmounts("12,500, 4200;300\n1,000,000.50"), [12500, 4200, 300, 1000000.5]);
  assert.deepEqual(parseAmounts("12500,4200"), [12500, 4200]);
  assert.deepEqual(parseAmounts(""), []);
});

test("summarize explains the effective rate and the cap", () => {
  const s = summarize(computeBudget(EXAMPLE));
  assert.equal(s.status, "warn");
  assert.match(s.text, /Over the \$350,000\.00 cap by \$18,470\.00/);
  assert.match(s.text, /only 12\.2% of direct costs/);
  assert.equal(summarize(computeBudget({ salaries: 0, fringe: 0, supplies: 0, travel: 0, services: 0, otherDirect: 0 })).status, "error");
  assert.equal(money(-0.001), "$0.00");
});
