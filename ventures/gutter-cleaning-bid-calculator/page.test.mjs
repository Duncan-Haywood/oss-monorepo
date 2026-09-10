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

// Closest sibling: same cleaning subcategory, but panes and travel rather than
// linear feet and downspouts. Related-tool chrome rotates inside the subcategory,
// so without an explicit one-hop a crawler on this page may never land on that tool.
test('index links one hop to the window-cleaning-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/window-cleaning-bid-calculator\/"/,
    'index must link ../window-cleaning-bid-calculator/ so crawlers reach the window calculator in one hop',
  );
  assert.match(html, /window cleaning bid calculator/i);
});

// Second sibling, added alongside the window pair rather than in place of it:
// same exterior-maintenance crew, and a wash is routinely bundled onto the same
// visit as the gutter clear. Both one-hops are kept -- a page may carry more
// than one, and dropping either would reopen an orphan.
test('index links one hop to the pressure-washing-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/pressure-washing-bid-calculator\/"/,
    'index must link ../pressure-washing-bid-calculator/ so crawlers reach it in one hop',
  );
  assert.match(html, /pressure washing bid calculator/i);
});
