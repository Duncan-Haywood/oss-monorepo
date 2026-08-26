import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Porta Potty Event Quote Calculator/);
  assert.match(html, /portable restroom event rental/i);
  assert.match(html, /calculateQuote/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /health-department/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /github.com\/Duncan-Haywood\/monorepo-projects/);
});

test('SEO page answers the search question and does not claim a code table', () => {
  const html = page('how-many.html');
  assert.match(html, /How many porta potties for 200 people/i);
  assert.match(html, /not a health-code table/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /portable-restroom-event-quote\/<\/loc>/);
  assert.match(sitemap, /how-many\.html/);
});
