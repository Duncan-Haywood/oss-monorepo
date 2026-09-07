import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge for pressure washing/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});

// Closest sibling: same exterior-maintenance crew, routinely bundled onto one visit. Related-tool chrome rotates inside the
// Cleaning, restoration & insulation subcategory, so without an explicit one-hop a crawler on this page
// may never land on that tool.
test('index links one hop to the gutter-cleaning-bid-calculator sibling', () => {
  const siblingPage = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    siblingPage,
    /href="\.\.\/gutter-cleaning-bid-calculator\/"/,
    'index must link ../gutter-cleaning-bid-calculator/ so crawlers reach it in one hop',
  );
  assert.match(siblingPage, /gutter cleaning bid calculator/i);
});
