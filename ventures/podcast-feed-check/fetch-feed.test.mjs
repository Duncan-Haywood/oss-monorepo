import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchFeedXml } from './fetch-feed.mjs';

function startServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function baseUrl(server) {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('fetchFeedXml returns the body on a 200', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end('<rss><channel><title>T</title></channel></rss>');
  });
  try {
    const result = await fetchFeedXml(`${baseUrl(server)}/feed.xml`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.match(result.body, /<title>T<\/title>/);
  } finally {
    server.close();
  }
});

test('fetchFeedXml follows a redirect to the final body', async () => {
  const server = await startServer((req, res) => {
    if (req.url === '/old.xml') {
      res.writeHead(301, { location: '/new.xml' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end('<rss><channel><title>Moved</title></channel></rss>');
  });
  try {
    const result = await fetchFeedXml(`${baseUrl(server)}/old.xml`);
    assert.equal(result.ok, true);
    assert.match(result.body, /Moved/);
  } finally {
    server.close();
  }
});

test('fetchFeedXml reports a non-2xx status as an error', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  try {
    const result = await fetchFeedXml(`${baseUrl(server)}/missing.xml`);
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.match(result.error, /404/);
  } finally {
    server.close();
  }
});

test('fetchFeedXml rejects an invalid URL without throwing', async () => {
  const result = await fetchFeedXml('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('fetchFeedXml rejects an unsupported scheme', async () => {
  const result = await fetchFeedXml('ftp://example.com/feed.xml');
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('fetchFeedXml times out rather than hanging forever', async () => {
  const server = await startServer((req, res) => {
    // Never respond -- exercises the timeout path.
    void req; void res;
  });
  try {
    const result = await fetchFeedXml(`${baseUrl(server)}/hangs.xml`, { timeoutMs: 100 });
    assert.equal(result.ok, false);
    assert.match(result.error, /timed out/);
  } finally {
    server.close();
  }
});

test('fetchFeedXml refuses a body larger than the byte cap, by Content-Length', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-length': '1000000' });
    res.end('<rss></rss>');
  });
  try {
    const result = await fetchFeedXml(`${baseUrl(server)}/big.xml`, { maxBytes: 10 });
    assert.equal(result.ok, false);
    assert.match(result.error, /too large/);
  } finally {
    server.close();
  }
});

test('fetchFeedXml refuses a body larger than the byte cap when Content-Length is absent', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/rss+xml', 'transfer-encoding': 'chunked' });
    res.end('x'.repeat(1000));
  });
  try {
    const result = await fetchFeedXml(`${baseUrl(server)}/big-chunked.xml`, { maxBytes: 10 });
    assert.equal(result.ok, false);
    assert.match(result.error, /too large/);
  } finally {
    server.close();
  }
});
