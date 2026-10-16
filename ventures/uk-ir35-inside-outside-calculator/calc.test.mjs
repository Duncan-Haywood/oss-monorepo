import { test } from "node:test";
import assert from "node:assert/strict";
import { insideIr35, outsideIr35, breakEvenInvoice, compare, summaryText, SAMPLE, incomeTax, employeeNi, personalAllowance, class4, limitedCompany, bestSalary } from "./calc.mjs";

const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("inside IR35: gross pay plus employer NI on it equals the invoice less the fee", () => {
  const r = insideIr35(110000, 1300);
  near(r.grossPay + r.employerNi, 108700);
  near(r.grossPay, (108700 + 750) / 1.15);
  near(r.takeHome, r.grossPay - employeeNi(r.grossPay) - incomeTax(r.grossPay));
});

test("inside IR35: below the secondary threshold there is no employer NI", () => {
  const r = insideIr35(4000, 0);
  assert.equal(r.employerNi, 0);
  assert.equal(r.grossPay, 4000);
});

test("outside IR35 keeps more than inside at the same rate for a typical contractor", () => {
  const r = compare(SAMPLE);
  assert.ok(r.ok);
  assert.ok(r.diff > 0);
  assert.ok(r.out.takeHome > r.inside.takeHome);
});

test("break-even invoice makes inside take-home match the target", () => {
  const target = 60000;
  const inv = breakEvenInvoice(target, 1300);
  near(insideIr35(inv, 1300).takeHome, target, 0.5);
});

test("break-even day rate is above the outside day rate and rebuilds the outside take-home", () => {
  const r = compare(SAMPLE);
  assert.ok(r.needDayRate > r.dayRate);
  near(insideIr35(r.needDayRate * r.days, r.yearlyFee).takeHome, r.out.takeHome, 5);
});

test("a custom inside rate is used for the inside figure only", () => {
  const r = compare({ ...SAMPLE, insideRate: "600" });
  assert.equal(r.insideRate, 600);
  assert.equal(r.inside.invoice, 600 * 220);
  assert.equal(r.out.invoice, 500 * 220);
});

test("bad input is rejected, not clamped", () => {
  for (const bad of [{ dayRate: "0" }, { dayRate: "-5" }, { dayRate: "abc" }, { daysPerYear: "300" }, { expenses: "-1" }, { umbrellaFeeWeekly: "-1" }, { insideRate: "-2" }]) {
    const r = compare({ ...SAMPLE, ...bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.errors.length > 0);
  }
});

test("table includes the current rate and rises with day rate", () => {
  const r = compare({ ...SAMPLE, dayRate: "450" });
  assert.ok(r.table.some((t) => t.current && t.dayRate === 450));
  for (let i = 1; i < r.table.length; i++) assert.ok(r.table[i].outside >= r.table[i - 1].outside);
});

test("summary names both routes and the break-even rate", () => {
  const r = compare(SAMPLE);
  const s = summaryText(SAMPLE, r);
  assert.match(s, /Outside IR35/);
  assert.match(s, /Inside IR35/);
  assert.match(s, /Not tax advice/);
});

test("personal allowance tapers by 1 for every 2 above 100,000 and never goes negative", () => {
  assert.equal(personalAllowance(100000), 12570);
  assert.equal(personalAllowance(110000), 7570);
  assert.equal(personalAllowance(125140), 0);
  assert.equal(personalAllowance(200000), 0);
});

test("class 4 NI: 6% between the limits, 2% above the upper limit", () => {
  assert.equal(class4(12570), 0);
  assert.ok(Math.abs(class4(50270) - 2262) < 1e-9);
  assert.ok(Math.abs(class4(60270) - 2462) < 1e-9);
});

test("limited company: costs and salary both reduce corporation tax profit", () => {
  const c = limitedCompany(100000, 10000, 2000, false, 0);
  // employer NI 750; CT profit 100000 - 2000 - 10000 - 750 = 87250 at 25% less marginal relief (250000-87250)*3/200
  assert.equal(c.employerNi, 750);
  assert.equal(c.corporationTax, 19371.25);
});

test("bestSalary keeps costs at 0 by default and handles zero profit without a floor", () => {
  assert.equal(bestSalary(100000).costs, 0);
  const z = bestSalary(0, 0, false, false);
  assert.equal(z.salary, 0);
  assert.equal(z.takeHome, 0);
});
