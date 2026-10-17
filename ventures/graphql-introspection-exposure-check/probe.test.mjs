import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { sendIntrospectionQuery, INTROSPECTION_QUERY } from './probe.mjs';

// A tiny local HTTP server standing in for "the internet" -- every request
// in this file goes to 127.0.0.1 only, nothing external, so these tests are
// deterministic and need no network access beyond loopback.
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

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

test('the introspection query asks only for root type names, their field names, and every named type/kind', () => {
  assert.match(INTROSPECTION_QUERY, /__schema/);
  assert.match(INTROSPECTION_QUERY, /queryType/);
  assert.match(INTROSPECTION_QUERY, /mutationType/);
  assert.match(INTROSPECTION_QUERY, /subscriptionType/);
  assert.match(INTROSPECTION_QUERY, /types\s*\{\s*name\s*kind\s*\}/);
  // Deliberately shallow: no args, no descriptions, no interfaces.
  assert.doesNotMatch(INTROSPECTION_QUERY, /args/);
  assert.doesNotMatch(INTROSPECTION_QUERY, /description/);
});

test('sends a POST with a JSON body carrying the introspection query', async () => {
  await withServer(
    async (req, res) => {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      assert.equal(req.method, 'POST');
      assert.equal(req.headers['content-type'], 'application/json');
      assert.match(parsed.query, /__schema/);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { __schema: { queryType: { name: 'Query', fields: [] }, mutationType: null, subscriptionType: null, types: [] } } }));
    },
    async (base) => {
      const result = await sendIntrospectionQuery(base);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.__schema.queryType.name, 'Query');
    },
  );
});

test('sends custom headers the caller supplies', async () => {
  await withServer(
    async (req, res) => {
      assert.equal(req.headers['x-api-key'], 'secret-value');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: 'GraphQL introspection is not allowed' }] }));
    },
    async (base) => {
      const result = await sendIntrospectionQuery(base, { headers: { 'X-Api-Key': 'secret-value' } });
      assert.equal(result.ok, true);
      assert.equal(result.body.errors[0].message, 'GraphQL introspection is not allowed');
    },
  );
});

test('a non-200 status with a parseable GraphQL error body is still reported as ok (transport succeeded)', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: 'Bad Request' }] }));
    },
    async (base) => {
      const result = await sendIntrospectionQuery(base);
      assert.equal(result.ok, true);
      assert.equal(result.status, 400);
      assert.equal(result.body.errors[0].message, 'Bad Request');
    },
  );
});

test('a response body that is not valid JSON is reported with a parseError, not thrown', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('not json');
    },
    async (base) => {
      const result = await sendIntrospectionQuery(base);
      assert.equal(result.ok, true);
      assert.equal(result.body, null);
      assert.match(result.parseError, /JSON|Unexpected/i);
    },
  );
});

test('resolves (does not throw) on an unreachable host', async () => {
  const result = await sendIntrospectionQuery('http://127.0.0.1:1', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('resolves with an error for an invalid URL instead of throwing', async () => {
  const result = await sendIntrospectionQuery('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('rejects an unsupported scheme instead of attempting the request', async () => {
  const result = await sendIntrospectionQuery('ftp://example.com/graphql');
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('times out on a server that never responds', async () => {
  await withServer(
    () => { /* never respond */ },
    async (base) => {
      const result = await sendIntrospectionQuery(base, { timeoutMs: 200 });
      assert.equal(result.ok, false);
      assert.equal(typeof result.error, 'string');
    },
  );
});
