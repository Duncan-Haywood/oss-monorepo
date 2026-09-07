import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const article = readFileSync(join(root, 'two-story-gutter-cleaning-cost.html'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');

test('the landing page names the search problem and the product', () => {
  assert.match(html, /<title>Gutter Cleaning Bid Calculator/);
  assert.match(html, /name="description"/);
  assert.match(html, /two-story/);
  assert.match(html, /gutter guards/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /SoftwareApplication/);
});

test('the user sees the disclaimer and the privacy line', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /usageOptOut/);
});

test('the companion article answers the two-story question and stays crawlable', () => {
  assert.match(article, /<title>Why two-story gutter cleaning costs more/);
  assert.match(article, /FAQPage/);
  assert.match(article, /micro-mesh/i);
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /gutter-cleaning-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /two-story-gutter-cleaning-cost\.html/);
});

// Closest sibling: same exterior-maintenance crew, routinely bundled onto one visit. Related-tool chrome rotates inside the
// Cleaning, restoration & insulation subcategory, so without an explicit one-hop a crawler on this page
// may never land on that tool.
test('index links one hop to the pressure-washing-bid-calculator sibling', () => {
  const siblingPage = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    siblingPage,
    /href="\.\.\/pressure-washing-bid-calculator\/"/,
    'index must link ../pressure-washing-bid-calculator/ so crawlers reach it in one hop',
  );
  assert.match(siblingPage, /pressure washing bid calculator/i);
});
