import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchHost, fetchHostname } from './probe.mjs';

// A tiny local HTTP server standing in for a real third-party provider --
// every request in this file goes to 127.0.0.1 only, nothing external, so
// these tests are deterministic and never touch anyone's real site.
function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await fn(`http://127.0.0.1:${port}/`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

function danglingBucket(req, res) {
  res.writeHead(404, { 'content-type': 'application/xml' });
  res.end('<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>');
}

function realApp(req, res) {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<html><body>Welcome to our real app</body></html>');
}

test('fetchHost returns the real body and status for a reachable target', () =>
  withServer(danglingBucket, async (base) => {
    const result = await fetchHost(base);
    assert.equal(result.ok, true);
    assert.equal(result.status, 404);
    assert.match(result.text, /NoSuchBucket/);
  }));

test('fetchHost treats a 200 with real content the same as any other reachable response', () =>
  withServer(realApp, async (base) => {
    const result = await fetchHost(base);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.match(result.text, /Welcome to our real app/);
  }));

test('fetchHost reports an error (not a status) for an unreachable host', async () => {
  const result = await fetchHost('http://127.0.0.1:1/', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.ok(result.error);
});

test('fetchHost caps the response body rather than buffering an unbounded stream', () =>
  withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('x'.repeat(500_000));
  }, async (base) => {
    const result = await fetchHost(base);
    assert.equal(result.ok, true);
    assert.ok(result.text.length <= 200_000);
  }));

test('fetchHost never throws on a slow response, timing out instead', async () => {
  await withServer((req, res) => {
    // Never responds -- exercises the abort/timeout path deterministically.
  }, async (base) => {
    const result = await fetchHost(base, { timeoutMs: 200 });
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });
});

// Red team 2026-11-13: fetchHostname tried HTTPS only. An S3 website endpoint
// serves no HTTPS and an unclaimed Heroku or GitHub Pages name fails the
// certificate check, so the typical dangling CNAME could never be confirmed.
function schemeFetch({ https, http }) {
  const asked = [];
  const impl = async (url) => {
    asked.push(url);
    const handler = url.startsWith('https:') ? https : http;
    if (handler instanceof Error) throw handler;
    return new Response(handler.body, { status: handler.status });
  };
  return { impl, asked };
}

test('fetchHostname retries over plain HTTP when HTTPS gets no response at all', async () => {
  const { impl, asked } = schemeFetch({ https: new Error('certificate mismatch'), http: { status: 404, body: 'Code: NoSuchBucket' } });
  const result = await fetchHostname('www.example.com', { fetchImpl: impl });
  assert.deepEqual(asked, ['https://www.example.com/', 'http://www.example.com/']);
  assert.equal(result.ok, true);
  assert.equal(result.url, 'http://www.example.com/');
  assert.match(result.text, /NoSuchBucket/);
  assert.equal(result.httpsError, 'certificate mismatch');
});

test('fetchHostname sends no HTTP request when HTTPS answered, whatever the status', async () => {
  const { impl, asked } = schemeFetch({ https: { status: 404, body: 'No such app' }, http: new Error('unused') });
  const result = await fetchHostname('blog.example.com', { fetchImpl: impl });
  assert.deepEqual(asked, ['https://blog.example.com/']);
  assert.equal(result.url, 'https://blog.example.com/');
});

test('fetchHostname keeps the HTTPS error when both schemes fail', async () => {
  const { impl } = schemeFetch({ https: new Error('blocked by CORS'), http: new Error('mixed content') });
  const result = await fetchHostname('blog.example.com', { fetchImpl: impl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'blocked by CORS');
});
