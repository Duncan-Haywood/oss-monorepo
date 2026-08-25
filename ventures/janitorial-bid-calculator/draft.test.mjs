import test from 'node:test';
import assert from 'node:assert/strict';
import { clearDraft, DRAFT_STORAGE_KEY, loadDraft, saveDraft } from './draft.mjs';

function fakeStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('round trips a local draft without changing its contents', () => {
  const storage = fakeStorage();
  const draft = { areas: [{ name: 'Office', squareFeet: '1000' }], costs: { hourlyWage: '18' } };
  assert.equal(saveDraft(storage, draft), true);
  assert.deepEqual(loadDraft(storage), draft);
  assert.equal(storage.values.has(DRAFT_STORAGE_KEY), true);
});

test('ignores malformed or unrelated local storage values', () => {
  const storage = fakeStorage();
  storage.values.set(DRAFT_STORAGE_KEY, '{not json');
  assert.equal(loadDraft(storage), null);
  storage.values.set(DRAFT_STORAGE_KEY, JSON.stringify({ areas: [] }));
  assert.equal(loadDraft(storage), null);
});

test('clears the saved draft', () => {
  const storage = fakeStorage();
  saveDraft(storage, { areas: [], costs: {} });
  assert.equal(clearDraft(storage), true);
  assert.equal(loadDraft(storage), null);
});

test('storage failures are safe no-ops', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(saveDraft(broken, {}), false);
  assert.equal(loadDraft(broken), null);
  assert.equal(clearDraft(broken), false);
});
