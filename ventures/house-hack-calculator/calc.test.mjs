import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, monthlyPayment, fhaAnnualMip, pmiRate, validate, sampleInput, toCsv, usd, FHA_BASE_LIMIT } from "./calc.mjs";

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("monthly payment matches the standard amortisation figure", () => {
  close(monthlyPayment(100000, 6, 30), 599.55, 0.01);
  close(monthlyPayment(120000, 0, 10), 1000, 1e-9);
  assert.equal(monthlyPayment(0, 6, 30), 0);
});

test("FHA annual MIP follows the 30-year schedule", () => {
  assert.deepEqual(fhaAnnualMip(300000, 96.5), { rate: 0.0055, months: 360 });
  assert.deepEqual(fhaAnnualMip(300000, 92), { rate: 0.005, months: 360 });
  assert.deepEqual(fhaAnnualMip(300000, 88), { rate: 0.005, months: 132 });
  assert.deepEqual(fhaAnnualMip(FHA_BASE_LIMIT + 1, 96.5), { rate: 0.0075, months: 360 });
});

test("PMI falls as loan-to-value falls and is zero at 80%", () => {
  assert.ok(pmiRate(97) > pmiRate(92));
  assert.ok(pmiRate(92) > pmiRate(87));
  assert.equal(pmiRate(80), 0);
});

test("validation rejects bad input with a message", () => {
  const s = sampleInput();
  assert.match(plan({ ...s, price: "" }).error, /purchase price/);
  assert.match(plan({ ...s, units: 1 }).error, /2, 3 or 4/);
  assert.match(plan({ ...s, downPct: 2 }).error, /at least 3.5%/);
  assert.match(plan({ ...s, termYears: 7 }).error, /term/);
  assert.match(plan({ ...s, holdYears: 40 }).error, /1 to 30/);
  assert.match(plan({ ...s, vacancyPct: 120 }).error, /Vacancy/);
  assert.match(plan({ ...s, otherRents: -5 }).error, /negative/);
});

test("FHA loan adds the 1.75% upfront premium and cash to close excludes it", () => {
  const r = plan(sampleInput());
  close(r.upfrontMip, 400000 * 0.965 * 0.0175, 0.01);
  close(r.loan.loan, 400000 * 0.965 * 1.0175, 0.01);
  close(r.cashToClose, 400000 * 0.035 + 400000 * 0.03, 0.01);
});

test("month one: costs, rent and net housing cost reconcile", () => {
  const r = plan({ ...sampleInput(), vacancyPct: 0, utilitiesMo: 0, maintPct: 0, insuranceYr: 0, taxPct: 0 });
  close(r.month1.total, r.loan.pi + r.month1.costs.mi, 0.01);
  close(r.livingMonth1, r.month1.total - 3100, 0.01);
  close(r.month1.costs.mi, (400000 * 0.965 * 1.0175 * 0.0055) / 12, 0.01);
});

test("vacancy reduces collected rent and management is a share of what is collected", () => {
  const r = plan({ ...sampleInput(), vacancyPct: 10, mgmtPct: 8 });
  close(r.month1.effectiveRent, 3100 * 0.9, 1e-9);
  close(r.month1.costs.management, 3100 * 0.9 * 0.08, 1e-9);
});

test("rent needed to live free makes the first-year net cost zero", () => {
  const s = sampleInput();
  const r = plan(s);
  const again = plan({ ...s, otherRents: r.neededGross });
  close(again.livingMonth1, 0, 0.01);
  const withMgmt = plan({ ...s, mgmtPct: 8 });
  close(plan({ ...s, mgmtPct: 8, otherRents: withMgmt.neededGross }).livingMonth1, 0, 0.01);
});

test("live-free price makes the first-year net cost zero and is below the entered price when it costs money to live there", () => {
  const s = sampleInput();
  const r = plan(s);
  assert.ok(r.livingMonth1 > 0 && r.liveFreePrice < s.price);
  close(plan({ ...s, price: r.liveFreePrice }).livingMonth1, 0, 1);
});

test("FHA self-sufficiency test applies to 3-4 units only and uses 75% of all rent", () => {
  const three = plan(sampleInput());
  close(three.selfSufficiency.credited, 0.75 * 4600, 1e-9);
  assert.equal(three.selfSufficiency.passes, three.selfSufficiency.credited >= three.selfSufficiency.payment);
  assert.equal(plan({ ...sampleInput(), units: 2 }).selfSufficiency, null);
  assert.equal(plan({ ...sampleInput(), loanType: "conv", downPct: 5 }).selfSufficiency, null);
  assert.equal(plan({ ...sampleInput(), price: 700000 }).selfSufficiency.passes, false);
});

test("conventional PMI stops once the balance reaches 80% of the price", () => {
  const r = plan({ ...sampleInput(), loanType: "conv", downPct: 10, holdYears: 15, liveYears: 15 });
  assert.ok(r.month1.costs.mi > 0);
  const early = r.years[0].mi, late = r.years[14].mi;
  assert.ok(early > 0 && late === 0);
  assert.equal(plan({ ...sampleInput(), loanType: "conv", downPct: 20 }).month1.costs.mi, 0);
  const o = plan({ ...sampleInput(), loanType: "conv", downPct: 10, pmiOverridePct: 1 });
  close(o.month1.costs.mi, (400000 * 0.9 * 0.01) / 12, 0.01);
});

test("moving out starts renting the owner's unit", () => {
  const r = plan({ ...sampleInput(), liveYears: 1 });
  assert.equal(r.years[0].living, true);
  assert.equal(r.years[1].living, false);
  assert.ok(r.years[1].rentIn > r.years[0].rentIn * 1.3);
  const stay = plan({ ...sampleInput(), liveYears: 10 });
  assert.ok(stay.years.every((y) => y.living));
});

test("loan balance falls to the amortisation schedule and equity tracks value", () => {
  const r = plan({ ...sampleInput(), holdYears: 30, appreciationPct: 0 });
  assert.ok(r.years[29].balance < 1);
  assert.ok(r.years[0].balance < r.loan.loan && r.years[0].balance > r.years[1].balance);
  close(r.years[0].equity, r.years[0].value - r.years[0].balance, 1e-6);
  close(r.years[0].value, 400000, 1e-6);
});

test("total gain equals cash flow advantage plus sale proceeds minus cash invested", () => {
  const r = plan(sampleInput());
  close(r.totalGain, r.totalAdvantage + r.saleProceeds - r.cashToClose, 1e-6);
  close(r.sellCost, r.years[9].value * 0.06, 1e-6);
});

test("irr is consistent with the cash flows and flat prices give a lower return than appreciation", () => {
  const r = plan(sampleInput());
  const flows = [-r.cashToClose, ...r.years.map((y) => y.advantage)];
  flows[flows.length - 1] += r.saleProceeds;
  const npv = flows.reduce((s, f, t) => s + f / Math.pow(1 + r.irr, t), 0);
  close(npv, 0, 1);
  assert.ok(r.flatIrr < r.irr);
  assert.ok(r.flatGain < r.totalGain);
});

test("higher rates raise the first-year cost and the sensitivity table is ordered", () => {
  const r = plan(sampleInput());
  const rates = r.sens.filter((s) => s.group === "rate");
  for (let k = 1; k < rates.length; k++) assert.ok(rates[k].net > rates[k - 1].net);
  const rents = r.sens.filter((s) => s.group === "rent");
  for (let k = 1; k < rents.length; k++) assert.ok(rents[k].net > rents[k - 1].net);
});

test("a building that pays for itself reports living free", () => {
  const r = plan({ ...sampleInput(), otherRents: 6000 });
  assert.equal(r.livesFree, true);
  assert.match(r.advice[0], /live free/);
});

test("csv has a header, one row per year and no raw floats", () => {
  const rows = toCsv(plan(sampleInput())).trim().split("\n");
  assert.equal(rows.length, 11);
  assert.match(rows[0], /^year,living_there/);
  assert.ok(!/\.\d{3,}/.test(rows.join("")));
});

test("usd formats negatives and non-numbers", () => {
  assert.equal(usd(1234.4), "$1,234");
  assert.equal(usd(-1234.6), "-$1,235");
  assert.equal(usd(NaN), "n/a");
});

test("validate returns a typed input and defaults optional fields", () => {
  const v = validate({ price: "300000", downPct: "3.5", rate: "6", units: "2", ownerUnitRent: "1200", otherRents: "1500", rentIfRenting: "1500" });
  assert.equal(v.input.vacancyPct, 5);
  assert.equal(v.input.holdYears, 10);
  assert.equal(v.input.loanType, "fha");
});
