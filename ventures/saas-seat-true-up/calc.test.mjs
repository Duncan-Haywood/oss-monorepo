import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, renewalBrief } from './calc.mjs';
import { loadScenario, saveScenario } from './usage.mjs';

test('calculates unused seat waste across a term', () => {
  const result = calculate({ seats: 40, activeUsers: 31, price: 18, months: 12, overageRate: 20 });
  assert.equal(result.unusedSeats, 9);
  assert.equal(result.termWaste, 1944);
  assert.equal(result.annualWaste, 1944);
  assert.equal(result.savingsRate, 22.5);
});

test('calculates overage exposure when usage exceeds plan', () => {
  const result = calculate({ seats: 10, activeUsers: 13, price: 12, months: 1, overageRate: 25 });
  assert.equal(result.overageSeats, 3);
  assert.equal(result.monthlyOverage, 45);
  assert.equal(result.unusedSeats, 0);
});

test('brief remains evidence-oriented and includes the entered scenario', () => {
  const brief = renewalBrief({ seats: 20, activeUsers: 15, price: 10, months: 6, overageRate: 10 });
  assert.match(brief, /5 seats/);
  assert.match(brief, /\$300\.00/);
  assert.match(brief, /Review vendor terms/);
});

test('rejects invalid values', () => {
  assert.throws(() => calculate({ seats: -1, activeUsers: 1, price: 1, months: 1, overageRate: 0 }), /seats/);
  assert.throws(() => calculate({ seats: 1, activeUsers: 1, price: 1, months: 0, overageRate: 0 }), /months/);
});

test('saves and restores only the totals-only scenario', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const scenario = { seats: '40', activeUsers: '31', price: '18', months: '12', overageRate: '20' };
  assert.equal(saveScenario(storage, scenario), true);
  assert.deepEqual(loadScenario(storage), { seats: 40, activeUsers: 31, price: 18, months: 12, overageRate: 20 });
});

test('ignores malformed saved scenarios', () => {
  const storage = { getItem: () => '{"seats":null}' };
  assert.equal(loadScenario(storage), null);
});
