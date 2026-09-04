// Structural tests for the free-shipping vs charged-shipping page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column or advertises a figure it never shows. Kept
// dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareFreeShipping } from './calc.mjs';

const html = readFileSync(new URL('./should-i-offer-free-shipping-on-etsy.html', import.meta.url), 'utf8');
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
  assert.match(sitemap, /should-i-offer-free-shipping-on-etsy\.html/);
  assert.match(index, /should-i-offer-free-shipping-on-etsy\.html/);
  assert.match(index, /id="free-shipping"/);
  assert.match(html, /href="\.\/#free-shipping"/);
});

test('disclaimers and optional sponsors are visible', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('default figures on the page match compareFreeShipping', () => {
  const comparison = compareFreeShipping(PAGE_ORDER);
  const eat = compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: 30 });
  const raised = compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: 40 });
  const ads = compareFreeShipping({ ...PAGE_ORDER, offsiteAdRate: 15 });
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  assert.ok(html.includes(money(comparison.charged.profit)), `missing charged ${money(comparison.charged.profit)}`);
  assert.ok(html.includes(money(comparison.eatLabel.profit)), `missing eat ${money(comparison.eatLabel.profit)}`);
  assert.ok(html.includes(money(comparison.raised.profit)), `missing $32 ${money(comparison.raised.profit)}`);
  assert.ok(html.includes(signed(comparison.perOrderDelta)), `missing $32 delta ${signed(comparison.perOrderDelta)}`);
  assert.ok(html.includes(money(comparison.monthlyCharged)), `missing monthly charged ${money(comparison.monthlyCharged)}`);
  assert.ok(html.includes(`${comparison.extraOrdersNeeded.toFixed(1)} extra orders`), `missing lift ${comparison.extraOrdersNeeded.toFixed(1)}`);
  assert.ok(html.includes(`${comparison.liftPercent.toFixed(1)}%`), `missing ${comparison.liftPercent.toFixed(1)}%`);
  assert.ok(html.includes(money(eat.raised.profit)), `missing $30 leftover ${money(eat.raised.profit)}`);
  assert.ok(html.includes(`${eat.extraOrdersNeeded.toFixed(1)} extra orders`), `missing $30 lift ${eat.extraOrdersNeeded.toFixed(1)}`);
  assert.ok(html.includes(money(raised.raised.profit)), `missing $40 leftover ${money(raised.raised.profit)}`);
  assert.ok(html.includes(signed(raised.perOrderDelta)), `missing $40 delta ${signed(raised.perOrderDelta)}`);
  assert.ok(html.includes(money(ads.charged.profit)), `missing ads charged ${money(ads.charged.profit)}`);
  assert.ok(html.includes(money(ads.raised.profit)), `missing ads raised ${money(ads.raised.profit)}`);
  assert.ok(html.includes(signed(ads.perOrderDelta)), `missing ads delta ${signed(ads.perOrderDelta)}`);
});
