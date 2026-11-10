import test from 'node:test';
import assert from 'node:assert/strict';
import { samplePages, isSectionIndex } from './sideways-sample.mjs';

const site = new Set(['index.html', 'research/index.html', 'writing/index.html', 'compare/index.html', 'writing/some-post/index.html']);
const pages = [
  'index.html', 'compare/index.html', 'research/index.html', 'writing/index.html', 'writing/some-post/index.html',
  ...Array.from({ length: 200 }, (_, i) => `tool-${String(i).padStart(3, '0')}/index.html`),
].sort();
const owned = (rel) => site.has(rel);

test('a sample always carries the site-owned section index pages', () => {
  const got = samplePages(pages, 20, owned);
  assert.equal(got.length, 20);
  for (const rel of ['index.html', 'research/index.html', 'writing/index.html', 'compare/index.html']) {
    assert.ok(got.includes(rel), `${rel} missing from the sample`);
  }
  assert.equal(new Set(got).size, got.length, 'no page probed twice');
});

test('venture index pages are not pinned, deeper site pages are not pinned', () => {
  const got = samplePages(pages, 4, owned);
  assert.deepEqual(got.sort(), ['compare/index.html', 'index.html', 'research/index.html', 'writing/index.html']);
  assert.ok(isSectionIndex('about/index.html'));
  assert.ok(!isSectionIndex('writing/some-post/index.html'));
});

test('no sample, or a budget past the page count, probes everything', () => {
  assert.equal(samplePages(pages, 0, owned), pages);
  assert.equal(samplePages(pages, 10_000, owned), pages);
});
