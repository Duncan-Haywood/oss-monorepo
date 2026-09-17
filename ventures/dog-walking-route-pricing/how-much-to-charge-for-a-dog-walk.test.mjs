import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculate, computeRouteRevenue, incomeGap, DEFAULTS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./how-much-to-charge-for-a-dog-walk.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const GUIDE = /how-much-to-charge-for-a-dog-walk\.html/;

const money = (value) => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('the calculator links to its guide page and the guide is listed in the sitemap', () => {
  assert.match(index, GUIDE);
  assert.match(sitemap, GUIDE);
});

test('the guide is question-shaped, indexable, and links back to the tool', () => {
  assert.match(page, /<title>How Much to Charge for a Dog Walk/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(page, /rel="canonical" href="\.\/how-much-to-charge-for-a-dog-walk\.html"/);
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

test('the single-visit worked example matches what the calculator returns', () => {
  const visit = calculate({ ...DEFAULTS });

  assert.equal(visit.billableMinutes, 40);
  for (const value of [
    visit.laborCost,
    visit.mileageCost,
    visit.overheadPerVisit,
    visit.baseCost,
    visit.marginAmount,
    visit.finalPrice,
    visit.effectiveHourlyRate,
  ]) {
    assert.ok(
      page.includes(money(value)),
      `the worked example is missing ${money(value)}, which the calculator returns for the default inputs`,
    );
  }
});

// The route-density table is the guide's central claim: one flat rate cannot
// be right across a scattered book. Each row is recomputed here so a change to
// the mileage or labor formula cannot leave the prose quietly wrong.
test('every row of the route-density table is what the calculator returns', () => {
  const rows = [
    { driveMinutes: 5, mileage: 2, committed: 35 },
    { driveMinutes: 10, mileage: 4, committed: 40 },
    { driveMinutes: 20, mileage: 9, committed: 50 },
  ];

  for (const row of rows) {
    const visit = calculate({ ...DEFAULTS, driveMinutes: row.driveMinutes, mileage: row.mileage });
    assert.equal(visit.billableMinutes, row.committed);
    for (const value of [visit.mileageCost, visit.baseCost, visit.finalPrice]) {
      assert.ok(
        page.includes(money(value)),
        `the ${row.driveMinutes}-minute-drive row is missing ${money(value)}`,
      );
    }
  }

  // The headline contrast in the callout, stated as a spread rather than a
  // single price. If the two ends stopped differing, the section loses its point.
  const near = calculate({ ...DEFAULTS, driveMinutes: 5, mileage: 2 });
  const far = calculate({ ...DEFAULTS, driveMinutes: 20, mileage: 9 });
  assert.ok(far.finalPrice > near.finalPrice * 1.5);
  assert.match(page, new RegExp(`${money(near.finalPrice).replace(/\$/, '\\$')} job and a ${money(far.finalPrice).replace(/\$/, '\\$')} job`));
});

test('the route-revenue and income-gap figures match the calculator', () => {
  const clients = [
    { price: 22.34, visitsPerWeek: 5 },
    { price: 22.34, visitsPerWeek: 3 },
    { price: 22.34, visitsPerWeek: 5 },
    { price: 28, visitsPerWeek: 2 },
  ];
  const route = computeRouteRevenue(clients);
  const gap = incomeGap(3000, route.monthlyRevenue, route.averagePrice);

  assert.equal(route.totalVisitsPerMonth, 65);
  assert.ok(page.includes(String(route.totalVisitsPerMonth)));
  assert.ok(page.includes(money(route.averagePrice)), 'the average visit price is missing');
  assert.ok(page.includes(money(route.monthlyRevenue)), 'the monthly route revenue is missing');
  assert.ok(page.includes(money(gap.gap)), 'the income gap is missing');
  assert.ok(
    page.includes(`${gap.additionalVisitsNeeded} per month`),
    `the additional-visits figure (${gap.additionalVisitsNeeded}) is missing`,
  );
  assert.equal(gap.meetsTarget, false);
});

test('each FAQ answer in the JSON-LD appears verbatim as visible prose', () => {
  const block = page.match(/<script type="application\/ld\+json">(\{"@context".*?\})<\/script>/s);
  assert.ok(block, 'the guide should carry one FAQPage JSON-LD block');
  const { mainEntity } = JSON.parse(block[1]);
  assert.ok(mainEntity.length >= 4, 'a guide page earns its place with several real questions');

  for (const entry of mainEntity) {
    assert.ok(page.includes(entry.name), `the question "${entry.name}" is not visible on the page`);
    assert.ok(
      page.includes(entry.acceptedAnswer.text),
      `the answer to "${entry.name}" is not visible verbatim on the page`,
    );
  }
});
