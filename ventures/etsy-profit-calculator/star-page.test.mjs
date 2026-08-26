// Structural tests for the Star Seller vs unsigned page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column or advertises a figure it never shows. Kept
// dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareStarSeller } from './calc.mjs';

const html = readFileSync(new URL('./is-etsy-star-seller-worth-it.html', import.meta.url), 'utf8');
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
  assert.match(sitemap, /is-etsy-star-seller-worth-it\.html/);
  assert.match(index, /is-etsy-star-seller-worth-it\.html/);
  assert.match(index, /id="star-seller"/);
  assert.match(html, /href="\.\/#star-seller"/);
});

test('disclaimers and optional sponsors are visible', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('default figures on the page match compareStarSeller', () => {
  const comparison = compareStarSeller(PAGE_ORDER);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  assert.ok(html.includes(money(comparison.unsigned.profit)), `missing unsigned packed ${money(comparison.unsigned.profit)}`);
  assert.ok(html.includes(money(comparison.starSeller.profit)), `missing star packed ${money(comparison.starSeller.profit)}`);
  assert.ok(html.includes(money(comparison.unsigned.expected)), `missing unsigned expected ${money(comparison.unsigned.expected)}`);
  assert.ok(html.includes(money(comparison.starSeller.expected)), `missing star expected ${money(comparison.starSeller.expected)}`);
  assert.ok(html.includes(money(Math.abs(comparison.extraExpected))), `missing extra ${money(Math.abs(comparison.extraExpected))}`);
  assert.ok(html.includes(money(comparison.starPostageCeiling)), `missing postage ceiling ${money(comparison.starPostageCeiling)}`);
});
