import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculate } from '../app.mjs';

const docsPage = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = docsPage('how-much-more-does-a-national-or-worldwide-license-cost.html');
const index = docsPage('index.html');

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

test('index links to the territory SEO/AI-discovery page', () => {
  assert.match(index, /how-much-more-does-a-national-or-worldwide-license-cost\.html/);
});

test('the territory page answers the search question with a worked table', () => {
  assert.match(html, /How Much More Does a National or Worldwide Photo License Cost Than Local/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not legal, tax, financial, or copyright advice/i);
});

test('the table figures match calculate() at the stated shoot defaults, not hand-typed numbers', () => {
  const base = { creative: 1200, images: 5, term: 6, exclusivity: 1, rush: 0, channels: [{ name: 'web', factor: 1 }] };
  const territories = [
    ['Local / one city', 1],
    ['Country / national', 1.25],
    ['Worldwide', 1.6],
  ];
  for (const [, territory] of territories) {
    const result = calculate({ ...base, territory });
    assert.match(html, new RegExp(money(result.rights).replace(/[$,.]/g, '\\$&')), `usage rights for territory ${territory} should appear as ${money(result.rights)}`);
    assert.match(html, new RegExp(money(result.total).replace(/[$,.]/g, '\\$&')), `total quote for territory ${territory} should appear as ${money(result.total)}`);
    assert.match(html, new RegExp(money(result.perImage).replace(/[$,.]/g, '\\$&')), `per-image allocation for territory ${territory} should appear as ${money(result.perImage)}`);
  }

  const local = calculate({ ...base, territory: 1 });
  const national = calculate({ ...base, territory: 1.25 });
  const worldwide = calculate({ ...base, territory: 1.6 });
  // National is exactly 1.25/1 of local's rights, worldwide exactly 1.6/1 -- the
  // relationship the page's prose claims holds for any shoot with the same
  // channels, term, and exclusivity.
  assert.equal(national.rights, local.rights * 1.25);
  assert.equal(worldwide.rights, local.rights * 1.6);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /commercial-photo-license-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-more-does-a-national-or-worldwide-license-cost\.html/);
});
