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

test('sendProbe reads back the checked headers and the request path', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=()',
    });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/page`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.protocol, 'http:');
    assert.equal(result.path, '/page');
    assert.equal(result.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(result.headers['permissions-policy'], 'camera=(), microphone=()');
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
    assert.equal(result.headers['referrer-policy'], null);
    assert.equal(result.headers['permissions-policy'], null);
    assert.equal(result.headers['feature-policy'], null);
  } finally {
    server.close();
  }
});

test('runProbe includes the target alongside the probe result', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'referrer-policy': 'no-referrer' });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const target = `http://127.0.0.1:${port}/`;
    const result = await runProbe(target);
    assert.equal(result.target, target);
    assert.equal(result.ok, true);
    assert.equal(result.headers['referrer-policy'], 'no-referrer');
  } finally {
    server.close();
  }
});
