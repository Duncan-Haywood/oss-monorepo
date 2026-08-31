// Structural tests for the venture's published pages. Until now this venture
// had calc.test.mjs and proposal.test.mjs (pure logic) plus usage.test.mjs,
// but nothing that reads index.html or how-to-bid-tree-removal.html — so a
// page that shipped without an og:* tag (how-to-bid-tree-removal.html did,
// until this change) had nothing to catch it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const index = page('index.html');

test('the calculator page carries the required disclaimer, privacy line, and schema.org markup', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Nothing leaves your browser/);
  assert.match(index, /<script type="application\/ld\+json">/);
  assert.match(index, /how-to-bid-tree-removal\.html/, 'the docs page must be linked from the calculator');
});

// A page missing og:* renders as a bare link with no preview when shared —
// PRODUCT_PLAYBOOK.md 5e requires Open Graph tags "so a shared link renders".
test('every published page carries Open Graph tags', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 2, 'expected at least the 2 known pages in this venture');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
  }
});

test('the docs page is listed in the sitemap', () => {
  const sitemap = page('sitemap.xml');
  assert.ok(sitemap.includes('how-to-bid-tree-removal.html'), 'the docs page is missing from the sitemap');
});
