import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeJobQuote, formatQuoteBreakdown, BREAKDOWN_DISCLAIMER } from './calc.mjs';

test('a single device with no extras: fee plus filing, no discount, no retest', () => {
  const r = computeJobQuote({
    devices: [{ label: 'Domestic RPZ', deviceType: 'rpz', testFee: 75 }],
    reportFilingFeePerDevice: 10,
  });
  assert.equal(r.deviceCount, 1);
  assert.equal(r.subtotalTesting, 75);
  assert.equal(r.subtotalFiling, 10);
  assert.equal(r.subtotalRetest, 0);
  assert.equal(r.grandTotal, 85);
  assert.equal(r.averagePerDevice, 85);
});

test('multi-device discount applies only to devices after the first', () => {
  const r = computeJobQuote({
    devices: [
      { label: 'Fire line RPZ', testFee: 100 },
      { label: 'Irrigation DC', testFee: 60 },
      { label: 'Domestic DC', testFee: 60 },
    ],
    additionalDeviceDiscountPercent: 20,
  });
  // First device: full 100. Second and third: 60 * 0.8 = 48 each.
  assert.equal(r.lineItems[0].discountedFee, 100);
  assert.equal(r.lineItems[1].discountedFee, 48);
  assert.equal(r.lineItems[2].discountedFee, 48);
  assert.equal(r.subtotalTesting, 196);
  // Full price would have been 100 + 60 + 60 = 220; saved 24.
  assert.equal(r.discountSaved, 24);
  assert.ok(r.findings.some((f) => f.id === 'discount-applied'));
});

test('a travel fee is charged once per visit, not once per device', () => {
  const r = computeJobQuote({
    devices: [{ testFee: 50 }, { testFee: 50 }, { testFee: 50 }],
    travelFee: 40,
  });
  assert.equal(r.travelFee, 40);
  assert.equal(r.grandTotal, 190); // 150 testing + 40 travel
});

test('the report filing fee is charged per device, including failed ones', () => {
  const r = computeJobQuote({
    devices: [{ testFee: 50, failed: true }, { testFee: 50 }],
    reportFilingFeePerDevice: 15,
  });
  assert.equal(r.subtotalFiling, 30);
  assert.ok(r.findings.some((f) => f.id === 'filing-fee-applies-per-device'));
});

test('a failed device is billed the retest fee and flagged', () => {
  const r = computeJobQuote({
    devices: [{ label: 'Backyard PVB', testFee: 45, failed: true }, { testFee: 45 }],
    retestFee: 20,
  });
  assert.equal(r.failedCount, 1);
  assert.equal(r.subtotalRetest, 20);
  assert.equal(r.lineItems[0].lineTotal, 65);
  assert.ok(r.findings.some((f) => f.id === 'failed-devices'));
});

test('a passed job with no discount, filing, or retest fee has none of those findings', () => {
  const r = computeJobQuote({ devices: [{ testFee: 50 }, { testFee: 50 }] });
  assert.equal(r.subtotalFiling, 0);
  assert.equal(r.subtotalRetest, 0);
  assert.ok(!r.findings.some((f) => f.id === 'failed-devices'));
  assert.ok(!r.findings.some((f) => f.id === 'filing-fee-applies-per-device'));
});

test('a single device with a discount entered is flagged as not applying', () => {
  const r = computeJobQuote({ devices: [{ testFee: 50 }], additionalDeviceDiscountPercent: 15 });
  assert.ok(r.findings.some((f) => f.id === 'single-device-no-discount'));
});

test('no devices at all is flagged and returns zeros, not an error', () => {
  const r = computeJobQuote({ devices: [] });
  assert.equal(r.deviceCount, 0);
  assert.equal(r.grandTotal, 0);
  assert.ok(r.findings.some((f) => f.id === 'no-devices'));
});

test('rows with a zero, missing, or non-finite fee are dropped, not treated as a zero-cost device', () => {
  const r = computeJobQuote({
    devices: [
      { label: 'Kept', testFee: 60 },
      { label: 'No fee', testFee: 0 },
      { label: 'Missing', testFee: NaN },
      { label: 'Negative', testFee: -10 },
    ],
  });
  assert.equal(r.deviceCount, 1);
  assert.equal(r.lineItems[0].label, 'Kept');
});

test('every non-empty result carries the jurisdiction caveat', () => {
  const r = computeJobQuote({ devices: [{ testFee: 50 }] });
  assert.ok(r.findings.some((f) => f.id === 'jurisdiction-note'));
});

test('a negative or missing discount/travel/filing/retest input is treated as zero, never negative', () => {
  const r = computeJobQuote({
    devices: [{ testFee: 50 }],
    additionalDeviceDiscountPercent: -20,
    travelFee: -5,
    reportFilingFeePerDevice: NaN,
    retestFee: -1,
  });
  assert.equal(r.travelFee, 0);
  assert.equal(r.subtotalFiling, 0);
  assert.equal(r.grandTotal, 50);
});

// --- Breakdown text -------------------------------------------------------

test('formatQuoteBreakdown renders every line item, the totals, and the disclaimer', () => {
  const r = computeJobQuote({
    devices: [
      { label: 'Fire line RPZ', deviceType: 'rpz', testFee: 100 },
      { label: 'Irrigation DC', deviceType: 'dc', testFee: 60, failed: true },
    ],
    additionalDeviceDiscountPercent: 10,
    travelFee: 25,
    reportFilingFeePerDevice: 10,
    retestFee: 15,
  });
  const text = formatQuoteBreakdown(r);
  assert.match(text, /Fire line RPZ \(rpz\) - \$100\.00 test \+ \$10\.00 filing = \$110\.00/);
  assert.match(text, /Irrigation DC \(dc\) \[FAILED\] - \$54\.00 test \+ \$10\.00 filing \+ \$15\.00 retest = \$79\.00/);
  assert.match(text, /Travel fee: \$25\.00/);
  assert.match(text, /Total: \$214\.00/);
  assert.ok(text.endsWith(BREAKDOWN_DISCLAIMER));
});

test('formatQuoteBreakdown never throws on an empty result', () => {
  const r = computeJobQuote({ devices: [] });
  assert.doesNotThrow(() => formatQuoteBreakdown(r));
});
