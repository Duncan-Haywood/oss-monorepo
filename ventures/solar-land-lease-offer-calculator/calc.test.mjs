import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, sensitivity, sampleInput, toCsv, money } from "./calc.mjs";

test("hand-checked: 1 acre, no option, 2-year term, no escalator, 0% discount", () => {
  const r = analyze({ acres: 1, rentPerAcre: 1000, escalatorPct: 0, termYears: 2, optionYears: 0, altCashRent: 300, altGrowthPct: 0, discountPct: 0, extraTaxPerAcre: 0 });
  assert.equal(r.npvLease, 2000);
  assert.equal(r.npvAlt, 600);
  assert.equal(r.npvGain, 1400);
  assert.equal(r.breakEvenRent, 300);
});

test("escalator and discounting follow the formula", () => {
  const r = analyze({ acres: 1, rentPerAcre: 100, escalatorPct: 10, termYears: 2, optionYears: 0, altCashRent: 0, altGrowthPct: 0, discountPct: 10, extraTaxPerAcre: 0 });
  assert.equal(r.npvLease, r2(100 / 1.1 + 110 / 1.21));
  assert.equal(r.lastYearRent, 110);
});
const r2 = (x) => Math.round(x * 100) / 100;

test("option period pays option money plus the farm income if farming continues", () => {
  const farm = analyze({ acres: 1, rentPerAcre: 0, termYears: 1, optionYears: 2, optionPerAcre: 50, farmDuringOption: 1, altCashRent: 200, altGrowthPct: 0, discountPct: 0, escalatorPct: 0, extraTaxPerAcre: 0 });
  assert.equal(farm.npvLease, 50 + 200 + 50 + 200 + 0);
  const noFarm = analyze({ acres: 1, rentPerAcre: 0, termYears: 1, optionYears: 2, optionPerAcre: 50, farmDuringOption: 0, altCashRent: 200, altGrowthPct: 0, discountPct: 0, escalatorPct: 0, extraTaxPerAcre: 0 });
  assert.equal(noFarm.npvLease, 100);
});

test("signing bonus adds and rollback tax subtracts at year 0", () => {
  const base = { acres: 10, rentPerAcre: 0, termYears: 1, optionYears: 0, altCashRent: 0, discountPct: 8, escalatorPct: 0, extraTaxPerAcre: 0 };
  assert.equal(analyze({ ...base, signingBonusPerAcre: 100 }).npvLease, 1000);
  assert.equal(analyze({ ...base, rollbackPerAcre: 40 }).npvLease, -400);
});

test("extra property tax lowers the net rent", () => {
  const a = analyze({ acres: 1, rentPerAcre: 500, termYears: 1, optionYears: 0, altCashRent: 0, discountPct: 0, escalatorPct: 0, extraTaxPerAcre: 0 });
  const b = analyze({ acres: 1, rentPerAcre: 500, termYears: 1, optionYears: 0, altCashRent: 0, discountPct: 0, escalatorPct: 0, extraTaxPerAcre: 25 });
  assert.equal(a.npvLease - b.npvLease, 25);
});

test("break-even rent makes the gain zero", () => {
  const r = analyze(sampleInput());
  const again = analyze({ ...sampleInput(), rentPerAcre: r.breakEvenRent });
  assert.ok(Math.abs(again.npvGain) < 50, String(again.npvGain));
});

test("break-even escalator is found when the offer is short", () => {
  const r = analyze({ ...sampleInput(), rentPerAcre: 200, escalatorPct: 0 });
  assert.equal(r.offerBeatsAlternative, false);
  assert.ok(r.breakEvenEscalatorPct > 0);
  const fix = analyze({ ...sampleInput(), rentPerAcre: 200, escalatorPct: r.breakEvenEscalatorPct + 0.01 });
  assert.ok(fix.npvGain >= -1);
});

test("flat rent below the alternative's growth warns about erosion", () => {
  const r = analyze({ ...sampleInput(), escalatorPct: 0 });
  assert.ok(r.advice.some((a) => /buys less each year/.test(a)));
  assert.ok(r.lastRentRealPerAcre < r.inputs.rentPerAcre);
});

test("project size and rent share", () => {
  const r = analyze({ acres: 70, acresPerMw: 7, rentPerAcre: 700, capacityFactorPct: 20, powerPricePerMwh: 50 });
  assert.equal(r.projectMw, 10);
  assert.equal(r.rentPerMwYear, 4900);
  assert.equal(r.revenuePerAcre, r2(8760 * 0.2 * 50 / 7));
});

test("validation", () => {
  for (const bad of [{ acres: 0 }, { rentPerAcre: -1 }, { termYears: 0 }, { discountPct: 80 }, { escalatorPct: 50 }, { acresPerMw: 0 }, { capacityFactorPct: 0 }, { altCashRent: -5 }])
    assert.ok(analyze(bad).error, JSON.stringify(bad));
});

test("sensitivity grid and csv", () => {
  const g = sensitivity(sampleInput());
  assert.equal(g.length, 5);
  assert.ok(g[4].cells[2].npvGain > g[0].cells[0].npvGain);
  assert.match(toCsv(analyze(sampleInput())), /present value of lease/);
  assert.equal(money(-1234.4), "-$1,234");
});
