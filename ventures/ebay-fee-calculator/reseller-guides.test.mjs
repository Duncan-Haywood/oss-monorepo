import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const GUIDES = [
  'how-to-reconcile-marketplace-payouts-to-sales.html',
  'cost-of-goods-sold-for-resellers.html',
  'schedule-c-worksheet-for-resellers.html',
];
const index = read('index.html');
const sitemap = read('sitemap.xml');
const money = (s) => Number(s.replace(/[$,]/g, ''));

for (const f of GUIDES) {
  const html = read(f);
  test(`${f}: disclaimer, canonical, sitemap, linked from the tool page`, () => {
    assert.match(html, /<strong>No warranty\.<\/strong>/);
    assert.match(html, /not legal, tax, financial, or business advice/i);
    assert.match(html, new RegExp(`<link rel="canonical" href="${f.replace('.', '\\.')}">`));
    assert.ok(sitemap.includes(f), 'not in sitemap');
    assert.ok(index.includes(`href="${f}"`), 'not linked from index.html');
  });
  test(`${f}: FAQ schema is valid and matches the visible questions`, () => {
    const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    const schema = JSON.parse(m[1]);
    assert.equal(schema['@type'], 'FAQPage');
    for (const q of schema.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
  });
  test(`${f}: honest product status and no 1099-K fear`, () => {
    assert.match(html, /in development &mdash; early access/);
    assert.match(html, /href="https:\/\/marisstella\.app\/industries\/online-sellers\/"/);
    assert.doesNotMatch(html, /\$600(?![.,\d])/, 'the federal 1099-K threshold is $20,000 and 200 transactions, not $600');
    assert.match(html, /irs\.gov/);
  });
}

test('reconciliation bridge closes: payout + deductions = gross sales, + tax = buyer total', () => {
  const fvf = Math.round(1446 * 0.136 * 100) / 100 - Math.round(54 * 0.136 * 100) / 100;
  assert.equal(fvf.toFixed(2), '189.32');
  const gross = 923.68 + fvf + 30 * 0.4 + 40 + 135 + 50;
  assert.equal(gross.toFixed(2), '1350.00');
  const html = read(GUIDES[0]);
  for (const s of ['$923.68', '$189.32', '$12.00', '$1,350.00', '$1,446.00']) assert.ok(html.includes(s), s);
});

test('lot allocation sums back to the lot cost', () => {
  const total = 2 * 60 + 8 * 20 + 10 * 5;
  const each = [60, 20, 5].map((v) => Math.round((120 * v / total) * 100) / 100);
  assert.deepEqual(each, [21.82, 7.27, 1.82]);
  assert.equal((2 * each[0] + 8 * each[1] + 10 * each[2]).toFixed(2), '120.00');
});

test('Schedule C worked year adds up', () => {
  const html = read(GUIDES[2]);
  const cell = (line) => money(html.match(new RegExp(`<td>${line}[^<]*</td><td>.*?</td><td class="num">([^<]+)</td>`))[1]);
  const gross = cell('1 Gross') - cell('2 Returns') - cell('4 Cost');
  assert.equal(gross, cell('5 Gross profit'));
  const expenses = cell('8 Advertising') + cell('10 Commissions') + cell('18 Office') + cell('22 Supplies') + cell('27a Other');
  assert.equal(expenses, cell('28 Total'));
  assert.equal(gross - expenses, cell('31 Net profit'));
  const cogs = read(GUIDES[1]);
  assert.ok(cogs.includes('$8,200.00') && cogs.includes('$6,100.00'));
  assert.equal(1800 + 6400 - 2100, 6100);
});
