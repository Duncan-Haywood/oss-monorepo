import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, salaryForBudget, employerNic, pension, SAMPLE, VERIFY } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("2025/26 employer NIC is 15% above 5,000", () => {
  const r = run({ salary: 35000 });
  assert.equal(r.nicGross, 4500);
});

test("2024/25 employer NIC is 13.8% above 9,100", () => {
  assert.equal(run({ year: "2024", salary: 35000 }).nicGross, 3574.2);
});

test("the April 2025 change on a 35,000 salary is +925.80", () => {
  assert.equal(run({ salary: 35000 }).nicChange, 925.8);
});

test("pension on qualifying earnings: 3% of 35,000 - 6,240", () => {
  assert.equal(run({ salary: 35000, pensionPct: 3 }).pension, 862.8);
  assert.equal(pension(100000, 3, "qualifying"), (50270 - 6240) * 0.03);
  assert.equal(pension(35000, 3, "full"), 1050);
});

test("below the NIC threshold there is no employer NIC", () => {
  assert.equal(run({ salary: 4000 }).nicGross, 0);
});

test("Employment Allowance reduces the bill, not below zero", () => {
  const r = run({ salary: 35000, allowanceLeft: 3000 });
  assert.equal(r.allowanceUsed, 3000);
  assert.equal(r.nic, 1500);
  assert.equal(run({ salary: 35000, allowanceLeft: 10500 }).nic, 0);
});

test("under-21 and apprentices pay NIC only above 50,270", () => {
  assert.equal(employerNic(40000, { rate: 0.15, threshold: 5000 }, "under21"), 0);
  assert.equal(employerNic(60000, { rate: 0.15, threshold: 5000 }, "apprentice"), (60000 - 50270) * 0.15);
});

test("running cost adds salary, NIC, pension and extras; year one adds recruitment", () => {
  const r = run({});
  assert.equal(r.running, r2(35000 + 4500 + 862.8 + 1500 + 500));
  assert.equal(r.firstYear, r.running + 3000);
  assert.equal(r.monthly, r2(r.running / 12));
});
const r2 = (n) => Math.round(n * 100) / 100;

test("budget round-trips: the salary found costs the budget", () => {
  const b = salaryForBudget({ ...SAMPLE, budget: 50000 });
  const r = compute({ ...SAMPLE, salary: b.salary });
  assert.ok(Math.abs(r.running - 50000) < 0.05, String(r.running));
});

test("a budget below the extras buys no salary", () => {
  assert.equal(salaryForBudget({ ...SAMPLE, budget: 1000 }).salary, 0);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(run({ salary: "" }).errors.length);
  assert.ok(run({ salary: -5 }).errors.length);
  assert.ok(run({ year: "1999" }).errors.length);
  assert.ok(run({ pensionPct: 120 }).errors.length);
});

test("pension under 3% and no pension are flagged", () => {
  assert.ok(run({ pensionPct: 1 }).findings.some((f) => /below the 3%/.test(f.title)));
  assert.ok(run({ pensionPct: 0 }).findings.some((f) => /No employer pension/.test(f.title)));
});

test("sources are named", () => assert.match(VERIFY, /gov\.uk/));
