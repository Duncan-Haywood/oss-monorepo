import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './analyze.mjs';

test('an open Realtime Database root is classified exposed with key names, not values', () => {
  const report = buildReport({
    projectId: 'demo-project',
    databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
    realtimeDatabase: { path: '/', ok: true, status: 200, keys: ['users', 'posts'], isNull: false, error: null },
    firestore: [],
  });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.match(report.findings[0].title, /Realtime Database path/);
  assert.match(report.findings[0].detail, /users/);
});

test('a locked Realtime Database root is classified blocked', () => {
  const report = buildReport({
    projectId: 'demo-project',
    databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
    realtimeDatabase: { path: '/', ok: false, status: 401, keys: null, error: 'HTTP 401' },
    firestore: [],
  });
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.blocked.length, 1);
});

test('an empty (null) Realtime Database root is unconfirmed, not exposed or blocked', () => {
  const report = buildReport({
    projectId: 'demo-project',
    databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
    realtimeDatabase: { path: '/', ok: true, status: 200, keys: [], isNull: true, error: null },
    firestore: [],
  });
  assert.equal(report.dangerCount, 0);
  assert.equal(report.unconfirmed.length, 1);
});

test('an open Firestore collection is classified exposed with field names, not values', () => {
  const report = buildReport({
    projectId: 'demo-project',
    databaseUrl: null,
    realtimeDatabase: null,
    firestore: [{ collection: 'users', ok: true, status: 200, documentCount: 1, fieldNames: ['email', 'isAdmin'], error: null }],
  });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.match(report.findings[0].title, /Firestore collection "users"/);
  assert.match(report.findings[0].detail, /email/);
  assert.doesNotMatch(report.findings[0].detail, /someone@example\.com/);
});

test('a protected Firestore collection (403) is classified blocked', () => {
  const report = buildReport({
    projectId: 'demo-project',
    firestore: [{ collection: 'admin_only', ok: false, status: 403, documentCount: 0, fieldNames: [], error: null }],
  });
  assert.equal(report.dangerCount, 0);
  assert.equal(report.blocked.length, 1);
});

test('a Firestore collection with zero documents is unconfirmed, not exposed or blocked', () => {
  const report = buildReport({
    projectId: 'demo-project',
    firestore: [{ collection: 'empty_collection', ok: true, status: 200, documentCount: 0, fieldNames: [], error: null }],
  });
  assert.equal(report.dangerCount, 0);
  assert.equal(report.unconfirmed.length, 1);
});

test('a request that errors out (no status) is classified error, never exposed or blocked', () => {
  const report = buildReport({
    projectId: 'demo-project',
    databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
    realtimeDatabase: { path: '/', ok: false, status: null, keys: null, error: 'network error' },
    firestore: [{ collection: 'x', ok: false, status: null, documentCount: 0, fieldNames: [], error: 'network error' }],
  });
  assert.equal(report.dangerCount, 0);
  assert.equal(report.errors.length, 2);
  assert.equal(report.incomplete, true);
});

test('an unrecognised HTTP status is classified error, not exposed or blocked', () => {
  const report = buildReport({
    projectId: 'demo-project',
    firestore: [{ collection: 'x', ok: false, status: 500, documentCount: 0, fieldNames: [], error: null }],
  });
  assert.equal(report.errors.length, 1);
  assert.equal(report.blocked.length, 0);
});

test('checking nothing at all (no databaseUrl, no collections) is incomplete', () => {
  const report = buildReport({ projectId: 'demo-project', realtimeDatabase: null, firestore: [] });
  assert.equal(report.checked, 0);
  assert.equal(report.ok, false);
  assert.equal(report.incomplete, true);
});

test('a report with both an exposed Realtime Database path and a blocked Firestore collection counts both', () => {
  const report = buildReport({
    projectId: 'demo-project',
    databaseUrl: 'https://demo-project-default-rtdb.firebaseio.com',
    realtimeDatabase: { path: '/', ok: true, status: 200, keys: ['users'], isNull: false, error: null },
    firestore: [{ collection: 'orders', ok: false, status: 403, documentCount: 0, fieldNames: [], error: null }],
  });
  assert.equal(report.checked, 2);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.blocked.length, 1);
});

test('truncated is carried through from the probe result', () => {
  const report = buildReport({ projectId: 'demo-project', firestore: [], truncated: true });
  assert.equal(report.truncated, true);
});
