import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { probeRealtimeDatabasePath, probeFirestoreCollection, runProbes } from './probe.mjs';

// Two tiny local HTTP servers standing in for a real Realtime Database and
// a real Firestore REST endpoint -- every request in this file goes to
// 127.0.0.1 only, nothing external, so these tests are deterministic and
// never touch anyone's real project.
function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

function fakeRealtimeDatabase(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ users: true, posts: true }));
    return;
  }
  if (url.pathname === '/locked.json') {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Permission denied' }));
    return;
  }
  if (url.pathname === '/empty.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('null');
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

test('probeRealtimeDatabasePath on an open root reports the child key names', () =>
  withServer(fakeRealtimeDatabase, async (base) => {
    const result = await probeRealtimeDatabasePath(base, '/');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.deepEqual([...result.keys].sort(), ['posts', 'users']);
  }));

test('probeRealtimeDatabasePath on a locked path reports the 401', () =>
  withServer(fakeRealtimeDatabase, async (base) => {
    const result = await probeRealtimeDatabasePath(base, '/locked');
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  }));

test('probeRealtimeDatabasePath on an empty path reports null, not a key list', () =>
  withServer(fakeRealtimeDatabase, async (base) => {
    const result = await probeRealtimeDatabasePath(base, '/empty');
    assert.equal(result.ok, true);
    assert.equal(result.isNull, true);
  }));

test('probeRealtimeDatabasePath requests shallow=true, never a deep read', () =>
  withServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    assert.equal(url.searchParams.get('shallow'), 'true');
    fakeRealtimeDatabase(req, res);
  }, async (base) => {
    await probeRealtimeDatabasePath(base, '/');
  }));

test('probeRealtimeDatabasePath never sends anything but GET', () =>
  withServer((req, res) => {
    assert.equal(req.method, 'GET');
    fakeRealtimeDatabase(req, res);
  }, async (base) => {
    await probeRealtimeDatabasePath(base, '/');
  }));

test('an unreachable database reports a clean error rather than throwing', async () => {
  const result = await probeRealtimeDatabasePath('http://127.0.0.1:1', '/', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

function fakeFirestore(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.endsWith('/documents/public_collection')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      documents: [
        { name: 'projects/p/databases/(default)/documents/public_collection/doc1', fields: { email: { stringValue: 'someone@example.com' }, isAdmin: { booleanValue: true } } },
      ],
    }));
    return;
  }
  if (url.pathname.endsWith('/documents/protected_collection')) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } }));
    return;
  }
  if (url.pathname.endsWith('/documents/empty_collection')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 404, message: 'not found' } }));
}

test('probeFirestoreCollection on an open collection reports document/field data without the caller asking for values', async () => {
  await withServer(fakeFirestore, async (base) => {
    // Point the module at the fake server by overriding fetch, since the
    // Firestore URL is hardcoded to the real googleapis.com host.
    const fetchImpl = (url, init) => fetch(url.replace('https://firestore.googleapis.com', base), init);
    const result = await probeFirestoreCollection('demo-project', 'public_collection', { fetchImpl });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.documentCount, 1);
    assert.deepEqual([...result.fieldNames].sort(), ['email', 'isAdmin']);
  });
});

test('probeFirestoreCollection on a protected collection reports the 403', async () => {
  await withServer(fakeFirestore, async (base) => {
    const fetchImpl = (url, init) => fetch(url.replace('https://firestore.googleapis.com', base), init);
    const result = await probeFirestoreCollection('demo-project', 'protected_collection', { fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });
});

test('probeFirestoreCollection on an empty collection (Firestore returns {}) reports zero documents', async () => {
  await withServer(fakeFirestore, async (base) => {
    const fetchImpl = (url, init) => fetch(url.replace('https://firestore.googleapis.com', base), init);
    const result = await probeFirestoreCollection('demo-project', 'empty_collection', { fetchImpl });
    assert.equal(result.ok, true);
    assert.equal(result.documentCount, 0);
  });
});

test('probeFirestoreCollection requests pageSize=1, never more than one document', async () => {
  await withServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    assert.equal(url.searchParams.get('pageSize'), '1');
    fakeFirestore(req, res);
  }, async (base) => {
    const fetchImpl = (url, init) => fetch(url.replace('https://firestore.googleapis.com', base), init);
    await probeFirestoreCollection('demo-project', 'public_collection', { fetchImpl });
  });
});

test('runProbes checks the Realtime Database root and every given Firestore collection', async () => {
  await withServer(fakeRealtimeDatabase, async (dbBase) => {
    await withServer(fakeFirestore, async (fsBase) => {
      const fetchImpl = (url, init) => {
        if (typeof url === 'string' && url.includes('firestore.googleapis.com')) {
          return fetch(url.replace('https://firestore.googleapis.com', fsBase), init);
        }
        return fetch(url, init);
      };
      const result = await runProbes('demo-project', {
        databaseUrl: dbBase,
        collections: ['public_collection', 'protected_collection'],
        fetchImpl,
      });
      assert.equal(result.realtimeDatabase.ok, true);
      assert.equal(result.firestore.length, 2);
      assert.equal(result.firestore[0].collection, 'public_collection');
      assert.equal(result.firestore[1].status, 403);
    });
  });
});

test('runProbes with no databaseUrl and no collections checks nothing, cleanly', async () => {
  const result = await runProbes('demo-project', {});
  assert.equal(result.realtimeDatabase, null);
  assert.deepEqual(result.firestore, []);
});

test('runProbes caps the collection list at maxCollections and reports truncated', async () => {
  await withServer(fakeFirestore, async (fsBase) => {
    const fetchImpl = (url, init) => fetch(url.replace('https://firestore.googleapis.com', fsBase), init);
    const result = await runProbes('demo-project', {
      collections: ['public_collection', 'empty_collection', 'protected_collection'],
      fetchImpl,
      maxCollections: 2,
    });
    assert.equal(result.firestore.length, 2);
    assert.equal(result.truncated, true);
  });
});

test('normalizeDatabaseUrl rejects a non-http(s) scheme', async () => {
  await assert.rejects(() => runProbes('demo-project', { databaseUrl: 'ftp://example.com' }));
});

test('normalizeProjectId rejects an implausible project ID', async () => {
  await assert.rejects(() => runProbes('not a project id!!', { collections: ['users'] }));
});
