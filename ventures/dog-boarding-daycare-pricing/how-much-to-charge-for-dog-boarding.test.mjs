import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculate, occupancyBreakeven, DEFAULTS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./how-much-to-charge-for-dog-boarding.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const GUIDE = /how-much-to-charge-for-dog-boarding\.html/;

const money = (value) => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('the calculator links to its guide page and the guide is listed in the sitemap', () => {
  assert.match(index, GUIDE);
  assert.match(sitemap, GUIDE);
});

test('the guide is question-shaped, indexable, and links back to the tool', () => {
  assert.match(page, /<title>How Much to Charge for Dog Boarding/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(page, /rel="canonical" href="\.\/how-much-to-charge-for-dog-boarding\.html"/);
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

test('the single-reservation worked example matches what the calculator returns', () => {
  const r = calculate(DEFAULTS);
  assert.equal(r.baseCostPerDogDay, 23);
  assert.equal(r.dailyRate, 28.75);
  for (const value of [r.laborCostPerDogDay, r.baseCostPerDogDay, r.dailyRate, r.marginPerDogDay, r.finalPrice]) {
    assert.ok(page.includes(money(value)), `the worked example is missing ${money(value)}`);
  }
});

test('the multi-dog worked example matches what the calculator returns', () => {
  const two = calculate({ ...DEFAULTS, dogCount: 2 });
  const fullPrice = calculate(DEFAULTS).finalPrice * 2;
  assert.ok(page.includes(money(two.finalPrice)), `missing two-dog price ${money(two.finalPrice)}`);
  assert.ok(page.includes(money(fullPrice)), `missing undiscounted two-dog price ${money(fullPrice)}`);
  assert.ok(page.includes(money(two.multiDogDiscountAmount)), `missing multi-dog discount amount ${money(two.multiDogDiscountAmount)}`);
});

test('the long-stay worked example matches what the calculator returns', () => {
  const ten = calculate({ ...DEFAULTS, boardingNights: 10 });
  assert.equal(ten.standardDays, 7);
  assert.equal(ten.discountedDays, 3);
  assert.ok(page.includes(money(ten.finalPrice)), `missing 10-night total ${money(ten.finalPrice)}`);
  assert.ok(page.includes(money(ten.longStayDiscountAmount)), `missing long-stay discount amount ${money(ten.longStayDiscountAmount)}`);
  const flatDiscountTotal = ten.dailyRate * 10 * (1 - DEFAULTS.longStayDiscountPct / 100);
  assert.ok(page.includes(money(flatDiscountTotal)), `missing the flat-discount comparison figure ${money(flatDiscountTotal)}`);
});

test('the occupancy worked example matches what the calculator returns', () => {
  const o = occupancyBreakeven(DEFAULTS);
  const o30 = occupancyBreakeven({ ...DEFAULTS, projectedOccupancyPct: 30 });
  assert.ok(page.includes(`${o.breakEvenOccupancyPct.toFixed(1)}%`), 'missing break-even occupancy percentage');
  assert.ok(page.includes(money(o.projectedProfit)), `missing projected profit ${money(o.projectedProfit)}`);
  assert.ok(page.includes(`${o.projectedDogDays.toFixed(1)}`), 'missing projected dog-days at 65%');
  assert.ok(page.includes(`${o30.projectedDogDays.toFixed(1)}`), 'missing projected dog-days at 30%');
  assert.ok(o30.projectedProfit < 0, 'the 30% projection should be a shortfall');
  assert.ok(page.includes(money(Math.abs(o30.projectedProfit))), `missing shortfall amount ${money(Math.abs(o30.projectedProfit))}`);
  assert.ok(page.includes(`${o30.occupancyGapPct.toFixed(1)} points`) || page.includes(`${o30.occupancyGapPct.toFixed(1)} percentage points`), 'missing occupancy gap figure');
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
