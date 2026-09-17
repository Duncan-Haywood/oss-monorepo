import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { compareBuyout, formatMoney } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./should-i-buy-out-my-equipment-lease.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const GUIDE = 'should-i-buy-out-my-equipment-lease.html';

test('the calculator links to its guide page and the guide is listed in the sitemap', () => {
  assert.match(index, new RegExp(GUIDE.replace(/\./g, '\\.')));
  assert.match(sitemap, new RegExp(GUIDE.replace(/\./g, '\\.')));
});

test('the guide is question-shaped, indexable, and links back to the tool', () => {
  assert.match(page, /<title>Should I Buy Out My Equipment Lease\?/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(page, /rel="canonical" href="\.\/should-i-buy-out-my-equipment-lease\.html"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
});

test('the guide carries the standard no-warranty and sponsorship clauses', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /no data is uploaded/i);
});

test('the guide makes no network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

// The whole point of the worked example is that its arithmetic is the tool's
// arithmetic. A guide that quotes figures the calculator would not produce
// teaches the reader something false about the tool it is selling, and the
// error is invisible on the page -- nothing else in the build recomputes prose.
// So the numbers are asserted against `compareBuyout` itself rather than
// hard-coded twice.
test('every figure in the worked example is what the calculator actually returns', () => {
  const result = compareBuyout({
    buyoutPrice: '14500',
    fairMarketValue: '11000',
    usefulLifeMonths: '60',
    replacementCost: '32000',
    replacementLifeMonths: '120',
    removalCost: '1800',
    downtimeDays: '4',
    dailyDowntimeCost: '950',
  });

  for (const value of [
    result.buyoutPrice,
    result.replacementCost,
    result.removalCost,
    result.downtimeCost,
    result.totalReplacementCost,
    result.costPerMonthBuyout,
    result.costPerMonthReplace,
    result.breakEvenBuyoutPrice,
    result.premiumOverFairMarketValue,
    result.totalSavingsOverUsefulLife,
    result.monthlySavings,
  ]) {
    assert.ok(
      page.includes(formatMoney(value)),
      `the worked example is missing ${formatMoney(value)}, which the calculator returns for these inputs`,
    );
  }

  // The page's headline claim is the counterintuitive one: a buyout priced
  // above fair market value that is still the cheaper path. If a future edit
  // to `calc.mjs` flipped that, the prose would silently become wrong.
  assert.equal(result.buyoutWins, true);
  assert.ok(result.premiumOverFairMarketValue > 0);
  assert.equal(Math.round(result.premiumOverFairMarketValuePercent), 32);
});

// `platform/pages/faq-visible.test.mjs` enforces this across the catalogue;
// asserting it here too means a broken answer fails in the venture's own suite,
// where the author is still looking, rather than in a catalogue-wide run.
test('each FAQ answer in the JSON-LD appears verbatim as visible prose', () => {
  const block = page.match(/<script type="application\/ld\+json">(\{"@context".*?\})<\/script>/s);
  assert.ok(block, 'the guide should carry one FAQPage JSON-LD block');
  const { mainEntity } = JSON.parse(block[1]);
  assert.ok(mainEntity.length >= 4, 'a guide page earns its place with several real questions');

  for (const entry of mainEntity) {
    assert.ok(
      page.includes(entry.name),
      `the question "${entry.name}" is in the schema but not visible on the page`,
    );
    assert.ok(
      page.includes(entry.acceptedAnswer.text),
      `the answer to "${entry.name}" is in the schema but not visible verbatim on the page`,
    );
  }
});
