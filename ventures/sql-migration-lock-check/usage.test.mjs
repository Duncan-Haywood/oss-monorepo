import test from 'node:test';
import assert from 'node:assert/strict';
import { record, readUsage, setUsageOptOut, usageOptedOut } from './usage.mjs';

// A minimal localStorage stand-in. The module has to work in a browser and be
// testable here, and the interesting cases are the ones where the store is
// hostile: absent, full, or throwing.
function installStorage(impl) {
  globalThis.localStorage = impl ?? {
    _data: new Map(),
    getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
    setItem(k, v) { this._data.set(k, String(v)); },
    removeItem(k) { this._data.delete(k); },
  };
}

// Node 22 defines `globalThis.navigator` as a getter-only accessor, so a
// plain assignment throws `Cannot set property navigator`. Redefining the
// property is the only way to stand in for a browser's navigator here.
function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value, writable: true, configurable: true,
  });
}

test.beforeEach(() => {
  installStorage();
  globalThis.__usageOptOut = false;
  setNavigator({});
});

test('events are counted locally', () => {
  record('check_run');
  record('check_run');
  record('example_loaded');
  assert.deepEqual(readUsage(), { check_run: 2, example_loaded: 1 });
});

test('opting out stops counting and clears what was counted', () => {
  record('check_run');
  setUsageOptOut(true);
  assert.deepEqual(readUsage(), {}, 'the existing counters are removed');
  record('check_run');
  assert.deepEqual(readUsage(), {}, 'and nothing new is counted');
  assert.equal(usageOptedOut(), true);
});

test('the opt-out survives a page reload', () => {
  // The flag is stored separately from the counters on purpose: opting out
  // *removes* the counters, so a flag kept inside them would be deleted by
  // the very act that records it -- and the switch would silently stop
  // working on the visitor's next visit, which they would never check.
  setUsageOptOut(true);
  const store = globalThis.localStorage;
  globalThis.__usageOptOut = undefined; // a fresh realm, as on reload
  installStorage(store);
  assert.equal(usageOptedOut(), true, 'the choice must persist across a reload');
});

test('opting back in resumes counting', () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  record('check_run');
  assert.deepEqual(readUsage(), { check_run: 1 });
});

test('Do Not Track and Global Privacy Control are honoured', () => {
  setNavigator({ doNotTrack: "1" });
  record('check_run');
  assert.deepEqual(readUsage(), {});
  setNavigator({ globalPrivacyControl: true });
  record('check_run');
  assert.deepEqual(readUsage(), {});
});

test('a throwing or absent store never crashes the tool', () => {
  // A blocked store is the common case in a private window, and the tool has
  // to keep working -- the counters are a nicety, the checker is the product.
  installStorage({
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  });
  assert.doesNotThrow(() => record('check_run'));
  assert.deepEqual(readUsage(), {});
  assert.equal(usageOptedOut(), false, 'a blocked store must never be read as consent');

  delete globalThis.localStorage;
  assert.doesNotThrow(() => record('check_run'));
  assert.deepEqual(readUsage(), {});
});

test('corrupt stored data is replaced rather than propagated', () => {
  installStorage();
  globalThis.localStorage.setItem('sql-migration-lock-check-usage', 'not json');
  record('check_run');
  assert.deepEqual(readUsage(), { check_run: 1 });
  globalThis.localStorage.setItem('sql-migration-lock-check-usage', '[1,2,3]');
  assert.deepEqual(readUsage(), {}, 'an array is not a counter map');
});

test('no network call exists in the usage module', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./usage.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) {
    assert.ok(!src.includes(forbidden), `usage.mjs must not reference ${forbidden}`);
  }
});
