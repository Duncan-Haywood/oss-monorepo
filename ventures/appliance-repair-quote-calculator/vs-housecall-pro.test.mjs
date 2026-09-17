import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-housecall-pro.html', import.meta.url), 'utf8');
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

test('states it is not affiliated with Housecall Pro', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Housecall Pro/);
});

test('no unverifiable price is claimed for Housecall Pro', () => {
  // housecallpro.com is not reachable from this session -- a direct fetch
  // returns a 403 from the egress proxy, confirmed live, which is the same
  // block `decision_queue.py`'s `egress-policy` row is about. A web search
  // (a separate tool from a direct fetch, and not blocked) surfaced
  // Housecall Pro's own marketing copy describing its category (field
  // service management software for home service businesses), its feature
  // set (drag-and-drop scheduling calendar, real-time dispatch, automated
  // on-my-way texts with GPS tracking, online booking, recurring service
  // plans, a field mobile app for work orders and repair notes, estimates
  // and invoicing with automated reminders, card payments, QuickBooks
  // integration), its ongoing-account sales model, and its published
  // "over 200,000 field service professionals" figure -- all corroborated
  // from housecallpro.com's own pages in the result set.
  //
  // Third-party review sites in the same results carried monthly prices and
  // plan names. Those could not be checked against Housecall Pro's own
  // current pricing page from here, so they are not repeated as fact --
  // the same discipline vs-fence-cloud.html uses for Fence Cloud and
  // vs-smartmoving.html uses for SmartMoving. Only well-documented,
  // non-numeric identity facts are stated, and no dollar figure for
  // Housecall Pro appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-housecall-pro\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-housecall-pro\.html"|href="vs-housecall-pro\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-housecall-pro\.html/);
});

test('the comparison page links back to the calculator and to the repair-or-replace walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="should-i-repair-or-replace-this-appliance\.html"/);
});
