import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateOrder } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Etsy', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Etsy, Inc\./);
  assert.match(html, /trademarks of Etsy, Inc\./);
});

test('names no spreadsheet application or vendor', () => {
  // Deliberately a generic-method comparison (a hand-typed spreadsheet
  // formula), not a named-vendor one -- unlike this venture's own
  // vs-etsys-listing-form-calculator.html, which names Etsy's own tool and
  // carries the affiliation disclaimer for it.
  assert.doesNotMatch(html, /Google Sheets|Excel|Airtable|Notion/i);
});

test('the worked example matches calculateOrder', () => {
  const naive = calculateOrder({
    price: 45,
    shippingCharged: 6.5,
    listingFee: 0.2,
    transactionRate: 6.5,
    paymentRate: 3,
    paymentFixed: 0.25,
    offsiteAdRate: 0,
    shippingCost: 5,
    materialCost: 12,
    otherCost: 0,
  });
  const withOffsiteAds = calculateOrder({
    price: 45,
    shippingCharged: 6.5,
    listingFee: 0.2,
    transactionRate: 6.5,
    paymentRate: 3,
    paymentFixed: 0.25,
    offsiteAdRate: 15,
    shippingCost: 5,
    materialCost: 12,
    otherCost: 0,
  });
  assert.equal(naive.profit.toFixed(2), '29.16');
  assert.equal(withOffsiteAds.profit.toFixed(2), '21.43');
  // The page's "$7.73 higher" is the gap between the two rounded dollar
  // figures it shows, not the unrounded difference (29.1575 - 21.4325 =
  // 7.725, which itself rounds to $7.72 or $7.73 depending on floating-point
  // representation) -- matching how a reader would check it by subtracting
  // the two numbers printed on the page.
  const gap = Number(naive.profit.toFixed(2)) - Number(withOffsiteAds.profit.toFixed(2));
  assert.equal(gap.toFixed(2), '7.73');

  assert.match(html, /\$29\.16/);
  assert.match(html, /\$21\.43/);
  assert.match(html, /\$7\.73 higher/);
  assert.match(html, /36%\s+overstatement/);
});

test('the canonical tag names this file, matching the venture convention', () => {
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

test('every FAQPage answer is on the page verbatim', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
