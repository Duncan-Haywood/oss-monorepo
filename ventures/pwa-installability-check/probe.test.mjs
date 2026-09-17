import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { findManifestHref, runProbe } from './probe.mjs';

// A tiny local HTTP server standing in for "the internet" -- every request
// in this file goes to 127.0.0.1 only, nothing external, so these tests are
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

test('findManifestHref finds a manifest link regardless of attribute order', () => {
  assert.equal(findManifestHref('<link rel="manifest" href="/m.json">'), '/m.json');
  assert.equal(findManifestHref('<link href="/m.json" rel="manifest">'), '/m.json');
  assert.equal(findManifestHref("<link rel='manifest' href='/m.json'>"), '/m.json');
  assert.equal(findManifestHref('<link rel="manifest" href=/m.json>'), '/m.json');
});

test('findManifestHref ignores unrelated <link> tags and returns null when absent', () => {
  assert.equal(findManifestHref('<link rel="stylesheet" href="/style.css">'), null);
  assert.equal(findManifestHref('<html><head></head></html>'), null);
});

test('findManifestHref is case-insensitive on rel', () => {
  assert.equal(findManifestHref('<LINK REL="MANIFEST" HREF="/m.json">'), '/m.json');
});

test('runProbe walks page -> manifest -> icons end to end against a real local server', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><head><link rel="manifest" href="/manifest.json"></head></html>');
      } else if (req.url === '/manifest.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          name: 'Test App',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/missing.png', sizes: '512x512', type: 'image/png' },
          ],
        }));
      } else if (req.url === '/icon-192.png') {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end('fake-png-bytes');
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    },
    async (base) => {
      const result = await runProbe(base + '/');
      assert.equal(result.page.ok, true);
      assert.equal(result.manifestHref, '/manifest.json');
      assert.equal(result.manifestUrl, base + '/manifest.json');
      assert.equal(result.manifest.ok, true);
      assert.equal(result.manifestJson.name, 'Test App');
      assert.equal(result.icons.length, 2);

      const good = result.icons.find((i) => i.src === '/icon-192.png');
      assert.equal(good.fetch.ok, true);
      assert.equal(good.fetch.status, 200);
      assert.equal(good.fetch.contentType, 'image/png');

      const bad = result.icons.find((i) => i.src === '/missing.png');
      assert.equal(bad.fetch.status, 404);
    },
  );
});

test('runProbe records secure=true for loopback http (the localhost exemption)', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    },
    async (base) => {
      const result = await runProbe(base + '/');
      assert.equal(result.secure, true, '127.0.0.1 should be treated as a secure-equivalent origin');
    },
  );
});

test('runProbe records secure=false for a plain-http, non-loopback URL', async () => {
  // 0.0.0.0:1 refuses instantly with no DNS lookup and touches no external
  // network, but its hostname is neither "localhost" nor "127.0.0.1", so the
  // secure-origin computation (which happens before the failed fetch) must
  // still read false.
  const result = await runProbe('http://0.0.0.0:1/', { timeoutMs: 500 });
  assert.equal(result.secure, false);
  assert.equal(result.page.ok, false);
});

test('runProbe stops cleanly with no manifest link and no crash', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head></head><body>no manifest here</body></html>');
    },
    async (base) => {
      const result = await runProbe(base + '/');
      assert.equal(result.page.ok, true);
      assert.equal(result.manifestHref, null);
      assert.equal(result.manifestUrl, null);
      assert.equal(result.icons.length, 0);
    },
  );
});

test('runProbe reports page.ok=false for an unreachable host, without throwing', async () => {
  const result = await runProbe('http://127.0.0.1:1', { timeoutMs: 500 });
  assert.equal(result.page.ok, false);
  assert.equal(typeof result.page.error, 'string');
});

test('runProbe reports an invalid URL cleanly', async () => {
  const result = await runProbe('not a url');
  assert.equal(result.page.ok, false);
  assert.match(result.page.error, /invalid URL/);
});

test('runProbe reports manifest.ok=false when the manifest link 404s', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><head><link rel="manifest" href="/missing-manifest.json"></head></html>');
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    },
    async (base) => {
      const result = await runProbe(base + '/');
      assert.equal(result.manifestHref, '/missing-manifest.json');
      assert.equal(result.manifest.status, 404);
      assert.equal(result.manifestJson, null);
    },
  );
});

test('runProbe reports a parse error for a manifest that is not valid JSON', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><head><link rel="manifest" href="/manifest.json"></head></html>');
      } else if (req.url === '/manifest.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{ this is not json');
      }
    },
    async (base) => {
      const result = await runProbe(base + '/');
      assert.equal(result.manifest.ok, true);
      assert.equal(result.manifestJson, null);
      assert.equal(typeof result.parseError, 'string');
    },
  );
});
