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

test('sendProbe returns the status and body of a plain 200 response', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end('<ListBucketResult></ListBucketResult>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/bucket`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.bodySample, '<ListBucketResult></ListBucketResult>');
  } finally {
    server.close();
  }
});

test('sendProbe caps the body it reads and reports truncated:true beyond the cap', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end('a'.repeat(40_000));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`);
    assert.equal(result.ok, true);
    assert.equal(result.truncated, true);
    assert.ok(result.bodySample.length <= 16_384);
  } finally {
    server.close();
  }
});

// This is the one behaviour deliberately different from git-exposure-check's
// probe: AWS's path-style endpoint 307-redirects to the bucket's real
// region, so this tool has to follow same-server redirects to work at all.
test('sendProbe follows a redirect to the Location the server names, up to the cap', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect-once') {
      res.writeHead(307, { location: '/final' });
      res.end();
    } else if (req.url === '/final') {
      res.writeHead(200);
      res.end('landed');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/redirect-once`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.bodySample, 'landed');
    assert.equal(result.url, `http://127.0.0.1:${port}/final`);
  } finally {
    server.close();
  }
});

test('sendProbe gives up on a redirect loop rather than hanging forever', async () => {
  const server = createServer((req, res) => {
    res.writeHead(307, { location: '/loop' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/loop`);
    assert.equal(result.ok, false);
    assert.match(result.error, /too many redirects/);
  } finally {
    server.close();
  }
});

test('runProbe folds the given provider into the result', async () => {
  const server = createServer((req, res) => {
    res.writeHead(403);
    res.end('<Error><Code>AccessDenied</Code></Error>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await runProbe({ provider: 's3', probeUrl: `http://127.0.0.1:${port}/private-bucket` });
    assert.equal(result.provider, 's3');
    assert.equal(result.status, 403);
    assert.match(result.bodySample, /AccessDenied/);
  } finally {
    server.close();
  }
});
