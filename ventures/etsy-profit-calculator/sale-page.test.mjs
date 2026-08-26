// Structural tests for the shop-sale vs full-price page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column or advertises a figure it never shows. Kept
// dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareShopSale } from './calc.mjs';

const html = readFileSync(new URL('./should-i-put-my-etsy-shop-on-sale.html', import.meta.url), 'utf8');
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
  assert.match(sitemap, /should-i-put-my-etsy-shop-on-sale\.html/);
  assert.match(index, /should-i-put-my-etsy-shop-on-sale\.html/);
  assert.match(index, /id="shop-sale"/);
  assert.match(html, /href="\.\/#shop-sale"/);
});

test('disclaimers and optional sponsors are visible', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('default figures on the page match compareShopSale', () => {
  const comparison = compareShopSale(PAGE_ORDER);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  assert.ok(html.includes(money(comparison.asListed.profit)), `missing listed packed ${money(comparison.asListed.profit)}`);
  assert.ok(html.includes(money(comparison.percent.profit)), `missing 20% packed ${money(comparison.percent.profit)}`);
  assert.ok(html.includes(money(comparison.dollar.profit)), `missing $5 packed ${money(comparison.dollar.profit)}`);
  assert.ok(html.includes(money(comparison.asListed.expected)), `missing listed expected ${money(comparison.asListed.expected)}`);
  assert.ok(html.includes(money(comparison.percent.expected)), `missing 20% expected ${money(comparison.percent.expected)}`);
  assert.ok(html.includes(money(comparison.dollar.expected)), `missing $5 expected ${money(comparison.dollar.expected)}`);
  assert.ok(html.includes(money(Math.abs(comparison.dollarExtraExpected))), `missing extra ${money(Math.abs(comparison.dollarExtraExpected))}`);
  assert.ok(html.includes(money(comparison.dollarCeiling)), `missing dollar ceiling ${money(comparison.dollarCeiling)}`);
});
