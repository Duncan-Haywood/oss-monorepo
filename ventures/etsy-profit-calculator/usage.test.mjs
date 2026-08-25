import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('records only an aggregate local event', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  recordUsage(storage);
  const event = JSON.parse(values.get('etsy-profit-usage'));
  assert.equal(event.order_profit_calculated, 1);
  assert.match(event.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('honors opt out', () => {
  let called = false;
  recordUsage({ setItem: () => { called = true; } }, true);
  assert.equal(called, false);
});

test('supports a named aggregate event without recording inputs', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  recordUsage(storage, false, 'scenario_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).scenario_compared, 1);
});

test('honors Do Not Track and Global Privacy Control', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  };
  try {
    const dntValues = new Map();
    const dntStorage = { getItem: key => dntValues.get(key) ?? null, setItem: (key, value) => dntValues.set(key, value) };
    Object.defineProperty(globalThis, 'navigator', {
      value: { doNotTrack: '1' },
      configurable: true,
    });
    recordUsage(dntStorage, false);
    assert.equal(dntValues.size, 0);

    const gpcValues = new Map();
    const gpcStorage = { getItem: key => gpcValues.get(key) ?? null, setItem: (key, value) => gpcValues.set(key, value) };
    Object.defineProperty(globalThis, 'navigator', {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpcStorage, false);
    assert.equal(gpcValues.size, 0);
  } finally {
    restore();
  }
});
