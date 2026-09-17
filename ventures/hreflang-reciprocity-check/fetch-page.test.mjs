import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchPage } from './fetch-page.mjs';

// A tiny local HTTP server standing in for "the internet" -- every request in
// this file goes to 127.0.0.1 only, nothing external, so these tests are
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

test('fetchPage returns the body of a 200 response', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>hi</body></html>');
    },
    async (base) => {
      const result = await fetchPage(base);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.match(result.html, /hi/);
      assert.equal(result.error, null);
    },
  );
});

test('fetchPage follows a redirect', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/old') {
        res.writeHead(302, { location: '/new' });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end('landed');
    },
    async (base) => {
      const result = await fetchPage(`${base}/old`);
      assert.equal(result.ok, true);
      assert.equal(result.html, 'landed');
    },
  );
});

test('fetchPage resolves a relative redirect Location against the request URL', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/a/old') {
        res.writeHead(301, { location: 'new' }); // relative to /a/
        res.end();
        return;
      }
      res.writeHead(200);
      res.end('landed-relative');
    },
    async (base) => {
      const result = await fetchPage(`${base}/a/old`);
      assert.equal(result.ok, true);
      assert.equal(result.html, 'landed-relative');
    },
  );
});

test('fetchPage gives up after too many redirects rather than looping forever', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(302, { location: req.url + 'x' }); // always redirects to a new URL
      res.end();
    },
    async (base) => {
      const result = await fetchPage(base, { redirectsLeft: 2 });
      assert.equal(result.ok, false);
      assert.match(result.error, /too many redirects/);
    },
  );
});

test('fetchPage resolves (does not throw) on an unreachable host', async () => {
  const result = await fetchPage('http://127.0.0.1:1', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('fetchPage resolves with an error for an invalid URL', async () => {
  const result = await fetchPage('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('fetchPage rejects an unsupported scheme instead of attempting the request', async () => {
  const result = await fetchPage('ftp://example.com/file');
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('fetchPage truncates a response body larger than the byte cap rather than buffering it all', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200);
      // Stream more than the 5MB cap in small chunks so the truncation path,
      // not just a single oversized write, is exercised.
      const chunk = 'x'.repeat(1024 * 1024); // 1MB
      for (let i = 0; i < 6; i++) res.write(chunk);
      res.end();
    },
    async (base) => {
      const result = await fetchPage(base);
      assert.equal(result.ok, true);
      assert.match(result.error, /truncated/);
      assert.ok(result.html.length <= 5 * 1024 * 1024 + 1024 * 1024);
    },
  );
});

test('fetchPage times out rather than hanging on a server that never responds', async () => {
  await withServer(
    () => {
      // Never call res.end() -- simulates a hung connection.
    },
    async (base) => {
      const result = await fetchPage(base, { timeoutMs: 200 });
      assert.equal(result.ok, false);
      assert.match(result.error, /timed out/);
    },
  );
});
