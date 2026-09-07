import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge for kitchen hood cleaning/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});

// Closest sibling: same cleaning subcategory, but a residential / light-
// commercial air-duct clean rather than a restaurant hood. Without a
// crawlable link here, a crawler entering on the hood calculator never
// reaches the duct tool in one hop — same one-way orphan class as #3709 /
// #3729 / #3743 / #3778.
test('index links one hop to the duct-cleaning-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/duct-cleaning-bid-calculator\/"/,
    'index must link ../duct-cleaning-bid-calculator/ so crawlers reach the duct calculator in one hop',
  );
  assert.match(html, /duct cleaning bid calculator/i);
});
