import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-procore.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('states it is not affiliated with Procore', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Procore Technologies\./);
});

test('no unverifiable price is claimed for Procore', () => {
  // procore.com is not reachable from the sandboxed worker that runs this
  // repo's routine sessions (network egress there is proxied and does not
  // permit fetching arbitrary vendor sites), so no current plan name or
  // price could be confirmed against a primary source from that
  // environment -- same discipline the other vs-* pages in this repo use
  // for the same reason (see pool-plaster-bid-calculator's vs-buildxact.html).
  // Only well-documented, non-numeric identity facts (founding year,
  // headquarters city, product category) are stated; no dollar figure for
  // Procore appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-procore\.html">/);
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
  assert.match(indexHtml, /href="vs-procore\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-procore\.html/);
});

test('the comparison page links back to the daily log and to the change-order walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-do-i-document-a-change-order\.html"/);
});

test('does not disparage the named platform', () => {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const word of ['worse', 'rip-off', 'ripoff', 'overpriced', 'scam', 'useless']) {
    assert.ok(!text.includes(word), `disparaging word on the page: ${word}`);
  }
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});
