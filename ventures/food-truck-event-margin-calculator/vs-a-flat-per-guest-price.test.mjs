import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateQuote, DEFAULTS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(
  new URL('./vs-a-flat-per-guest-price.html', import.meta.url),
  'utf8',
);
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const PAGE = /vs-a-flat-per-guest-price\.html/;

const money = (value) => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('the calculator links to the comparison page and it is listed in the sitemap', () => {
  assert.match(index, PAGE);
  assert.match(sitemap, PAGE);
});

test('the comparison page is indexable and links back to the tool', () => {
  assert.match(page, /<title>This calculator vs\. a flat per-guest price/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(page, /rel="canonical" href="\.\/vs-a-flat-per-guest-price\.html"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
});

test('the page carries the standard no-warranty and sponsorship clauses, and names no company or product', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /no data is uploaded/i);
  assert.match(page, /names no company, product, or service/);
});

test('the page makes no network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

// The two-booking comparison is the page's whole argument, so every figure
// is asserted against calculateQuote rather than transcribed by hand.
test('the base (rate-setting) booking matches what the calculator returns for the documented inputs', () => {
  const base = calculateQuote({ ...DEFAULTS });

  assert.equal(Number(base.pricePerGuest.toFixed(2)), 15.09);
  for (const value of [base.price, base.totalCost]) {
    assert.ok(page.includes(money(value)), `the base booking is missing ${money(value)}`);
  }
  assert.ok(page.includes('$15.09'), 'the flat per-guest rate derived from the base booking is missing');
});

test('the smaller, farther booking and the flat-rate gap match what the calculator returns', () => {
  const base = calculateQuote({ ...DEFAULTS });
  const smaller = calculateQuote({
    ...DEFAULTS,
    expectedGuests: 40,
    foodCostPerGuest: 6,
    driveMinutesRoundTrip: 150,
    milesRoundTrip: 120,
    permitFeeCost: 75,
  });

  assert.equal(smaller.committedHoursPerStaff, 10.5);
  assert.match(page, /10 hours 30 minutes/);
  assert.match(page, /8 hours 40 minutes/);

  for (const value of [
    smaller.laborCost,
    smaller.mileageCost,
    smaller.totalCost,
    smaller.price,
  ]) {
    assert.ok(page.includes(money(value)), `the smaller booking is missing ${money(value)}`);
  }

  const flatQuoteForSmaller = base.pricePerGuest * 40;
  assert.ok(
    page.includes(money(flatQuoteForSmaller)),
    `the flat-rate quote for the smaller booking (${money(flatQuoteForSmaller)}) is missing`,
  );

  const gapVsBreakeven = flatQuoteForSmaller - smaller.totalCost;
  const gapVsBid = flatQuoteForSmaller - smaller.price;
  assert.ok(gapVsBreakeven < 0, 'the flat rate should quote below the smaller booking break-even');
  assert.ok(
    page.includes(money(Math.abs(gapVsBreakeven))),
    `the break-even shortfall (${money(Math.abs(gapVsBreakeven))}) is missing`,
  );
  assert.ok(
    page.includes(money(Math.abs(gapVsBid))),
    `the bid-price shortfall (${money(Math.abs(gapVsBid))}) is missing`,
  );
});

test('each FAQ answer in the JSON-LD appears verbatim as visible prose', () => {
  const block = page.match(/<script type="application\/ld\+json">(\{"@context".*?\})<\/script>/s);
  assert.ok(block, 'the page should carry one FAQPage JSON-LD block');
  const { mainEntity } = JSON.parse(block[1]);
  assert.ok(mainEntity.length >= 4, 'a comparison page earns its place with several real questions');

  for (const entry of mainEntity) {
    assert.ok(page.includes(entry.name), `the question "${entry.name}" is not visible on the page`);
    assert.ok(
      page.includes(entry.acceptedAnswer.text),
      `the answer to "${entry.name}" is not visible verbatim on the page`,
    );
  }
});
