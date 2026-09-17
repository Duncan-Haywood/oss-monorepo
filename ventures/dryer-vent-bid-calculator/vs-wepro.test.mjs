import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-wepro.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with WePro', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by WePro/);
});

test('no unverifiable price is claimed for WePro', () => {
  // wepro.ai is not reachable from this session -- WebFetch to
  // https://wepro.ai/industries/dryer-vent-cleaning-service-software/ returned
  // EGRESS_BLOCKED, confirmed live. A web search (a separate tool from
  // WebFetch, not blocked) surfaced WePro's product category (a field-service
  // app for dryer vent and duct cleaning companies) and its feature set
  // (scheduling, dispatch, job tracking, customer messaging, invoicing,
  // service reports), but no dollar figure for WePro's own current pricing --
  // none was found even from a third-party aggregator, so none is stated here.
  // Same discipline vs-coatingos.html uses for CoatingOS.
  assert.doesNotMatch(html, /WePro[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-wepro\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-wepro\.html"|href="vs-wepro\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-wepro\.html/);
});

test('the comparison page links back to the calculator and the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-dryer-vent-cleaning\.html"/);
});
