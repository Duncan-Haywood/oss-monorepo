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

const KEY = 'drone-mapping-job-usage';
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
  recordUsage(storage, false, 'job_priced');
  recordUsage(storage, false, 'job_priced');
  const saved = read(storage);
  assert.equal(saved.job_priced, 2);
  assert.deepEqual(Object.keys(saved).sort(), ['job_priced', 'last_day']);
  assert.match(saved.last_day, /^\d{4}-\d{2}-\d{2}$/);
  // No acreage, no altitude, no coordinate, no rate, no margin, no identifier.
  assert.doesNotMatch(
    storage.getItem(KEY),
    /\d{4}-\d{2}-\d{2}T|acres|altitude|overlap|rate|margin|lat|lon/i,
  );
});

test('opting out records nothing at all', () => {
  const storage = new FakeStorage();
  recordUsage(storage, true, 'job_priced');
  assert.equal(storage.getItem(KEY), null);
});

test('a browser sending Do Not Track is honoured without being asked twice', () => {
  const storage = new FakeStorage();
  withNavigator({ doNotTrack: '1' }, () => recordUsage(storage, false, 'job_priced'));
  assert.equal(storage.getItem(KEY), null);
});

test('Global Privacy Control is honoured the same way', () => {
  const storage = new FakeStorage();
  withNavigator({ globalPrivacyControl: true }, () => recordUsage(storage, false, 'job_priced'));
  assert.equal(storage.getItem(KEY), null);
});

test('distinct events are tallied separately', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, 'job_priced');
  recordUsage(storage, false, 'overlap_compared');
  recordUsage(storage, false, 'overlap_compared');
  const saved = read(storage);
  assert.equal(saved.job_priced, 1);
  assert.equal(saved.overlap_compared, 2);
});

test('a browser refusing site data does not break the page', () => {
  const hostile = {
    getItem() {
      throw new Error('site data blocked');
    },
    setItem() {
      throw new Error('site data blocked');
    },
  };
  assert.doesNotThrow(() => recordUsage(hostile, false, 'job_priced'));
});

test('no storage at all is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(undefined, false, 'job_priced'));
  assert.doesNotThrow(() => recordUsage(null, false, 'job_priced'));
});

test('a corrupt stored value is replaced rather than thrown on', () => {
  const storage = new FakeStorage();
  storage.setItem(KEY, 'not json at all');
  assert.doesNotThrow(() => recordUsage(storage, false, 'job_priced'));
});
