import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeProbeFn(probeResult) {
  return async () => probeResult;
}

test('runCheck reports ok=true when everything checked is blocked', async () => {
  const report = await runCheck('demo-project', {
    probeFn: fakeProbeFn({
      projectId: 'demo-project',
      databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
      realtimeDatabase: { path: '/', ok: false, status: 401, keys: null, error: 'HTTP 401' },
      firestore: [],
    }),
    databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
  });
  assert.equal(report.ok, true);
});

test('runCheck reports ok=false and a finding when the Realtime Database root is exposed', async () => {
  const report = await runCheck('demo-project', {
    probeFn: fakeProbeFn({
      projectId: 'demo-project',
      databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
      realtimeDatabase: { path: '/', ok: true, status: 200, keys: ['users'], isNull: false, error: null },
      firestore: [],
    }),
    databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
  });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
});

test('runCheck reports ok=false and a finding when a Firestore collection is exposed', async () => {
  const report = await runCheck('demo-project', {
    probeFn: fakeProbeFn({
      projectId: 'demo-project',
      firestore: [{ collection: 'users', ok: true, status: 200, documentCount: 1, fieldNames: ['email'], error: null }],
    }),
    collections: ['users'],
  });
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].location, 'Firestore collection "users"');
});

test('runCheck passes the timeout and other options through to the probe function', async () => {
  let seenOpts;
  const report = await runCheck('demo-project', {
    probeFn: async (projectId, opts) => {
      seenOpts = opts;
      return { projectId, firestore: [] };
    },
    collections: ['users'],
    timeoutMs: 1234,
  });
  assert.equal(seenOpts.timeoutMs, 1234);
  assert.deepEqual(seenOpts.collections, ['users']);
  assert.equal(report.checked, 0);
});
