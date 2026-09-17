import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { sendProbe, runProbe } from './probe.mjs';

test('sendProbe resolves with ok:false for an invalid URL rather than throwing', async () => {
  const result = await sendProbe('not a url');
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('sendProbe resolves with ok:false for an unsupported scheme', async () => {
  const result = await sendProbe('ftp://example.com/');
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('sendProbe resolves with ok:false (not a throw) against a port nothing listens on', async () => {
  const result = await sendProbe('http://127.0.0.1:1/', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('sendProbe reads back the caching headers and the request path', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'cache-control': 'public, max-age=3600',
      expires: 'Wed, 21 Oct 2026 07:28:00 GMT',
      date: 'Wed, 21 Oct 2026 06:28:00 GMT',
      etag: '"abc123"',
      'accept-ranges': 'bytes',
    });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/style.css`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.protocol, 'http:');
    assert.equal(result.path, '/style.css');
    assert.equal(result.headers['cache-control'], 'public, max-age=3600');
    assert.equal(result.headers.expires, 'Wed, 21 Oct 2026 07:28:00 GMT');
    assert.equal(result.headers.etag, '"abc123"');
    assert.equal(result.headers['accept-ranges'], 'bytes');
    assert.deepEqual(result.setCookie, []);
  } finally {
    server.close();
  }
});

test('sendProbe reads back Set-Cookie as a proper array alongside the caching headers', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'cache-control': 'public, max-age=60',
      'set-cookie': ['sid=abc123; Path=/'],
    });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`);
    assert.equal(result.ok, true);
    assert.deepEqual(result.setCookie, ['sid=abc123; Path=/']);
  } finally {
    server.close();
  }
});

test('sendProbe reports absent headers as null, not undefined or missing keys', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {});
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`);
    assert.equal(result.ok, true);
    assert.equal(result.headers['cache-control'], null);
    assert.equal(result.headers.vary, null);
  } finally {
    server.close();
  }
});

test('runProbe includes the target alongside the probe result', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'cache-control': 'no-store' });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const target = `http://127.0.0.1:${port}/`;
    const result = await runProbe(target);
    assert.equal(result.target, target);
    assert.equal(result.ok, true);
    assert.equal(result.headers['cache-control'], 'no-store');
  } finally {
    server.close();
  }
});
