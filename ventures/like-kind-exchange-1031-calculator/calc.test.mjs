import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeOutcome, exchangeDeadlines, identificationCheck, parseISODate, money } from "./calc.mjs";

const base = {
  salePrice: 1000000, sellingCosts: 60000, mortgagePayoff: 400000,
  purchasePrice: 500000, improvements: 50000, depreciation: 150000,
  replacementPrice: 1200000, newMortgage: 600000, acquisitionCosts: 10000,
};

test("full deferral: trade up, more debt, all equity reinvested", () => {
  const o = exchangeOutcome(base);
  assert.equal(o.amountRealized, 940000);
  assert.equal(o.adjustedBasis, 400000);
  assert.equal(o.realizedGain, 540000);
  assert.equal(o.boot, 0);
  assert.equal(o.recognizedGain, 0);
  assert.equal(o.deferredGain, 540000);
  assert.equal(o.newBasis, 1210000 - 540000);
  assert.equal(o.cashAdded, 70000);
  assert.ok(o.fullyDeferred);
});

test("cash boot: replacement needs less equity than the sale produced", () => {
  const o = exchangeOutcome({ ...base, replacementPrice: 800000, newMortgage: 200000, acquisitionCosts: 0 });
  // netEquity 540000, need 600000? no: 800000-200000 = 600000 > 540000
  assert.equal(o.cashBoot, 0);
  const o2 = exchangeOutcome({ ...base, replacementPrice: 700000, newMortgage: 400000, acquisitionCosts: 0 });
  // need 300000, equity 540000 -> 240000 cash boot
  assert.equal(o2.cashBoot, 240000);
  assert.equal(o2.recognizedGain, 240000);
  assert.equal(o2.deferredGain, 300000);
  assert.ok(!o2.fullyDeferred);
});

test("mortgage boot when debt drops and no cash is added", () => {
  const o = exchangeOutcome({ ...base, replacementPrice: 940000, newMortgage: 300000, acquisitionCosts: 0 });
  // need 640000 > equity 540000 -> cashAdded 100000 offsets the 100000 debt relief
  assert.equal(o.mortgageBoot, 0);
  const o2 = exchangeOutcome({ ...base, replacementPrice: 400000, newMortgage: 100000, acquisitionCosts: 0 });
  // need 300000, equity 540000 -> cash boot 240000; mortgage boot 300000
  assert.equal(o2.cashBoot, 240000);
  assert.equal(o2.mortgageBoot, 300000);
  assert.equal(o2.recognizedGain, 500000 > 540000 ? 540000 : 540000 > 540000 ? 0 : Math.min(540000, 540000));
});

test("recognized gain never exceeds realized gain", () => {
  const o = exchangeOutcome({ ...base, replacementPrice: 100000, newMortgage: 0, acquisitionCosts: 0 });
  assert.equal(o.recognizedGain, o.realizedGain);
  assert.equal(o.deferredGain, 0);
});

test("a loss is not recognized and raises the replacement basis", () => {
  const o = exchangeOutcome({ salePrice: 300000, purchasePrice: 400000, replacementPrice: 300000, newMortgage: 0 });
  assert.equal(o.realizedGain, -100000);
  assert.equal(o.recognizedGain, 0);
  assert.equal(o.newBasis, 400000);
  assert.ok(o.findings.some((f) => /No gain to defer/.test(f.title)));
});

test("tax comparison uses typed rates, recapture first", () => {
  const o = exchangeOutcome({ ...base, niit: true, stateRate: 5 });
  // 150000*25% + 390000*20% + 540000*(5%+3.8%)
  assert.equal(o.taxWithoutExchange, 37500 + 78000 + 47520);
  assert.equal(o.taxWithExchange, 0);
  assert.equal(o.taxDeferred, o.taxWithoutExchange);
});

test("deadlines: 45 and 180 days, cut short by the return due date", () => {
  const d = exchangeDeadlines("2026-11-15", "2026-11-20");
  assert.equal(d.identifyBy, "2026-12-30");
  assert.equal(d.completeBy, "2027-05-14");
  assert.equal(d.returnDue, "2027-04-15");
  assert.ok(d.cutShort);
  assert.equal(d.daysToIdentify, 40);
  const early = exchangeDeadlines("2026-03-01", "2026-03-02");
  assert.ok(!early.cutShort);
  assert.equal(early.completeBy, "2026-08-28");
});

test("invalid dates are rejected", () => {
  assert.equal(parseISODate("2026-02-31"), null);
  assert.equal(exchangeDeadlines("nonsense"), null);
});

test("identification rules", () => {
  assert.ok(identificationCheck([1, 2, 3].map((n) => n * 100000), 1000000).threeProperty);
  const four = identificationCheck([300000, 300000, 300000, 300000], 1000000);
  assert.ok(!four.threeProperty && four.twoHundredPercent && four.ok);
  const bad = identificationCheck([900000, 900000, 900000, 900000], 1000000, 800000);
  assert.ok(!bad.ok);
  const nf = identificationCheck([900000, 900000, 900000, 900000], 1000000, 3600000);
  assert.ok(nf.ok && nf.ninetyFivePercent);
  assert.equal(identificationCheck([], 1), null);
});

test("garbage input does not produce NaN", () => {
  const o = exchangeOutcome({ salePrice: "abc", replacementPrice: undefined });
  for (const [k, v] of Object.entries(o)) if (typeof v === "number") assert.ok(Number.isFinite(v), k);
  assert.equal(money(NaN), "$0.00");
});
