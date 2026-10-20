import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateOrder } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('names no specific competing product', () => {
  // Generic-method comparison (spreadsheet / doing it by hand), not a named
  // product -- same discipline the surface-budget angle check relies on to
  // tell this page apart from vs-ebay-fee-calculator.html.
  assert.doesNotMatch(html, /quickbooks|freshbooks|xero|wave|intuit|vendoo|crosslist|sellbrite/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-spreadsheet\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to the returns guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="do-ebay-returns-wipe-the-profit\.html"/);
});

test('it reports facts, not a recommendation to abandon spreadsheets', () => {
  assert.doesNotMatch(html, /you should switch|replace your spreadsheet|better than a spreadsheet/i);
});

test('the base-case worked numbers match calculateOrder on the index page defaults', () => {
  const base = calculateOrder({
    price: 40,
    quantity: 1,
    shippingCharged: 6,
    finalValueRate: 13.6,
    fixedFee: 0.4,
    promotedRate: 0,
    intlFeeRate: 0,
    costOfGoods: 12,
    shippingCost: 5,
    packagingCost: 1,
    otherCost: 0,
    targetMargin: 20,
    returnRatePercent: 10,
    returnShippingCost: 5,
    feeRefundOnReturnPercent: 100,
  });
  assert.ok(Math.abs(base.profit - 21.344) < 1e-6);
  assert.ok(Math.abs(base.expectedProfit - 18.1096) < 1e-6);
  assert.match(html, /\$21\.34/);
  assert.match(html, /\$18\.11/);
});

test('the stacked-fee worked numbers (Promoted + international) match calculateOrder', () => {
  const stacked = calculateOrder({
    price: 40,
    quantity: 1,
    shippingCharged: 6,
    finalValueRate: 13.6,
    fixedFee: 0.4,
    promotedRate: 8,
    intlFeeRate: 1.65,
    costOfGoods: 12,
    shippingCost: 5,
    packagingCost: 1,
    otherCost: 0,
    targetMargin: 20,
    returnRatePercent: 10,
    returnShippingCost: 5,
    feeRefundOnReturnPercent: 100,
  });
  assert.ok(Math.abs(stacked.profit - 16.905) < 1e-6);
  assert.match(html, /\$16\.91/);
  assert.match(html, /\$4\.44/);
  const noReturnBase = 21.344;
  assert.ok(Math.abs(noReturnBase - stacked.profit - 4.439) < 1e-3);
});
