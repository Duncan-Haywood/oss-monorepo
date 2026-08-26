import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('counts only named feature events', () => {
  const storage = memoryStorage();
  recordUsage('scenario_planned', true, storage);
  recordUsage('invoice_amount', true, storage);
  const stored = JSON.parse(storage.getItem('subcontractor-cashflow-planner-usage'));
  assert.equal(stored.scenario_planned, 1);
  assert.equal(stored.invoice_amount, undefined);
});

test('does not count when the visitor turns the counter off', () => {
  const storage = memoryStorage();
  recordUsage('csv_exported', false, storage);
  assert.equal(storage.getItem('subcontractor-cashflow-planner-usage'), null);
});
