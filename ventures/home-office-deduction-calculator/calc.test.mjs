import { test } from "node:test";
import assert from "node:assert/strict";
import { homeOfficeOutcome, scheduleCTaxValue, SIMPLIFIED_MAX } from "./calc.mjs";

const base = {
  homeSqFt: 2000, officeSqFt: 200, monthsUsed: 12, grossIncome: 80000, otherExpenses: 30000,
  owns: true, mortgageInterest: 12000, propertyTax: 4000, insurance: 1800, utilities: 4800,
  repairs: 1000, homeBasis: 350000, landValue: 70000,
};

test("simplified is $5/sq ft", () => {
  assert.equal(homeOfficeOutcome(base).simplified, 1000);
});

test("simplified caps at 300 sq ft / $1,500", () => {
  const r = homeOfficeOutcome({ ...base, officeSqFt: 500 });
  assert.equal(r.simplified, SIMPLIFIED_MAX);
});

test("simplified prorates part-year use by average monthly footage", () => {
  assert.equal(homeOfficeOutcome({ ...base, monthsUsed: 6 }).simplified, 500);
});

test("regular: tier-1 interest+tax, operating, depreciation at 2.564%", () => {
  const r = homeOfficeOutcome(base);
  assert.equal(r.businessPct, 0.1);
  assert.equal(r.regularParts.mortgageInterestAndTaxes, 1600);
  assert.equal(r.regularParts.operating, 760);
  assert.equal(r.regularParts.depreciationBasis, 28000);
  assert.equal(r.regularParts.depreciation, 717.92);
  assert.equal(r.regular, 3077.92);
});

test("first-year depreciation uses the month table and prorates months", () => {
  const r = homeOfficeOutcome({ ...base, firstYearMonth: 7 });
  assert.equal(r.monthsUsed, 6);
  assert.equal(r.regularParts.depreciationRate, 0.01177);
  assert.equal(r.regularParts.mortgageInterestAndTaxes, 800);
});

test("gross income limit: interest/taxes always allowed, operating then depreciation limited in order", () => {
  const r = homeOfficeOutcome({ ...base, grossIncome: 32000 }); // gap 2,000
  assert.equal(r.grossIncomeLimit, 2000);
  assert.equal(r.regularParts.mortgageInterestAndTaxes, 1600);
  assert.equal(r.regularParts.operating, 400);
  assert.equal(r.regularParts.depreciation, 0);
  assert.equal(r.carryForward.operating, 360);
  assert.equal(r.carryForward.depreciation, 717.92);
  assert.equal(r.simplified, 1000);
});

test("simplified is limited by gross income and does not carry over", () => {
  const r = homeOfficeOutcome({ ...base, grossIncome: 30300 });
  assert.equal(r.simplified, 300);
});

test("renter uses rent as an operating expense, no depreciation", () => {
  const r = homeOfficeOutcome({ homeSqFt: 1000, officeSqFt: 100, grossIncome: 50000, owns: false, rent: 24000, utilities: 1200 });
  assert.equal(r.regularParts.operating, 2520);
  assert.equal(r.regularParts.depreciation, 0);
  assert.equal(r.regular, 2520);
});

test("prior-year carryover is used under regular and left untouched by simplified", () => {
  const r = homeOfficeOutcome({ ...base, carryoverOperating: 500 });
  assert.equal(r.regularParts.operating, 1260);
  assert.equal(r.simplified, 1000);
});

test("direct expenses are 100% deductible and not prorated", () => {
  const r = homeOfficeOutcome({ ...base, mortgageInterest: 0, propertyTax: 0, insurance: 0, utilities: 0, repairs: 0, directExpenses: 300, homeBasis: 0 });
  assert.equal(r.regularParts.operating, 300);
});

test("itemizer nets out the Schedule A amount from the regular tax value", () => {
  const a = homeOfficeOutcome({ ...base, marginalRate: 0.24, includeSelfEmploymentTax: false });
  const b = homeOfficeOutcome({ ...base, marginalRate: 0.24, includeSelfEmploymentTax: false, itemizes: true });
  assert.equal(Math.round((a.regularTaxValue - b.regularTaxValue) * 100) / 100, 384);
});

test("SE tax adds value and recommends the higher-value method", () => {
  assert.ok(scheduleCTaxValue(1000, 0.24, true) > scheduleCTaxValue(1000, 0.24, false));
  const r = homeOfficeOutcome({ ...base, marginalRate: 0.22 });
  assert.equal(r.better, "regular");
  const small = homeOfficeOutcome({ homeSqFt: 1000, officeSqFt: 100, grossIncome: 50000, owns: false, rent: 0, marginalRate: 0.22 });
  assert.equal(small.better, "simplified");
});

test("empty input is safe and flagged", () => {
  const r = homeOfficeOutcome({});
  assert.equal(r.invalid, true);
  assert.equal(r.simplified, 0);
  assert.equal(r.regular, 0);
});

test("findings always include the self-employed-only warning", () => {
  assert.ok(homeOfficeOutcome(base).findings.some((f) => /Self-employed only/.test(f.title)));
});
