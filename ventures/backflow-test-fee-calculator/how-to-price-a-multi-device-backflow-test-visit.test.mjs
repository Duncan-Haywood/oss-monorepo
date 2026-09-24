import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeJobQuote } from './calc.mjs';

const guide = readFileSync(
  new URL('./how-to-price-a-multi-device-backflow-test-visit.html', import.meta.url),
  'utf8',
);

const money = (value) => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('the guide carries the no-warranty clause', () => {
  assert.match(guide, /No warranty\.<\/strong> This page and the linked calculator apply the fee schedule/);
});

test('the guide links back to the calculator', () => {
  assert.match(guide, /href="\.\/"/);
});

test('the guide is indexable and describes itself for a crawler', () => {
  assert.match(guide, /<meta name="robots" content="index,follow">/);
  assert.match(guide, /<meta name="description" content="[^"]{80,}">/);
  assert.match(guide, /<title>[^<]+<\/title>/);
});

test('the guide carries valid FAQPage JSON-LD matching its visible text', () => {
  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the guide');
  assert.ok(faq.mainEntity.length >= 4);
  for (const qa of faq.mainEntity) {
    assert.ok(guide.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(guide.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the guide carries the privacy line and is listed in the venture sitemap', () => {
  assert.match(guide, /Nothing leaves your browser/);
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-to-price-a-multi-device-backflow-test-visit\.html/);
});

test('the guide states the water-utility jurisdiction caveat', () => {
  assert.match(guide, /water utility/i);
});

// The worked example is the guide's whole argument, so every figure is
// asserted against computeJobQuote rather than transcribed by hand.
test('the 6-device worked example matches what the calculator returns for the documented inputs', () => {
  const devices = [
    { label: 'Domestic RPZ', deviceType: 'RPZ', testFee: 65 },
    { label: 'Fire line RPZ #1', deviceType: 'RPZ', testFee: 65 },
    { label: 'Fire line RPZ #2', deviceType: 'RPZ', testFee: 65, failed: true },
    { label: 'Irrigation double-check #1', deviceType: 'Double check', testFee: 55 },
    { label: 'Irrigation double-check #2', deviceType: 'Double check', testFee: 55 },
    { label: 'Landscape PVB', deviceType: 'PVB', testFee: 45 },
  ];
  const result = computeJobQuote({
    devices,
    additionalDeviceDiscountPercent: 20,
    travelFee: 40,
    reportFilingFeePerDevice: 15,
    retestFee: 35,
  });

  assert.equal(result.deviceCount, 6);
  assert.equal(result.failedCount, 1);
  assert.equal(result.discountSaved, 57);
  assert.equal(result.subtotalTesting, 293);
  assert.equal(result.subtotalFiling, 90);
  assert.equal(result.subtotalRetest, 35);
  assert.equal(result.travelFee, 40);
  assert.equal(result.grandTotal, 458);
  assert.equal(result.averagePerDevice, 76.33);

  for (const item of result.lineItems) {
    assert.ok(guide.includes(money(item.discountedFee)), `missing discounted fee ${money(item.discountedFee)} for ${item.label}`);
    assert.ok(guide.includes(money(item.lineTotal)), `missing line total ${money(item.lineTotal)} for ${item.label}`);
  }
  for (const value of [
    result.discountSaved,
    result.subtotalTesting,
    result.subtotalFiling,
    result.subtotalRetest,
    result.travelFee,
    result.grandTotal,
    result.averagePerDevice,
  ]) {
    assert.ok(guide.includes(money(value)), `the worked example is missing ${money(value)}`);
  }

  // The flat-per-device comparison callout: 6 devices at the first device's
  // own (undiscounted) rate, no filing, no travel, no retest.
  const naiveFlatQuote = devices[0].testFee * devices.length;
  assert.equal(naiveFlatQuote, 390);
  assert.ok(guide.includes(money(naiveFlatQuote)), 'the naive flat-rate comparison figure is missing');
  const gap = result.grandTotal - naiveFlatQuote;
  assert.ok(guide.includes(money(gap)), 'the gap between the flat rate and the real total is missing');
  const filingPlusRetest = result.subtotalFiling + result.subtotalRetest;
  assert.equal(filingPlusRetest, 125);
  assert.ok(guide.includes(money(filingPlusRetest)), 'the filing+retest total is missing');
});
