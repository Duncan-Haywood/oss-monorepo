import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-quickbooks-job-costing.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not financial, tax, accounting, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with QuickBooks or Intuit', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Intuit or QuickBooks/);
});

test('no unverifiable price is claimed for QuickBooks', () => {
  // QuickBooks/Intuit's own pricing page is not reachable from this session
  // to confirm today's exact plan prices, so no dollar figure for QuickBooks
  // is invented here -- only its well-documented feature set (Projects /
  // job costing on the Plus and Advanced plans) is described, the same
  // discipline vs-fence-cloud.html uses for Fence Cloud.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-quickbooks-job-costing\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-quickbooks-job-costing\.html"|href="vs-quickbooks-job-costing\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-quickbooks-job-costing\.html/);
});

test('the comparison page links back to the calculator and to the variance explainer', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/why-did-my-job-cost-more-than-i-estimated\.html"/);
});
