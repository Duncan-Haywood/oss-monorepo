import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-quickbooks-online-invoicing.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('states it is not affiliated with QuickBooks or Intuit', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Intuit Inc\./);
});

test('no unverifiable price is claimed for QuickBooks', () => {
  // quickbooks.intuit.com is not reachable from this session (network egress
  // in this environment is proxied and does not permit fetching arbitrary
  // vendor sites), so no current plan name or price could be confirmed
  // against a primary source -- same discipline
  // electrical-panel-upgrade-bid-calculator/vs-servicetitan.html uses for
  // ServiceTitan. Only well-documented, non-numeric identity facts (maker,
  // product category, that it is a paid subscription) are stated; no dollar
  // figure for QuickBooks appears anywhere on this page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-quickbooks-online-invoicing\.html">/);
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
  assert.match(indexHtml, /href="vs-quickbooks-online-invoicing\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-quickbooks-online-invoicing\.html/);
});

test('the comparison page links back to the calculator and to the other landing pages', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="should-i-offer-2-10-net-30\.html"/);
  assert.match(html, /href="should-i-factor-this-invoice\.html"/);
  assert.match(html, /href="should-i-ask-for-a-deposit\.html"/);
});

test('it reports facts, not a recommendation to switch tools', () => {
  assert.doesNotMatch(html, /you should switch|replace quickbooks|better than quickbooks/i);
});
