import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { sendProbe, runProbe, HEAD_RELATIVE_PATH, CONFIG_RELATIVE_PATH } from './probe.mjs';

test('sendProbe resolves with ok:false for an invalid base URL rather than throwing', async () => {
  const result = await sendProbe('not a url', HEAD_RELATIVE_PATH);
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid URL/);
});

test('sendProbe resolves with ok:false for an unsupported scheme', async () => {
  const result = await sendProbe('ftp://example.com/', HEAD_RELATIVE_PATH);
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported scheme/);
});

test('sendProbe resolves with ok:false (not a throw) against a port nothing listens on', async () => {
  const result = await sendProbe('http://127.0.0.1:1/', HEAD_RELATIVE_PATH, { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('sendProbe resolves the relative path against the base URL', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end(req.url);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`, HEAD_RELATIVE_PATH);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.bodySample, '/.git/HEAD');
    assert.equal(result.url, `http://127.0.0.1:${port}/.git/HEAD`);
  } finally {
    server.close();
  }
});

test('sendProbe caps the body it reads and reports truncated:true beyond the cap', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end('a'.repeat(20_000));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`, CONFIG_RELATIVE_PATH);
    assert.equal(result.ok, true);
    assert.equal(result.truncated, true);
    assert.ok(result.bodySample.length <= 8192);
  } finally {
    server.close();
  }
});

test('sendProbe does not follow a redirect -- it reports the 3xx as-is', async () => {
  const server = createServer((req, res) => {
    res.writeHead(302, { location: '/elsewhere' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await sendProbe(`http://127.0.0.1:${port}/`, HEAD_RELATIVE_PATH);
    assert.equal(result.ok, true);
    assert.equal(result.status, 302);
  } finally {
    server.close();
  }
});

test('runProbe sends both HEAD and config requests against the same base URL', async () => {
  const seenPaths = [];
  const server = createServer((req, res) => {
    seenPaths.push(req.url);
    if (req.url === '/.git/HEAD') {
      res.writeHead(200);
      res.end('ref: refs/heads/main\n');
    } else if (req.url === '/.git/config') {
      res.writeHead(200);
      res.end('[core]\n\trepositoryformatversion = 0\n');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const target = `http://127.0.0.1:${port}/`;
    const result = await runProbe(target);
    assert.equal(result.target, target);
    assert.equal(result.head.status, 200);
    assert.equal(result.head.bodySample, 'ref: refs/heads/main\n');
    assert.equal(result.config.status, 200);
    assert.match(result.config.bodySample, /\[core\]/);
    assert.deepEqual(seenPaths.sort(), ['/.git/HEAD', '/.git/config']);
  } finally {
    server.close();
  }
});

test('runProbe against a safe (protected) server reports 404 for both paths', async () => {
  const server = createServer((req, res) => {
    res.writeHead(404);
    res.end('Not Found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const result = await runProbe(`http://127.0.0.1:${port}/`);
    assert.equal(result.head.status, 404);
    assert.equal(result.config.status, 404);
  } finally {
    server.close();
  }
});
