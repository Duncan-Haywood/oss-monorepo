import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-publint.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const docsHtml = fs.readFileSync(new URL('./why-package-json-exports-fields-drift-from-what-you-actually-publish.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not a guarantee that your package will install or import cleanly/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with publint', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by publint/i);
});

test('no unverifiable price is claimed for publint', () => {
  // publint's own current product details are not reachable from this
  // session to confirm live, so no dollar amount is invented here -- only
  // its well-documented, free/open-source product shape is described.
  assert.doesNotMatch(html, /\$\d/);
});

test('does not claim this tool does anything beyond exports-target existence', () => {
  assert.match(html, /checks existence only, nothing about resolution or module format/);
  assert.match(html, /It has\s+no install step, reads no\s+<code>node_modules<\/code>, and never talks\s+to the npm registry/);
});

test('does not claim publint accuracy or coverage either way', () => {
  assert.match(html, /does not evaluate publint's accuracy or coverage/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-publint\.html">/);
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

test('the comparison page is linked from the tool page', () => {
  assert.match(indexHtml, /href="\.\/vs-publint\.html"|href="vs-publint\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-publint\.html/);
});

test('the comparison page links back to the tool and the docs page', () => {
  assert.match(html, /href="\.\/"/);
  assert.match(html, /href="\.\/why-package-json-exports-fields-drift-from-what-you-actually-publish\.html"/);
});

test('the docs page links to the comparison page too', () => {
  assert.match(docsHtml, /href="\.\/vs-publint\.html"|href="vs-publint\.html"/);
});
