import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-saasphalt.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.ok(html.includes('This free tool is not structural, construction, building-code, legal, tax, financial, traffic-engineering, or ADA advice'));
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with SaaSphalt', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by SaaSphalt/);
});

test('no unverifiable price is claimed for SaaSphalt', () => {
  // saasphalt.com is not reachable from this session (the agent egress proxy refuses arbitrary hosts
  // with CONNECT tunnel failed, response 403). A web search -- a separate tool, not blocked --
  // surfaced SaaSphalt's identity: estimating, scheduling and invoicing software for asphalt
  // contractors, with a striping module, a QuickBooks integration, and customisation. No pricing was
  // surfaced from SaaSphalt's own page, so no dollar figure is repeated as fact here.
  assert.doesNotMatch(html, /SaaSphalt[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-saasphalt\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-saasphalt\.html"|href="vs-saasphalt\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-saasphalt\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-stripe-a-parking-lot.html"/);
});
