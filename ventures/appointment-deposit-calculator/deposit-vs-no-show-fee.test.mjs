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
