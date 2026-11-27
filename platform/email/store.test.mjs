// The store contract (store-contract.mjs) against the D1 + R2 store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1r2Store, d1Bucket, RAW_INLINE_MAX } from './store.mjs';
import { d1Shim, memBucket } from './testkit.mjs';
import { storeContract } from './store-contract.mjs';

storeContract('d1r2Store', () => d1r2Store(d1Shim(), memBucket()));

const shared = () => { const db = d1Shim(); return d1r2Store(db, d1Bucket(db)); };
storeContract('d1r2Store with raw in D1 (no R2)', shared);

test('raw kept in D1 is cut at RAW_INLINE_MAX', async () => {
  const db = d1Shim();
  const b = d1Bucket(db);
  await b.put('k', new Uint8Array(RAW_INLINE_MAX + 10));
  assert.equal((await (await b.get('k')).arrayBuffer()).byteLength, RAW_INLINE_MAX);
});
