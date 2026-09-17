import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchBody, fetchHeaders } from './fetch-url.mjs';

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

// --- fetchBody -----------------------------------------------------------

test('fetchBody returns the body of a 200 response', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end('<urlset></urlset>');
    },
    async (base) => {
      const result = await fetchBody(base);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.match(result.body, /urlset/);
      assert.equal(result.error, null);
    },
  );
});

test('fetchBody follows a redirect', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/old.xml') {
        res.writeHead(302, { location: '/new.xml' });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end('landed');
    },
    async (base) => {
      const result = await fetchBody(`${base}/old.xml`);
      assert.equal(result.ok, true);
      assert.equal(result.body, 'landed');
    },
  );
});

test('fetchBody resolves a relative redirect Location against the request URL', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/a/old.xml') {
        res.writeHead(301, { location: 'new.xml' });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end('landed-relative');
    },
    async (base) => {
      const result = await fetchBody(`${base}/a/old.xml`);
      assert.equal(result.ok, true);
      assert.equal(result.body, 'landed-relative');
    },
  );
});

test('fetchBody gives up after too many redirects rather than looping forever', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(302, { location: req.url + 'x' });
      res.end();
    },
    async (base) => {
      const result = await fetchBody(base, { redirectsLeft: 2 });
      assert.equal(result.ok, false);
      assert.match(result.error, /too many redirects/);
    },
  );
});

test('fetchBody resolves (does not throw) on an unreachable host', async () => {
  const result = await fetchBody('http://127.0.0.1:1', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('fetchBody resolves with an "invalid URL" error for a malformed URL', async () => {
  const result = await fetchBody('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('fetchBody rejects an unsupported scheme instead of attempting the request', async () => {
  const result = await fetchBody('ftp://example.com/file.xml');
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('fetchBody truncates a response body larger than the byte cap rather than buffering it all', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200);
      const chunk = 'x'.repeat(1024 * 1024); // 1MB
      for (let i = 0; i < 12; i++) res.write(chunk);
      res.end();
    },
    async (base) => {
      const result = await fetchBody(base);
      assert.equal(result.ok, true);
      assert.match(result.error, /truncated/);
      assert.ok(result.body.length <= 10 * 1024 * 1024 + 1024 * 1024);
    },
  );
});

test('fetchBody times out rather than hanging on a server that never responds', async () => {
  await withServer(
    () => {
      // Never call res.end() -- simulates a hung connection.
    },
    async (base) => {
      const result = await fetchBody(base, { timeoutMs: 200 });
      assert.equal(result.ok, false);
      assert.match(result.error, /timed out/);
    },
  );
});

// --- fetchHeaders ----------------------------------------------------------

test('fetchHeaders parses a Last-Modified header and never returns a body', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' });
      res.end('should not matter -- headers already resolved before body read');
    },
    async (base) => {
      const result = await fetchHeaders(base);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.lastModified.toISOString(), '2025-01-01T00:00:00.000Z');
    },
  );
});

test('fetchHeaders reports lastModified: null when the header is absent', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200);
      res.end('no last-modified header sent');
    },
    async (base) => {
      const result = await fetchHeaders(base);
      assert.equal(result.ok, true);
      assert.equal(result.lastModified, null);
    },
  );
});

test('fetchHeaders reports lastModified: null for an unparseable header value', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'last-modified': 'not a real date' });
      res.end();
    },
    async (base) => {
      const result = await fetchHeaders(base);
      assert.equal(result.lastModified, null);
    },
  );
});

test('fetchHeaders follows a redirect and reads the final response headers', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/old') {
        res.writeHead(302, { location: '/new' });
        res.end();
        return;
      }
      res.writeHead(200, { 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' });
      res.end('landed');
    },
    async (base) => {
      const result = await fetchHeaders(`${base}/old`);
      assert.equal(result.ok, true);
      assert.equal(result.lastModified.toISOString(), '2025-01-01T00:00:00.000Z');
    },
  );
});

test('fetchHeaders reports ok:false for a 404, but still resolves', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(404);
      res.end('not found');
    },
    async (base) => {
      const result = await fetchHeaders(base);
      assert.equal(result.ok, false);
      assert.equal(result.status, 404);
    },
  );
});

test('fetchHeaders never reads more than the response headers even on a huge body', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' });
      // Write far more than any reasonable byte cap would allow, and never
      // end -- if fetchHeaders waited for the body this would time out.
      const chunk = 'x'.repeat(1024 * 1024);
      const interval = setInterval(() => {
        try {
          res.write(chunk);
        } catch {
          clearInterval(interval);
        }
      }, 5);
      res.on('close', () => clearInterval(interval));
    },
    async (base) => {
      const result = await fetchHeaders(base, { timeoutMs: 2000 });
      assert.equal(result.ok, true);
      assert.equal(result.lastModified.toISOString(), '2025-01-01T00:00:00.000Z');
    },
  );
});

test('fetchHeaders resolves (does not throw) on an unreachable host', async () => {
  const result = await fetchHeaders('http://127.0.0.1:1', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('fetchHeaders times out rather than hanging on a server that never responds', async () => {
  await withServer(
    () => {
      // Never call res.end() or send a response head -- simulates a hung connection.
    },
    async (base) => {
      const result = await fetchHeaders(base, { timeoutMs: 200 });
      assert.equal(result.ok, false);
      assert.match(result.error, /timed out/);
    },
  );
});
