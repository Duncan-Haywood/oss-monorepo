import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateOffer } from './offer.mjs';

const car = { mpg: 25, gasPrice: 3.5, maintenancePerMile: 0.1 }; // 0.14 + 0.10 = 0.24/mi
const html = readFileSync(new URL('./offer.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('prices every mile and every minute, including the drive back and the wait', () => {
  const r = evaluateOffer({ payout: 8, milesToPickup: 2, milesToDropoff: 4, milesBack: 2,
    minutesToPickup: 6, minutesWaiting: 6, minutesToDropoff: 14, minutesBack: 4, ...car });
  assert.equal(r.miles, 8);
  assert.equal(r.minutes, 30);
  assert.ok(Math.abs(r.vehicleCost - 1.92) < 1e-9);
  assert.ok(Math.abs(r.net - 6.08) < 1e-9);
  assert.ok(Math.abs(r.netPerHour - 12.16) < 1e-9);
  assert.ok(Math.abs(r.grossPerHour - 16) < 1e-9);
  assert.ok(Math.abs(r.netPerMile - 0.76) < 1e-9);
});

test('minimum payout clears the stricter of the hour and mile floors', () => {
  const r = evaluateOffer({ payout: 8, milesToPickup: 2, milesToDropoff: 4, milesBack: 2,
    minutesToPickup: 6, minutesWaiting: 6, minutesToDropoff: 14, minutesBack: 4,
    minNetPerHour: 18, minNetPerMile: 1, ...car });
  // hour floor: 1.92 + 9 = 10.92 ; mile floor: 1.92 + 8 = 9.92
  assert.ok(Math.abs(r.minPayout - 10.92) < 1e-9);
  assert.equal(r.verdict, 'decline');
  assert.deepEqual(r.failures, ['hour', 'mile']);
  assert.ok(Math.abs(r.shortfall - 2.92) < 1e-9);
});

test('an offer paying exactly the minimum payout is accepted', () => {
  const base = { milesToPickup: 1, milesToDropoff: 3, minutesToPickup: 5, minutesToDropoff: 15, minNetPerHour: 15, ...car };
  const { minPayout } = evaluateOffer({ payout: 0, ...base });
  const r = evaluateOffer({ payout: minPayout, ...base });
  assert.equal(r.verdict, 'accept');
  assert.equal(r.shortfall, 0);
});

test('with no floor set there is no minimum payout, only profit or loss', () => {
  assert.equal(evaluateOffer({ payout: 5, milesToDropoff: 3, minutesToDropoff: 10, ...car }).verdict, 'no-floor-profit');
  const loss = evaluateOffer({ payout: 0.5, milesToDropoff: 10, minutesToDropoff: 20, ...car });
  assert.equal(loss.verdict, 'no-floor-loss');
  assert.equal(loss.minPayout, null);
});

test('zero distance or time gives null rates, and a floor on a null rate fails', () => {
  const r = evaluateOffer({ payout: 5, minNetPerHour: 10, ...car });
  assert.equal(r.netPerHour, null);
  assert.equal(r.verdict, 'decline');
});

test('rejects bad input', () => {
  assert.throws(() => evaluateOffer({ payout: '', ...car }), /Payout/);
  assert.throws(() => evaluateOffer({ payout: 5, ...car, mpg: 0 }), /Miles per gallon/);
  assert.throws(() => evaluateOffer({ payout: 5, ...car, milesBack: -1 }), /Miles back/);
});

test('page carries disclaimer, privacy note, and is linked and in the sitemap', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or legal advice/i);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="offer\.html">/);
  assert.match(html, /from '\.\/offer\.mjs'/);
  assert.match(index, /href="offer\.html"/);
  assert.match(sitemap, /gig-driver-net-pay-calculator\/offer\.html/);
});

test('the page worked example matches the calculation', () => {
  const r = evaluateOffer({ payout: 7.5, milesToPickup: 2.5, milesToDropoff: 3, milesBack: 2.5,
    minutesToPickup: 8, minutesWaiting: 5, minutesToDropoff: 12, minutesBack: 8,
    mpg: 28, gasPrice: 3.49, maintenancePerMile: 0.07, minNetPerHour: 18 });
  for (const text of [`$${r.netPerHour.toFixed(2)}`, `$${r.minPayout.toFixed(2)}`]) {
    assert.ok(html.includes(text), `page should state ${text}`);
  }
});
