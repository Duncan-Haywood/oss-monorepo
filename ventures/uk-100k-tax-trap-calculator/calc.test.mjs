import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, incomeTax, employeeNI, personalAllowance, hicbc, marginalRate, marginalTable } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const near = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) <= d, `${a} vs ${b}`);

test("personal allowance tapers 1 for every 2 over 100,000 and is gone at 125,140", () => {
  assert.equal(personalAllowance(100000), 12570);
  assert.equal(personalAllowance(110000), 7570);
  assert.equal(personalAllowance(125140), 0);
  assert.equal(personalAllowance(200000), 0);
});

test("income tax at known points", () => {
  near(incomeTax(50270), 7540);
  near(incomeTax(100000), 27432);
  near(incomeTax(110000), 33432);
  near(incomeTax(125140), 42516 + 0); // 7540 + (125140-37700)*0.4
});

test("employee NI: 8% to the upper limit then 2%", () => {
  near(employeeNI(50270), 3016);
  near(employeeNI(110000), 3016 + 1194.6);
  assert.equal(employeeNI(10000), 0);
});

test("marginal rate inside the trap is 62% with NI", () => {
  near(marginalRate(110000), 0.62, 0.0001);
  near(marginalRate(90000), 0.42, 0.0001);
  near(marginalRate(130000), 0.47, 0.0001);
});

test("10,000 salary sacrifice at 110,000 costs 3,800", () => {
  const r = run({ contribution: 10000 });
  near(r.testCost, 3800);
  assert.equal(r.test.income, 100000);
  assert.equal(r.toEdge, 10000);
  near(r.edgeCost, 3800);
  assert.equal(r.edgeChildcare, 2000);
  assert.equal(r.childcareRegained, 2000);
});

test("personal contribution gets tax relief but no NI saving", () => {
  const r = run({ method: "personal", contribution: 10000 });
  near(r.testCost, 4000); // 60% relief only
});

test("under 100,000 there is no trap and no pension target", () => {
  const r = run({ salary: 60000, contribution: 0 });
  assert.equal(r.toEdge, 0);
  assert.equal(r.inTrap, false);
  assert.match(r.findings[0].title, /not in the trap/);
});

test("above 125,140 the allowance is gone and relief is higher on the first slice", () => {
  const r = run({ salary: 150000, contribution: 0 });
  assert.match(r.findings[0].title, /already gone/);
  assert.equal(r.toEdge, 50000);
});

test("Child Benefit charge scales with whole percents", () => {
  assert.equal(hicbc(59999, 2000), 0);
  assert.equal(hicbc(70000, 2000), 1000);
  assert.equal(hicbc(80000, 2000), 2000);
  assert.equal(hicbc(120000, 2000), 2000);
});

test("annual allowance warning and contribution above pay rejected", () => {
  assert.match(run({ salary: 200000, contribution: 70000 }).findings.map((f) => f.title).join(" "), /annual allowance/);
  assert.ok(parse({ ...SAMPLE, contribution: 200000 }).errors.length);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(parse({ ...SAMPLE, salary: "" }).errors.length);
  assert.ok(parse({ ...SAMPLE, salary: -1 }).errors.length);
  assert.ok(parse({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(parse({ ...SAMPLE, method: "x" }).errors.length);
  assert.ok(compute({}).errors.length > 0);
});

test("marginal table peaks in the trap", () => {
  const t = marginalTable();
  const peak = t.reduce((a, b) => (b.rate > a.rate ? b : a));
  assert.ok(peak.salary >= 100000 && peak.salary < 125140);
});

test("summary names the source and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
