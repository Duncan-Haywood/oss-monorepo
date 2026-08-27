import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateSeason } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /Price the winter, not the driveway/);
  assert.match(html, /<title>Snow Removal Bid Calculator \| Per-Push vs Seasonal Contract Price<\/title>/);
  assert.match(html, /meta name="description"/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /FAQPage/);
});

test('disclaimer and privacy are visible, not only in the README', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /github.com\/Duncan-Haywood\/monorepo-projects/);
});

test('the shipped starting route matches the documented eight-driveway winter', () => {
  const result = calculateSeason({
    sites: Array.from({ length: 8 }, () => ({
      name: 'Two-car driveway',
      minutesPerPush: 12,
      sidewalkMinutes: 8,
      saltBags: 1.5,
    })),
    operatorWage: 22,
    burdenRate: 30,
    truckHourly: 45,
    deadheadMinutesPerSite: 6,
    saltCostPerBag: 8,
    overheadRate: 15,
    targetMargin: 20,
    expectedSnowEvents: 10,
    expectedIceEvents: 6,
    passesPerSnowEvent: 1,
    proposedSeasonal: 2800,
  });
  // The page's example seasonal — $350/driveway × 8 — loses this winter.
  // breakEvenSnowEvents follows the proposed budget, so it is well under 10.
  assert.equal(result.proposedSeasonal.belowBreakEven, true);
  assert.ok(result.seasonalPrice > 7000);
  assert.ok(result.breakEvenSnowEvents < 10);
  assert.match(html, /length: 8/);
  assert.match(html, /value="10"/);
  assert.match(html, /value="6"/);
});
