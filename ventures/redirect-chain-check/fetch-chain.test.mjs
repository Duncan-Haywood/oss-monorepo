import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchOneHop, walkChain } from './fetch-chain.mjs';

/** Starts a tiny loopback HTTP server so no test hits the real internet.
 * `routes` maps a path to either a number (status to return with no
 * Location) or `{status, location}`. */
function startServer(routes) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const route = routes[req.url];
      if (!route) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      const status = typeof route === 'number' ? route : route.status;
      const headers = {};
      if (typeof route === 'object' && route.location) headers.location = route.location;
      res.writeHead(status, headers);
      res.end(status >= 300 && status < 400 ? 'redirecting' : 'ok body that should never be needed');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function baseUrl(server) {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('fetchOneHop reports status and resolved Location for a redirect', async () => {
  const server = await startServer({ '/old': { status: 301, location: '/new' } });
  try {
    const result = await fetchOneHop(`${baseUrl(server)}/old`);
    assert.equal(result.status, 301);
    assert.equal(result.location, `${baseUrl(server)}/new`);
    assert.equal(result.error, null);
  } finally {
    server.close();
  }
});

test('fetchOneHop reports a landing 200 with no Location', async () => {
  const server = await startServer({ '/final': 200 });
  try {
    const result = await fetchOneHop(`${baseUrl(server)}/final`);
    assert.equal(result.status, 200);
    assert.equal(result.location, null);
  } finally {
    server.close();
  }
});

test('fetchOneHop never follows the redirect itself', async () => {
  const server = await startServer({
    '/old': { status: 302, location: '/new' },
    '/new': 200,
  });
  try {
    const result = await fetchOneHop(`${baseUrl(server)}/old`);
    assert.equal(result.status, 302, 'must report the redirect itself, not the followed target');
  } finally {
    server.close();
  }
});

test('fetchOneHop rejects an invalid URL without throwing', async () => {
  const result = await fetchOneHop('not a url');
  assert.equal(result.status, null);
  assert.match(result.error, /invalid URL/);
});

test('fetchOneHop rejects an unsupported scheme', async () => {
  const result = await fetchOneHop('ftp://example.com/file');
  assert.equal(result.status, null);
  assert.match(result.error, /unsupported scheme/);
});

test('fetchOneHop times out rather than hanging forever', async () => {
  const server = createServer((req, res) => {
    // Never respond -- exercises the timeout path.
    void req; void res;
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await fetchOneHop(`${baseUrl(server)}/hangs`, { timeoutMs: 100 });
    assert.equal(result.status, null);
    assert.match(result.error, /timed out/);
  } finally {
    server.close();
  }
});

test('walkChain follows a multi-hop chain to a landing page', async () => {
  const server = await startServer({
    '/a': { status: 301, location: '/b' },
    '/b': { status: 302, location: '/c' },
    '/c': 200,
  });
  try {
    const { hops, truncated } = await walkChain(`${baseUrl(server)}/a`);
    assert.equal(truncated, false);
    assert.equal(hops.length, 3);
    assert.deepEqual(hops.map((h) => h.status), [301, 302, 200]);
  } finally {
    server.close();
  }
});

test('walkChain stops at maxHops and reports truncated when still redirecting', async () => {
  const server = createServer((req, res) => {
    const n = Number(req.url.slice(1)) || 0;
    res.writeHead(301, { location: `/${n + 1}` });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { hops, truncated } = await walkChain(`${baseUrl(server)}/0`, { maxHops: 4 });
    assert.equal(truncated, true);
    assert.equal(hops.length, 4);
    assert.ok(hops.every((h) => h.status === 301));
  } finally {
    server.close();
  }
});

test('walkChain stops and reports the error on a fetch failure', async () => {
  const { hops, truncated } = await walkChain('http://127.0.0.1:1/nowhere', { timeoutMs: 500 });
  assert.equal(truncated, false);
  assert.equal(hops.length, 1);
  assert.equal(hops[0].status, null);
  assert.ok(hops[0].error);
});

test('walkChain treats a redirect status with no Location header as a landing (nothing to follow)', async () => {
  const server = await startServer({ '/weird': 301 });
  try {
    const { hops, truncated } = await walkChain(`${baseUrl(server)}/weird`);
    assert.equal(truncated, false);
    assert.equal(hops.length, 1);
    assert.equal(hops[0].status, 301);
  } finally {
    server.close();
  }
});
