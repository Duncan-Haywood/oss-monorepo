import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-marginedge.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with MarginEdge', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by MarginEdge/);
});

test('no unverifiable price is claimed for MarginEdge', () => {
  // marginedge.com is not reachable from this session (egress here is proxied
  // and does not permit fetching arbitrary vendor sites), so no plan name or
  // subscription rate could be confirmed against a primary source -- the same
  // discipline every other vs-* page in this repo uses. Only well-documented,
  // non-numeric category facts are stated (invoice digitisation, inventory,
  // recipe costing, POS and accounting integrations, paid account-based
  // subscription), and no dollar figure appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-marginedge\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  // The defect this guards is the one CLAUDE.md records costing live product:
  // JSON-LD that diverges from the visible copy is a structured-data lie to a
  // crawler, and it drifts silently because nothing renders the schema.
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-marginedge\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-marginedge\.html/);
});

test('the comparison page links back to the calculator and to the guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-menu-engineering-works\.html"/);
});

test('the page is clear that this calculator holds and uploads nothing', () => {
  assert.match(html, /uploads nothing you type/);
  assert.match(html, /stores nothing and has no\s*account/);
});

test('the page does not claim to describe MarginEdge feature specifics it could not verify', () => {
  // Positive assertion that the hedge itself is present: a later edit that
  // quietly adds a confident feature list should fail here rather than ship.
  assert.match(html, /not reachable from the session that generated/);
});
