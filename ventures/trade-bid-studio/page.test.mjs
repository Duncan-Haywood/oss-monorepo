import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readTrades } from './build-directory.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('page is usable without a build step and carries its disclaimers', () => {
  const html = page('index.html');
  assert.match(html, /Trade Bid Studio/);
  assert.match(html, /walk-away/i);
  assert.match(html, /calculateBid/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /markup-vs-margin\.html/);
  assert.match(html, /FAQPage/);
});

test('SEO page gives the formulas and links back', () => {
  const html = page('markup-vs-margin.html');
  assert.match(html, /cost &divide; \(1 &minus; margin\)/);
  assert.match(html, /FAQPage/);
  assert.match(html, /No warranty/);
  assert.match(html, /href="\.\/"/);
});

test('robots and sitemap let crawlers find both pages', () => {
  assert.match(page('robots.txt'), /Allow: \//);
  assert.match(page('sitemap.xml'), /trade-bid-studio\/<\/loc>/);
  assert.match(page('sitemap.xml'), /markup-vs-margin\.html/);
});

test('trades.json lists exactly the bid calculators on disk (run node build-directory.mjs if this fails)', () => {
  const onDisk = readTrades();
  const listed = JSON.parse(page('trades.json'));
  assert.ok(onDisk.length >= 100);
  assert.deepEqual(listed, onDisk);
  for (const t of listed) assert.ok(t.title && t.blurb, t.slug);
});
