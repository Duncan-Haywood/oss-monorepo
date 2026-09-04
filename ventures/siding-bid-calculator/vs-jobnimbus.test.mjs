import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-jobnimbus.html', import.meta.url), 'utf8');
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

test('states it is not affiliated with JobNimbus', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by JobNimbus, Inc\./);
});

test('no unverifiable price is claimed for JobNimbus', () => {
  // jobnimbus.com is not reachable from this session with WebFetch (the
  // egress proxy blocks it), but a web search (a separate tool, not
  // blocked) surfaced JobNimbus's own "About" page together with
  // independent corroboration (a Mainsail Partners investor case study,
  // Utah Business Magazine, Roofing Contractor trade press, and a PRWeb
  // release) that all agree on: founded in 2013 by Ben Hodson, Nick Wood,
  // and Jason Wood; headquartered in Lehi, Utah; a CRM / job management
  // platform serving roofing, siding, gutter, solar, and other exterior
  // contractor trades, sold as an ongoing subscription account.
  //
  // No dollar figure, plan name, or current feature claim was available
  // from a source this session could treat as JobNimbus's own current
  // pricing, so none is stated -- the same discipline
  // furnace-bid-calculator/vs-servicetitan.html uses for ServiceTitan and
  // fence-bid-calculator/vs-fence-cloud.html uses for Fence Cloud. Only
  // well-documented, non-numeric identity facts are stated, and no dollar
  // figure for JobNimbus appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-jobnimbus\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-jobnimbus\.html"|href="vs-jobnimbus\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-jobnimbus\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
