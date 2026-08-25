import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraft, loadDraft, saveDraft } from './draft.mjs';

function storage() {
  const values = new Map();
  return {
    setItem: (key, value) => values.set(key, value),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };
}

test('drafts round-trip by mode without sharing sheet and linear state', () => {
  const store = storage();
  const sheet = { 'sheet-parts': 'Shelf: 24 x 12', 'sheet-rotate': true };
  assert.equal(saveDraft(store, 'sheet', sheet), true);
  assert.deepEqual(loadDraft(store, 'sheet'), sheet);
  assert.equal(loadDraft(store, 'linear'), null);
});

test('invalid modes and malformed storage fail safely', () => {
  const store = storage();
  assert.equal(saveDraft(store, 'other', {}), false);
  assert.equal(loadDraft(store, 'other'), null);
  store.setItem('cut-list-optimizer-draft-sheet', '{bad');
  assert.equal(loadDraft(store, 'sheet'), null);
});

test('a draft can be cleared', () => {
  const store = storage();
  saveDraft(store, 'linear', { cuts: '24 x 3' });
  clearDraft(store, 'linear');
  assert.equal(loadDraft(store, 'linear'), null);
});
