import test from 'node:test';
import assert from 'node:assert/strict';

// usage.mjs reads `localStorage` and `navigator` off the global object, so
// these tests stub both before importing it and restore them afterward. That
// mirrors how the module is actually used (loaded once into a browser global
// scope), and lets each test control Do Not Track / opt-out state precisely.

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
const originalNavigator = globalThis.navigator;

async function withGlobals(storage, navigator, fn) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  }
}

test('recordEvent counts a named event in localStorage', async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-a`);
    mod.recordEvent('estimate');
    mod.recordEvent('estimate');
    mod.recordEvent('share-link');
    const counts = JSON.parse(storage.getItem('pool-route-pricing-usage'));
    assert.equal(counts.estimate, 2);
    assert.equal(counts['share-link'], 1);
  });
});

test('recordEvent is a no-op once opted out', async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-b`);
    mod.toggleUsage(false);
    mod.recordEvent('estimate');
    assert.equal(storage.getItem('pool-route-pricing-usage'), null);
    assert.equal(mod.usageAllowed(), false);
  });
});

test('usageAllowed is false when the browser sends Do Not Track', async () => {
  const storage = memoryStorage();
  await withGlobals(storage, { doNotTrack: '1' }, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-c`);
    assert.equal(mod.usageAllowed(), false);
    mod.recordEvent('estimate');
    assert.equal(storage.getItem('pool-route-pricing-usage'), null);
  });
});

test('usageAllowed is false when the browser sends Global Privacy Control', async () => {
  const storage = memoryStorage();
  await withGlobals(storage, { globalPrivacyControl: true }, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-d`);
    assert.equal(mod.usageAllowed(), false);
  });
});

test('usageAllowed is false with no localStorage, and recordEvent does not throw', async () => {
  await withGlobals(undefined, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-e`);
    assert.equal(mod.usageAllowed(), false);
    assert.doesNotThrow(() => mod.recordEvent('estimate'));
  });
});

test('toggleUsage(true) re-enables counting after an opt-out', async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-f`);
    mod.toggleUsage(false);
    assert.equal(mod.usageAllowed(), false);
    mod.toggleUsage(true);
    assert.equal(mod.usageAllowed(), true);
    mod.recordEvent('estimate');
    const counts = JSON.parse(storage.getItem('pool-route-pricing-usage'));
    assert.equal(counts.estimate, 1);
  });
});
