import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('records only an aggregate local event', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  recordUsage(storage);
  const event = JSON.parse(values.get('import-landed-cost-usage'));
  assert.equal(event.landed_cost_calculated, 1);
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
  recordUsage(storage, false, 'link_copied');
  assert.equal(JSON.parse(values.get('import-landed-cost-usage')).link_copied, 1);
  recordUsage(storage, false, 'entry_type_toggled');
  assert.equal(JSON.parse(values.get('import-landed-cost-usage')).entry_type_toggled, 1);
});

test('honors Do Not Track without recording', () => {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { doNotTrack: '1' } });
  let called = false;
  try {
    recordUsage({ setItem: () => { called = true; } });
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous });
  }
});

test('honors Global Privacy Control without recording', () => {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { globalPrivacyControl: true } });
  let called = false;
  try {
    recordUsage({ setItem: () => { called = true; } });
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous });
  }
});
