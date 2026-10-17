import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { parseFeed, checkFeed } from './engine.mjs';

const html = fs.readFileSync(new URL('./vs-eyeballing-the-feed-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The exact four-row feed the page's own table describes: one clean row, one
// obviously-bad row a spreadsheet scan would catch, and two rows that are
// visually identical to the clean row but each fail one spec rule a visual
// scan cannot check (a transposed GTIN digit, a price missing its currency
// code). Every number quoted on the page is asserted against this feed run
// through checkFeed(), not invented.
const FEED = `id,title,description,link,image_link,availability,price,brand,gtin,google_product_category
sku-1,Blue Cotton T-Shirt,A soft breathable blue cotton t-shirt in unisex sizing.,https://shop.example.com/blue-tee,https://shop.example.com/blue-tee.jpg,in stock,19.99 USD,Examplewear,4006381333931,Apparel & Accessories > Clothing
sku-2,GREAT DEAL Red Hoodie 50% off Free Shipping,short,not-a-url,not-a-url,maybe,cheap,,123,
sku-3,Grey Wool Scarf,A warm grey wool scarf with a hand-finished edge.,https://shop.example.com/grey-scarf,https://shop.example.com/grey-scarf.jpg,in stock,34.00 USD,Examplewear,4006381339931,Apparel & Accessories > Clothing
sku-4,Black Leather Belt,A full-grain black leather belt with a brushed buckle.,https://shop.example.com/black-belt,https://shop.example.com/black-belt.jpg,in stock,19.99,Examplewear,4006381333931,Apparel & Accessories > Clothing`;

test('sku-1 is clean (baseline)', () => {
  const report = checkFeed(parseFeed(FEED));
  const row = report.items.find((r) => r.item.id === 'sku-1');
  assert.deepEqual(row.errors, []);
  assert.deepEqual(row.warnings, []);
});

test('sku-2 is the obviously-bad row: 5 errors, 4 warnings', () => {
  const report = checkFeed(parseFeed(FEED));
  const row = report.items.find((r) => r.item.id === 'sku-2');
  assert.equal(row.errors.length, 5);
  assert.equal(row.warnings.length, 4);
});

test('sku-3 fails only the GTIN checksum, from a single transposed digit', () => {
  const report = checkFeed(parseFeed(FEED));
  const row = report.items.find((r) => r.item.id === 'sku-3');
  assert.deepEqual(row.errors.map((e) => e.code), ['invalid-gtin-checksum']);
  assert.deepEqual(row.warnings, []);
  // Same length, same shape as sku-1's valid GTIN -- only two digits differ.
  assert.equal(row.item.gtin.length, 13);
  assert.notEqual(row.item.gtin, '4006381333931');
});

test('sku-4 fails only the price format, from a missing currency code', () => {
  const report = checkFeed(parseFeed(FEED));
  const row = report.items.find((r) => r.item.id === 'sku-4');
  assert.deepEqual(row.errors.map((e) => e.code), ['invalid-price-format']);
  assert.deepEqual(row.warnings, []);
  assert.equal(row.item.price, '19.99');
});

test('feed-level totals match the numbers quoted on the page', () => {
  const report = checkFeed(parseFeed(FEED));
  assert.equal(report.totalItems, 4);
  assert.equal(report.itemsWithErrors, 3);
  assert.equal(report.totalErrors, 7);
  assert.equal(report.totalWarnings, 4);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-eyeballing-the-feed-in-a-spreadsheet\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-eyeballing-the-feed-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-eyeballing-the-feed-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('names the mechanical checks this page is about', () => {
  assert.match(html, /GTIN|checksum/i);
  assert.match(html, /NUMBER CURRENCY|currency code/i);
  assert.match(html, /never uploaded/i);
});

test('names no specific spreadsheet product or competitor', () => {
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const word of ['Excel', 'Google Sheets', 'Numbers', 'Airtable']) {
    assert.ok(!text.includes(word), `unexpected specific-product reference: ${word}`);
  }
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});
