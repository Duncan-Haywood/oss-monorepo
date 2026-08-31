import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareCompensation } from './calc.mjs';

const page = readFileSync(new URL('./how-many-clients-does-booth-rent-need.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const defaults = {
  averageTicket: 85,
  clientsPerWeek: 14,
  retailPerWeek: 80,
  weeksWorkedPerYear: 50,
  averageServiceMinutes: 75,
  commissionPercent: 50,
  retailCommissionPercent: 10,
  unpaidHoursCommission: 2,
  boothRentAmount: 275,
  boothRentCadence: 'weekly',
  cardFeePercent: 2.9,
  backbarPercent: 10,
  retailCostPercent: 50,
  otherWeeklyCost: 20,
  unpaidHoursBooth: 7,
};

test('docs page carries the no-warranty clause and links home', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not legal, tax, or financial advice|not financial or business advice/i);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /href="index\.html"/);
});

test('docs page numbers match calc.mjs on the calculator defaults', () => {
  const atDefault = compareCompensation(defaults);
  assert.equal(atDefault.dollarWinner, 'booth');
  assert.ok(Math.abs(atDefault.breakEvenClients - 8.413508799746314) < 1e-9);
  assert.ok(Math.abs(atDefault.weeklyDifference - 176.17) < 0.01);
  assert.ok(Math.abs(atDefault.maxWeeklyRentToMatch - 451.17) < 0.01);
  assert.match(page, /8\.4 clients/);
  assert.match(page, /\$176\.17/);
  assert.match(page, /\$451\.17/);

  const belowBreakEven = compareCompensation({ ...defaults, clientsPerWeek: 6 });
  assert.equal(belowBreakEven.dollarWinner, 'commission');
  assert.ok(Math.abs(belowBreakEven.weeklyDifference - -76.11) < 0.01);
  assert.ok(Math.abs(belowBreakEven.extraClientsNeeded - 2.413508799746314) < 1e-9);
  assert.match(page, /\$76\.11/);
  assert.match(page, /2\.4 more clients/);
});

test('index links to the docs page and the sitemap lists it', () => {
  assert.match(index, /href="how-many-clients-does-booth-rent-need\.html"/);
  assert.match(sitemap, /how-many-clients-does-booth-rent-need\.html/);
});
