import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Chimney Sweep Bid Calculator/);
  assert.match(html, /flue and the height/i);
  assert.match(html, /calculateBid/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /Copy share link/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /CSIA/);
  assert.match(html, /NFPA 211/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /github.com\/Duncan-Haywood\/monorepo-projects/);
  assert.match(html, /how-much-to-charge\.html/);
});

test('SEO page answers the search question and does not claim a code table', () => {
  const html = page('how-much-to-charge.html');
  assert.match(html, /How much should I charge for a chimney sweep/i);
  assert.match(html, /not a CSIA standard/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /chimney-sweep-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge\.html/);
});
