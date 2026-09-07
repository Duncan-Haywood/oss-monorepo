import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Asphalt Sealcoating Bid Calculator/);
  assert.match(html, /coats and the cracks/i);
  assert.match(html, /calculateBid/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /Copy share link/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /VOC/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /how-much-to-charge\.html/);
});

test('SEO page answers the search question and does not claim a spec sheet', () => {
  const html = page('how-much-to-charge.html');
  assert.match(html, /How much should I charge for sealcoating/i);
  assert.match(html, /not a manufacturer yield/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /asphalt-sealcoat-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge\.html/);
});

// Closest sibling: same asphalt shop, but an overlay / mill-and-overlay /
// full-depth pave rather than a sealcoat. Related-tool chrome rotates
// inside the trades category, so without an explicit one-hop a crawler on
// this page may never land on that tool.
test('index links one hop to the asphalt-driveway-pave-bid-calculator sibling', () => {
  const html = page('index.html');
  assert.match(
    html,
    /href="\.\.\/asphalt-driveway-pave-bid-calculator\/"/,
    'index must link ../asphalt-driveway-pave-bid-calculator/ so crawlers reach the paving calculator in one hop',
  );
  assert.match(html, /asphalt driveway paving bid calculator/i);
});
