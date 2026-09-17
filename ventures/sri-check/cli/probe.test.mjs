import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fetchText, fetchAndDigest, fetchAllAssets } from './probe.mjs';

// A tiny local HTTP server standing in for "the internet" -- every request in
// this file goes to 127.0.0.1 only, nothing external, matching the pattern
// cors-misconfig-check/probe.test.mjs already established for this portfolio.
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

test('fetchText returns the body and ok:true on 200', async () => {
  await withServer(
    (req, res) => { res.writeHead(200); res.end('<html>hi</html>'); },
    async (base) => {
      const result = await fetchText(base);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.text, '<html>hi</html>');
    },
  );
});

test('fetchText reports ok:false and the status on a 404', async () => {
  await withServer(
    (req, res) => { res.writeHead(404); res.end('not found'); },
    async (base) => {
      const result = await fetchText(base);
      assert.equal(result.ok, false);
      assert.equal(result.status, 404);
      assert.match(result.error, /404/);
    },
  );
});

test('fetchText resolves (does not throw) on an unreachable host', async () => {
  const result = await fetchText('http://127.0.0.1:1/', { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('fetchAndDigest hashes the response body it just fetched', async () => {
  const body = 'const x = 1;';
  await withServer(
    (req, res) => { res.writeHead(200); res.end(body); },
    async (base) => {
      const result = await fetchAndDigest(base);
      assert.equal(result.ok, true);
      assert.equal(result.hashes.sha256, createHash('sha256').update(body).digest('base64'));
      assert.equal(result.hashes.sha384, createHash('sha384').update(body).digest('base64'));
      assert.equal(result.hashes.sha512, createHash('sha512').update(body).digest('base64'));
    },
  );
});

test('fetchAndDigest reports ok:false on a non-2xx status, with no hashes', async () => {
  await withServer(
    (req, res) => { res.writeHead(500); res.end('boom'); },
    async (base) => {
      const result = await fetchAndDigest(base);
      assert.equal(result.ok, false);
      assert.equal(result.hashes, null);
      assert.match(result.error, /500/);
    },
  );
});

test('fetchAllAssets only fetches assets that declare an integrity hash', async () => {
  let requests = 0;
  await withServer(
    (req, res) => { requests += 1; res.writeHead(200); res.end('body'); },
    async (base) => {
      const assets = [
        { kind: 'script', url: `${base}/with-hash.js`, integrity: 'sha384-AAA', crossoriginAttr: true },
        { kind: 'script', url: `${base}/no-hash.js`, integrity: null, crossoriginAttr: false },
      ];
      const results = await fetchAllAssets(assets);
      assert.equal(requests, 1, 'only the asset that declares an integrity hash should be fetched');
      assert.ok(results.has(`${base}/with-hash.js`));
      assert.ok(!results.has(`${base}/no-hash.js`));
    },
  );
});
