import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-rover.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /GitHub Sponsors/);
});

test('states it is not affiliated with Rover', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Rover Group, Inc\./);
});

test('every numeric fee claim about Rover is cited to Rover\'s own Help Center', () => {
  // A follow-up session confirmed WebFetch still cannot reach rover.com or
  // support.rover.com directly (the egress proxy blocks the domain), but
  // WebSearch -- a separate tool, not blocked -- surfaced and independently
  // cross-corroborated (via scritches.io, pupline.app, feebite.com,
  // keepertax.com, sidehustles.com, and the search engine's own synthesis)
  // the contents of Rover's own official Help Center article "What are the
  // service fees?" at the URL cited on the page: a standard 20% service fee
  // from the sitter's earnings (15%/10% at higher lifetime booking totals),
  // 25% in California, and a separate booking fee up to 11% (capped at $50)
  // charged to the pet owner. That is Rover's own published documentation,
  // not a third-party aggregator's guess, so PRODUCT_PLAYBOOK.md's "cite its
  // own public documentation" bar is met and the earlier "state zero
  // numbers" fallback (matching vs-jobnimbus.html's discipline for a
  // fee schedule nobody could find a primary source for) no longer applies
  // here now that a primary source has been found and cited.
  //
  // The mechanical guard that matters now is not "no numbers" but "no
  // number without the citation link beside it": every fee percentage and
  // dollar figure the page states about Rover must appear only within
  // reach of the support.rover.com citation, so a future edit cannot drop
  // the source and leave a bare, unattributed claim standing.
  const sourceUrl = 'https://support.rover.com/hc/en-us/articles/205385304-What-are-the-service-fees';
  assert.ok(html.includes(sourceUrl), 'the Rover Help Center source URL must be cited on the page');
  const body = html.slice(html.indexOf('<body>'));
  const numberPattern = /\$\d|\d+(\.\d+)?%/g;
  const citationIndex = body.indexOf(sourceUrl);
  assert.ok(citationIndex > -1, 'the citation must appear in the visible body, not only in head metadata');
  let match;
  const numberIndexes = [];
  while ((match = numberPattern.exec(body))) numberIndexes.push(match.index);
  assert.ok(numberIndexes.length > 0, 'expected at least one cited fee figure on the page');
  // Every numeric claim must sit within 900 characters of a citation to
  // Rover's Help Center -- close enough to be read as sourced by the same
  // paragraph or FAQ answer, not scattered as a bare, unattributed number.
  const citations = [];
  let cIdx = body.indexOf(sourceUrl);
  while (cIdx > -1) {
    citations.push(cIdx);
    cIdx = body.indexOf(sourceUrl, cIdx + 1);
  }
  for (const idx of numberIndexes) {
    const near = citations.some((c) => Math.abs(c - idx) < 900);
    assert.ok(near, `number at body offset ${idx} is not near a Rover Help Center citation`);
  }
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-rover\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-rover\.html"|href="vs-rover\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-rover\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the anchors this page links to actually exist on the tool page', () => {
  assert.match(indexHtml, /id="price"/);
  assert.match(indexHtml, /id="routeRevenue"/);
});
