import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-bitumio.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with Bitumio', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Bitumio/);
});

test('no unverifiable price is claimed for Bitumio', () => {
  // bitumio.com is not reachable from this session -- WebFetch to
  // bitumio.com/ returned EGRESS_BLOCKED, confirmed live. A web search (a
  // separate tool from WebFetch, not blocked) surfaced Bitumio's product
  // category (asphalt estimation and scheduling software for paving
  // contractors, aimed at sealcoating/crack-filling/striping/repair work),
  // its feature set (job estimating, scheduling, customer management, job
  // costing, integrated map measurement, QuickBooks integration, automated
  // proposal generation, material-quantity calculations factoring crack
  // size/application method/coverage/waste), and that it is sold as a
  // subscription with a free tier -- but third-party sites (Software
  // Finder, Capterra) reported a per-user monthly price, and those are not
  // Bitumio's own page and can go stale, so no dollar figure is repeated
  // as fact here. Same discipline vs-servicemonster.html uses for
  // ServiceMonster and vs-coatingos.html uses for CoatingOS.
  assert.doesNotMatch(html, /Bitumio[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-bitumio\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-bitumio\.html"|href="vs-bitumio\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-bitumio\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
