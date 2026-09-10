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

test('sendProbe reads back multiple Set-Cookie headers as a proper array, not comma-joined', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'set-cookie': [
        'sid=abc123; Path=/; HttpOnly; Secure; SameSite=Lax',
        'consent=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/',
      ],
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
    assert.equal(result.setCookie.length, 2);
    assert.equal(result.setCookie[0], 'sid=abc123; Path=/; HttpOnly; Secure; SameSite=Lax');
    // The comma inside the Expires value must survive as part of the second
    // array element, not be treated as a header separator.
    assert.equal(result.setCookie[1], 'consent=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/');
  } finally {
    server.close();
  }
});

test('sendProbe reports an empty array when the response sets no cookies', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, {});
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`);
    assert.equal(result.ok, true);
    assert.deepEqual(result.setCookie, []);
  } finally {
    server.close();
  }
});

test('runProbe includes the target and the protocol scheme alongside the probe result', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'set-cookie': ['sid=1; HttpOnly'] });
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
    assert.deepEqual(result.setCookie, ['sid=1; HttpOnly']);
  } finally {
    server.close();
  }
});
