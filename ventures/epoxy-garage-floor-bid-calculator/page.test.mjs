import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = name => readFileSync(join(root, name), 'utf8');

test('landing page is crawlable and names the contractor search phrases', () => {
  const html = read('index.html');
  assert.match(html, /<title>[^<]*Epoxy[^<]*Garage Floor/i);
  assert.match(html, /meta name="description"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /how much to charge for an epoxy garage floor/i);
  assert.match(html, /polyaspartic/i);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /usageOptOut/);
  assert.match(html, /Copy bid summary/);
});

test('how-to pages answer the two search questions and send the user to the calculator', () => {
  const epoxy = read('how-much-to-charge-for-an-epoxy-garage-floor.html');
  const poly = read('how-much-to-charge-for-polyaspartic-garage-floor.html');
  for (const html of [epoxy, poly]) {
    assert.match(html, /<title>/);
    assert.match(html, /FAQPage|HowTo|SoftwareApplication/);
    assert.match(html, /index\.html/);
    assert.match(html, /No warranty/);
  }
  assert.match(epoxy, /grind/i);
  assert.match(poly, /same-day|one-day|1-day/i);
});

test('robots and sitemap expose the landing page and both how-to pages', () => {
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /epoxy-garage-floor-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge-for-an-epoxy-garage-floor\.html/);
  assert.match(sitemap, /how-much-to-charge-for-polyaspartic-garage-floor\.html/);
});
