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
  assert.deepEqual(status(rows), { lowest: 2200, week: 2, shortfall: false });
  assert.match(csv(rows), /^week,income,costs,projected_balance\n1,0\.00,1400\.00,3600\.00/m);
});

test('rejects negative cash and collection delays over a year', () => {
  assert.throws(() => forecast({ cash: -1, weeklyIncome: 1, collectionWeeks: 0, weeklyCosts: 1 }));
  assert.throws(() => forecast({ cash: 1, weeklyIncome: 1, collectionWeeks: 53, weeklyCosts: 1 }));
});
