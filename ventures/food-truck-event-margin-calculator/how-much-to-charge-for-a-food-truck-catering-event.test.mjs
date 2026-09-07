import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateQuote, DEFAULTS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(
  new URL('./how-much-to-charge-for-a-food-truck-catering-event.html', import.meta.url),
  'utf8',
);
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const GUIDE = /how-much-to-charge-for-a-food-truck-catering-event\.html/;

const money = (value) => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('the calculator links to its guide page and the guide is listed in the sitemap', () => {
  assert.match(index, GUIDE);
  assert.match(sitemap, GUIDE);
});

test('the guide is question-shaped, indexable, and links back to the tool', () => {
  assert.match(page, /<title>How Much to Charge for a Food Truck Catering or Event Booking/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(page, /rel="canonical" href="\.\/how-much-to-charge-for-a-food-truck-catering-event\.html"/);
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

// The worked example is the guide's whole argument, so its figures are
// asserted against `calculateQuote` rather than transcribed. Nothing else in
// the build recomputes prose: if a rate or a formula in `calc.mjs` changed,
// this page would go on confidently quoting the old arithmetic.
test('the base worked example matches what the calculator returns for the documented inputs', () => {
  const quote = calculateQuote({ ...DEFAULTS });

  // The committed-time claim the headline rests on.
  assert.equal(quote.onSiteHours, 8);
  assert.equal(Number(quote.committedHoursPerStaff.toFixed(2)), 8.67);
  assert.match(page, /8 hours 40 minutes/);

  for (const value of [
    quote.laborCost,
    quote.mileageCost,
    quote.peakPremium,
    quote.foodCost,
    quote.directCost,
    quote.overhead,
    quote.totalCost,
    quote.price,
    quote.profit,
    quote.profitPerCommittedHour,
    quote.pricePerGuest,
  ]) {
    assert.ok(
      page.includes(money(value)),
      `the worked example is missing ${money(value)}, which the calculator returns for the default inputs`,
    );
  }
});

test('the busy-turnout comparison matches what the calculator returns at 150 guests', () => {
  const base = calculateQuote({ ...DEFAULTS });
  const busy = calculateQuote({ ...DEFAULTS, expectedGuests: 150 });

  assert.ok(page.includes(money(busy.foodCost)), 'the busy-case food cost is missing');
  assert.ok(page.includes(money(busy.totalCost)), 'the busy-case total cost is missing');

  // Profit at the *base* price when the event runs busy -- the number the
  // whole section exists to show, and one the tool reports only indirectly.
  const profitIfBusyAtBasePrice = base.price - busy.totalCost;
  assert.ok(
    page.includes(money(profitIfBusyAtBasePrice)),
    `the busy-case profit at the quoted price (${money(profitIfBusyAtBasePrice)}) is missing`,
  );

  // The claim in the callout: profit falls by half.
  const drop = 1 - profitIfBusyAtBasePrice / base.profit;
  assert.equal(Math.round(drop * 100), 50);

  // And the tool's own risk flag agrees with what the page implies.
  assert.equal(base.foodBudgetTight, false);
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
