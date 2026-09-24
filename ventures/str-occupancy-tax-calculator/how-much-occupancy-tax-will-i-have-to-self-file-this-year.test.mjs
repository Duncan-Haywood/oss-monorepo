import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateTax } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./how-much-occupancy-tax-will-i-have-to-self-file-this-year.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to the self-file guide, and it is in the sitemap', () => {
  assert.match(index, /how-much-occupancy-tax-will-i-have-to-self-file-this-year\.html/);
  assert.match(sitemap, /how-much-occupancy-tax-will-i-have-to-self-file-this-year\.html/);
});

// The tool's own defaults (index.html's #stayForm), same worked example the
// page's own FAQPage JSON-LD already quotes.
const WORKED_EXAMPLE = {
  rows: [
    { name: 'Florida state sales tax', ratePercent: '6', platformCollectsPercent: '100' },
    { name: 'County tourist development tax', ratePercent: '5', platformCollectsPercent: '0' },
  ],
  nightlyRate: '250',
  nights: '4',
  cleaningFee: '150',
  bookingsPerMonth: '6',
  flatFeePerNight: '0',
  flatFeePlatformCollectsPercent: '0',
};

const money = (value) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test("the guide's per-stay and per-month figures match calculateTax on the tool's own worked example", () => {
  const result = calculateTax(WORKED_EXAMPLE);
  assert.equal(result.ok, true);
  assert.equal(result.totalTax, 126.5);
  assert.equal(result.platformCollected, 69);
  assert.equal(result.hostMustRemit, 57.5);
  assert.equal(result.monthlyTax, 759);
  assert.equal(result.monthlyPlatformCollected, 414);
  assert.equal(result.monthlyHostMustRemit, 345);
  assert.match(guide, new RegExp(`\\$${money(result.hostMustRemit)}`));
  assert.match(guide, new RegExp(`\\$${money(result.monthlyHostMustRemit)}`));
});

test("the guide's annual figures are exactly 12x the tool's own monthly rollup", () => {
  const result = calculateTax(WORKED_EXAMPLE);
  const annualTotalTax = result.monthlyTax * 12;
  const annualPlatformCollected = result.monthlyPlatformCollected * 12;
  const annualHostMustRemit = result.monthlyHostMustRemit * 12;
  assert.equal(annualTotalTax, 9108);
  assert.equal(annualPlatformCollected, 4968);
  assert.equal(annualHostMustRemit, 4140);
  assert.match(guide, new RegExp(`\\$${money(annualTotalTax)}`));
  assert.match(guide, new RegExp(`\\$${money(annualPlatformCollected)}`));
  assert.match(guide, new RegExp(`\\$${money(annualHostMustRemit)}`, 'g'));
});

test('the guide carries a working FAQPage block whose questions are also rendered as visible copy', () => {
  const match = guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  assert.ok(match, 'expected a FAQPage JSON-LD block');
  const ld = JSON.parse(match[1]);
  assert.ok(ld.mainEntity.length >= 4);
  for (const entry of ld.mainEntity) {
    assert.ok(guide.includes(entry.name), `question not rendered as visible copy: ${entry.name}`);
    assert.ok(guide.includes(entry.acceptedAnswer.text), `answer not rendered as visible copy: ${entry.name}`);
  }
});

test('the guide never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(guide, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the guide carries the standard no-warranty disclaimer', () => {
  assert.match(guide, /No warranty/);
  assert.match(guide, /not legal, tax, accounting, or financial advice/);
});

test('the guide links back to the calculator', () => {
  assert.match(guide, /href="\.\/">/);
});
