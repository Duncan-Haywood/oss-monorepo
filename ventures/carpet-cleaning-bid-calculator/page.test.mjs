import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const howTo = readFileSync(join(root, 'how-to-price-carpet-cleaning.html'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');

test('landing page names the search problem and the hidden labor', () => {
  assert.match(html, /<title>[^<]*Carpet cleaning/i);
  assert.match(html, /meta name="description"[^>]+carpet cleaning/i);
  assert.match(html, /3.bed|per-room special|stairs/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /SoftwareApplication/);
});

test('the user-visible surface carries the disclaimer and a privacy line', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or business advice/);
  assert.match(html, /Nothing leaves your browser|never uploaded/i);
  assert.match(html, /usageOptOut/);
});

test('primary controls a technician can complete a bid with are present', () => {
  assert.match(html, /id="rooms"/);
  assert.match(html, /id="upholstery"/);
  assert.match(html, /id="stairFlights"/);
  assert.match(html, /id="travelMinutes"/);
  assert.match(html, /id="minimumCharge"/);
  assert.match(html, /id="proposedPrice"/);
  assert.match(html, /id="copySummary"/);
  assert.match(html, /how-to-price-carpet-cleaning\.html/);
});

test('how-to page answers the niche question and links back to the tool', () => {
  assert.match(howTo, /How to price carpet cleaning/i);
  assert.match(howTo, /FAQPage/);
  assert.match(howTo, /href="\.\/"/);
  assert.match(howTo, /No warranty/);
});

test('discoverability files let crawlers find both pages', () => {
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /carpet-cleaning-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-to-price-carpet-cleaning\.html/);
});
