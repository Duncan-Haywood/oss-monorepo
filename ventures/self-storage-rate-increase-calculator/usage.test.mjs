// The usage counter's whole job is to be uninteresting: a tally of which
// features were used, on this device, that stops counting the moment the
// visitor or their browser says not to. These tests assert what it must never
// do as much as what it does.

import test from 'node:test';
import assert from 'node:assert/strict';

import { recordUsage } from './usage.mjs';

class FakeStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const KEY = 'self-storage-rate-increase-usage';
const read = (storage) => JSON.parse(storage.getItem(KEY) || 'null');

function withNavigator(navigator, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
}

test('counts an event and the day, and nothing else', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, 'increase_priced');
  recordUsage(storage, false, 'increase_priced');
  const saved = read(storage);
  assert.equal(saved.increase_priced, 2);
  assert.deepEqual(Object.keys(saved).sort(), ['increase_priced', 'last_day']);
  assert.match(saved.last_day, /^\d{4}-\d{2}-\d{2}$/);
  // No rent, no unit count, no identifier of any kind.
  assert.doesNotMatch(storage.getItem(KEY), /\d{4}-\d{2}-\d{2}T|rent|street|unit/i);
});

test('opting out records nothing at all', () => {
  const storage = new FakeStorage();
  recordUsage(storage, true, 'increase_priced');
  assert.equal(read(storage), null);
});

test('Do Not Track switches it off', () => {
  const storage = new FakeStorage();
  withNavigator({ doNotTrack: '1' }, () => recordUsage(storage, false, 'increase_priced'));
  assert.equal(read(storage), null);
});

test('Global Privacy Control switches it off', () => {
  const storage = new FakeStorage();
  withNavigator({ globalPrivacyControl: true }, () => recordUsage(storage, false, 'increase_priced'));
  assert.equal(read(storage), null);
});

test('a browser that refuses site data does not break the calculator', () => {
  const hostile = {
    getItem() {
      throw new Error('site data blocked');
    },
    setItem() {
      throw new Error('site data blocked');
    },
  };
  assert.doesNotThrow(() => recordUsage(hostile, false, 'increase_priced'));
  assert.doesNotThrow(() => recordUsage(null, false, 'increase_priced'));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'increase_priced'));
});

test('malformed stored JSON is replaced rather than thrown on', () => {
  const storage = new FakeStorage();
  storage.setItem(KEY, '{not json');
  assert.doesNotThrow(() => recordUsage(storage, false, 'increase_priced'));
});

test('separate events keep separate tallies', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, 'increase_priced');
  recordUsage(storage, false, 'ladder_read');
  const saved = read(storage);
  assert.equal(saved.increase_priced, 1);
  assert.equal(saved.ladder_read, 1);
});
