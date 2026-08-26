// Structural tests for the production-partner vs handmade page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column or advertises a figure it never shows. Kept
// dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareProductionPartner } from './calc.mjs';

const html = readFileSync(new URL('./should-i-use-an-etsy-production-partner.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the SEO page is in the sitemap and linked from the calculator', () => {
  assert.match(sitemap, /should-i-use-an-etsy-production-partner\.html/);
  assert.match(index, /should-i-use-an-etsy-production-partner\.html/);
  assert.match(index, /id="production-partner"/);
  assert.match(html, /href="\.\/#production-partner"/);
});

test('disclaimers and optional sponsors are visible', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('default figures on the page match compareProductionPartner', () => {
  const comparison = compareProductionPartner({
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
  });
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  assert.ok(html.includes(money(comparison.youMake.profit)), `missing handmade ${money(comparison.youMake.profit)}`);
  assert.ok(html.includes(money(comparison.hybrid.monthly)), `missing hybrid month ${money(comparison.hybrid.monthly)}`);
  assert.ok(html.includes(money(comparison.breakEvenPartnerUnit)), `missing break-even ${money(comparison.breakEvenPartnerUnit)}`);
});
