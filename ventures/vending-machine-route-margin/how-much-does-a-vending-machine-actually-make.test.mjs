import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculate, computeRouteProfit, incomeGap, DEFAULTS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(
  new URL('./how-much-does-a-vending-machine-actually-make.html', import.meta.url),
  'utf8',
);
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const GUIDE = /how-much-does-a-vending-machine-actually-make\.html/;

const money = (value) => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('the calculator links to its guide page and the guide is listed in the sitemap', () => {
  assert.match(index, GUIDE);
  assert.match(sitemap, GUIDE);
});

test('the guide is question-shaped, indexable, and links back to the tool', () => {
  assert.match(page, /<title>How Much Does a Vending Machine Actually Make\?/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(
    page,
    /rel="canonical" href="\.\/how-much-does-a-vending-machine-actually-make\.html"/,
  );
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
});

test('the guide carries the standard no-warranty and sponsorship clauses', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /no data is uploaded/i);
});

// This page argues about a business people are sold on. The disclaimer has to
// say plainly that the worked figures are inputs rather than a projection of
// earnings, which is a stronger claim than the house no-warranty text alone.
test('the guide disclaims its figures as illustrative rather than expected earnings', () => {
  assert.match(page, /not a market rate, a typical result, or a projection of what any machine will earn/);
});

test('the guide makes no network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the per-visit worked example matches what the calculator returns', () => {
  const visit = calculate({ ...DEFAULTS });

  for (const value of [
    visit.grossRevenue,
    visit.cogs,
    visit.commissionAmount,
    visit.cardFeeAmount,
    visit.laborCost,
    visit.mileageCost,
    visit.machineCostPerVisit,
    visit.totalCost,
    visit.netProfit,
    visit.monthlyProfit,
  ]) {
    assert.ok(
      page.includes(money(value)),
      `the worked example is missing ${money(value)}, which the calculator returns for the default inputs`,
    );
  }

  // The headline pairing: monthly gross against monthly net.
  const monthlyGross = visit.grossRevenue * visit.visitsPerMonth;
  assert.ok(page.includes(money(monthlyGross)), 'the monthly gross revenue is missing');
  assert.match(page, new RegExp(`${money(monthlyGross).replace('$', '\\$')} a month in sales`));
  assert.equal(Number(visit.profitMarginPct.toFixed(1)), 21.7);
});

// The drive-time table is the guide's central claim -- that route density
// decides a location more than its sales do. Recomputed rather than
// transcribed so a change to the labor or mileage formula cannot leave the
// argument standing on stale numbers.
test('every row of the drive-time table is what the calculator returns', () => {
  const rows = [
    { driveMinutes: 5, mileage: 2 },
    { driveMinutes: 20, mileage: 8 },
    { driveMinutes: 35, mileage: 15 },
  ];

  const profits = [];
  for (const row of rows) {
    const visit = calculate({ ...DEFAULTS, driveMinutes: row.driveMinutes, mileage: row.mileage });
    profits.push(visit.monthlyProfit);
    for (const value of [visit.laborCost, visit.mileageCost, visit.netProfit, visit.monthlyProfit]) {
      assert.ok(
        page.includes(money(value)),
        `the ${row.driveMinutes}-minute-drive row is missing ${money(value)}`,
      );
    }
    assert.ok(
      page.includes(money(visit.effectiveHourlyRate)),
      `the ${row.driveMinutes}-minute-drive row is missing its effective hourly rate`,
    );
  }

  // Strictly decreasing: if this ever stopped holding, the section's argument
  // would be false while every individual figure on it stayed correct.
  assert.ok(profits[0] > profits[1] && profits[1] > profits[2]);

  // The callout names the worst row's hourly rate as the punchline.
  const worst = calculate({ ...DEFAULTS, driveMinutes: 35, mileage: 15 });
  assert.match(
    page,
    new RegExp(`pays ${money(worst.effectiveHourlyRate).replace('$', '\\$')} an hour`),
  );
});

test('the commission table matches the calculator at each split', () => {
  for (const commissionPct of [0, 15, 25]) {
    const visit = calculate({ ...DEFAULTS, commissionPct });
    for (const value of [visit.netProfit, visit.monthlyProfit]) {
      assert.ok(
        page.includes(money(value)),
        `the ${commissionPct}% commission row is missing ${money(value)}`,
      );
    }
  }

  // The asymmetry the section is about: 10 more points of commission costs
  // the operator far more than 10% of their profit.
  const at15 = calculate({ ...DEFAULTS, commissionPct: 15 }).monthlyProfit;
  const at25 = calculate({ ...DEFAULTS, commissionPct: 25 }).monthlyProfit;
  assert.equal(Math.round((1 - at25 / at15) * 100), 46);
});

test('the route-profit and income-gap figures match the calculator', () => {
  const base = calculate({ ...DEFAULTS });
  const locations = Array.from({ length: 3 }, () => ({ monthlyProfit: base.monthlyProfit }));
  const route = computeRouteProfit(locations);
  const gap = incomeGap(3000, route.totalMonthlyProfit, route.averageProfitPerLocation);

  assert.equal(route.locationCount, 3);
  assert.ok(page.includes(money(route.totalMonthlyProfit)), 'the total route profit is missing');
  assert.ok(page.includes(money(gap.gap)), 'the income gap is missing');
  assert.ok(
    page.includes(`<strong>${gap.additionalLocationsNeeded}</strong>`),
    `the additional-locations figure (${gap.additionalLocationsNeeded}) is missing`,
  );
  // The page states the total as well as the delta; keep them consistent.
  assert.ok(page.includes(`${gap.additionalLocationsNeeded + route.locationCount} in total`));
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
