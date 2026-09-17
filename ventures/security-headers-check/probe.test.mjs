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

test('sendProbe reads back the four header names against a real local server', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
      'x-frame-options': 'SAMEORIGIN',
      'strict-transport-security': 'max-age=63072000',
      'x-unrelated-header': 'ignored',
    });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.protocol, 'http:');
    assert.equal(result.headers['content-security-policy'], "default-src 'self'; frame-ancestors 'self'");
    assert.equal(result.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(result.headers['strict-transport-security'], 'max-age=63072000');
    assert.equal(result.headers['content-security-policy-report-only'], null);
  } finally {
    server.close();
  }
});

test('runProbe includes the target and the protocol scheme alongside the probe result', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'x-frame-options': 'DENY' });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const target = `http://127.0.0.1:${port}/`;
    const result = await runProbe(target);
    assert.equal(result.target, target);
    assert.equal(result.ok, true);
    assert.equal(result.protocol, 'http:');
    assert.equal(result.headers['x-frame-options'], 'DENY');
  } finally {
    server.close();
  }
});
