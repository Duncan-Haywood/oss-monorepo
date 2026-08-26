import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(root, 'index.html'), 'utf8');
const replacePage = readFileSync(join(root, 'how-much-to-charge-to-replace-a-garage-door.html'), 'utf8');
const springPage = readFileSync(join(root, 'how-much-to-charge-for-a-broken-spring.html'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');

test('landing page names the niche problem and is crawlable', () => {
  assert.match(index, /<title>Garage Door Bid Calculator/);
  assert.match(index, /name="description"/);
  assert.match(index, /application\/ld\+json/);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /\$189 spring special/);
  assert.match(index, /16×7 is not two 8×7s/);
  assert.match(index, /Nothing leaves your browser/);
  assert.match(index, /No warranty/);
  assert.match(index, /not legal, tax, financial, engineering/);
  assert.match(index, /usageOptOut/);
  assert.match(index, /Copy bid summary/);
  assert.match(index, /github.com\/Duncan-Haywood\/monorepo-projects/);
});

test('niche how-to pages answer the search query in the first screen', () => {
  assert.match(replacePage, /How much to charge to replace a garage door/i);
  assert.match(replacePage, /FAQPage/);
  assert.match(replacePage, /16×7 is not two 8×7s/);
  assert.match(springPage, /How much to charge for a broken garage door spring/i);
  assert.match(springPage, /\$189/);
  assert.match(springPage, /travel labor/);
});

test('robots and sitemap expose the calculator and the how-to pages', () => {
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap.xml/);
  assert.match(sitemap, /garage-door-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge-to-replace-a-garage-door.html/);
  assert.match(sitemap, /how-much-to-charge-for-a-broken-spring.html/);
});
