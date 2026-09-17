import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-coatingos.html', import.meta.url), 'utf8');
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

test('states it is not affiliated with CoatingOS', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by CoatingOS/);
});

test('no unverifiable price is claimed for CoatingOS', () => {
  // www.coatingos.com is not reachable from this session -- WebFetch to
  // www.coatingos.com/software/epoxy-contractor-software returned
  // EGRESS_BLOCKED, confirmed live. A web search (a separate tool from
  // WebFetch, not blocked) surfaced CoatingOS's product category (an
  // all-in-one business management app built specifically for floor
  // coating contractors -- epoxy, polyurea, polyaspartic, and concrete
  // coating professionals), its feature set (estimates, work orders,
  // invoices and payment tracking, scheduling, customer records, two-way
  // SMS, photo documentation, Square payment integration), and that it is
  // sold as an ongoing subscription with a free trial -- but no dollar
  // figure from CoatingOS's own current pricing page, since that page is
  // not reachable from this session. Same discipline vs-servicemonster.html
  // uses for ServiceMonster and vs-smartmoving.html uses for SmartMoving.
  // Only well-documented, non-numeric identity facts are stated about
  // CoatingOS; the one dollar figure on this page ($3-$5/sq ft) is this
  // venture's own example of a cut-rate special, not a CoatingOS price.
  assert.doesNotMatch(html, /CoatingOS[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-coatingos\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-coatingos\.html"|href="vs-coatingos\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-coatingos\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthroughs', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-an-epoxy-garage-floor\.html"/);
  assert.match(html, /href="how-much-to-charge-for-polyaspartic-garage-floor\.html"/);
});
