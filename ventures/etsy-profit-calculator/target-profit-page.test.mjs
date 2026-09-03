// Structural tests for the keep-$X price landing.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// advertises a figure it never shows. Kept dependency-free so CI stays
// `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateOrder, priceForProfit } from './calc.mjs';

const html = readFileSync(new URL('./what-price-keeps-this-etsy-profit.html', import.meta.url), 'utf8');
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
  assert.match(sitemap, /what-price-keeps-this-etsy-profit\.html/);
  assert.match(index, /what-price-keeps-this-etsy-profit\.html/);
  assert.match(index, /id="target-profit"/);
  assert.match(html, /href="\.\/#target-profit"/);
});

test('disclaimers and optional sponsors are visible', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /does not recommend a price/i);
  assert.doesNotMatch(html, /should charge|must raise|must lower/i);
});

test('default figures on the page match priceForProfit', () => {
  const current = calculateOrder(PAGE_ORDER);
  const keep20 = priceForProfit(PAGE_ORDER, 20);
  const keep10 = priceForProfit(PAGE_ORDER, 10);
  const keep30 = priceForProfit(PAGE_ORDER, 30);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  assert.ok(html.includes(money(current.profit)), `missing current leftover ${money(current.profit)}`);
  assert.ok(html.includes(money(keep20)), `missing $20 price ${money(keep20)}`);
  assert.ok(html.includes(money(keep10)), `missing $10 price ${money(keep10)}`);
  assert.ok(html.includes(money(keep30)), `missing $30 price ${money(keep30)}`);
  assert.match(html, /from ['"]\.\/calc\.mjs['"]/);
  assert.match(html, /priceForProfit/);
  assert.match(html, /target_profit_priced/);
  assert.match(html, /etsy-target-profit-inputs/);
});
