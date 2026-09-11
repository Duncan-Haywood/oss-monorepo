import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('usage is aggregate and opt-out', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage); recordUsage(storage, true);
  assert.deepEqual(JSON.parse(data.get('vpat-acr-generator-usage')), { report_generated: 1 });
});

test('distinct events stay on the same local key, opted-out events never write', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage, false, 'report_downloaded');
  recordUsage(storage, false, 'report_copied');
  recordUsage(storage, true, 'sponsor_link_clicked');
  assert.deepEqual(JSON.parse(data.get('vpat-acr-generator-usage')), {
    report_downloaded: 1,
    report_copied: 1,
  });
});

test('honours Do Not Track without an explicit opt-out', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { doNotTrack: '1' }, configurable: true });
  try {
    recordUsage(storage);
  } finally {
    Object.defineProperty(globalThis, 'navigator', descriptor);
  }
  assert.equal(data.get('vpat-acr-generator-usage'), undefined);
});
