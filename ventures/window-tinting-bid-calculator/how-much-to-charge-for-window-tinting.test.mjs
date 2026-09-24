import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateTintBid, DEFAULTS, FILM_TIERS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./how-much-to-charge-for-window-tinting.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const GUIDE = /how-much-to-charge-for-window-tinting\.html/;

const money = (value) => `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('the calculator links to its guide page and the guide is listed in the sitemap', () => {
  assert.match(index, GUIDE);
  assert.match(sitemap, GUIDE);
});

test('the guide is question-shaped, indexable, and links back to the tool', () => {
  assert.match(page, /<title>How Much to Charge for Window Tinting/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="robots" content="index,follow"/);
  assert.match(page, /rel="canonical" href="\.\/how-much-to-charge-for-window-tinting\.html"/);
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

// Film tier table: same seven-pane kit, no removal, only the film changes.
test('the film-tier comparison table matches what the calculator returns', () => {
  for (const filmTier of Object.keys(FILM_TIERS)) {
    const job = calculateTintBid({ ...DEFAULTS, filmTier, removeOldTint: false });
    assert.ok(page.includes(money(job.filmCost)), `${filmTier} film cost ${money(job.filmCost)} is missing`);
    assert.ok(page.includes(money(job.finalPrice)), `${filmTier} final price ${money(job.finalPrice)} is missing`);
  }
});

// Default job breakdown: full seven-pane ceramic kit, no removal.
test('the default-job breakdown matches what the calculator returns', () => {
  const job = calculateTintBid({ ...DEFAULTS });
  const marginAmount = job.priceAtMargin - job.directCost;

  assert.equal(job.totalSqFt.toFixed(1), '31.4');
  for (const value of [job.filmCost, job.laborCost, job.boothOverhead, job.directCost, marginAmount, job.finalPrice]) {
    assert.ok(page.includes(money(value)), `the default-job breakdown is missing ${money(value)}`);
  }
});

// Removal comparison: same ceramic seven-pane kit, with and without removal.
test('the removal comparison matches what the calculator returns', () => {
  const withoutRemoval = calculateTintBid({ ...DEFAULTS, removeOldTint: false });
  const withRemoval = calculateTintBid({ ...DEFAULTS, removeOldTint: true });

  assert.equal(withRemoval.removalMinutes, 82);
  assert.equal(withRemoval.totalMinutes, 202);
  for (const value of [withoutRemoval.laborCost, withoutRemoval.directCost, withoutRemoval.finalPrice]) {
    assert.ok(page.includes(money(value)), `the no-removal row is missing ${money(value)}`);
  }
  for (const value of [withRemoval.laborCost, withRemoval.directCost, withRemoval.finalPrice]) {
    assert.ok(page.includes(money(value)), `the with-removal row is missing ${money(value)}`);
  }

  const removalDelta = withRemoval.finalPrice - withoutRemoval.finalPrice;
  assert.ok(page.includes(money(removalDelta)), `the removal price delta ${money(removalDelta)} is missing`);
});

// Minimum job fee: a light front-two-only dyed job prices under the minimum
// and is floored, which is the guide's second central claim.
test('the minimum-job-fee example matches what the calculator returns', () => {
  const job = calculateTintBid({
    ...DEFAULTS,
    frontDoorWindows: 2,
    rearDoorWindows: 0,
    quarterWindows: 0,
    rearWindshield: 0,
    filmTier: 'dyed',
    removeOldTint: false,
  });

  assert.equal(job.minimumApplied, true);
  assert.equal(job.finalPrice, job.minimumJobFee);
  for (const value of [job.filmCost, job.laborCost, job.boothOverhead, job.directCost, job.priceAtMargin, job.minimumJobFee]) {
    assert.ok(page.includes(money(value)), `the minimum-job-fee example is missing ${money(value)}`);
  }
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
