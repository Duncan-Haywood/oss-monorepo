import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { listTables, probeTable, runProbes } from './probe.mjs';

// A tiny local HTTP server standing in for a real Supabase/PostgREST
// project -- every request in this file goes to 127.0.0.1 only, nothing
// external, so these tests are deterministic and need no real network
// access (and never touch anyone's real project).
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

function fakePostgrest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const apikey = req.headers.apikey;
  if (!apikey) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'no apikey' }));
    return;
  }
  if (url.pathname === '/rest/v1/' || url.pathname === '/rest/v1') {
    res.writeHead(200, { 'content-type': 'application/openapi+json' });
    res.end(JSON.stringify({
      paths: { '/': {}, '/public_table': {}, '/protected_table': {}, '/empty_table': {}, '/rpc/some_function': {} },
    }));
    return;
  }
  if (url.pathname === '/rest/v1/public_table') {
    res.writeHead(200, { 'content-type': 'application/json', 'content-range': '0-0/3' });
    res.end(JSON.stringify([{ id: 1, email: 'someone@example.com' }]));
    return;
  }
  if (url.pathname === '/rest/v1/protected_table') {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'permission denied for table protected_table' }));
    return;
  }
  if (url.pathname === '/rest/v1/empty_table') {
    res.writeHead(200, { 'content-type': 'application/json', 'content-range': '*/0' });
    res.end('[]');
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'not found' }));
}

test('listTables reads the OpenAPI root and excludes the root path and rpc/*', () =>
  withServer(fakePostgrest, async (base) => {
    const result = await listTables(base, 'anon-key');
    assert.equal(result.ok, true);
    assert.deepEqual([...result.tables].sort(), ['empty_table', 'protected_table', 'public_table']);
  }));

test('listTables reports an error when the apikey is missing/rejected', () =>
  withServer(fakePostgrest, async (base) => {
    const result = await listTables(base, '');
    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 401/);
  }));

test('probeTable on a table with a real row reports rowsReturned and totalCount', () =>
  withServer(fakePostgrest, async (base) => {
    const result = await probeTable(base, 'anon-key', 'public_table');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.rowsReturned, 1);
    assert.equal(result.totalCount, 3);
    assert.deepEqual(result.columns, ['id', 'email']);
  }));

test('probeTable on a table blocked by RLS/grants reports the 401', () =>
  withServer(fakePostgrest, async (base) => {
    const result = await probeTable(base, 'anon-key', 'protected_table');
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.rowsReturned, 0);
  }));

test('probeTable on an empty table reports zero rows and zero total', () =>
  withServer(fakePostgrest, async (base) => {
    const result = await probeTable(base, 'anon-key', 'empty_table');
    assert.equal(result.ok, true);
    assert.equal(result.rowsReturned, 0);
    assert.equal(result.totalCount, 0);
  }));

test('probeTable never sends anything but GET (no mutation attempted)', () =>
  withServer((req, res) => {
    assert.equal(req.method, 'GET');
    fakePostgrest(req, res);
  }, async (base) => {
    await probeTable(base, 'anon-key', 'public_table');
  }));

test('runProbes lists then probes every table, end to end against the fake project', () =>
  withServer(fakePostgrest, async (base) => {
    const { baseUrl, tables, results, schemaError } = await runProbes(base, 'anon-key');
    assert.equal(baseUrl, base);
    assert.equal(schemaError, null);
    assert.deepEqual([...tables].sort(), ['empty_table', 'protected_table', 'public_table']);
    const byTable = Object.fromEntries(results.map((r) => [r.table, r]));
    assert.equal(byTable.public_table.rowsReturned, 1);
    assert.equal(byTable.protected_table.status, 401);
    assert.equal(byTable.empty_table.rowsReturned, 0);
  }));

test('runProbes accepts an explicit table list and skips the schema request', () =>
  withServer(fakePostgrest, async (base) => {
    const { results } = await runProbes(base, 'anon-key', { tables: ['public_table'] });
    assert.equal(results.length, 1);
    assert.equal(results[0].table, 'public_table');
  }));

test('runProbes reports schemaError and no results when the key is rejected', () =>
  withServer(fakePostgrest, async (base) => {
    const { results, schemaError } = await runProbes(base, '');
    assert.equal(results.length, 0);
    assert.match(schemaError, /HTTP 401/);
  }));

test('an unreachable project reports a clean error rather than throwing', async () => {
  const result = await probeTable('http://127.0.0.1:1', 'anon-key', 'public_table', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('normalizeBaseUrl rejects a non-http(s) scheme via runProbes', async () => {
  await assert.rejects(() => runProbes('ftp://example.com', 'anon-key'));
});
