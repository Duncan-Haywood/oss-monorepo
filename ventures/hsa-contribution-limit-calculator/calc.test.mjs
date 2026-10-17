import { test } from "node:test";
import assert from "node:assert/strict";
import { hdhpQualifies, contributionLimitOutcome, money, LIMITS_2026, CATCH_UP_55_PLUS } from "./calc.mjs";

test("LIMITS_2026 and CATCH_UP_55_PLUS are the documented 2026 figures", () => {
  assert.equal(LIMITS_2026.self.annual, 4_400);
  assert.equal(LIMITS_2026.family.annual, 8_750);
  assert.equal(LIMITS_2026.self.hdhpMinDeductible, 1_700);
  assert.equal(LIMITS_2026.family.hdhpMinDeductible, 3_400);
  assert.equal(LIMITS_2026.self.hdhpMaxOutOfPocket, 8_500);
  assert.equal(LIMITS_2026.family.hdhpMaxOutOfPocket, 17_000);
  assert.equal(CATCH_UP_55_PLUS, 1_000);
});

test("hdhpQualifies passes a plan that meets both bounds", () => {
  const result = hdhpQualifies({ coverage: "self", deductible: 2_000, outOfPocketMax: 7_000 });
  assert.equal(result.qualifies, true);
  assert.equal(result.deductibleOk, true);
  assert.equal(result.outOfPocketOk, true);
});

test("hdhpQualifies fails a plan whose deductible is too low", () => {
  const result = hdhpQualifies({ coverage: "self", deductible: 1_000, outOfPocketMax: 7_000 });
  assert.equal(result.qualifies, false);
  assert.equal(result.deductibleOk, false);
});

test("hdhpQualifies fails a plan whose out-of-pocket max is too high", () => {
  const result = hdhpQualifies({ coverage: "family", deductible: 4_000, outOfPocketMax: 20_000 });
  assert.equal(result.qualifies, false);
  assert.equal(result.outOfPocketOk, false);
});

test("hdhpQualifies at exactly the boundary values passes (inclusive)", () => {
  const result = hdhpQualifies({ coverage: "self", deductible: 1_700, outOfPocketMax: 8_500 });
  assert.equal(result.qualifies, true);
});

test("full-year self-only coverage gets the full annual limit", () => {
  const result = contributionLimitOutcome({ coverage: "self", eligibleMonths: 12, age55Plus: false });
  assert.equal(result.fullYear, true);
  assert.equal(result.totalLimit, 4_400);
});

test("full-year family coverage with catch-up adds the fixed $1,000", () => {
  const result = contributionLimitOutcome({ coverage: "family", eligibleMonths: 12, age55Plus: true });
  assert.equal(result.totalLimit, 8_750 + 1_000);
});

test("6 months of self-only eligibility prorates to half the annual limit", () => {
  const result = contributionLimitOutcome({ coverage: "self", eligibleMonths: 6, age55Plus: false });
  assert.equal(result.fullYear, false);
  assert.equal(result.baseLimit, 2_200);
  assert.equal(result.totalLimit, 2_200);
});

test("proration also applies to the catch-up contribution", () => {
  const result = contributionLimitOutcome({ coverage: "self", eligibleMonths: 6, age55Plus: true });
  assert.equal(result.catchUpLimit, 500);
  assert.equal(result.totalLimit, 2_200 + 500);
});

test("the last-month rule gives the full limit despite partial-year eligibility", () => {
  const result = contributionLimitOutcome({
    coverage: "family",
    eligibleMonths: 1,
    age55Plus: false,
    useLastMonthRule: true,
  });
  assert.equal(result.useLastMonthRule, true);
  assert.equal(result.totalLimit, 8_750);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /testing period/i);
});

test("the last-month rule with catch-up gives the full base plus full catch-up", () => {
  const result = contributionLimitOutcome({
    coverage: "self",
    eligibleMonths: 3,
    age55Plus: true,
    useLastMonthRule: true,
  });
  assert.equal(result.totalLimit, 4_400 + 1_000);
});

test("zero eligible months yields zero limit and a high-severity finding", () => {
  const result = contributionLimitOutcome({ coverage: "self", eligibleMonths: 0 });
  assert.equal(result.totalLimit, 0);
  const severities = result.findings.map((f) => f.severity);
  assert.ok(severities.includes("high"));
});

test("requesting the last-month rule with zero months does not apply it", () => {
  const result = contributionLimitOutcome({ coverage: "self", eligibleMonths: 0, useLastMonthRule: true });
  assert.equal(result.useLastMonthRule, false);
});

test("months are clamped to the 0-12 range", () => {
  const over = contributionLimitOutcome({ coverage: "self", eligibleMonths: 15 });
  assert.equal(over.months, 12);
  const under = contributionLimitOutcome({ coverage: "self", eligibleMonths: -3 });
  assert.equal(under.months, 0);
});

test("every outcome includes the not-a-full-eligibility-determination caveat", () => {
  const result = contributionLimitOutcome({ coverage: "self", eligibleMonths: 12 });
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /not a full eligibility determination/i);
});

test("money() formats cents and negative sign correctly", () => {
  assert.equal(money(4400), "$4,400.00");
  assert.equal(money(0), "$0.00");
});
