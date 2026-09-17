import test from 'node:test';
import assert from 'node:assert/strict';

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
  removeItem(key) {
    this.values.delete(key);
  }
}

globalThis.localStorage = new FakeStorage();
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const {
  recordEvent,
  usageAllowed,
  disableUsage,
  saveScenario,
  loadScenario,
  clearScenario,
  SCENARIO_FIELDS,
} = await import('./usage.mjs');

const SCENARIO = {
  buyoutPrice: 8000,
  fairMarketValue: 6000,
  usefulLifeMonths: 24,
  replacementCost: 22000,
  replacementLifeMonths: 60,
  removalCost: 500,
  downtimeDays: 2,
  dailyDowntimeCost: 300,
};

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  // usageAllowed() is called outside any try/catch by recordEvent() and by
  // the #disable click handler in index.html, so a blocked getItem must be
  // swallowed here or it throws out of both.
  assert.doesNotThrow(() => usageAllowed());
  assert.equal(usageAllowed(), false);
  assert.doesNotThrow(() => recordEvent('buyout_compared'));
  assert.doesNotThrow(() => disableUsage());
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('equipment-lease-buyout-calculator:usage', '{not-json');
  assert.doesNotThrow(() => recordEvent('buyout_compared'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent('buyout_compared');
  recordEvent('buyout_compared');
  const saved = JSON.parse(localStorage.getItem('equipment-lease-buyout-calculator:usage'));
  assert.equal(saved.buyout_compared, 2);
});

test('disableUsage stops future counting', () => {
  globalThis.localStorage = new FakeStorage();
  disableUsage();
  assert.equal(usageAllowed(), false);
  recordEvent('buyout_compared');
  assert.equal(localStorage.getItem('equipment-lease-buyout-calculator:usage'), null);
});

test('Do Not Track and Global Privacy Control both disable counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordEvent('buyout_compared');
  assert.equal(localStorage.getItem('equipment-lease-buyout-calculator:usage'), null);
  navigator.doNotTrack = undefined;

  navigator.globalPrivacyControl = true;
  recordEvent('buyout_compared');
  assert.equal(localStorage.getItem('equipment-lease-buyout-calculator:usage'), null);
  navigator.globalPrivacyControl = undefined;
});

test('saveScenario/loadScenario round-trip every field the form carries', () => {
  const store = new FakeStorage();
  assert.equal(saveScenario(store, SCENARIO), true);
  assert.deepEqual(loadScenario(store), SCENARIO);
});

test('a scenario missing any single field is rejected rather than part-restored', () => {
  // A part-restored scenario mixes this lease's buyout price with a previous
  // replacement estimate, and the resulting verdict looks entirely ordinary --
  // there is no way for the reader to notice. Reject the whole thing instead.
  for (const field of SCENARIO_FIELDS) {
    const store = new FakeStorage();
    const partial = { ...SCENARIO };
    delete partial[field];
    assert.equal(saveScenario(store, partial), false, `${field} was accepted while missing`);

    const forged = { ...SCENARIO };
    delete forged[field];
    store.setItem('equipment-lease-buyout-calculator:scenario', JSON.stringify(forged));
    assert.equal(loadScenario(store), null, `${field} missing was still loaded`);
  }
});

test('saveScenario rejects negative and non-numeric values', () => {
  const store = new FakeStorage();
  assert.equal(saveScenario(store, { ...SCENARIO, buyoutPrice: -1 }), false);
  assert.equal(saveScenario(store, { ...SCENARIO, replacementCost: 'lots' }), false);
});

test('loadScenario rejects a corrupted stored scenario', () => {
  const store = new FakeStorage();
  store.setItem('equipment-lease-buyout-calculator:scenario', '{not-json');
  assert.doesNotThrow(() => loadScenario(store));
  assert.equal(loadScenario(store), null);
  store.setItem('equipment-lease-buyout-calculator:scenario', '[1,2,3]');
  assert.equal(loadScenario(store), null);
});

test('clearScenario removes a saved scenario', () => {
  const store = new FakeStorage();
  saveScenario(store, SCENARIO);
  clearScenario(store);
  assert.equal(loadScenario(store), null);
});
