import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-jobber.html', import.meta.url), 'utf8');
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

test('states it is not affiliated with Jobber', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Jobber/);
});

test('no unverifiable price is claimed for Jobber', () => {
  // getjobber.com is not reachable from this session by direct fetch (the
  // same egress-proxy block `decision_queue.py`'s `egress-policy` row is
  // about). A web search and a WebFetch of Jobber's own
  // getjobber.com/industries/appliance-repair-software/ page (a separate
  // route, not blocked) surfaced Jobber's own marketing copy describing its
  // category (field service management software for home service
  // businesses), its feature set (quoting, drag-and-drop scheduling with
  // route optimization, a CRM with appliance serial numbers and service
  // history, automated client texts, invoicing and online payments, the
  // "Client Hub"), its ongoing-account sales model, and its published
  // "400,000+ home service pros trust Jobber" figure -- all corroborated
  // from getjobber.com's own page.
  //
  // Third-party aggregator sites in the same results carried a monthly
  // price range. That could not be checked against Jobber's own current
  // pricing page from here, so it is not repeated as fact -- the same
  // discipline vs-housecall-pro.html uses for Housecall Pro, vs-fence-cloud.html
  // uses for Fence Cloud, and vs-smartmoving.html uses for SmartMoving. Only
  // well-documented, non-numeric identity facts are stated, and no dollar
  // figure for Jobber appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-jobber\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-jobber\.html"|href="vs-jobber\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-jobber\.html/);
});

test('the comparison page links back to the calculator and to the repair-or-replace walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="should-i-repair-or-replace-this-appliance\.html"/);
});
