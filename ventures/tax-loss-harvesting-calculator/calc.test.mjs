import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, netLosses, sampleInput, reportCsv, parseNum } from "./calc.mjs";

test("netLosses: gains only are taxed by character", () => {
  assert.deepEqual(netLosses(5000, 8000, 3000), { stTax: 5000, ltTax: 8000, ded: 0, carryST: 0, carryLT: 0 });
});
test("netLosses: short loss offsets long gain", () => {
  const n = netLosses(-4000, 10000, 3000);
  assert.equal(n.ltTax, 6000); assert.equal(n.stTax, 0); assert.equal(n.ded, 0);
});
test("netLosses: net loss uses the $3,000 limit and carries the rest, short first", () => {
  const n = netLosses(-5000, -4000, 3000);
  assert.equal(n.ded, 3000); assert.equal(n.carryST, 2000); assert.equal(n.carryLT, 4000);
});
test("netLosses: long loss larger than short gain", () => {
  const n = netLosses(2000, -9000, 3000);
  assert.equal(n.ded, 3000); assert.equal(n.carryLT, 4000); assert.equal(n.stTax, 0);
});
test("married filing separately caps at $1,500", () => {
  assert.equal(netLosses(0, -10000, 1500).ded, 1500);
});
test("sample: wash-sale position excluded, savings computed by hand", () => {
  const a = analyze(sampleInput());
  assert.equal(a.harvested, 11700);
  assert.equal(a.disallowed.length, 1);
  // before: st 6000 at 37%, lt 16000 at 20% = 2220 + 3200 = 5420
  assert.equal(a.before.cost, 5420);
  // after: st -> 1800 (6000-4200), lt 16000-7500 = 8500. tax = 666 + 1700 = 2366
  assert.equal(a.after.cost, 2366);
  assert.equal(a.savings, 3054);
});
test("harvest beyond gains creates ordinary deduction and carryforward", () => {
  const a = analyze({ filing: "single", stGain: "0", ltGain: "1000", ordRate: "24", ltRate: "15", positions: [{ loss: "10000", term: "long" }] });
  assert.equal(a.after.ded, 3000);
  assert.equal(a.after.carryLT, 6000);
  assert.equal(a.savings, 1000 * 0.15 + 3000 * 0.24);
});
test("validation", () => {
  assert.ok(analyze({ positions: [] }).error);
  assert.ok(analyze({ stGain: "abc", positions: [{ loss: "5" }] }).error);
  assert.ok(analyze({ positions: [{ loss: "-5" }] }).error);
  assert.ok(analyze({ ordRate: "90", positions: [{ loss: "5" }] }).error);
  assert.ok(analyze({ stCarry: "-1", positions: [{ loss: "5" }] }).error);
});
test("csv and parseNum", () => {
  assert.match(reportCsv(analyze(sampleInput())), /Estimated savings this year/);
  assert.equal(parseNum("$1,200"), 1200);
  assert.ok(Number.isNaN(parseNum("x")));
});
