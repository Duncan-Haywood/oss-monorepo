import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-oneradon.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.ok(html.includes('It is not radon, environmental, construction, health, legal, tax, or financial advice'));
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with Sun Nuclear or SunRADON', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Sun Nuclear or SunRADON/);
});

test('no unverifiable price is claimed for OneRADON or its monitors', () => {
  // sunradon.com is not reachable from this session (the agent egress proxy refuses arbitrary
  // hosts with CONNECT tunnel failed, response 403). A web search -- a separate tool, not
  // blocked -- surfaced OneRADON's device-connected reporting features (Bluetooth/USB monitor
  // link, PDF report and invoice generation). No dollar figure was surfaced from Sun Nuclear's
  // own page, so none is repeated as fact here, matching the discipline vs-realgreen.html uses
  // for RealGreen.
  assert.doesNotMatch(html, /OneRADON[^<]*\$\d/);
  assert.doesNotMatch(html, /SunRADON[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-oneradon\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-oneradon\.html"|href="vs-oneradon\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-oneradon\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-radon-mitigation\.html"/);
});
