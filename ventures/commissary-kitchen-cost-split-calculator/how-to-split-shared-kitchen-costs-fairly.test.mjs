import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { computeSplit, resolvePoolTotalCents, DEFAULTS } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('how-to-split-shared-kitchen-costs-fairly.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the fairness guide', () => {
  assert.match(index, /how-to-split-shared-kitchen-costs-fairly\.html/);
  assert.match(readme, /how-to-split-shared-kitchen-costs-fairly\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /commissary-kitchen-cost-split-calculator\/<\/loc>/);
  assert.match(sitemap, /how-to-split-shared-kitchen-costs-fairly\.html/);
});

test('the guide carries the required disclaimers and links back', () => {
  assert.match(html, /<title>How to Split Shared Kitchen Costs Fairly/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /Nothing leaves your browser/);
});

test('the page never calls an even split a bad-faith practice', () => {
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless', 'unfair to the operator']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the guide uses "${word}"`);
  }
});

test('the worked figures match the calculator\'s own verified defaults', () => {
  const even = computeSplit({ ...DEFAULTS, splitMethod: 'equal' });
  const hours = computeSplit({ ...DEFAULTS, splitMethod: 'hours' });
  const blend = computeSplit(DEFAULTS);
  const pool = resolvePoolTotalCents(DEFAULTS);

  assert.equal(pool, 500000);
  assert.deepEqual(even.tenants.map((t) => t.totalCents), [166666, 166667, 166667]);
  assert.deepEqual(hours.tenants.map((t) => t.totalCents), [246250, 156719, 97031]);
  assert.deepEqual(blend.tenants.map((t) => t.totalCents), [256482, 152882, 90636]);

  for (const figure of [
    '$1,666.66', '$1,666.67', '$2,462.50', '$1,567.19', '$970.31',
    '$2,564.82', '$1,528.82', '$906.36', '$5,000.00', '$898.16',
  ]) {
    assert.ok(html.includes(figure), `guide is missing figure ${figure}`);
  }
});

test('FAQPage JSON-LD answers match the visible prose exactly', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  const visible = html.replace(/&mdash;/g, '—');
  for (const qa of ld.mainEntity) {
    assert.ok(visible.includes(qa.name), `visible prose is missing the exact FAQ question "${qa.name}"`);
    assert.ok(visible.includes(qa.acceptedAnswer.text), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});
