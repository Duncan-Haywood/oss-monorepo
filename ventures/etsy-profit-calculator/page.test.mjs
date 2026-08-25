import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareFreeShipping } from './calc.mjs';

const page = readFileSync(new URL('./free-shipping.html', import.meta.url), 'utf8');
const home = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const robots = readFileSync(new URL('./robots.txt', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('free-shipping page is a real calculator, not a stub landing', () => {
  assert.match(page, /compareFreeShipping/);
  assert.match(page, /free_shipping_compared/);
  assert.match(page, /FREE_SHIPPING_FIELD_IDS/);
  assert.match(page, /No warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /Do not keep anonymous local usage counts/);
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /FAQPage/);
  for (const id of ['price', 'shippingCharged', 'freeShipPrice', 'monthlyOrders', 'shippingCost']) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
});

test('order-profit page links to the free-shipping comparison', () => {
  assert.match(home, /free-shipping.html/);
});

test('discoverability files list both surfaces and allow crawlers', () => {
  assert.match(robots, /Allow: \//);
  assert.match(robots, /etsy-profit-calculator\/sitemap.xml/);
  assert.match(sitemap, /etsy-profit-calculator\/<\/loc>/);
  assert.match(sitemap, /etsy-profit-calculator\/free-shipping.html/);
});

test('page defaults match the documented $32 + $6 vs $35 example', () => {
  const result = compareFreeShipping({
    price: 32,
    shippingCharged: 6,
    listingFee: 0.2,
    transactionRate: 6.5,
    paymentRate: 3,
    paymentFixed: 0.25,
    shippingCost: 6,
    materialCost: 4,
    freeShipPrice: 35,
    monthlyOrders: 40,
  });
  assert.equal(result.winnerPerOrder, 'charged');
  assert.match(page, /value="32"/);
  assert.match(page, /value="35"/);
  assert.match(page, /value="40"/);
});
