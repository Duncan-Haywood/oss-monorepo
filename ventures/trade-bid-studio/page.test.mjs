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

test('page wires the trade takeoff into the bid and says where its rates come from', () => {
  const html = page('index.html');
  assert.match(html, /from '\.\/takeoff\.mjs'/);
  assert.match(html, /from '\.\/presets\.mjs'/);
  assert.match(html, /<select id="trade">/);
  assert.match(html, /id="takeoffRows"/);
  assert.match(html, /#trade=/);
  assert.match(html, /Where do the trade starting rates come from\?/);
  // The visible FAQ and the FAQPage JSON-LD must ask the same questions.
  const visible = [...html.matchAll(/<h3>([^<]+\?)<\/h3>/g)].map(m => m[1]);
  const ld = [...html.matchAll(/"@type":"Question","name":"([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(visible, ld);
});

test('page offers a printable customer proposal that prints nothing else', () => {
  const html = page('index.html');
  assert.match(html, /from '\.\/proposal\.mjs'/);
  assert.match(html, /from '\.\/quote\.mjs'/);
  assert.match(html, /id="printProposal"/);
  assert.match(html, /id="proposalDoc"/);
  assert.match(html, /body > :not\(#proposalDoc\) \{ display: none !important/);
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
