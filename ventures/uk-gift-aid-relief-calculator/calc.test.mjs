import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, SAMPLE, summaryText } from "./calc.mjs";

test("basic-rate taxpayer gets no extra relief", () => {
  const r = compute({ income: "30000", donation: "80" });
  assert.equal(r.gross, 100);
  assert.equal(r.relief, 0);
  assert.equal(r.netCost, 80);
});

test("higher-rate taxpayer reclaims 20% of the gross gift", () => {
  const r = compute(SAMPLE);
  assert.equal(r.gross, 1000);
  assert.equal(r.relief, 200);
  assert.equal(r.netCost, 600);
});

test("£100k taper band: the gift restores allowance, relief is 40% of gross", () => {
  const r = compute({ income: "110000", donation: "800" });
  assert.equal(r.relief, 400);
});

test("additional-rate relief is 25% of gross", () => {
  const r = compute({ income: "200000", donation: "800" });
  assert.equal(r.relief, 250);
});

test("gift needed to reach £100,000 is net of the 20% gross-up", () => {
  const r = compute({ income: "110000", donation: "0" });
  assert.equal(r.toReach100k, 8000);
  const after = incomeTax(110000, 8000 / 0.8);
  assert.equal(after.ani, 100000);
});

test("too little tax paid is flagged", () => {
  const r = compute({ income: "14000", donation: "2000" });
  assert.equal(r.taxEnough, false);
  assert.ok(r.findings.some((f) => /at least/.test(f.title)));
});

test("compute validates input and summary renders", () => {
  assert.ok(compute({ income: "x", donation: "1" }).errors.length > 0);
  assert.ok(compute({ income: "1", donation: "-5" }).errors.length > 0);
  assert.match(summaryText(compute(SAMPLE)), /Relief you can claim: £200\.00/);
});
