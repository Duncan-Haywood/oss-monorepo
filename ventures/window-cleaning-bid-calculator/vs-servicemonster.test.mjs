import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-servicemonster.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with ServiceMonster', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ServiceMonster/);
});

test('no unverifiable price is claimed for ServiceMonster', () => {
  // www.servicemonster.com is not reachable from this session -- WebFetch to
  // www.servicemonster.com/company and www.servicemonster.com/industries/window-cleaning
  // both returned EGRESS_BLOCKED, confirmed live. A web search (a separate
  // tool from WebFetch, not blocked) surfaced ServiceMonster's founding
  // roots (2002, as carpet-cleaning software), headquarters (Bellingham,
  // WA), product category (field-service management software marketed to
  // window cleaning, pressure washing, and carpet cleaning businesses),
  // its own "trusted by thousands of service pros" claim, and industry
  // coverage of a 2023 acquisition by Teamfront -- but no dollar figure
  // from ServiceMonster's own current pricing page, since that page is not
  // reachable from this session. Third-party sites (Capterra, review
  // aggregators) reported plan prices, but those are not ServiceMonster's
  // own page and can go stale, so none is repeated as fact here. Same
  // discipline vs-smartmoving.html uses for SmartMoving and
  // vs-mobiletechrx.html uses for Mobile Tech RX. Only well-documented,
  // non-numeric identity facts are stated; no dollar figure appears
  // anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-servicemonster\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-servicemonster\.html"|href="vs-servicemonster\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-servicemonster\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-per-window\.html"/);
});
