import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function fakeStorage(initial = null, { throwOnSet = false } = {}) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      if (throwOnSet) throw new Error('quota');
      value = next;
    },
    read: () => value,
  };
}

test('a count is the event name and the day, and nothing else', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'menu_classified');
  const saved = JSON.parse(store.read());
  assert.equal(saved.menu_classified, 1);
  assert.match(saved.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(saved).sort(), ['last_day', 'menu_classified']);
});

test('counts accumulate across events', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'menu_classified');
  recordUsage(store, false, 'menu_classified');
  recordUsage(store, false, 'price_move_sized');
  const saved = JSON.parse(store.read());
  assert.equal(saved.menu_classified, 2);
  assert.equal(saved.price_move_sized, 1);
});

test('opting out records nothing at all', () => {
  const store = fakeStorage();
  recordUsage(store, true, 'menu_classified');
  assert.equal(store.read(), null);
});

test('no storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'menu_classified'));
});

test('a browser refusing site data does not stop the page', () => {
  assert.doesNotThrow(() => recordUsage(fakeStorage(null, { throwOnSet: true }), false, 'menu_classified'));
});

/**
 * `globalThis.navigator` is a read-only accessor in modern Node, so it is
 * replaced by definition rather than by assignment — the same way the rest of
 * the ventures here test this.
 */
function withNavigator(value, body) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
  try {
    body();
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
}

test('a Do Not Track browser is not counted', () => {
  withNavigator({ doNotTrack: '1' }, () => {
    const store = fakeStorage();
    recordUsage(store, false, 'menu_classified');
    assert.equal(store.read(), null);
  });
});

test('a Global Privacy Control browser is not counted', () => {
  withNavigator({ globalPrivacyControl: true }, () => {
    const store = fakeStorage();
    recordUsage(store, false, 'menu_classified');
    assert.equal(store.read(), null);
  });
});

test('a dish name can never reach the counter, because only an event name is passed', () => {
  // The module's whole privacy claim is that a restaurant's own signature dish
  // names stay on the device. The counter takes an event name and nothing
  // else, so this asserts the shape rather than trusting the comment.
  const store = fakeStorage();
  recordUsage(store, false, 'menu_classified');
  const saved = JSON.parse(store.read());
  for (const key of Object.keys(saved)) {
    assert.ok(
      ['last_day', 'menu_classified', 'price_move_sized', 'dogs_found'].includes(key),
      `unexpected key in the usage counter: ${key}`,
    );
  }
  assert.equal(typeof saved.menu_classified, 'number');
});
