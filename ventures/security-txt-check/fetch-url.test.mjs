import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchText } from './fetch-url.mjs';

// These run against a throwaway HTTP server on loopback, not the internet.
// That is the only way to pin redirect handling, the byte cap, and the
// timeout as behaviour rather than as intent -- and it keeps the suite
// runnable in a sandbox with no outbound egress, which is where it is.

/** Starts a server, runs `body`, and always closes it. */
async function withServer(handler, body) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await body(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('fetches a body and reports the served Content-Type', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Contact: mailto:a@b.c\n');
  }, async (base) => {
    const r = await fetchText(`${base}/.well-known/security.txt`);
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.equal(r.body, 'Contact: mailto:a@b.c\n');
    assert.equal(r.contentType, 'text/plain; charset=utf-8');
    assert.equal(r.error, null);
  });
});

test('a 404 resolves as not-ok rather than throwing', async () => {
  await withServer((req, res) => {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<h1>Not found</h1>');
  }, async (base) => {
    const r = await fetchText(`${base}/.well-known/security.txt`);
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
  });
});

test('follows a redirect and reports the body from where it landed', async () => {
  await withServer((req, res) => {
    if (req.url === '/.well-known/security.txt') {
      res.writeHead(301, { location: '/security.txt' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Contact: mailto:moved@example.com\n');
  }, async (base) => {
    const r = await fetchText(`${base}/.well-known/security.txt`);
    assert.equal(r.ok, true);
    assert.match(r.body, /moved@example\.com/);
  });
});

test('gives up on a redirect loop instead of following it forever', async () => {
  await withServer((req, res) => {
    res.writeHead(302, { location: '/loop' });
    res.end();
  }, async (base) => {
    const r = await fetchText(`${base}/loop`);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'too many redirects');
  });
});

test('caps an oversized response rather than reading all of it', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    // Well past the 256 KB cap.
    res.end('x'.repeat(400 * 1024));
  }, async (base) => {
    const r = await fetchText(`${base}/.well-known/security.txt`);
    assert.match(r.error ?? '', /truncated/);
    assert.ok(r.body.length <= 400 * 1024);
  });
});

test('a timeout resolves as an error, not an unhandled rejection', async () => {
  await withServer((req, res) => {
    // Never respond; the client's own timeout has to end this.
    res.writeHead(200, { 'content-type': 'text/plain' });
  }, async (base) => {
    const r = await fetchText(`${base}/.well-known/security.txt`, { timeoutMs: 120 });
    assert.equal(r.ok, false);
    assert.ok(r.error, 'expected an error string');
  });
});

test('an unroutable URL resolves as an error rather than throwing', async () => {
  const r = await fetchText('not-a-url');
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid URL/);
});

test('a non-HTTP scheme is refused before any socket is opened', async () => {
  const r = await fetchText('file:///etc/passwd');
  assert.equal(r.ok, false);
  assert.match(r.error, /unsupported scheme/);
});
