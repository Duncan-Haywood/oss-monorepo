// Structural tests for the Etsy label vs Pirate Ship page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column or advertises a figure it never shows. Kept
// dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareEtsyLabels } from './calc.mjs';

const html = readFileSync(new URL('./should-i-buy-etsy-shipping-labels.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const PAGE_ORDER = {
  price: 30,
  shippingCharged: 5,
  listingFee: 0.2,
  transactionRate: 6.5,
  paymentRate: 3,
  paymentFixed: 0.25,
  offsiteAdRate: 0,
  shippingCost: 6,
  materialCost: 4,
  otherCost: 0,
};

test('the SEO page is in the sitemap and linked from the calculator', () => {
  assert.match(sitemap, /should-i-buy-etsy-shipping-labels\.html/);
  assert.match(index, /should-i-buy-etsy-shipping-labels\.html/);
  assert.match(index, /id="etsy-labels"/);
  assert.match(html, /href="\.\/#etsy-labels"/);
});

test('disclaimers and optional sponsors are visible', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('default figures on the page match compareEtsyLabels', () => {
  const comparison = compareEtsyLabels(PAGE_ORDER);
  const zeroTime = compareEtsyLabels({ ...PAGE_ORDER, labelUploadMinutes: 0 });
  const matchedClaim = compareEtsyLabels({ ...PAGE_ORDER, thirdPartyClaimRatePercent: 0.8 });
  const cheap = compareEtsyLabels({ ...PAGE_ORDER, thirdPartyLabelCost: 4, labelUploadMinutes: 1 });
  const ads = compareEtsyLabels({ ...PAGE_ORDER, offsiteAdRate: 15 });
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  assert.ok(html.includes(money(comparison.etsy.expectedProfit)), `missing Etsy ${money(comparison.etsy.expectedProfit)}`);
  assert.ok(html.includes(money(comparison.third.expectedProfit)), `missing third ${money(comparison.third.expectedProfit)}`);
  assert.ok(html.includes(money(comparison.postageOnly.expectedProfit)), `missing postage ${money(comparison.postageOnly.expectedProfit)}`);
  assert.ok(html.includes(signed(comparison.extraKeptOnThird)), `missing extra ${signed(comparison.extraKeptOnThird)}`);
  assert.ok(html.includes(signed(comparison.extraKeptOnPostageOnly)), `missing postage extra ${signed(comparison.extraKeptOnPostageOnly)}`);
  assert.ok(html.includes(money(Math.abs(comparison.monthlyExtraOnThird))), `missing monthly ${money(Math.abs(comparison.monthlyExtraOnThird))}`);
  assert.ok(html.includes(money(comparison.breakEvenThirdPartyLabelCost)), `missing ceiling ${money(comparison.breakEvenThirdPartyLabelCost)}`);
  assert.ok(html.includes(money(zeroTime.third.expectedProfit)), `missing zero-time ${money(zeroTime.third.expectedProfit)}`);
  assert.ok(html.includes(`${zeroTime.breakEvenThirdPartyClaimRate.toFixed(1)}%`), `missing 3.7% ${zeroTime.breakEvenThirdPartyClaimRate.toFixed(1)}%`);
  assert.ok(html.includes(money(matchedClaim.third.expectedProfit)), `missing matched ${money(matchedClaim.third.expectedProfit)}`);
  assert.ok(html.includes(signed(matchedClaim.extraKeptOnThird)), `missing matched extra ${signed(matchedClaim.extraKeptOnThird)}`);
  assert.ok(html.includes(money(cheap.third.expectedProfit)), `missing $4 ${money(cheap.third.expectedProfit)}`);
  assert.ok(html.includes(signed(cheap.extraKeptOnThird)), `missing $4 extra ${signed(cheap.extraKeptOnThird)}`);
  assert.ok(html.includes(money(ads.etsy.expectedProfit)), `missing ads Etsy ${money(ads.etsy.expectedProfit)}`);
  assert.ok(html.includes(money(ads.third.expectedProfit)), `missing ads third ${money(ads.third.expectedProfit)}`);
  assert.ok(html.includes(signed(ads.extraKeptOnThird)), `missing ads extra ${signed(ads.extraKeptOnThird)}`);
});
