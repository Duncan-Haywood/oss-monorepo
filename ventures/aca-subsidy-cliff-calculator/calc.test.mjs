import { test } from "node:test";
import assert from "node:assert/strict";
import { fplAmount, applicablePercentage, creditAt, analyze, scenarioTable, money, BANDS } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("2025 poverty lines for 2026 coverage", () => {
  assert.equal(fplAmount(1), 15_650);
  assert.equal(fplAmount(2), 21_150);
  assert.equal(fplAmount(4), 32_150);
  assert.equal(fplAmount(1, "alaska"), 19_550);
  assert.equal(fplAmount(3, "hawaii"), 17_990 + 2 * 6_320);
  assert.equal(fplAmount(0), 15_650);
});

test("applicable percentage hits the published band edges", () => {
  near(applicablePercentage(100), 0.0210);
  near(applicablePercentage(133), 0.0210);
  near(applicablePercentage(150), 0.0419);
  near(applicablePercentage(200), 0.0660);
  near(applicablePercentage(250), 0.0844);
  near(applicablePercentage(300), 0.0996);
  near(applicablePercentage(400), 0.0996);
  assert.equal(applicablePercentage(400.01), null);
  assert.equal(BANDS.length, 6);
});

test("percentage interpolates inside a band", () => {
  near(applicablePercentage(175), (4.19 + 6.60) / 2 / 100);
});

test("credit is benchmark minus expected contribution, floored at zero", () => {
  const r = creditAt({ magi: 62_600, householdSize: 1, benchmarkAnnual: 8_400 });
  near(r.credit, 8_400 - 62_600 * 0.0996);
  assert.equal(creditAt({ magi: 62_600, householdSize: 1, benchmarkAnnual: 3_000 }).credit, 0);
});

test("one dollar over 400% of poverty removes the whole credit", () => {
  const at = creditAt({ magi: 62_600, householdSize: 1, benchmarkAnnual: 8_400 });
  const over = creditAt({ magi: 62_601, householdSize: 1, benchmarkAnnual: 8_400 });
  assert.ok(at.credit > 2_000);
  assert.equal(over.credit, 0);
  assert.equal(over.aboveCliff, true);
});

test("analyze reports the overage, credit lost, and whether deductions cover it", () => {
  const r = analyze({ magi: 68_000, benchmarkMonthly: 700, deductionsAvailable: 8_000 });
  assert.equal(r.cliff, 62_600);
  assert.equal(r.overBy, 5_400);
  near(r.atCliff, 8_400 - 62_600 * 0.0996);
  assert.ok(r.findings.some((f) => /enough to get under/.test(f.title)));
  const short = analyze({ magi: 68_000, benchmarkMonthly: 700, deductionsAvailable: 1_000 });
  assert.ok(short.findings.some((f) => /fall short/.test(f.title)));
});

test("under the cliff: room, near-cliff warning, no-cap repayment note", () => {
  const r = analyze({ magi: 60_000, benchmarkMonthly: 700 });
  assert.equal(r.aboveCliff, false);
  assert.ok(r.findings.some((f) => /2,600 of room/.test(f.title)));
  assert.ok(r.findings.some((f) => /Close to the cliff/.test(f.title)));
  assert.ok(r.findings.some((f) => /repaid in full/.test(f.title)));
});

test("low income gets the below-poverty and Medicaid notes", () => {
  assert.ok(analyze({ magi: 10_000, benchmarkMonthly: 500 }).findings.some((f) => /Below 100%/.test(f.title)));
  assert.ok(analyze({ magi: 20_000, benchmarkMonthly: 500 }).findings.some((f) => /Medicaid/.test(f.title)));
});

test("plan premium after credit is reported when given", () => {
  const r = analyze({ magi: 40_000, benchmarkMonthly: 600, planMonthly: 500 });
  assert.ok(r.findings.some((f) => /Your plan after the credit/.test(f.title)));
});

test("scenario table is sorted, includes the user's income and both sides of the cliff", () => {
  const t = scenarioTable({ magi: 70_000, benchmarkMonthly: 700 });
  const incomes = t.map((r) => r.income);
  assert.deepEqual(incomes, [...incomes].sort((a, b) => a - b));
  assert.ok(incomes.includes(70_000) && incomes.includes(62_600) && incomes.includes(62_601));
  assert.equal(t.find((r) => r.income === 62_601).credit, 0);
});

test("money formats", () => {
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(-5), "-$5");
});
