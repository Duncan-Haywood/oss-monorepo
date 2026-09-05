import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-realgreen.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.ok(html.includes('It is not electrical, lighting-design, building-code, legal, tax, or financial advice'));
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with RealGreen', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by RealGreen/);
});

test('no unverifiable price is claimed for RealGreen', () => {
  // realgreen.com's holiday-light product page is not reachable from this session (the agent egress
  // proxy refuses arbitrary hosts with CONNECT tunnel failed, response 403). A web search -- a
  // separate tool, not blocked -- surfaced RealGreen's holiday light installation software line and
  // its stated scope: marketing services, inventory management, estimating and scheduling, and job
  // tracking. No pricing was surfaced from RealGreen's own page, so no dollar figure is repeated as
  // fact here, matching the discipline vs-servicemonster.html uses for ServiceMonster.
  assert.doesNotMatch(html, /RealGreen[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-realgreen\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-realgreen\.html"|href="vs-realgreen\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-realgreen\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-hang-christmas-lights.html"/);
});
