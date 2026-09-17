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
  monthlyVolume: 42000,
  transactions: 1400,
  totalFees: 1300,
  cardPresentPercent: 85,
  fixedMonthlyFees: 45,
  quoteMarkupPercent: 0.25,
  quotePerTransaction: 0.1,
  quoteMonthlyFees: 10,
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
  assert.doesNotThrow(() => recordEvent('statement_audited'));
  assert.doesNotThrow(() => disableUsage());
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('card-processing-fee-audit:usage', '{not-json');
  assert.doesNotThrow(() => recordEvent('statement_audited'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent('statement_audited');
  recordEvent('statement_audited');
  const saved = JSON.parse(localStorage.getItem('card-processing-fee-audit:usage'));
  assert.equal(saved.statement_audited, 2);
});

test('disableUsage stops future counting', () => {
  globalThis.localStorage = new FakeStorage();
  disableUsage();
  assert.equal(usageAllowed(), false);
  recordEvent('statement_audited');
  assert.equal(localStorage.getItem('card-processing-fee-audit:usage'), null);
});

test('Do Not Track and Global Privacy Control both disable counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordEvent('statement_audited');
  assert.equal(localStorage.getItem('card-processing-fee-audit:usage'), null);
  navigator.doNotTrack = undefined;

  navigator.globalPrivacyControl = true;
  recordEvent('statement_audited');
  assert.equal(localStorage.getItem('card-processing-fee-audit:usage'), null);
  navigator.globalPrivacyControl = undefined;
});

test('saveScenario/loadScenario round-trip every field the form carries', () => {
  const store = new FakeStorage();
  assert.equal(saveScenario(store, SCENARIO), true);
  assert.deepEqual(loadScenario(store), SCENARIO);
});

test('a scenario missing any single field is rejected rather than part-restored', () => {
  // A part-restored statement mixes this month's volume with last month's fee
  // total, and the resulting markup split looks entirely ordinary -- there is
  // no way for the reader to notice. Reject the whole thing instead.
  for (const field of SCENARIO_FIELDS) {
    const store = new FakeStorage();
    const partial = { ...SCENARIO };
    delete partial[field];
    assert.equal(saveScenario(store, partial), false, `${field} was accepted while missing`);

    const forged = { ...SCENARIO };
    delete forged[field];
    store.setItem('card-processing-fee-audit:scenario', JSON.stringify(forged));
    assert.equal(loadScenario(store), null, `${field} missing was still loaded`);
  }
});

test('saveScenario rejects negative and non-numeric values', () => {
  const store = new FakeStorage();
  assert.equal(saveScenario(store, { ...SCENARIO, totalFees: -1 }), false);
  assert.equal(saveScenario(store, { ...SCENARIO, monthlyVolume: 'lots' }), false);
});

test('loadScenario rejects a corrupted stored scenario', () => {
  const store = new FakeStorage();
  store.setItem('card-processing-fee-audit:scenario', '{not-json');
  assert.doesNotThrow(() => loadScenario(store));
  assert.equal(loadScenario(store), null);
  store.setItem('card-processing-fee-audit:scenario', '[1,2,3]');
  assert.equal(loadScenario(store), null);
});

test('clearScenario removes a saved scenario', () => {
  const store = new FakeStorage();
  saveScenario(store, SCENARIO);
  clearScenario(store);
  assert.equal(loadScenario(store), null);
});
