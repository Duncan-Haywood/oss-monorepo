import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'which-canonical-finding-to-fix-first.html'), 'utf8');
const indexHtml = readFileSync(join(HERE, 'index.html'), 'utf8');
const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /href="LICENSE"/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/canonical-tag-check\/which-canonical-finding-to-fix-first\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('does not repeat a question index.html already answers', () => {
  assert.ok(!html.includes('<h3>Is a cross-domain canonical always wrong?</h3>'));
});

test('names all three danger-severity findings', () => {
  assert.match(html, /Multiple conflicting canonical tags/);
  assert.match(html, /Canonical target unreachable/);
  assert.match(html, /Canonical target marked noindex/);
});

test('is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?which-canonical-finding-to-fix-first\.html"/);
});

test('is listed in the sitemap', () => {
  assert.match(sitemap, /which-canonical-finding-to-fix-first\.html/);
});

test('links back to the tool', () => {
  assert.match(html, /<a href="\.\/">/);
});
