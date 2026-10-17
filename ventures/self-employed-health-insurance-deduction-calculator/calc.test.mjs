import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, seTax, ltcLimit, parseNum, sampleInput, reportCsv, SS_WAGE_BASE } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("parseNum accepts money and rejects junk", () => {
  assert.equal(parseNum("$1,234.50"), 1234.5);
  assert.ok(Number.isNaN(parseNum("abc")));
  assert.ok(Number.isNaN(parseNum("")));
});

test("SE tax: 92.35% of profit, 12.4% to the wage base, 2.9% on all", () => {
  near(seTax(100000), 100000 * 0.9235 * 0.153);
  near(seTax(300000), SS_WAGE_BASE * 0.124 + 300000 * 0.9235 * 0.029);
  assert.equal(seTax(300), 0);
  // other wages use up Social Security room
  near(seTax(100000, SS_WAGE_BASE), 100000 * 0.9235 * 0.029);
});

test("LTC limits step up by age", () => {
  assert.equal(ltcLimit(35), 500);
  assert.equal(ltcLimit(41), 930);
  assert.equal(ltcLimit(60), 1860);
  assert.equal(ltcLimit(70), 4960);
  assert.equal(ltcLimit(71), 6200);
});

test("sample: premiums fit under the ceiling and tax saved is deduction times rates", () => {
  const a = analyze(sampleInput());
  assert.ok(!a.error);
  const se = 58000 * 0.9235 * 0.153;
  near(a.limit, 58000 - se / 2 - 4000);
  near(a.deduction, 9600);
  near(a.taxSaved, 9600 * 0.27);
  assert.equal(a.limitedByProfit, false);
  assert.equal(a.needed, null);
});

test("low profit caps the deduction and reports the profit that would fit it", () => {
  const a = analyze({ ...sampleInput(), netProfit: "9000", retirement: "0" });
  const se = 9000 * 0.9235 * 0.153;
  near(a.limit, 9000 - se / 2);
  near(a.deduction, a.limit);
  assert.ok(a.limitedByProfit);
  // at `needed` the ceiling equals the eligible premiums
  near(a.needed - seTax(a.needed) / 2, a.eligiblePremiums, 0.05);
  assert.ok(a.findings.some((f) => /caps the deduction/.test(f.title)));
});

test("months eligible for an employer plan are removed pro rata", () => {
  const a = analyze({ ...sampleInput(), ineligibleMonths: "3" });
  near(a.eligiblePremiums, 9600 * 0.75);
  near(a.deduction, 7200);
});

test("LTC premium is capped by age but paid still counts it", () => {
  const a = analyze({ ...sampleInput(), medical: "5000", ltc: "3000", age: "55" });
  assert.equal(a.ltcAllowed, 1860);
  near(a.qualifying, 6860);
  near(a.paid, 8000);
  near(a.notDeducted, 8000 - 6860);
  assert.ok(a.findings.some((f) => /capped by age/.test(f.title)));
});

test("S corp: ceiling is W-2 wages, no SE tax, Box 1 reminder", () => {
  const a = analyze({ entity: "S corp", wages: "40000", medical: "7000", age: "50", fedRate: "24", stateRate: "0" });
  assert.equal(a.scorp, true);
  assert.equal(a.se, 0);
  near(a.limit, 40000);
  near(a.deduction, 7000);
  assert.ok(a.findings.some((f) => /Box 1/.test(f.title)));
});

test("scenarios scale profit and never exceed premiums", () => {
  const a = analyze({ ...sampleInput(), netProfit: "20000" });
  assert.equal(a.scenarios.length, 5);
  for (const s of a.scenarios) assert.ok(s.deduction <= a.eligiblePremiums + 1e-9);
  assert.ok(a.scenarios[0].deduction <= a.scenarios[4].deduction);
});

test("bad input returns a message, not a throw", () => {
  assert.match(analyze({}).error, /net profit/);
  assert.match(analyze({ netProfit: "50000" }).error, /premium/);
  assert.match(analyze({ ...sampleInput(), ineligibleMonths: "13" }).error, /between 0 and 12/);
  assert.match(analyze({ ...sampleInput(), fedRate: "90" }).error, /rates/);
  assert.match(analyze({ entity: "scorp", medical: "100" }).error, /W-2 wages/);
});

test("CSV has the deduction row", () => {
  const csv = reportCsv(analyze(sampleInput()));
  assert.match(csv, /"Deduction","9600"/);
});
