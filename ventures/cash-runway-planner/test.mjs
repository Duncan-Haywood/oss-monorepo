import assert from 'node:assert/strict';
import test from 'node:test';
import { forecast, status, csv } from './app.mjs';

test('accumulates cash week by week instead of rewriting earlier weeks', () => {
  const rows = forecast({ cash: 5000, weeklyIncome: 1800, collectionWeeks: 2, weeklyCosts: 1400 });
  assert.equal(rows.length, 12);
  assert.equal(rows[0].balance, 3600);
  assert.equal(rows[1].balance, 2200);
  assert.equal(rows[2].income, 1800);
  assert.equal(rows[2].balance, 2600);
  assert.deepEqual(status(rows), { lowest: 2200, week: 2, shortfall: false, shortfallWeek: null });
  assert.match(csv(rows), /^week,income,costs,projected_balance\n1,0\.00,1400\.00,3600\.00/m);
});

test('rejects negative cash and collection delays over a year', () => {
  assert.throws(() => forecast({ cash: -1, weeklyIncome: 1, collectionWeeks: 0, weeklyCosts: 1 }));
  assert.throws(() => forecast({ cash: 1, weeklyIncome: 1, collectionWeeks: 53, weeklyCosts: 1 }));
});

test('rejects a fractional collection delay instead of silently rounding it up', () => {
  // index >= 1.5 is true from index 2, so 1.5 used to forecast exactly like 2
  // and the visitor was never told the number they typed had been ignored.
  assert.throws(
    () => forecast({ cash: 1000, weeklyIncome: 100, collectionWeeks: 1.5, weeklyCosts: 50 }),
    /whole number of weeks/,
  );
  assert.throws(() => forecast({ cash: 1000, weeklyIncome: 100, collectionWeeks: 1, weeklyCosts: 50, weeks: 0 }));
  assert.throws(() => forecast({ cash: 1000, weeklyIncome: 100, collectionWeeks: 1, weeklyCosts: 50, weeks: 4.5 }));
});

test('names the first week cash goes negative, not just the trough', () => {
  // Collection lands in week 3, so the balance dips negative in week 2 and
  // recovers: the week to act on is 2, while the lowest week is 3.
  const rows = forecast({ cash: 100, weeklyIncome: 500, collectionWeeks: 3, weeklyCosts: 75, weeks: 4 });
  assert.deepEqual(rows.map((row) => row.balance), [25, -50, -125, 300]);
  assert.deepEqual(status(rows), { lowest: -125, week: 3, shortfall: true, shortfallWeek: 2 });
});

test('refuses to report on an empty forecast rather than reading undefined', () => {
  assert.throws(() => status([]), /At least one forecast week/);
});
