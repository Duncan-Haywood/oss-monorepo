import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-onfleet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty and no-PHI disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or medical advice/i);
  assert.match(html, /Do not enter patient, specimen, or protected health information/);
});

test('states it is not affiliated with Onfleet', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Onfleet, Inc\./);
});

test('no unverifiable price is claimed for Onfleet', () => {
  // Onfleet's pricing page is not reachable from this session (network
  // egress in this environment is proxied and does not permit fetching
  // arbitrary vendor sites), so no current plan name or price could be
  // confirmed against a primary source -- same discipline the other vs-*
  // pages in this repo use. Only well-documented, non-numeric identity
  // facts (founding year, headquarters city, product category and target
  // customers) are stated; no dollar figure for Onfleet appears anywhere
  // on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-onfleet\.html">/);
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
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('every visible FAQ question also appears in the FAQPage block, and vice versa', () => {
  // The regression this repo has hit repeatedly: the JSON-LD FAQ drifting
  // from the visible copy. Check both directions -- an orphaned visible
  // question is as much a drift as an orphaned schema answer.
  const visible = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const schemaNames = schema.mainEntity.map((q) => q.name);
  assert.deepEqual([...visible].sort(), [...schemaNames].sort());
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-onfleet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-onfleet\.html/);
});

test('the comparison page links back to the calculator and to the margin guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="is-this-medical-courier-route-worth-it\.html"/);
});
