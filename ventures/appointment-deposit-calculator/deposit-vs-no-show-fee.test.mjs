import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan } from './calc.mjs';

const page = readFileSync(new URL('./deposit-vs-no-show-fee.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const defaults = {
  price: 150,
  depositPercent: 25,
  bookingsPerWeek: 12,
  bookingRate: 93,
};

test('comparison page carries the no-warranty clause and links home', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not legal, tax, or financial advice/i);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /href="\.\.\/no-show-fee-calculator\/"/);
});

test('comparison page numbers match the calculator on its own defaults', () => {
  const result = plan(defaults);
  assert.equal(result.deposit, 37.5);
  assert.equal(result.balance, 112.5);
  assert.equal(result.weeklyBookings, 11.16);
  assert.equal(result.annual, 21762);
  assert.match(page, /\$37\.50/);
  assert.match(page, /\$112\.50/);
  assert.match(page, /11\.16/);
  assert.match(page, /\$21,762/);
});

test('index links to the comparison page and the sitemap lists it', () => {
  assert.match(index, /href="deposit-vs-no-show-fee\.html"/);
  assert.match(sitemap, /deposit-vs-no-show-fee\.html/);
});

test('the page quotes the net-revenue figures the calculator actually produces', () => {
  // The page hard-codes worked numbers, so it can drift from `plan()` silently.
  // Before the net-revenue model landed it did exactly that in the other
  // direction: it called $21,762 of collected deposits what a deposit "nets",
  // which is the misreading the second results panel exists to prevent.
  const result = plan({ ...defaults, noShowWithout: 15, noShowWith: 5 });
  assert.equal(result.revenueWithoutDeposit.toFixed(2), '79560.00');
  assert.equal(result.revenueWithDeposit.toFixed(2), '83783.70');
  assert.equal(result.netChange.toFixed(2), '4223.70');
  assert.equal(result.breakEvenBookingRate.toFixed(1), '88.3');

  assert.match(page, /\$79,560/);
  assert.match(page, /\$83,783\.70/);
  assert.match(page, /\$4,223\.70/);
  assert.match(page, /88\.3% booking rate/);
});

test('the page does not present collected deposits as profit', () => {
  assert.doesNotMatch(page, /nets \$21,762/);
  assert.doesNotMatch(page, /secured deposits/);
  assert.match(page, /not extra money|not profit/);
  assert.match(page, /applied to the service total rather than added to it|would have been billed anyway/);
});

test('the page explains the boundary with the sibling no-show fee tool', () => {
  assert.match(page, /neither repeats the other/);
  assert.match(page, /No-Show &amp; Cancellation Fee Calculator/);
});

test('every FAQ answer in the schema has a matching visible heading', () => {
  const schema = JSON.parse(page.match(/\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\}\]\}/s)[0]);
  assert.ok(schema.mainEntity.length >= 4);
  for (const q of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${q.name}</h3>`), `no visible <h3> for: ${q.name}`);
    // The schema answer must not outlive the copy it mirrors.
    const claim = q.acceptedAnswer.text.slice(0, 60);
    assert.ok(page.includes(claim), `schema answer drifted from the page copy: ${q.name}`);
  }
});
