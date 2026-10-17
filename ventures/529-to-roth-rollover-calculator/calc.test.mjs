import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, num, toCsv } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const base = { ...DEFAULTS, contrib0: 0, contrib1: 0, contrib2: 0, contrib3: 0, contrib4: 0, growthPct: 0, limitGrowthPct: 0, accountAgeYears: 15 };

test("a mature account with no recent money rolls the annual limit each year up to the $35,000 cap", () => {
  const a = analyze({ ...base, balance: 60000, earnedIncome: 50000 });
  near(a.result.total, 35000);
  assert.equal(a.result.firstYearOffset, 0);
  assert.equal(a.schedule[0].roll, 7500);
  assert.equal(a.schedule[4].roll, 5000); // 4 x 7500 = 30000 -> 5000 left
  assert.equal(a.result.yearsToFinish, 5);
});

test("account younger than 15 years waits", () => {
  const a = analyze({ ...base, accountAgeYears: 12, balance: 60000, earnedIncome: 50000 });
  assert.equal(a.result.firstYearOffset, 3);
  assert.equal(a.schedule[0].roll, 0);
});

test("earned income caps the rollover", () => {
  const a = analyze({ ...base, balance: 60000, earnedIncome: 4000 });
  assert.equal(a.schedule[0].roll, 4000);
  assert.equal(a.schedule[0].binding, "earned income");
});

test("other IRA contributions use up the annual limit", () => {
  const a = analyze({ ...base, balance: 60000, earnedIncome: 50000, otherIraContrib: 7000 });
  assert.equal(a.schedule[0].roll, 500);
});

test("recent contributions stay locked until five years old", () => {
  const a = analyze({ ...base, balance: 10000, contrib0: 6000, earnedIncome: 50000 });
  assert.equal(a.schedule[0].roll, 4000); // only the old part is eligible
  assert.equal(a.schedule[0].binding, "eligible balance");
  assert.equal(a.schedule[4].roll, 0);
  assert.equal(a.schedule[5].roll, 6000); // the contribution is five years old in year 5
  near(a.result.total, 10000);
});

test("growth on locked contributions stays locked", () => {
  const a = analyze({ ...base, balance: 10000, contrib0: 5000, growthPct: 10, earnedIncome: 50000 });
  near(a.result.lockedNow, 5000);
  assert.equal(a.schedule[5].roll, 7500); // 5000 * 1.1^5 = 8052 unlocked, capped by the annual limit
  assert.ok(a.schedule[5].eligibleAfter > 500);
});

test("lifetime cap is respected even with a big balance", () => {
  const a = analyze({ ...base, balance: 500000, earnedIncome: 90000, annualLimit: 20000 });
  near(a.result.total, 35000);
  near(a.result.capUsedPct, 1);
});

test("alternative nonqualified withdrawal costs tax plus 10% on the earnings share", () => {
  const a = analyze({ ...base, balance: 60000, basis: 30000, earnedIncome: 50000, withdrawalTaxPct: 22 });
  near(a.result.altTaxAndPenalty, 35000 * 0.5 * 0.32);
});

test("a rolled dollar grows tax-free to retirement", () => {
  const a = analyze({ ...base, balance: 7500, earnedIncome: 50000, beneficiaryAge: 25, retireAge: 65, rothGrowthPct: 7 });
  near(a.result.rothValueAtRetirement, 7500 * 1.07 ** 40, 0.5);
});

test("bad input returns warnings and no result", () => {
  const a = analyze({ ...DEFAULTS, retireAge: 10 });
  assert.equal(a.result, null);
  assert.ok(a.warnings.length);
  assert.equal(analyze({ ...DEFAULTS, balance: -1 }).result, null);
});

test("num parses currency strings and rejects blanks", () => {
  assert.equal(num("$1,200.50"), 1200.5);
  assert.ok(Number.isNaN(num("")));
});

test("csv lists only years with a rollover", () => {
  const lines = toCsv(analyze({ ...base, balance: 60000, earnedIncome: 50000 })).trim().split("\n");
  assert.equal(lines[0], "year_from_now,rollover_usd,limiting_factor,eligible_balance_after_usd");
  assert.equal(lines.length, 6);
});
