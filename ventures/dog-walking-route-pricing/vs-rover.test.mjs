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

test('no unverifiable price or fee percentage is claimed for Rover', () => {
  // rover.com is not reachable from this session with WebFetch (the egress
  // proxy blocks it). A web search (a separate tool, not blocked) surfaced
  // Rover's own identity facts corroborated by Wikipedia and Rover's own
  // press releases: founded 2011 in Seattle as "A Place for Rover, Inc.",
  // a marketplace for pet sitting, boarding, dog walking, and drop-in
  // visits, publicly listed 2021-2024 before being taken private by
  // Blackstone. Several independent aggregator sites also quote a current
  // sitter service fee and owner booking fee, but none of them is Rover's
  // own current fee-schedule page, so -- the same discipline
  // ventures/siding-bid-calculator/vs-jobnimbus.html uses for JobNimbus --
  // no dollar figure or fee percentage for Rover is stated on this page,
  // only the well-corroborated, non-numeric identity and business-model
  // facts above.
  const body = html.slice(html.indexOf('<body>'));
  assert.doesNotMatch(body, /\$\d/);
  assert.doesNotMatch(body, /\d+(\.\d+)?%/);
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
