import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareBestOffer, bestOfferRows, bestOfferSummary } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./should-i-accept-this-ebay-offer.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('index wires Best Offer fields and the comparison table', () => {
  for (const needle of [
    'id="bestOffer"',
    'id="listChance"',
    'id="offerSection"',
    'id="offers"',
    'compareBestOffer',
    'best_offer_compared',
    'should-i-accept-this-ebay-offer.html',
    'no uptime or availability SLA',
  ]) {
    assert.match(index, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('SEO page answers the offer question with the worked example', () => {
  assert.match(seo, /Should you accept this eBay Best Offer/);
  assert.match(seo, /\$16\.40/);
  assert.match(seo, /\$21\.61/);
  assert.match(seo, /href="\.\/"/);
  assert.match(seo, /No warranty/);
  assert.match(sitemap, /should-i-accept-this-ebay-offer\.html/);
});

test('default form assumptions match the locked Best Offer journey', () => {
  const comparison = compareBestOffer({
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1, targetMargin: 20,
    bestOffer: 34, listChance: 50,
  });
  const rows = bestOfferRows(comparison);
  assert.equal(rows[1].profit, 16.4);
  assert.equal(comparison.acceptBeatsWait, true);
  assert.match(bestOfferSummary(comparison), /still leaves \$16\.40/);
});
