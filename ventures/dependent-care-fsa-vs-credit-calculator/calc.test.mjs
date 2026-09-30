import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, creditRate, savings, parseInput, reportCsv, sampleInput, parseNum, money } from "./calc.mjs";

const base = { status: "joint", children: "2", expenses: "10000", agi: "120000", fedRate: "22", stateRate: "0", ficaRate: "7.65", earned: "", taxBefore: "" };

test("credit rate steps: 50% at $15k, 35% by $45k, 20% floor", () => {
  assert.equal(creditRate(15000, false), 0.5);
  assert.equal(creditRate(15001, false), 0.49);
  assert.equal(creditRate(45000, false), 0.35);
  assert.equal(creditRate(75000, false), 0.35);
  assert.equal(creditRate(75001, false), 0.34);
  assert.equal(creditRate(105000, false), 0.2);
  assert.equal(creditRate(500000, false), 0.2);
});

test("joint filers start the second phase at $150k", () => {
  assert.equal(creditRate(150000, true), 0.35);
  assert.equal(creditRate(160000, true), 0.30);
  assert.equal(creditRate(210000, true), 0.2);
});

test("savings: FSA exclusion reduces the credit cap dollar for dollar", () => {
  const p = parseInput(base);
  const s = savings(p, 4000);
  assert.equal(s.qualified, 2000);
  assert.ok(Math.abs(s.fsaSaved - 4000 * 0.2965) < 1e-6);
  const none = savings(p, 0);
  assert.equal(none.qualified, 6000);
  assert.ok(Math.abs(none.credit - 6000 * creditRate(120000, true)) < 1e-6);
});

test("a mid-income household prefers the FSA at its marginal rate", () => {
  const a = analyze(base);
  assert.equal(a.best.fsa, 7500);
  assert.ok(a.best.total > a.creditOnly.total);
});

test("a low-income household prefers the credit", () => {
  const a = analyze({ ...base, agi: "30000", fedRate: "10", ficaRate: "7.65", expenses: "6000" });
  // FSA saves ~17.65c/dollar; credit at ~42% on the first $6,000 is better.
  assert.equal(a.best.fsa, 0);
  assert.match(a.findings[0].title, /credit beats/);
});

test("earned income of the lower earner caps both", () => {
  const a = analyze({ ...base, earned: "4000" });
  assert.equal(a.eligible, 4000);
  assert.equal(a.fsaMax, 4000);
  assert.ok(a.findings.some((f) => /Lower earner/.test(f.title)));
});

test("credit is limited by tax before credits", () => {
  const a = analyze({ ...base, agi: "30000", fedRate: "10", expenses: "6000", taxBefore: "500" });
  assert.equal(a.best.credit <= 500, true);
  assert.equal(a.creditOnly.creditLimited, true);
});

test("best split is never worse than the two extremes", () => {
  for (const agi of ["20000", "60000", "100000", "180000", "400000"]) {
    for (const fed of ["10", "22", "32", "37"]) {
      const a = analyze({ ...base, agi, fedRate: fed, expenses: "9000" });
      assert.ok(a.best.total + 1e-9 >= a.creditOnly.total);
      assert.ok(a.best.total + 1e-9 >= a.fsaMaxed.total);
    }
  }
});

test("validation", () => {
  assert.match(analyze({ ...base, expenses: "" }).error, /care expenses/);
  assert.match(analyze({ ...base, agi: "abc" }).error, /AGI/);
  assert.match(analyze({ ...base, children: "0" }).error, /qualifying/);
  assert.match(analyze({ ...base, fedRate: "99" }).error, /too high/);
  assert.match(analyze({ ...base, expenses: "-5" }).error, /negative/);
});

test("sample, csv and helpers", () => {
  const a = analyze(sampleInput());
  assert.ok(!a.error);
  const out = reportCsv(a);
  assert.equal(out.trim().split("\n").length, 4);
  assert.equal(parseNum("$1,200"), 1200);
  assert.equal(parseNum(""), null);
  assert.equal(money(1234.5), "1,235");
});
