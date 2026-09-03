import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Irrigation Winterization Bid Calculator/);
  assert.match(html, /zones and the backflow/i);
  assert.match(html, /calculateBid/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /Copy share link/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /backflow/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /how-much-to-charge\.html/);
});

test('SEO page answers the search question and does not claim a winterization spec', () => {
  const html = page('how-much-to-charge.html');
  assert.match(html, /How much should I charge for a sprinkler blowout/i);
  assert.match(html, /not a winterization specification/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /irrigation-winterization-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge\.html/);
});
