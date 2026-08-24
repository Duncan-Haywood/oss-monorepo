import assert from 'node:assert/strict';
import { forecast, status } from './app.mjs';
const rows = forecast({ cash: 5000, weeklyIncome: 1800, collectionWeeks: 2, weeklyCosts: 1400 });
assert.equal(rows.length, 12);
assert.equal(rows[0].balance, 3600);
assert.equal(rows[2].balance, 6200);
assert.deepEqual(status(rows), { lowest: 2200, week: 2, shortfall: false });
assert.throws(() => forecast({ cash: -1, weeklyIncome: 1, collectionWeeks: 0, weeklyCosts: 1 }));
console.log('cash runway tests passed');
