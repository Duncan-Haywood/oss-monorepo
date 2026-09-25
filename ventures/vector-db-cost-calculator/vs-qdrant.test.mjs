import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-qdrant.html', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or engineering advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Qdrant', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Qdrant\./);
});

test('no unverifiable price is claimed for Qdrant', () => {
  // Qdrant's own site is not reachable from this session to confirm today's
  // plan names, unit prices, or free-tier limits (same discipline the vs-*
  // pages in this venture already use for Pinecone), so no dollar figure
  // appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-qdrant\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  for (const q of schema.mainEntity) {
    const heading = new RegExp(`<h3>${q.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\/h3>`);
    assert.match(html, heading, `FAQ heading missing from visible copy: ${q.name}`);
  }
});

test('links back to the calculator and the index-overhead guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /<a href="what-is-vector-index-overhead\.html">/);
});
