import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BID_STATE_KEY, clearBidState, loadBidState, saveBidState } from './state.mjs';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('saves and loads the bid setup without calculated outputs', () => {
  const store = storage();
  const state = { areas: [{ name: 'Office', squareFeet: '1000' }], costs: { hourlyWage: '18' } };
  assert.equal(saveBidState(store, state), true);
  const loaded = loadBidState(store);
  assert.deepEqual(loaded.areas, state.areas);
  assert.deepEqual(loaded.costs, state.costs);
  assert.equal(typeof loaded.savedAt, 'string');
  assert.equal(store.getItem(BID_STATE_KEY).includes('monthlyPrice'), false);
});

test('ignores malformed or incomplete saved state', () => {
  const store = storage();
  store.setItem(BID_STATE_KEY, '{"areas":"not an array"}');
  assert.equal(loadBidState(store), null);
  store.setItem(BID_STATE_KEY, 'not json');
  assert.equal(loadBidState(store), null);
});

test('clears saved setup and tolerates storage failures', () => {
  const store = storage();
  saveBidState(store, { areas: [], costs: {} });
  assert.equal(clearBidState(store), true);
  assert.equal(loadBidState(store), null);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(loadBidState(broken), null);
  assert.equal(saveBidState(broken, { areas: [], costs: {} }), false);
  assert.equal(clearBidState(broken), false);
});
