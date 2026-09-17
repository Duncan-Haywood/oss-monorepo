import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the page carries the standard disclaimer and sponsor link', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

// Regression: sitemap.xml was missing how-do-i-decide-which-job-to-take-first.html,
// a real page linked from index.html, so a crawler following robots.txt ->
// sitemap.xml never discovered it. Same defect class fixed for
// public-record-watch in #3289.
test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// Closest sibling: same trades-paid subcategory, but reviewing a finished
// job's estimate vs actuals rather than ranking what to take next. Without
// a crawlable link here, a crawler entering on the ranker never reaches the
// variance calculator in one hop.
test('index links one hop to the job-margin-variance sibling', () => {
  assert.match(
    html,
    /href="\.\.\/job-margin-variance\/"/,
    'index must link ../job-margin-variance/ so crawlers reach the variance calculator in one hop',
  );
});
