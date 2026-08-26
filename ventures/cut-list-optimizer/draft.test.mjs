import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_KEY, clearDraft, loadDraft, saveDraft } from './draft.mjs';

function storage(values = {}) {
  return {
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => { values[key] = value; },
    removeItem: (key) => { delete values[key]; },
  };
}

test('drafts round-trip through local storage', () => {
  const store = storage();
  const draft = { stock: '96', cuts: '24 x 3', sheetRotate: true };
  assert.equal(saveDraft(store, draft), true);
  assert.deepEqual(loadDraft(store), draft);
  assert.match(store.getItem(DRAFT_KEY), /24 x 3/);
});

test('missing and malformed drafts are ignored', () => {
  assert.equal(loadDraft(storage()), null);
  assert.equal(loadDraft(storage({ [DRAFT_KEY]: '{not json' })), null);
  assert.equal(loadDraft(storage({ [DRAFT_KEY]: 'null' })), null);
});

test('clearing a draft removes only the draft key', () => {
  const values = { [DRAFT_KEY]: '{}', other: 'keep' };
  const store = storage(values);
  assert.equal(clearDraft(store), true);
  assert.equal(loadDraft(store), null);
  assert.equal(values.other, 'keep');
});

test('storage failures do not break the calculator', () => {
  const broken = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.equal(loadDraft(broken), null);
  assert.equal(saveDraft(broken, {}), false);
  assert.equal(clearDraft(broken), false);
});
