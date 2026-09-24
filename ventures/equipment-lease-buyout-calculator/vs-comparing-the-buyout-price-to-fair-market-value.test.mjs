import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-comparing-the-buyout-price-to-fair-market-value.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its generic-method comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-comparing-the-buyout-price-to-fair-market-value\.html/);
  assert.match(sitemap, /vs-comparing-the-buyout-price-to-fair-market-value\.html/);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic sanity check (comparing the buyout
  // price to fair market value), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-lendzero.html and
  // vs-crest-capital.html, which name specific competitors.
  assert.doesNotMatch(page, /Lendzero|Crest Capital/i);
});

test('the comparison page carries the standard disclaimer and title', () => {
  assert.match(page, /<title>This calculator vs\. comparing the buyout price to fair market value/);
  assert.match(page, /name="description"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
});

test('the worked-example figures match calc.mjs on an $8,000 buyout with 6 months left vs. a $15,000, 60-month replacement', async () => {
  const { compareBuyout, formatMoney } = await import('./calc.mjs');

  const result = compareBuyout({
    buyoutPrice: 8000,
    fairMarketValue: 10000,
    usefulLifeMonths: 6,
    replacementCost: 15000,
    replacementLifeMonths: 60,
    removalCost: 0,
    downtimeDays: 0,
    dailyDowntimeCost: 0,
  });

  assert.equal(formatMoney(result.costPerMonthBuyout), '$1,333.33');
  assert.equal(formatMoney(result.costPerMonthReplace), '$250.00');
  assert.equal(formatMoney(result.breakEvenBuyoutPrice), '$1,500.00');
  assert.equal(formatMoney(Math.abs(result.totalSavingsOverUsefulLife)), '$6,500.00');
  assert.equal(result.buyoutWins, false);
  assert.equal(result.premiumOverFairMarketValuePercent, -20);

  const ratio = result.costPerMonthBuyout / result.costPerMonthReplace;
  assert.equal(ratio.toFixed(2), '5.33');

  for (const figure of [
    '$8,000', '$10,000', '20% below FMV', '6 months of useful life',
    '$15,000 replacement good for 60 months',
    '$1,333.33', '$250.00', '5.33 times', '$6,500', '$1,500',
  ]) {
    assert.ok(page.includes(figure), `worked-example figure ${figure} not found verbatim on the page`);
  }
});

test('the page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});
