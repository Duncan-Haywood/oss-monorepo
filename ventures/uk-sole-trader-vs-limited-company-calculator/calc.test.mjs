import { test } from "node:test";
import assert from "node:assert/strict";
import { incomeTax, dividendTax, class4, employeeNi, employerNi, corporationTax, personalAllowance, soleTrader, limitedCompany, bestSalary, compare, summaryText, SAMPLE } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("sole trader at 50,000 profit matches a hand calculation", () => {
  const r = soleTrader(50000);
  near(r.incomeTax, 7486);           // (50,000 - 12,570) * 20%
  near(r.class4, 2245.8);            // (50,000 - 12,570) * 6%
  near(r.takeHome, 40268.2);
});

test("personal allowance tapers from 100,000 and is gone at 125,140", () => {
  assert.equal(personalAllowance(100000), 12570);
  assert.equal(personalAllowance(110000), 7570);
  assert.equal(personalAllowance(125140), 0);
  assert.equal(personalAllowance(200000), 0);
});

test("income tax crosses the higher and additional bands", () => {
  near(incomeTax(12570), 0);
  near(incomeTax(50270), 7540);
  near(incomeTax(150000), 37700 * 0.2 + (125140 - 37700) * 0.4 + (150000 - 125140) * 0.45);
});

test("class 4 is 6% up to 50,270 and 2% above", () => {
  near(class4(12570), 0);
  near(class4(50270), 2262);
  near(class4(60270), 2262 + 200);
});

test("employee and employer NI thresholds", () => {
  near(employeeNi(12570), 0);
  near(employeeNi(20000), (20000 - 12570) * 0.08);
  near(employerNi(5000, false), 0);
  near(employerNi(12570, false), 7570 * 0.15);
  near(employerNi(12570, true), 0);
  near(employerNi(100000, true), 95000 * 0.15 - 10500);
});

test("corporation tax: 19% small, 25% main, marginal relief between", () => {
  near(corporationTax(40000), 7600);
  near(corporationTax(300000), 75000);
  near(corporationTax(250000), 62500);
  near(corporationTax(50000), 9500);
  // continuous across the band at 50,000 and 250,000
  near(corporationTax(50000.01), 9500, 0.05);
  near(corporationTax(249999.99), 62500, 0.05);
});

test("dividends inside the basic band pay 10.75% after the 500 allowance", () => {
  near(dividendTax(12570, 36526.55), (36526.55 - 500) * 0.1075);
  near(dividendTax(12570, 500), 0);
  near(dividendTax(0, 12570 + 500), 0);
});

test("dividends above the higher-rate line pay 35.75%", () => {
  // salary 12,570 uses the allowance; 37,700 of dividends is basic, the rest higher
  const t = dividendTax(12570, 60000);
  const expected = (37700 - 500) * 0.1075 + (60000 - 37700) * 0.3575;
  near(t, expected);
});

test("limited company figures add up", () => {
  const c = limitedCompany(60000, 12570, 1200, false);
  near(c.employerNi, 1135.5);
  near(c.corporationTax, (60000 - 1200 - 12570 - 1135.5) * 0.19 > 0 ? corporationTax(60000 - 1200 - 12570 - 1135.5) : 0);
  near(c.salary + c.dividends + c.corporationTax + c.employerNi + c.costs, 60000, 0.02);
  near(c.takeHome, 45223.69);
});

test("best salary beats both common fixed choices and keeps the NI year", () => {
  const best = bestSalary(60000, 1200, false, true);
  for (const s of [6500, 5000, 12570]) assert.ok(best.takeHome >= limitedCompany(60000, s, 1200, false).takeHome - 0.01, String(s));
  assert.ok(best.salary >= 6500);
});

test("retention does not change the chosen salary and is not counted as take-home", () => {
  const a = bestSalary(60000, 1200, false, true, 0);
  const b = bestSalary(60000, 1200, false, true, 10000);
  assert.equal(a.salary, b.salary);
  near(b.retained, 10000);
  assert.ok(b.takeHome < a.takeHome);
});

test("compare returns the table, findings and a summary", () => {
  const r = compare(SAMPLE);
  assert.equal(r.ok, true);
  assert.ok(r.table.some((t) => t.current && t.profit === 60000));
  assert.ok(r.findings.length >= 3);
  assert.match(summaryText(SAMPLE, r), /Not tax advice/);
});

test("MTD finding appears over 50,000 only", () => {
  assert.ok(compare({ ...SAMPLE, profit: "60000" }).findings.some((f) => /Making Tax Digital for Income Tax applies/.test(f.title)));
  assert.ok(!compare({ ...SAMPLE, profit: "30000" }).findings.some((f) => /applies/.test(f.title)));
});

test("bad input is rejected with a message", () => {
  assert.equal(compare({ ...SAMPLE, profit: "" }).ok, false);
  assert.equal(compare({ ...SAMPLE, profit: "-5" }).ok, false);
  assert.equal(compare({ ...SAMPLE, costs: "-1" }).ok, false);
  assert.equal(compare({ ...SAMPLE, retain: "-1" }).ok, false);
  assert.equal(compare({ ...SAMPLE, salaryMode: "custom", salary: "999999" }).ok, false);
  assert.equal(compare({ ...SAMPLE, profit: "abc" }).ok, false);
});

test("custom salary is respected", () => {
  const r = compare({ ...SAMPLE, salaryMode: "custom", salary: "5000" });
  assert.equal(r.lc.salary, 5000);
});

test("low profit still computes", () => {
  const r = compare({ ...SAMPLE, profit: "3000", costs: "1200" });
  assert.equal(r.ok, true);
  assert.ok(Number.isFinite(r.lc.takeHome));
});
