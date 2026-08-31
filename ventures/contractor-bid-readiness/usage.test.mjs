import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

// recordUsage(event, enabled) runs as the last statement of each click
// handler in index.html, with no try/catch at that call site. Before this
// fix, a blocked or corrupted localStorage would throw an uncaught error out
// of "Check readiness" or "Download private Markdown report" -- harmless in
// effect since it is the last statement, but a real uncaught exception on a
// live user action, and untested.

function withLocalStorage(stub, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

test('does not throw when stored usage JSON is malformed', () => {
  withLocalStorage({ getItem: () => '{not-json', setItem: () => {} }, () => {
    assert.doesNotThrow(() => recordUsage('readiness_checked', true));
  });
});

test('does not throw when storage access is blocked', () => {
  withLocalStorage({
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  }, () => {
    assert.doesNotThrow(() => recordUsage('readiness_checked', true));
  });
});

test('does not throw when localStorage is unavailable entirely', () => {
  withLocalStorage(undefined, () => {
    assert.doesNotThrow(() => recordUsage('readiness_checked', true));
  });
});

test('records a normal count under the venture-specific key', () => {
  const store = {};
  withLocalStorage({
    getItem: (key) => store[key],
    setItem: (key, value) => { store[key] = value; },
  }, () => {
    recordUsage('readiness_checked', true);
    const saved = JSON.parse(store['contractor-bid-readiness-usage']);
    assert.equal(saved.readiness_checked, 1);
  });
});

test('does nothing when disabled', () => {
  let called = false;
  withLocalStorage({ getItem: () => '{}', setItem: () => { called = true; } }, () => {
    recordUsage('readiness_checked', false);
  });
  assert.equal(called, false);
});
