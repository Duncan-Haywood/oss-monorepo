import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSale, splitGain, recaptureRate, DEFAULTS, MAX_RECAPTURE_RATE, NIIT_RATE } from './calc.mjs';

test('splitGain caps the recapture portion at the depreciation actually taken', () => {
  const { unrecapturedSection1250Gain, remainingGain } = splitGain(100000, 40000);
  assert.equal(unrecapturedSection1250Gain, 40000);
  assert.equal(remainingGain, 60000);
});

test('splitGain caps the recapture portion at the gain itself when depreciation exceeds the gain', () => {
  const { unrecapturedSection1250Gain, remainingGain } = splitGain(10000, 40000);
  assert.equal(unrecapturedSection1250Gain, 10000);
  assert.equal(remainingGain, 0);
});

test('splitGain treats a non-positive gain as nothing to recapture', () => {
  assert.deepEqual(splitGain(-5000, 40000), { unrecapturedSection1250Gain: 0, remainingGain: 0 });
  assert.deepEqual(splitGain(0, 40000), { unrecapturedSection1250Gain: 0, remainingGain: 0 });
});

test('recaptureRate defaults to the 25% statutory cap when no ordinary rate is supplied', () => {
  assert.equal(recaptureRate(''), MAX_RECAPTURE_RATE);
  assert.equal(recaptureRate(undefined), MAX_RECAPTURE_RATE);
  assert.equal(recaptureRate(null), MAX_RECAPTURE_RATE);
});

test('recaptureRate uses the lower of 25% and a supplied ordinary rate', () => {
  assert.equal(recaptureRate(0.12), 0.12);
  assert.equal(recaptureRate(0.32), MAX_RECAPTURE_RATE);
});

test('recaptureRate ignores a negative or non-numeric override', () => {
  assert.equal(recaptureRate(-0.1), MAX_RECAPTURE_RATE);
  assert.equal(recaptureRate('not-a-number'), MAX_RECAPTURE_RATE);
});

// Worked example, independently computable by hand:
// basis = 300000 + 20000 - 87000 = 233000
// realized = 420000 - 25000 = 395000
// gain = 395000 - 233000 = 162000
// recapture = min(162000, 87000) = 87000 -> tax at 25% = 21750
// remaining = 162000 - 87000 = 75000 -> tax at 15% = 11250
// total tax = 33000; net proceeds = 395000 - 33000 = 362000
test('analyzeSale matches a hand-computed worked example at the DEFAULTS inputs', () => {
  const result = analyzeSale(DEFAULTS);
  assert.equal(result.adjustedBasis, 233000);
  assert.equal(result.amountRealized, 395000);
  assert.equal(result.totalGain, 162000);
  assert.equal(result.unrecapturedSection1250Gain, 87000);
  assert.equal(result.remainingGain, 75000);
  assert.equal(result.appliedRecaptureRate, MAX_RECAPTURE_RATE);
  assert.equal(result.recaptureTax, 21750);
  assert.equal(result.ltcgTax, 11250);
  assert.equal(result.niitTax, 0);
  assert.equal(result.totalTax, 33000);
  assert.equal(result.netProceeds, 362000);
});

test('a lower supplied ordinary rate lowers the recapture tax below the 25% default', () => {
  const withCap = analyzeSale({ ...DEFAULTS, ordinaryRateCap: 0.12 });
  assert.equal(withCap.appliedRecaptureRate, 0.12);
  assert.equal(withCap.recaptureTax, 10440); // 87000 * 0.12
  assert.ok(withCap.totalTax < analyzeSale(DEFAULTS).totalTax);
});

test('NIIT, when included, adds 3.8% of the total gain on top of recapture and capital-gains tax', () => {
  const withoutNiit = analyzeSale(DEFAULTS);
  const withNiit = analyzeSale({ ...DEFAULTS, includeNiit: true });
  assert.equal(withNiit.niitTax, round(162000 * NIIT_RATE));
  assert.equal(withNiit.totalTax, withoutNiit.totalTax + withNiit.niitTax);
});

test('mortgage payoff reduces net proceeds but never the tax computation itself', () => {
  const noMortgage = analyzeSale(DEFAULTS);
  const withMortgage = analyzeSale({ ...DEFAULTS, mortgagePayoff: 150000 });
  assert.equal(withMortgage.totalTax, noMortgage.totalTax);
  assert.equal(withMortgage.netProceedsAfterMortgage, noMortgage.netProceeds - 150000);
});

test('a sale at a loss recognizes no gain and no recapture tax, and flags the loss', () => {
  const result = analyzeSale({ ...DEFAULTS, sellingPrice: 200000 });
  assert.ok(result.totalGain < 0);
  assert.equal(result.unrecapturedSection1250Gain, 0);
  assert.equal(result.recaptureTax, 0);
  assert.equal(result.ltcgTax, 0);
  assert.ok(result.findings.some((f) => /loss, not a gain/.test(f.title)));
});

test('depreciation exceeding the total gain is flagged and capped rather than over-recaptured', () => {
  const result = analyzeSale({ ...DEFAULTS, sellingPrice: 260000, depreciationTaken: 87000 });
  assert.ok(result.totalGain > 0 && result.totalGain < 87000);
  assert.equal(result.unrecapturedSection1250Gain, result.totalGain);
  assert.ok(result.findings.some((f) => /exceeds the total gain/.test(f.title)));
});

test('land value greater than the purchase price is flagged as a data error', () => {
  const result = analyzeSale({ ...DEFAULTS, landValue: 500000 });
  assert.ok(result.findings.some((f) => /Land value exceeds/.test(f.title)));
});

test('a full-value like-kind exchange with zero boot defers the entire tax bill', () => {
  const result = analyzeSale({ ...DEFAULTS, exchangeBoot: 0 });
  assert.equal(result.exchange.recognizedGain, 0);
  assert.equal(result.exchange.taxDue, 0);
  assert.equal(result.exchange.taxDeferred, result.totalTax);
  assert.equal(result.exchange.deferredGain, result.totalGain);
});

test('boot received in a 1031 exchange is taxed recapture-first, same as an outright sale', () => {
  // 50000 of boot, less than the 87000 recapture portion, so it is all
  // recapture-rate tax -- none of it should spill into the LTCG rate yet.
  const result = analyzeSale({ ...DEFAULTS, exchangeBoot: 50000 });
  assert.equal(result.exchange.recognizedGain, 50000);
  assert.equal(result.exchange.taxDue, round(50000 * MAX_RECAPTURE_RATE));
  assert.ok(result.exchange.taxDeferred < result.totalTax);
  assert.ok(result.exchange.deferredGain < result.totalGain);
});

test('boot at or above the total gain recognizes the whole gain, matching an outright sale', () => {
  const outright = analyzeSale(DEFAULTS);
  const fullyTaxedExchange = analyzeSale({ ...DEFAULTS, exchangeBoot: 999999 });
  assert.equal(fullyTaxedExchange.exchange.recognizedGain, outright.totalGain);
  assert.equal(fullyTaxedExchange.exchange.taxDue, outright.totalTax);
  assert.equal(fullyTaxedExchange.exchange.taxDeferred, 0);
});

test('every result always carries the state-tax and recapture-cap findings', () => {
  const result = analyzeSale(DEFAULTS);
  assert.ok(result.findings.some((f) => /State tax is not included/.test(f.title)));
  assert.ok(result.findings.some((f) => /25% statutory cap/.test(f.title)));
});

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
