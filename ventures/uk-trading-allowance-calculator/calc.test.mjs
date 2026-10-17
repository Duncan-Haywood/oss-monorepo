import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, incomeTax, class4, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax bands: nil under allowance, 20% basic, 40% higher, taper and 45%", () => {
  assert.equal(incomeTax(12570), 0);
  assert.equal(incomeTax(20000), 1486);
  assert.equal(incomeTax(50270), 7540);
  assert.equal(incomeTax(60000), 11432);
  assert.equal(incomeTax(100000), 27432);
  assert.equal(incomeTax(125140), 42516);
  assert.equal(incomeTax(150000), 53703);
});

test("class 4: 6% between 12,570 and 50,270, 2% above", () => {
  assert.equal(class4(12570), 0);
  assert.equal(class4(20000), 445.8);
  assert.equal(class4(50270), 2262);
  assert.equal(class4(60270), 2462);
});

test("1,000 exactly is within the allowance; 1,001 is not", () => {
  assert.equal(run({ gross: 1000 }).outcome, "exempt");
  assert.equal(run({ gross: 1001 }).outcome, "allowance");
});

test("sample: low expenses make the allowance win, 3,800 profit at 20% tax", () => {
  const r = run({});
  assert.equal(r.outcome, "allowance");
  assert.equal(r.chosen.profit, 3800);
  assert.equal(r.chosen.tax, 760);
  assert.equal(r.alt.profit, 4200);
  assert.ok(r.alt.total > r.chosen.total);
});

test("big expenses make deducting them win", () => {
  const r = run({ gross: 5000, expenses: 3000 });
  assert.equal(r.outcome, "expenses");
  assert.equal(r.chosen.profit, 2000);
});

test("expenses exceeding income give nil profit and a loss note", () => {
  const r = run({ gross: 3000, expenses: 5000 });
  assert.equal(r.outcome, "expenses");
  assert.equal(r.chosen.profit, 0);
  assert.ok(r.findings.some((f) => /carried forward/.test(f.title)));
});

test("tax is the extra tax caused by the side income, using the higher rate on top of a salary", () => {
  const r = run({ gross: 3000, expenses: 0, other: 60000 });
  assert.equal(r.chosen.profit, 2000);
  assert.equal(r.chosen.tax, 800);
});

test("income from an employer or partnership gets no allowance", () => {
  const r = run({ gross: 500, restricted: "yes" });
  assert.equal(r.outcome, "restricted");
  assert.equal(r.alt, null);
});

test("deadlines follow the tax year", () => {
  assert.equal(run({}).deadlines.register, "2026-10-05");
  assert.equal(run({}).deadlines.returnAndPay, "2027-01-31");
  assert.equal(run({ year: 2026 }).deadlines.returnAndPay, "2028-01-31");
});

test("negative, non-numeric and missing input is rejected, not clamped", () => {
  assert.ok(run({ gross: -1 }).errors.length);
  assert.ok(run({ gross: "abc" }).errors.length);
  assert.ok(run({ gross: "" }).errors.length);
  assert.ok(run({ year: 2020 }).errors.length);
  assert.ok(parse({ ...SAMPLE, other: -5 }).errors.length);
});

test("summary names the source to verify and says Scotland is not modelled", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Scotland not modelled/);
  assert.match(t, /Not tax advice/);
});
